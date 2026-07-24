// 領収書（立替）の保存。原本画像＋抽出データをKVに貯める。
// 整理（月フォルダ等）はNAS導入時にまとめて行う前提。今は「消えないように保存」だけが目的。

import { applyAssetThreshold } from "@/lib/receipt";

const IDX = "receipts:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type RLine = { name: string; amount: number; category: string; tags: string[] };

export type SavedReceipt = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  category: string;
  summary: string;
  payer: string;
  memo: string;
  savedAt: string;
  registered?: { journalId: number; at: string }; // freee登録済み
  expenseKind?: "company" | "card" | "labor"; // 立替 / 会社カード支出 / 労働枠経費
  laborMember?: string; // 労働枠のとき、誰の枠から引くか
  tags?: string[]; // 用途タグ（旧・レシート全体。互換用）
  lines?: RLine[]; // 内訳（用途/科目ごとに分割）。あればこちらを正とする
};

// 内訳を正規化：linesがあればそれ、無ければ旧単一項目を1行に。
export function receiptLines(r: SavedReceipt): RLine[] {
  if (r.lines && r.lines.length > 0) return r.lines;
  return [
    {
      name: r.summary || r.vendor || "",
      amount: r.total,
      category: r.category || "不明",
      tags: r.tags ?? [],
    },
  ];
}

export async function getReceipts(): Promise<SavedReceipt[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<SavedReceipt[]>(IDX)) ?? [];
}

// 重複検知：同じ日付・合計金額の保存済み領収書を探す（1件返す）。
// 店名は判定に使わない（AI読み取りでブレやすいため）。dateもtotalも無いときは判定しない。
export async function findDuplicate(
  date: string,
  total: number,
): Promise<SavedReceipt | null> {
  if (!date || !total) return null;
  const all = await getReceipts();
  return all.find((r) => r.date === date && r.total === total) ?? null;
}

export async function saveReceipt(
  r: Omit<SavedReceipt, "savedAt">,
  imageDataUrl?: string,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const index = await getReceipts();
  index.unshift({ ...r, savedAt: new Date(Date.now()).toISOString() });
  await store.set(IDX, index);
  // 原本画像（dataURL）は別キー。大きすぎればデータのみ（NAS導入時に対応）。
  if (imageDataUrl && imageDataUrl.length < 6_000_000) {
    try {
      await store.set(`receipt:file:${r.id}`, imageDataUrl);
    } catch {
      // 原本保存失敗はスルー（抽出データは保存済み）
    }
  }
}

export async function getReceiptImage(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(`receipt:file:${id}`)) ?? null;
}

export async function getReceipt(id: string): Promise<SavedReceipt | null> {
  const all = await getReceipts();
  return all.find((r) => r.id === id) ?? null;
}

export async function deleteReceipt(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getReceipts();
  await store.set(IDX, all.filter((r) => r.id !== id));
  try {
    await store.del(`receipt:file:${id}`);
  } catch {
    // 画像削除失敗はスルー
  }
}

// 既存領収書の内訳（品目）を後から確定保存する。AI推測をユーザーが承認したとき使う。
// summary / category / tags は lines から導出して整合を取る（POST /api/receipts と同じ流儀）。
export async function updateReceiptItems(id: string, lines: RLine[]): Promise<boolean> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getReceipts();
  const i = all.findIndex((r) => r.id === id);
  if (i < 0) return false;
  const clean = applyAssetThreshold(
    lines
      .filter((l) => l && (l.name || l.amount))
      .map((l) => ({
        name: l.name ?? "",
        amount: Number(l.amount) || 0,
        category: l.category || "不明",
        tags: (l.tags ?? []).filter((t) => t && t.trim()).map((t) => t.trim()),
      })),
  );
  if (clean.length === 0) return false;
  const compatTags = [...new Set(clean.flatMap((l) => l.tags))];
  all[i] = {
    ...all[i],
    lines: clean,
    summary: clean.map((l) => l.name).filter(Boolean).join("、") || all[i].summary,
    category: clean[0]?.category ?? all[i].category,
    tags: compatTags.length ? compatTags : all[i].tags,
  };
  await store.set(IDX, all);
  return true;
}

export async function markRegistered(id: string, journalId: number): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getReceipts();
  const i = all.findIndex((r) => r.id === id);
  if (i >= 0) {
    all[i].registered = { journalId, at: new Date(Date.now()).toISOString() };
    await store.set(IDX, all);
  }
}

// freee登録を取り消したとき、登録済みフラグを外す（再記帳できるようにする）
export async function clearRegistered(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getReceipts();
  const i = all.findIndex((r) => r.id === id);
  if (i >= 0) {
    delete all[i].registered;
    await store.set(IDX, all);
  }
}
