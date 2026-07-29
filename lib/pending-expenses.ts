// 銀行明細等で見つかった「レシートなし経費」の処理待ちリスト。
// 領収書が揃い次第 registered にする、もしくは不要なら skipped にする。

const IDX = "pending_expenses:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type PendingExpense = {
  id: string;           // "pe_" + timestamp
  date: string;         // YYYY-MM-DD
  amount: number;
  vendor: string;       // 店名
  source: string;       // "銀行CSV", "メルカリ", etc.
  description: string;  // 摘要
  payer: string;        // 立替者 "坂本", "櫻井"
  status: "pending" | "registered" | "skipped";
  category?: string;    // 勘定科目（登録時に設定）
  tags?: string[];
  receiptId?: string;   // 紐づくレシートID
  registeredAt?: string;
  note?: string;
};

export async function getPendingExpenses(): Promise<PendingExpense[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<PendingExpense[]>(IDX)) ?? [];
}

export async function savePendingExpense(e: PendingExpense): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const index = await getPendingExpenses();
  index.unshift(e);
  await store.set(IDX, index);
}

export async function updatePendingExpense(
  id: string,
  patch: Partial<Omit<PendingExpense, "id">>,
): Promise<boolean> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getPendingExpenses();
  const i = all.findIndex((e) => e.id === id);
  if (i < 0) return false;
  all[i] = { ...all[i], ...patch };
  await store.set(IDX, all);
  return true;
}

export async function bulkSavePendingExpenses(
  expenses: PendingExpense[],
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const index = await getPendingExpenses();
  // 先頭に追加（新しいものが上に来るよう逆順で unshift）
  for (const e of [...expenses].reverse()) {
    index.unshift(e);
  }
  await store.set(IDX, index);
}
