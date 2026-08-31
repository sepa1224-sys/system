// 売上を「カフェ」と「物販」に分ける。
//
// Tシャツやステッカーが混ざると、カフェとしての実力が見えなくなる。
// 原価の考え方も違う（カフェは30%前後、アパレルは仕入れた分がそのまま残る）ので、
// 経営の判断材料としては分けて見たい。
//
// 商品名で判定し、迷うものは画面から覚えさせられるようにしている。

const KEY = "salescat:overrides";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type SalesCategory = "カフェ" | "物販";

/** 物販とみなす商品名。上から順に見る */
export const GOODS_RULES: RegExp[] = [
  /Tシャツ|ティーシャツ/i,
  /ステッカー|シール(?!剥がし)/,
  /トートバッグ|トート/,
  /キャップ|ハット|ニット帽/,
  /パーカー|スウェット|フーディ/,
  /マグカップ|タンブラー(?!用)/,
  /缶バッジ|バッジ|ピンバッジ/,
  /ポストカード|ポスター/,
  /タオル|手ぬぐい/,
  /エコバッグ/,
  /グッズ|アパレル|物販/,
];

export async function getOverrides(): Promise<Record<string, SalesCategory>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, SalesCategory>>(KEY)) ?? {};
}

export async function saveOverride(name: string, cat: SalesCategory | ""): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const cur = await getOverrides();
  const k = name.trim();
  if (!k) throw new Error("商品名が空です");
  if (cat) cur[k] = cat;
  else delete cur[k];
  await store.set(KEY, cur);
}

/** ルールだけで判定する。覚えさせた分は classifyWith を使う */
export function classify(productName: string): SalesCategory {
  const s = String(productName ?? "");
  return GOODS_RULES.some((re) => re.test(s)) ? "物販" : "カフェ";
}

/** 覚えさせた対応を優先して判定する */
export function classifyWith(
  productName: string,
  overrides: Record<string, SalesCategory>,
): SalesCategory {
  const s = String(productName ?? "").trim();
  if (overrides[s]) return overrides[s];
  return classify(s);
}

export type CategorySplit = {
  カフェ: { sales: number; qty: number };
  物販: { sales: number; qty: number };
};

/** 商品別の売上をカテゴリごとに合計する */
export function splitByCategory(
  products: { name: string; qty: number; amount: number }[],
  overrides: Record<string, SalesCategory>,
): CategorySplit {
  const out: CategorySplit = {
    カフェ: { sales: 0, qty: 0 },
    物販: { sales: 0, qty: 0 },
  };
  for (const p of products) {
    const c = classifyWith(p.name, overrides);
    out[c].sales += p.amount || 0;
    out[c].qty += p.qty || 0;
  }
  return out;
}
