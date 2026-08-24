// Google OAuth + Gmail検索（読み取り専用）。トークンは Vercel KV(Redis)。
// 未処理明細に紐づく書類が無いとき、Gmailをメール本文から探して証拠にする。

const TOKEN_KEY = "google:tokens";
const SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/spreadsheets openid email profile";

function env(name: string): string {
  const raw = process.env[name] ?? "";
  return Array.from(raw)
    .filter((c) => c.charCodeAt(0) !== 0xfeff && c.charCodeAt(0) !== 0x200b)
    .join("")
    .trim();
}
const CLIENT_ID = env("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET");

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

type Tokens = { access_token: string; refresh_token: string; expires_at: number };

// Googleの連携が切れたときのエラー。
// リフレッシュトークンはユーザーがGoogle側で許可を取り消したり、
// 一定期間使われないと無効になる。こうなると再接続してもらうしかない。
export class GoogleAuthError extends Error {
  needsReauth = true as const;
  constructor(message = "Googleとの連携が切れています。再接続してください。") {
    super(message);
    this.name = "GoogleAuthError";
  }
}

export function needsReauth(e: unknown): boolean {
  return e instanceof GoogleAuthError;
}

// APIが返すエラーの形。画面側は needsReauth を見て再接続ボタンを出す。
export function googleErrorPayload(e: unknown, fallback = "エラー") {
  const reauth = needsReauth(e);
  return {
    error: e instanceof Error ? e.message : fallback,
    ...(reauth ? { needsReauth: true } : {}),
  };
}

async function loadTokens(): Promise<Tokens | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<Tokens>(TOKEN_KEY)) ?? null;
}
async function saveTokens(t: Tokens) {
  const store = await kv();
  if (store) await store.set(TOKEN_KEY, t);
}

export async function isGoogleReady(): Promise<boolean> {
  return !!CLIENT_ID && !!(await kv());
}
export async function isGoogleConnected(): Promise<boolean> {
  try {
    return (await loadTokens()) !== null;
  } catch {
    return false;
  }
}

export function googleRedirectUri(origin: string) {
  return `${origin}/api/google/callback`;
}
export function googleAuthorizeUrl(origin: string) {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function tokenReq(body: Record<string, string>): Promise<Tokens & { id_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`Googleトークン取得失敗(${res.status}): ${await res.text()}`);
  const j = await res.json();
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    id_token: j.id_token,
  };
}

export async function googleExchange(origin: string, code: string) {
  const prev = await loadTokens();
  const t = await tokenReq({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: googleRedirectUri(origin),
  });
  // Googleはrefresh_tokenを初回のみ返すことがある。無ければ前回分を保持。
  if (!t.refresh_token && prev?.refresh_token) t.refresh_token = prev.refresh_token;
  await saveTokens(t);
}

async function getAccessToken(): Promise<string> {
  const t = await loadTokens();
  if (!t) throw new Error("Google未接続");
  if (t.expires_at - 60 < Math.floor(Date.now() / 1000)) {
    let nt: Tokens;
    try {
      nt = await tokenReq({
        grant_type: "refresh_token",
        refresh_token: t.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });
    } catch (e) {
      // invalid_grant = 許可が取り消されたか期限切れ。もう自動では戻せない。
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("invalid_grant")) throw new GoogleAuthError();
      throw e;
    }
    if (!nt.refresh_token) nt.refresh_token = t.refresh_token; // Googleは更新時にrefresh返さない
    await saveTokens(nt);
    return nt.access_token;
  }
  return t.access_token;
}

export type Mail = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  body: string;
};

function decodeB64Url(data: string): string {
  try {
    const b = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

// payloadから text/plain 本文を再帰的に抽出
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const t = extractBody(p);
      if (t) return t;
    }
  }
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  return "";
}

/** 接続中アカウントのメールアドレス等（診断用） */
export async function gmailProfile(): Promise<{ emailAddress: string; messagesTotal: number }> {
  const token = await getAccessToken();
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`profile ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

/** Gmailを検索して上位メールを返す（本文は抜粋） */
export async function gmailSearch(query: string, max = 4): Promise<Mail[]> {
  const token = await getAccessToken();
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      query,
    )}&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!listRes.ok) {
    const t = await listRes.text();
    throw new Error(`Gmail検索失敗(${listRes.status}): ${t.slice(0, 300)}`);
  }
  const list = await listRes.json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);
  const mails: Mail[] = [];
  for (const id of ids) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) continue;
    const m = await r.json();
    const headers: { name: string; value: string }[] = m.payload?.headers ?? [];
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    mails.push({
      id,
      subject: h("subject"),
      from: h("from"),
      date: h("date"),
      snippet: m.snippet ?? "",
      body: extractBody(m.payload).slice(0, 1500),
    });
  }
  return mails;
}

/** 接続中のGmailアカウントからメールを送る（夏祭り申込の確認メール等） */
export async function gmailSend(to: string, subject: string, body: string): Promise<void> {
  const token = await getAccessToken();
  const raw = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64"),
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      raw: Buffer.from(raw, "utf-8").toString("base64url"),
    }),
  });
  if (!res.ok) throw new Error(`Gmail送信失敗(${res.status}): ${(await res.text()).slice(0, 300)}`);
}

// --- Google Sheets 読み書き ---
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function sheetsGet(
  spreadsheetId: string,
  range: string,
): Promise<(string | number)[][]> {
  const token = await getAccessToken();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets読み取り失敗(${res.status}): ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return (j.values ?? []) as (string | number)[][];
}

export async function sheetsClear(spreadsheetId: string, range: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheetsクリア失敗(${res.status}): ${(await res.text()).slice(0, 300)}`);
}

// タブが無ければ作成する
export async function sheetsEnsureTab(spreadsheetId: string, title: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheetsメタ取得失敗(${res.status})`);
  const j = await res.json();
  const titles: string[] = (j.sheets ?? []).map(
    (s: { properties: { title: string } }) => s.properties.title,
  );
  if (titles.includes(title)) return;
  const up = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  if (!up.ok) throw new Error(`タブ作成失敗(${up.status}): ${(await up.text()).slice(0, 200)}`);
}

export async function sheetsUpdate(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
  asFormula = false,
): Promise<void> {
  const token = await getAccessToken();
  const opt = asFormula ? "USER_ENTERED" : "RAW";
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${opt}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) throw new Error(`Sheets書き込み失敗(${res.status}): ${(await res.text()).slice(0, 300)}`);
}
