// サイト全体の合言葉。
//
// このシステムにはログインの仕組みが無く、URLを知っていれば
// 経理・シフト・売上・イベントの申込者名簿まで誰でも見られる状態だった。
// お客さんに配るイベント申込ページと同じドメインにあるので、
// 入口を1か所で塞ぐ。
//
// 合言葉は環境変数 SITE_PASSWORD。未設定のときは素通しにする
//   （設定を忘れた状態で店の端末が締め出されると営業に差し支えるため）。

export const AUTH_COOKIE = "flat_pass";
/** 合言葉を入れ直してもらう間隔 */
export const AUTH_MAX_AGE = 60 * 60 * 24 * 90; // 90日

const MESSAGE = "flat-site-v1";

function sitePassword(): string {
  return (process.env.SITE_PASSWORD || "").trim();
}

/** 合言葉が設定されているか。未設定なら保護しない */
export function authEnabled(): boolean {
  return sitePassword().length > 0;
}

/**
 * Cookieに入れる値。合言葉そのものではなく、そこから作った署名を入れる。
 * 合言葉を変えると署名も変わるので、全端末が自動でログアウトになる。
 */
export async function sessionToken(): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sitePassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(MESSAGE));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長さと中身が同じかを、途中で打ち切らずに比べる */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const p = sitePassword();
  if (!p) return true;
  return sameSecret(String(input ?? "").trim(), p);
}

/** Cookieの署名が正しいか */
export async function hasValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  if (!cookieValue) return false;
  return sameSecret(cookieValue, await sessionToken());
}

/**
 * 自動実行（Vercel cron）からの呼び出しか。
 * CRON_SECRET を設定しておくと、Vercelがこのヘッダを付けて叩いてくれる。
 */
export function isCronCall(authorization: string | null): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
