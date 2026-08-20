// カフェの運営ナレッジ。「聞かれたけど答えられなかったこと」を溜めていく場所。
// チャットボット(/help)はここを読んで答えるので、書けば書くほど答えられる範囲が広がる。

const KEY = "knowledge:entries";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export const CATEGORIES = [
  "ドリンク",
  "フード",
  "接客",
  "レジ・会計",
  "設備・機器",
  "掃除・衛生",
  "仕入れ",
  "その他",
] as const;

export type Knowledge = {
  id: string;
  title: string; // 一覧に出す見出し
  question: string; // どんなときに知りたくなるか
  answer: string; // 答え
  category: string;
  tags: string[];
  source?: string; // 誰に聞いたか
  raw?: string; // 入力した元の文章。整形がずれていたら見返せる
  createdAt: string;
  updatedAt: string;
};

export const newId = () =>
  `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export async function getKnowledge(): Promise<Knowledge[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<Knowledge[]>(KEY)) ?? [];
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveKnowledge(k: Knowledge): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Knowledge[]>(KEY)) ?? [];
  const i = list.findIndex((x) => x.id === k.id);
  if (i >= 0) list[i] = k;
  else list.push(k);
  await store.set(KEY, list);
}

export async function deleteKnowledge(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = (await store.get<Knowledge[]>(KEY)) ?? [];
  await store.set(
    KEY,
    list.filter((x) => x.id !== id),
  );
}

/** チャットボットに渡す形。長くなりすぎないよう上限を設ける */
export function toPrompt(list: Knowledge[], limit = 120): string {
  if (list.length === 0) return "";
  const body = list
    .slice(0, limit)
    .map(
      (k) =>
        `- 【${k.category}】${k.title}\n  Q: ${k.question}\n  A: ${k.answer}` +
        (k.source ? `\n  （${k.source}に確認）` : ""),
    )
    .join("\n");
  return `\n\n# 店のナレッジ（実際に確認して溜めたもの。これを最優先で使う）\n${body}\n`;
}
