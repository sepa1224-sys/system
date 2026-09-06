// ストックルームの在庫確認。
//
// 在庫は3層になっている。
//   倉庫（ダンボール・大容量）→ ストックルーム（数日分）→ 使う場所（台下冷蔵庫など）
// 毎日の補充はストックルームから取る。3日ごとにストックルームを倉庫から補充し、
// 倉庫に無くて補充できなかったものが「発注するもの」になる。
//
// 適正在庫（ストックルームに常に置いておく数）は品目ごとに違う。
// 回転の速いものは多く、動かない酒は1本。数は画面から決める。

const ITEMS_KEY = "stockroom:items";
const CHECKS_KEY = "stockroom:checks";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export const GROUPS = [
  "ドリンク（ノンアル）",
  "ドリンク（酒）",
  "コーヒー・茶",
  "フード",
  "ワッフル",
  "仕込み品",
  "消耗品・包材",
] as const;
export type Group = (typeof GROUPS)[number];

export type Item = {
  id: string;
  name: string;
  group: Group;
  /** ストックルームに常に置いておく数 */
  par: number;
  /** 数え方の単位。缶・本・袋・kg など */
  unit: string;
  /** 仕込み品は倉庫から補充できないので、足りなければ発注ではなく仕込み */
  madeInHouse?: boolean;
  /** 仕入れ表（🛒 仕入れ）の品目id。発注URLと単価はここから引く */
  buyId?: number;
  /** 1回に発注する数。空なら1 */
  orderQty?: number;
  /** 週間予定（📆 週間予定）の作業id。いつ仕込んだか・日持ちを引く */
  shikomiId?: string;
  /** 仕込んでから何日もつか */
  keepDays?: number;
  note?: string;
};

/**
 * 最初に入れておく品目。数(par)は売上から出したたたき台なので、
 * 実際に使いながら画面で直していく前提。
 */
export const SEED_ITEMS: Item[] = [
  // ドリンク（ノンアル）
  { id: "cola", name: "コカ・コーラ（缶）", group: "ドリンク（ノンアル）", par: 12, unit: "缶", buyId: 21, orderQty: 6 },
  { id: "ginger", name: "ジンジャーエール（缶）", group: "ドリンク（ノンアル）", par: 12, unit: "缶", buyId: 9, orderQty: 6 },
  { id: "mitsuya", name: "三ツ矢サイダー（缶）", group: "ドリンク（ノンアル）", par: 12, unit: "缶", buyId: 13, orderQty: 20 },
  { id: "soda", name: "炭酸水（サンガリア）", group: "ドリンク（ノンアル）", par: 12, unit: "本", buyId: 20, orderQty: 1 },
  { id: "tonic", name: "トニックウォーター", group: "ドリンク（ノンアル）", par: 6, unit: "本", buyId: 28, orderQty: 30 },
  { id: "oj", name: "オレンジジュース", group: "ドリンク（ノンアル）", par: 2, unit: "本", buyId: 19, orderQty: 2 },
  { id: "pine", name: "パインジュース", group: "ドリンク（ノンアル）", par: 2, unit: "本" },
  { id: "guava", name: "グァバジュース", group: "ドリンク（ノンアル）", par: 2, unit: "本", buyId: 4, orderQty: 12 },
  { id: "lime-j", name: "ライムジュース（お酒にプラス）", group: "ドリンク（ノンアル）", par: 2, unit: "本", buyId: 12, orderQty: 1 },
  { id: "lemon-j", name: "レモンジュース（お酒にプラス）", group: "ドリンク（ノンアル）", par: 2, unit: "本", buyId: 24, orderQty: 1 },
  { id: "gf-j", name: "グレープフルーツジュース（お酒にプラス）", group: "ドリンク（ノンアル）", par: 2, unit: "本" },
  { id: "yuzu", name: "ゆず茶", group: "ドリンク（ノンアル）", par: 1, unit: "瓶" },
  { id: "ume-j", name: "梅ジュース", group: "ドリンク（ノンアル）", par: 1, unit: "本" },
  { id: "gum", name: "ガムシロップ", group: "ドリンク（ノンアル）", par: 1, unit: "本", buyId: 23, orderQty: 1 },

  // ドリンク（酒）— ほとんど動かないので1本
  { id: "beer-heineken", name: "ハイネケン", group: "ドリンク（酒）", par: 6, unit: "本", buyId: 26, orderQty: 24 },
  { id: "beer-corona", name: "コロナ", group: "ドリンク（酒）", par: 6, unit: "本", buyId: 25, orderQty: 24 },
  { id: "beer-bud", name: "バドワイザー", group: "ドリンク（酒）", par: 6, unit: "本", buyId: 27, orderQty: 24 },
  { id: "beer-sapporo", name: "サッポロラガー（中瓶）", group: "ドリンク（酒）", par: 6, unit: "本" },
  { id: "tequila", name: "テキーラ（クエルボ）", group: "ドリンク（酒）", par: 2, unit: "本", note: "ショットで出るので減りが速い", buyId: 11, orderQty: 1 },
  { id: "bourbon", name: "バーボン（JIM BEAM）", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 16, orderQty: 1 },
  { id: "vodka", name: "ウォッカ（アブソルート）", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 22, orderQty: 1 },
  { id: "gin", name: "ジン", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 5, orderQty: 1 },
  { id: "cointreau", name: "コアントロー", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 17, orderQty: 1 },
  { id: "aperol", name: "アペロール", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 14, orderQty: 1 },
  { id: "umeshu", name: "梅酒", group: "ドリンク（酒）", par: 1, unit: "本", buyId: 10, orderQty: 6 },
  { id: "wine-white", name: "白ワイン", group: "ドリンク（酒）", par: 1, unit: "本", note: "料理にも使う" },

  // コーヒー・茶
  { id: "espresso-bean", name: "エスプレッソ豆", group: "コーヒー・茶", par: 2, unit: "袋" },
  { id: "tea-leaf", name: "紅茶の茶葉", group: "コーヒー・茶", par: 1, unit: "袋" },
  { id: "straight-tea", name: "ストレートティー（無糖）", group: "コーヒー・茶", par: 3, unit: "本", buyId: 30, orderQty: 12 },
  { id: "matcha", name: "抹茶パウダー", group: "コーヒー・茶", par: 1, unit: "袋" },
  { id: "cocoa", name: "ココアパウダー", group: "コーヒー・茶", par: 1, unit: "袋" },
  { id: "protein", name: "プロテインパウダー", group: "コーヒー・茶", par: 1, unit: "袋" },

  // フード
  { id: "milk", name: "牛乳", group: "フード", par: 5, unit: "本" },
  { id: "bread", name: "食パン", group: "フード", par: 6, unit: "斤" },
  { id: "ham", name: "切り落としハム", group: "フード", par: 500, unit: "g" },
  { id: "prosciutto", name: "生ハム", group: "フード", par: 2, unit: "パック" },
  { id: "cream-cheese", name: "クリームチーズ", group: "フード", par: 2, unit: "個" },
  { id: "blue-cheese", name: "ブルーチーズ", group: "フード", par: 1, unit: "個" },
  { id: "shred-cheese", name: "シュレッダーチーズ", group: "フード", par: 500, unit: "g", orderQty: 1000 },
  { id: "tuna", name: "ツナ缶", group: "フード", par: 4, unit: "缶" },
  { id: "sausage", name: "ソーセージ（冷凍）", group: "フード", par: 10, unit: "本" },
  { id: "sauerkraut", name: "ザワークラウト", group: "フード", par: 1, unit: "袋" },
  { id: "olive", name: "オリーブ（黒・緑）", group: "フード", par: 1, unit: "瓶ずつ" },
  { id: "pickles", name: "ピクルス", group: "フード", par: 1, unit: "瓶" },
  { id: "cracker", name: "クラッカー", group: "フード", par: 2, unit: "箱" },
  { id: "broccoli", name: "冷凍ブロッコリー", group: "フード", par: 1, unit: "袋" },
  { id: "katsuo", name: "鰹節", group: "フード", par: 1, unit: "袋" },
  { id: "garlic", name: "にんにく", group: "フード", par: 1, unit: "ネット" },
  { id: "tomato", name: "ミニトマト", group: "フード", par: 1, unit: "パック" },
  { id: "mushroom", name: "マッシュルーム", group: "フード", par: 1, unit: "パック" },
  { id: "asari", name: "殻付き大アサリ", group: "フード", par: 1, unit: "パック" },
  { id: "shrimp", name: "むき海老", group: "フード", par: 1, unit: "パック" },

  // ワッフル
  { id: "waffle-mix", name: "ワッフルミックス", group: "ワッフル", par: 2, unit: "袋", buyId: 29, orderQty: 6 },
  { id: "egg", name: "卵", group: "ワッフル", par: 6, unit: "個" },
  { id: "butter", name: "バター", group: "ワッフル", par: 1, unit: "個" },
  { id: "zarame", name: "ざらめ", group: "ワッフル", par: 1, unit: "袋" },
  { id: "waffle-sugar", name: "ワッフルシュガー", group: "ワッフル", par: 1, unit: "袋" },
  { id: "sugar-powder", name: "シュガーパウダー", group: "ワッフル", par: 1, unit: "袋" },
  { id: "choco-chip", name: "チョコチップ", group: "ワッフル", par: 1, unit: "袋" },
  { id: "choco-syrup", name: "ハーシーチョコシロップ", group: "ワッフル", par: 1, unit: "本" },
  { id: "blueberry", name: "冷凍ブルーベリー", group: "ワッフル", par: 1, unit: "袋" },
  { id: "banana", name: "冷凍バナナ", group: "ワッフル", par: 1, unit: "袋" },
  { id: "coconut", name: "ココナッツミルク", group: "ワッフル", par: 4, unit: "缶", buyId: 3, orderQty: 24 },

  // 仕込み品（足りなければ発注ではなく仕込み）
  { id: "mashed", name: "マッシュポテト", group: "仕込み品", par: 800, unit: "g", madeInHouse: true, shikomiId: "mashed-potato", keepDays: 10 },
  { id: "amiebi", name: "あみえびクリームチーズ", group: "仕込み品", par: 1, unit: "タッパ", madeInHouse: true, shikomiId: "amiebi-cream-cheese", keepDays: 10 },
  { id: "ajillo", name: "アヒージョセット（冷凍）", group: "仕込み品", par: 6, unit: "セット", madeInHouse: true },
  { id: "cold-brew", name: "コールドブリュー", group: "仕込み品", par: 2, unit: "本", madeInHouse: true },
  { id: "bread-baked", name: "自家製パン（冷凍・焼き済み）", group: "仕込み品", par: 6, unit: "個", madeInHouse: true },

  // 消耗品・包材
  { id: "paper-towel", name: "ペーパータオル", group: "消耗品・包材", par: 4, unit: "袋" },
  { id: "burger-bag", name: "バーガー袋", group: "消耗品・包材", par: 50, unit: "枚" },
  { id: "drink-carrier", name: "ドリンクキャリア", group: "消耗品・包材", par: 20, unit: "個" },
  { id: "paper-bag", name: "手提紙袋", group: "消耗品・包材", par: 20, unit: "枚" },
  { id: "straw", name: "ストロー", group: "消耗品・包材", par: 100, unit: "本" },
];

/** 「補充した」か「倉庫に無くて補充できなかった」か */
export type Result = "ok" | "short";

export type Check = {
  date: string;
  /** itemId → 結果 */
  results: Record<string, Result>;
  /** 倉庫に無かったもののメモ */
  note?: string;
  updatedAt: string;
};

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function loadItems(): Promise<Record<string, Item>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, Item>>(ITEMS_KEY)) ?? {};
}

/** 画面で直した分を反映した品目一覧 */
export async function getItems(): Promise<Item[]> {
  const edited = await loadItems();
  const map = new Map<string, Item>();
  for (const i of SEED_ITEMS) map.set(i.id, i);
  for (const i of Object.values(edited)) map.set(i.id, i);
  // 消したもの（par<0）は出さない
  return [...map.values()].filter((i) => i.par >= 0);
}

export async function saveItem(item: Item): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await loadItems();
  all[item.id] = item;
  await store.set(ITEMS_KEY, all);
}

async function loadChecks(): Promise<Record<string, Check>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, Check>>(CHECKS_KEY)) ?? {};
}

export async function getChecks(): Promise<Check[]> {
  const all = await loadChecks();
  return Object.values(all).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function saveCheck(c: Check): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await loadChecks();
  all[c.date] = c;
  // 在庫確認は3日に1回なので、400回で約3年分。
  // 「この品目は月に何回切らしているか」を後から見たいので長めに残す。
  // 1回の記録は品目idと ok/short だけで数KBしかなく、増えても困らない。
  const keep = Object.keys(all).sort().slice(-400);
  const next: Record<string, Check> = {};
  for (const d of keep) next[d] = all[d];
  await store.set(CHECKS_KEY, next);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000,
  );
}
