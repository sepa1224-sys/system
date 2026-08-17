// 夏祭り2026の申込データ（Vercel KV）。
// 送迎16名・花火30名の枠はサーバー側でカウントして自動で締める。

const KEY = "natsumatsuri:entries";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export const CAPS = { shuttle: 16, hanabi: 30 };

// 申込期限（JST）。花火を含むプランは火曜まで、パーティのみは木曜まで。
export const DEADLINES = {
  hanabi: "2026-08-19T00:00:00+09:00", // 8/18(火) 23:59まで
  party: "2026-08-21T00:00:00+09:00", // 8/20(木) 23:59まで
};

export function hanabiDeadlinePassed(): boolean {
  return Date.now() >= new Date(DEADLINES.hanabi).getTime();
}

export function partyDeadlinePassed(): boolean {
  return Date.now() >= new Date(DEADLINES.party).getTime();
}

// 花火大会に参加するプラン（30人枠の対象）
export const HANABI_PLANS = [
  "🎆 花火＋パーティ（飲み放題）¥4,000",
  "🎆 花火＋パーティ（3杯）¥3,000",
  "🎆 花火＋パーティ（ノンアル飲み放題）¥2,500",
  "🎆 花火＋パーティ（入場のみ）¥1,500",
  "🎆 花火のみ ¥1,000",
];

// サンセットchillのみ（花火に行かない）＝ 場所代がかからないので無料。
// ただし送迎を使う場合は花火大会にも参加してもらう（送迎の都合）。
export const CHILL_ONLY_PLAN = "🌅 サンセットchillのみ（無料）";

export const PARTY_PLANS = [
  "🪩 パーティのみ（飲み放題）¥3,500",
  "🪩 パーティのみ（ほろ酔い3杯）¥2,500",
  "🪩 パーティのみ（ノンアル飲み放題）¥2,000",
  "🪩 パーティのみ（入場のみ）¥500",
];

export const ALL_PLANS = [...HANABI_PLANS, ...PARTY_PLANS, CHILL_ONLY_PLAN];

export const SHUTTLE_OPTION = "🚌 送迎を希望する（先着16名・flat. 17:45集合）";

export type NatsumatsuriEntry = {
  id: string;
  name: string; // 本名
  lineName: string; // LINEの名前（LINE経由の申込。メール申込では空でもよい）
  email?: string; // メール申込の場合の連絡先。完了メールを送る
  lineUserId?: string; // LIFF経由の申込で取得。botからの個別連絡に使える
  events?: string[]; // 参加するもの: chill / hanabi / party
  plan: string;
  meetPoint: string;
  transport: string;
  hotsand: string;
  takeoutDrink?: string; // ソフトドリンクのテイクアウト（任意）
  djRequest?: string;
  photoOk: boolean;
  note?: string;
  createdAt: string;
};

export async function getEntries(): Promise<NatsumatsuriEntry[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<NatsumatsuriEntry[]>(KEY)) ?? [];
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function addEntry(e: NatsumatsuriEntry): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<NatsumatsuriEntry[]>(KEY)) ?? [];
  list.push(e);
  await store.set(KEY, list);
}

/**
 * 申込内容を後から直す。味の選択を追加する前(2026-08-16 14:48 JST)に
 * 申し込んだ人に、あとから電話などで確認した内容を反映するために使う。
 */
export async function updateEntry(
  id: string,
  patch: Partial<NatsumatsuriEntry>,
): Promise<NatsumatsuriEntry | null> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<NatsumatsuriEntry[]>(KEY)) ?? [];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  // id と createdAt は動かさない
  list[i] = { ...list[i], ...patch, id: list[i].id, createdAt: list[i].createdAt };
  await store.set(KEY, list);
  return list[i];
}

export async function deleteEntry(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<NatsumatsuriEntry[]>(KEY)) ?? [];
  await store.set(KEY, list.filter((e) => e.id !== id));
}

/** 花火大会(30人枠)に参加する申込か。eventsがあればそれを、無ければプラン名で判定 */
export function joinsHanabi(e: NatsumatsuriEntry): boolean {
  if (e.events && e.events.length) return e.events.includes("hanabi");
  return HANABI_PLANS.includes(e.plan);
}

/**
 * ホットサンドの味の内訳。
 * hotsand は「予約する：1つ（…） ／ 味: ガーデンメルト」の形で保存されている。
 * 味の選択は2026-08-16 14:48(JST)に追加したので、それ以前の申込には味が入っていない。
 *
 * 注意: 個人名を含むので、公開エンドポイントが返す counts には混ぜないこと。
 */
export function hotsandBreakdown(entries: NatsumatsuriEntry[]) {
  const byFlavor: Record<string, number> = {};
  const missing: { name: string; qty: number }[] = [];
  let total = 0;
  for (const e of entries) {
    const qty = e.hotsand.includes("2つ") ? 2 : e.hotsand.includes("1つ") ? 1 : 0;
    if (!qty) continue;
    total += qty;
    const m = /味[:：]\s*(.+)$/.exec(e.hotsand);
    const picked = m
      ? m[1].split(/[・、,]/).map((s) => s.trim()).filter(Boolean)
      : [];
    for (const f of picked) byFlavor[f] = (byFlavor[f] || 0) + 1;
    if (qty > picked.length) missing.push({ name: e.name, qty: qty - picked.length });
  }
  return { total, byFlavor, missing };
}

export function counts(entries: NatsumatsuriEntry[]) {
  const shuttle = entries.filter((e) => e.transport === SHUTTLE_OPTION).length;
  const hanabi = entries.filter(joinsHanabi).length;
  const party = entries.filter((e) =>
    e.events && e.events.length ? e.events.includes("party") : e.plan.includes("パーティ"),
  ).length;
  const hotsand = entries.reduce(
    (s, e) => s + (e.hotsand.includes("2つ") ? 2 : e.hotsand.includes("1つ") ? 1 : 0),
    0,
  );
  return {
    shuttle,
    hanabi,
    party,
    hotsand,
    shuttleOpen: shuttle < CAPS.shuttle,
    hanabiOpen: hanabi < CAPS.hanabi,
  };
}
