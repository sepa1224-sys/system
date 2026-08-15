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

// 花火大会に参加するプラン（30人枠の対象）
export const HANABI_PLANS = [
  "🎆 花火＋パーティ（飲み放題）¥4,000",
  "🎆 花火＋パーティ（3杯）¥3,000",
  "🎆 花火のみ ¥1,500",
];

export const PARTY_PLANS = [
  "🪩 パーティのみ（飲み放題）¥3,500",
  "🪩 パーティのみ（ほろ酔い3杯）¥2,500",
  "🪩 パーティのみ（ノンアル飲み放題）¥2,000",
  "🪩 パーティのみ（入場のみ）¥500",
];

export const ALL_PLANS = [...HANABI_PLANS, ...PARTY_PLANS];

export const SHUTTLE_OPTION = "🚌 送迎を希望する（先着16名・flat. 17:45集合）";

export type NatsumatsuriEntry = {
  id: string;
  name: string; // 本名
  lineName: string; // LINEの名前（連絡・写真共有用）
  plan: string;
  meetPoint: string;
  transport: string;
  hotsand: string;
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

export async function deleteEntry(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<NatsumatsuriEntry[]>(KEY)) ?? [];
  await store.set(KEY, list.filter((e) => e.id !== id));
}

export function counts(entries: NatsumatsuriEntry[]) {
  const shuttle = entries.filter((e) => e.transport === SHUTTLE_OPTION).length;
  const hanabi = entries.filter((e) => HANABI_PLANS.includes(e.plan)).length;
  const party = entries.filter((e) => e.plan.includes("パーティ")).length;
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
