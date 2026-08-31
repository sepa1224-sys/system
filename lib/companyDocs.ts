// 会社書類。定款・登記事項証明書・印鑑証明・許認可・税務署への届出など、
// 会社そのものを証明する書類をまとめる。
//
// 請求書や領収書（/shorui）や、取引先との約束（/contracts）とは別扱いにしている。
// この3つは探すきっかけが違うため。会社書類は「役所に出すとき」「更新するとき」に探す。

const KEY = "companydocs:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type CompanyDocKind =
  | "定款"
  | "登記事項証明書"
  | "印鑑証明・印鑑届"
  | "許認可・届出"
  | "税務署への届出"
  | "年金・労働保険"
  | "銀行・融資"
  | "その他";

export const COMPANY_DOC_KINDS: CompanyDocKind[] = [
  "定款", "登記事項証明書", "印鑑証明・印鑑届", "許認可・届出",
  "税務署への届出", "年金・労働保険", "銀行・融資", "その他",
];

export type CompanyDoc = {
  id: string;
  kind: CompanyDocKind;
  title: string;
  /** 作成日・発行日 */
  date: string;
  /** 発行元（法務局・税務署・行政書士など） */
  issuer?: string;
  /** 有効期限。印鑑証明のように使える期間が決まっているもの用 */
  validUntil?: string;
  /** 中身の要点。あとで探すときの手がかり */
  summary?: string;
  /** これが最新版か。定款は改訂すると旧版が残るため */
  current: boolean;
  createdAt: string;
};

export async function getCompanyDocs(): Promise<CompanyDoc[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<CompanyDoc[]>(KEY)) ?? [];
}

export async function saveCompanyDoc(d: Omit<CompanyDoc, "createdAt">): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getCompanyDocs();
  const i = list.findIndex((x) => x.id === d.id);
  if (i >= 0) list[i] = { ...list[i], ...d };
  else list.unshift({ ...d, createdAt: new Date(Date.now()).toISOString() });
  await store.set(KEY, list);
}

export async function deleteCompanyDoc(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(KEY, (await getCompanyDocs()).filter((d) => d.id !== id));
}

export async function saveCompanyFile(id: string, dataUrl: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (dataUrl.length > 6_000_000) throw new Error("ファイルが大きすぎます（6MBまで）");
  await store.set(`companydoc:file:${id}`, dataUrl);
}

export async function getCompanyFile(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(`companydoc:file:${id}`)) ?? null;
}
