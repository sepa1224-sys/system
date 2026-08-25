// スタッフのLINE ID。シフト提出のリマインドなど、店の中の連絡に使う。
// IDは 勤怠のLINE打刻ページを開いたときに自動で覚える。
// （名前を選んで打刻している時点で本人確認になっている）

const KEY = "staff:line";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/** スタッフ名 → LINEのuserId */
export async function getStaffLineIds(): Promise<Record<string, string>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, string>>(KEY)) ?? {};
}

export async function saveStaffLineId(name: string, userId: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getStaffLineIds();
  all[name] = userId;
  await store.set(KEY, all);
}

export async function pushLine(userId: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定");
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE送信に失敗(${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}
