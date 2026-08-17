// 書類保管庫（請求書・契約書・支払明細書など）。会計版NotebookLM的な蓄積。
// AIで内容を抽出してインデックス(KV)に保管し、freeeの未処理明細と金額で照合する。

const DOCS_INDEX = "docs:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type DocPayment = { payee: string; amount: number; note: string };
export type DocLine = { category: string; amount: number; memo: string };

export type DocEntry = {
  id: string;
  fileName: string;
  type: string; // 請求書/契約書/領収書/支払明細書/その他
  title: string;
  date: string;
  summary: string;
  payments: DocPayment[]; // 照合用：支払先と金額
  suggestedLines: DocLine[]; // 想定仕訳
  taxReview: boolean;
  taxReviewReason: string;
  uploadedAt: string;
};

function norm(s: string): string {
  return (s || "").replace(/[\s　]/g, "").toLowerCase();
}

export async function getDocsIndex(): Promise<DocEntry[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<DocEntry[]>(DOCS_INDEX)) ?? [];
}

export async function addDoc(
  entry: Omit<DocEntry, "uploadedAt">,
  file?: { base64: string; mediaType: string },
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const index = await getDocsIndex();
  index.unshift({ ...entry, uploadedAt: new Date(Date.now()).toISOString() });
  await store.set(DOCS_INDEX, index);
  // 原本(base64)は別キーに保存。大きすぎてKVに入らなければデータのみ保存(NAS導入時に整理)。
  if (file && file.base64.length < 6_000_000) {
    try {
      await store.set(`doc:file:${entry.id}`, file);
    } catch {
      // 原本保存失敗はスルー（抽出データは保存済み）
    }
  }
}

export async function getDocFile(
  id: string,
): Promise<{ base64: string; mediaType: string } | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<{ base64: string; mediaType: string }>(`doc:file:${id}`)) ?? null;
}

/**
 * 読み込み済みの索引から一致しそうな書類を返す（金額一致＋取引先名のゆるい一致）。
 * 明細を大量に判定するときは、KVの読み込みを1回で済ませるためこちらを使う。
 */
export function matchDocsIn(
  docs: DocEntry[],
  amount: number,
  description: string,
): DocEntry[] {
  const d = norm(description);
  return docs.filter((doc) =>
    doc.payments.some((p) => {
      const amtHit = p.amount === amount;
      const payeeHit = p.payee && (d.includes(norm(p.payee)) || norm(p.payee).includes(d));
      return amtHit || payeeHit;
    }),
  );
}

/** 未処理明細(金額・摘要)に一致しそうな書類を返す（金額一致＋取引先名のゆるい一致） */
export async function matchDocs(
  amount: number,
  description: string,
): Promise<DocEntry[]> {
  return matchDocsIn(await getDocsIndex(), amount, description);
}
