// 消費税の税率判定。
//   店内飲食       … 一律10%
//   テイクアウト   … 軽減税率8%。ただし酒類は持ち帰りでも10%
// 売価はすべて税込なので、Squareには INCLUSIVE（内税）として乗せる。
//
// Squareのカタログにカテゴリが1件も設定されていないため、酒類はここの名前で判定する。
// 商品を増やしたら必ずこのリストにも追加すること。

export type OrderType = "店内" | "テイクアウト";

/** 酒類（持ち帰りでも10%） */
export const ALCOHOL_ITEMS = new Set([
  // ビール
  "ハイネケン", "コロナ", "コロナ エキストラ", "バドワイザー", "サッポロラガー（中瓶）",
  "キリン 一番搾り（中瓶500ml）",
  // ハイボール・サワー・チューハイ
  "ハイボール", "ジンジャーハイボール", "コークハイ", "ジンハイボール", "ジンバック",
  "ジントニック",
  "レモンサワー", "ライムサワー", "グレープフルーツサワー", "梅サワー", "紅茶サワー",
  "カルピスサワー",
  "ウーロンハイ", "緑茶ハイ", "紅茶ハイ", "ジャスミンハイ",
  // カクテル
  "アペロールマルガリータ", "ココナッツベリークラウド", "ベリーココナッツクラウド",
  "マイアミサンセット", "エスプレッソマティーニ", "梅酒モヒート", "アマレットジンジャー",
  // ワイン
  "ワイン（グラス）", "ワイン（ボトル）",
  // 酒類を含むセット
  "ドリンク3杯のお得セット", "飲み放題＋ウェルカムビール1杯",
  // 店内飲食が前提のサービス（持ち帰り不可なので10%）
  "飲み放題（ソフトドリンクのみ）",
]);

export function isAlcohol(name: string): boolean {
  return ALCOHOL_ITEMS.has((name || "").trim());
}

/** その品目に適用する税率（%） */
export function taxRateFor(name: string, orderType: OrderType): 8 | 10 {
  if (orderType === "店内") return 10;
  return isAlcohol(name) ? 10 : 8;
}

type TaxLine = {
  uid: string;
  name: string;
  percentage: string;
  type: "INCLUSIVE";
  scope: "LINE_ITEM";
};

const TAX_DEFS: Record<8 | 10, TaxLine> = {
  8: { uid: "tax8", name: "消費税（軽減税率8%）", percentage: "8", type: "INCLUSIVE", scope: "LINE_ITEM" },
  10: { uid: "tax10", name: "消費税（10%）", percentage: "10", type: "INCLUSIVE", scope: "LINE_ITEM" },
};

/**
 * 品目ごとの税率から、Squareの注文に載せる taxes と、各行の applied_taxes を作る。
 * 実際に使う税率だけを taxes に含める。
 */
export function buildTaxes(
  names: string[],
  orderType: OrderType,
): { taxes: TaxLine[]; appliedTaxUids: string[] } {
  const rates = names.map((n) => taxRateFor(n, orderType));
  const used = Array.from(new Set(rates)).sort() as (8 | 10)[];
  return {
    taxes: used.map((r) => TAX_DEFS[r]),
    appliedTaxUids: rates.map((r) => TAX_DEFS[r].uid),
  };
}
