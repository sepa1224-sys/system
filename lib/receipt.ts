import { z } from "zod";

/**
 * freee準拠の勘定科目。AIはこの中から選ぶ。
 */
export const CATEGORIES = [
  "仕入高",
  "消耗品費",
  "家賃",
  "水道光熱費",
  "通信費",
  "保険料",
  "広告宣伝費",
  "修繕費",
  "荷造運賃",
  "旅費交通費",
  "交際費",
  "雑費",
  "設備（固定資産）",
  "不明",
] as const;

/**
 * 品目タグ候補。AIがtagsに自動付与する。後で「酒にいくら使った」等の分析に使う。
 */
export const ITEM_TAGS = [
  "酒類", "ソフトドリンク・炭酸", "コーヒー豆・茶葉", "牛乳・乳製品",
  "シロップ・調味料", "フード材料", "グラス・食器", "包装資材",
  "内装・家具", "照明", "設備・什器", "コーヒー器具",
  "掃除・衛生用品", "事務用品", "販促・広告", "開業準備",
] as const;

export type Category = (typeof CATEGORIES)[number];

// 固定資産の判定しきい値。1点30万円未満は固定資産にせず消耗品費にする
// （青色申告・少額減価償却資産の特例。全額その期の経費）。
export const ASSET_THRESHOLD = 300000;

// 30万円未満なのに「設備（固定資産）」になっている行を「消耗品費」に強制補正する。
// AIが誤って固定資産にしても、ここで確定的に直す。
export function applyAssetThreshold<T extends { category: string; amount: number }>(lines: T[]): T[] {
  return lines.map((l) =>
    l.category === "設備（固定資産）" && (Number(l.amount) || 0) < ASSET_THRESHOLD
      ? { ...l, category: "消耗品費" }
      : l,
  );
}

/** レシートの1行（内訳）。用途/科目が違う品目は行を分ける。 */
export const ReceiptLineSchema = z.object({
  name: z.string().describe("品目・内容（例: 木材、コーヒー豆2kg）。"),
  amount: z.number().describe("この品目の税込金額（円）。レシートが税抜表示の場合は消費税を加算した税込金額にすること。"),
  category: z
    .string()
    .describe(
      "freee勘定科目。次のいずれかから選ぶ: " + CATEGORIES.join(", ") + "。" +
        "カフェの飲食材料（コーヒー豆・酒・ジュース・フード材料等）は全て「仕入高」。" +
        "備品・文具・洗剤等は「消耗品費」。" +
        "コンビニのプリント代・コピー代・ネットワークプリントも「消耗品費」（通信費ではない。通信費は電話・ネット回線・切手のみ）。" +
        "**1点30万円未満の什器・機械・家具も「消耗品費」**（青色・少額減価償却資産の特例）。" +
        "「設備（固定資産）」は1点30万円以上のときだけ。判断できなければ「不明」。",
    ),
  tags: z
    .array(z.string())
    .describe(
      "品目タグ。何にお金を使ったかを分類する。次の候補から該当するものを必ず付ける: " +
        ITEM_TAGS.join(", ") +
        "。該当するものがなければ簡潔な新タグを付けてよい。" +
        "例: ウイスキー→「酒類」、炭酸水→「ソフトドリンク・炭酸」、ペンダントライト→「照明」、テーブル→「内装・家具」。" +
        "複数該当する場合は複数付ける。",
    ),
});

/** Claude に返させる構造化スキーマ（1領収書）。内訳を lines に分けて返す。 */
export const ReceiptSchema = z.object({
  date: z
    .string()
    .describe("領収書の日付。YYYY-MM-DD 形式。読めなければ空文字。"),
  vendor: z.string().describe("店名・支払先。読めなければ空文字。"),
  total: z
    .number()
    .describe("合計金額（税込・円）。レシートの支払総額。税抜表示のレシートでも消費税を含めた支払総額を入れる。読めなければ 0。"),
  lines: z
    .array(ReceiptLineSchema)
    .describe(
      "レシートの内訳。**用途や科目が違う品目は行を分ける**（例: 木材＝家具費／コーヒー豆＝仕入）。基本は1行、混在時のみ複数行。各行の金額合計＝total。",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("抽出全体の自信度。画像が不鮮明なら low。"),
  cardLast4: z
    .string()
    .describe("クレジットカード/デビットカードの下4桁。レシートに「****1234」「カード番号下4桁:1234」等の記載があれば読み取る。なければ空文字。"),
});

export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
