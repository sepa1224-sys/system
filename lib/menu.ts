// メニュー管理：KVに保存し、領収書登録時に仕入原価を自動更新する。

const MENU_KEY = "menu:items";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Ingredient = {
  name: string;
  unit: string;
  capacity: number;
  purchasePrice: number;
  usage: number;
  cost: number; // computed: (purchasePrice / capacity) * usage
};

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  cost: number;
  price: number | null;
  ingredients: Ingredient[];
  recipe?: string; // 作り方
  note?: string;
  updatedAt?: string;
};

// 材料の原価を再計算
function recalcCost(ing: Ingredient): number {
  if (!ing.capacity || !ing.purchasePrice) return 0;
  return Math.round((ing.purchasePrice / ing.capacity) * ing.usage * 100) / 100;
}

export function recalcItem(item: MenuItem): MenuItem {
  const ings = item.ingredients.map((i) => ({ ...i, cost: recalcCost(i) }));
  return {
    ...item,
    ingredients: ings,
    cost: Math.round(ings.reduce((s, i) => s + i.cost, 0)),
  };
}

// ─── 初期データ ───

export const DEFAULT_MENU: MenuItem[] = [
  // ☕ Drinks (Cafe)
  {
    id: "cafe-latte", name: "カフェラテ", category: "☕ Drinks (Cafe)",
    cost: 71, price: 500,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 200, cost: 30 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "espresso", name: "エスプレッソ", category: "☕ Drinks (Cafe)",
    cost: 41, price: 400,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "blend-coffee", name: "ブレンドコーヒー (Hot/Ice)", category: "☕ Drinks (Cafe)",
    cost: 41, price: 450,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
    ],
  },
  {
    id: "tea", name: "紅茶 (Hot/Ice)", category: "☕ Drinks (Cafe)",
    cost: 30, price: 400,
    ingredients: [
      { name: "茶葉", unit: "g", capacity: 200, purchasePrice: 800, usage: 5, cost: 20 },
      { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 200, cost: 1 },
    ],
    note: "原価は概算",
  },
  {
    id: "chai", name: "チャイ/トルコ茶", category: "☕ Drinks (Cafe)",
    cost: 50, price: 450,
    ingredients: [
      { name: "チャイ茶葉", unit: "g", capacity: 200, purchasePrice: 1200, usage: 5, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 100, cost: 15 },
      { name: "スパイス", unit: "g", capacity: 100, purchasePrice: 500, usage: 3, cost: 15 },
    ],
    note: "原価は概算",
  },
  {
    id: "matcha-latte", name: "抹茶ラテ", category: "☕ Drinks (Cafe)",
    cost: 91, price: 500,
    ingredients: [
      { name: "抹茶", unit: "g", capacity: 30, purchasePrice: 610, usage: 3, cost: 61 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 200, cost: 30 },
    ],
  },
  {
    id: "cocoa", name: "ココア", category: "☕ Drinks (Cafe)",
    cost: 42, price: 450,
    ingredients: [
      { name: "ココアパウダー", unit: "g", capacity: 1000, purchasePrice: 3980, usage: 5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 150, cost: 23 },
    ],
  },
  {
    id: "oj", name: "オレンジジュース", category: "☕ Drinks (Cafe)",
    cost: 31, price: 350,
    ingredients: [
      { name: "オレンジジュース", unit: "ml", capacity: 6000, purchasePrice: 2667, usage: 70, cost: 31 },
    ],
  },

  // 🍺 Drinks (Beer)
  {
    id: "heineken", name: "ハイネケン", category: "🍺 Beer",
    cost: 274, price: 650,
    ingredients: [
      { name: "ハイネケン 330ml瓶", unit: "本", capacity: 24, purchasePrice: 6580, usage: 1, cost: 274 },
    ],
    note: "リカマンオンライン 24本×2ケース",
  },
  {
    id: "corona", name: "コロナ エキストラ", category: "🍺 Beer",
    cost: 249, price: 650,
    ingredients: [
      { name: "コロナ 330ml瓶", unit: "本", capacity: 24, purchasePrice: 5980, usage: 1, cost: 249 },
    ],
    note: "リカマンオンライン 24本×2ケース",
  },
  {
    id: "budweiser", name: "バドワイザー", category: "🍺 Beer",
    cost: 224, price: 650,
    ingredients: [
      { name: "バドワイザー 330ml瓶", unit: "本", capacity: 24, purchasePrice: 5380, usage: 1, cost: 224 },
    ],
    note: "リカマンオンライン 24本×1ケース",
  },

  // 🥤 Smoothie / Protein
  {
    id: "banana-protein", name: "バナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 148, price: 500,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 130, cost: 20 },
    ],
  },
  {
    id: "cocoa-banana-protein", name: "ココアバナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 160, price: 550,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 130, cost: 20 },
      { name: "ココアパウダー", unit: "g", capacity: 1000, purchasePrice: 3980, usage: 3, cost: 12 },
    ],
  },
  {
    id: "berry-banana-protein", name: "ベリーバナナプロテイン", category: "🥤 Smoothie / Protein",
    cost: 289, price: 650,
    ingredients: [
      { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
      { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
      { name: "牛乳(オーツ)", unit: "ml", capacity: 1000, purchasePrice: 1000, usage: 130, cost: 130 },
      { name: "ミックスベリー", unit: "g", capacity: 1500, purchasePrice: 2998, usage: 15, cost: 30 },
    ],
  },

  // 🥪 Hot Sandwich
  {
    id: "ham-cream-cheese", name: "ハム＆クリームチーズ", category: "🥪 Hot Sandwich",
    cost: 130, price: 500,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
      { name: "切り落としハム", unit: "g", capacity: 800, purchasePrice: 905, usage: 40, cost: 45 },
      { name: "クリームチーズ", unit: "g", capacity: 227, purchasePrice: 387, usage: 15, cost: 26 },
      { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 10, cost: 19 },
      { name: "ケチャップ", unit: "g", capacity: 500, purchasePrice: 198, usage: 10, cost: 4 },
      { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
    ],
  },
  {
    id: "tuna-broccoli", name: "ツナブロッコリー", category: "🥪 Hot Sandwich",
    cost: 165, price: 500,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
      { name: "ツナ", unit: "缶", capacity: 1, purchasePrice: 181, usage: 0.3, cost: 54 },
      { name: "冷凍ブロッコリー", unit: "g", capacity: 500, purchasePrice: 192, usage: 30, cost: 12 },
      { name: "マヨネーズ", unit: "g", capacity: 1000, purchasePrice: 528, usage: 15, cost: 8 },
      { name: "シュレッダーチーズ", unit: "g", capacity: 1000, purchasePrice: 1242, usage: 30, cost: 37 },
      { name: "ペストロ", unit: "g", capacity: 185, purchasePrice: 321, usage: 5, cost: 9 },
      { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 5, cost: 10 },
      { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
    ],
  },
  {
    id: "spam-onigiri", name: "スパムおにぎり風", category: "🥪 Hot Sandwich",
    cost: 270, price: 550,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
      { name: "スパム(缶)", unit: "缶", capacity: 1, purchasePrice: 800, usage: 0.25, cost: 200 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
    ],
  },
  {
    id: "ham-cheese", name: "定番ハムチーズ", category: "🥪 Hot Sandwich",
    cost: 170, price: 500,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
      { name: "ハム", unit: "枚", capacity: 10, purchasePrice: 400, usage: 2, cost: 80 },
      { name: "チーズ", unit: "g", capacity: 1000, purchasePrice: 1000, usage: 50, cost: 50 },
    ],
  },
  {
    id: "tuna-mayo-broccoli", name: "健康的ツナマヨブロッコリー", category: "🥪 Hot Sandwich",
    cost: 140, price: 480,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
      { name: "ツナ(缶)", unit: "缶", capacity: 3, purchasePrice: 300, usage: 0.5, cost: 50 },
      { name: "ブロッコリー(株)", unit: "株", capacity: 1, purchasePrice: 200, usage: 0.25, cost: 50 },
    ],
  },
  {
    id: "sugar-butter", name: "お手頃シュガーバター", category: "🥪 Hot Sandwich",
    cost: 104, price: 380,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
      { name: "バター", unit: "g", capacity: 200, purchasePrice: 600, usage: 20, cost: 60 },
      { name: "砂糖", unit: "g", capacity: 1000, purchasePrice: 400, usage: 10, cost: 4 },
    ],
  },
  {
    id: "choco-banana", name: "チョコバナナ", category: "🥪 Hot Sandwich",
    cost: 167, price: 450,
    ingredients: [
      { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 108, usage: 2, cost: 36 },
      { name: "バナナ", unit: "本", capacity: 4, purchasePrice: 98, usage: 1, cost: 25 },
      { name: "板チョコ", unit: "g", capacity: 50, purchasePrice: 178, usage: 25, cost: 89 },
      { name: "マーガリン", unit: "g", capacity: 180, purchasePrice: 308, usage: 10, cost: 17 },
    ],
  },

  // 🧇 Sweets (Waffle)
  {
    id: "plain-waffle", name: "プレーンワッフル", category: "🧇 Sweets (Waffle)",
    cost: 34, price: 350, note: "1バッチ ¥343 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
      { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
    ],
  },
  {
    id: "choco-chip-waffle", name: "チョコチップワッフル", category: "🧇 Sweets (Waffle)",
    cost: 36, price: 400, note: "1バッチ ¥365 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
      { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 30, cost: 10 },
      { name: "チョコチップ", unit: "g", capacity: 500, purchasePrice: 525, usage: 30, cost: 32 },
    ],
  },
  {
    id: "matcha-waffle", name: "抹茶ワッフル", category: "🧇 Sweets (Waffle)",
    cost: 40, price: 420, note: "1バッチ ¥404 → 50g×10枚",
    ingredients: [
      { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
      { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
      { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
      { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
      { name: "抹茶", unit: "g", capacity: 30, purchasePrice: 610, usage: 3, cost: 61 },
    ],
  },

  // 🍸 Bar / Cocktail（全て¥650）
  {
    id: "highball", name: "ハイボール", category: "🍸 Bar / Cocktail",
    cost: 113, price: 550,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "ginger-highball", name: "ジンジャーハイボール", category: "🍸 Bar / Cocktail",
    cost: 92, price: 550,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "ジンジャーエール（カナダドライ）", unit: "ml", capacity: 9000, purchasePrice: 1277, usage: 185, cost: 26 },
    ],
  },
  {
    id: "coke-highball", name: "コークハイ", category: "🍸 Bar / Cocktail",
    cost: 88, price: 550,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 45, cost: 66 },
      { name: "コカ・コーラ", unit: "ml", capacity: 9000, purchasePrice: 1088, usage: 185, cost: 22 },
    ],
  },
  {
    id: "gin-tonic", name: "ジントニック", category: "🍸 Bar / Cocktail",
    cost: 121, price: 550,
    ingredients: [
      { name: "ドライジン（GORDON'S）", unit: "ml", capacity: 700, purchasePrice: 1264, usage: 30, cost: 54 },
      { name: "トニックウォーター（神戸居留地185ml缶）", unit: "本", capacity: 1, purchasePrice: 67, usage: 1, cost: 67 },
    ],
  },
  {
    id: "umeshu-soda", name: "梅酒ソーダ割り", category: "🍸 Bar / Cocktail",
    cost: 112, price: 550,
    ingredients: [
      { name: "梅酒（CHOYA熟成一年）", unit: "ml", capacity: 700, purchasePrice: 1010, usage: 45, cost: 65 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "cassis-orange", name: "カシスオレンジ", category: "📝 将来メニュー",
    cost: 120, price: 550,
    ingredients: [
      { name: "カシスリキュール", unit: "ml", capacity: 700, purchasePrice: 1200, usage: 30, cost: 51 },
      { name: "オレンジジュース", unit: "ml", capacity: 1000, purchasePrice: 400, usage: 150, cost: 60 },
    ],
  },
  {
    id: "moscow-mule", name: "モスコミュール", category: "📝 将来メニュー",
    cost: 115, price: 550,
    ingredients: [
      { name: "ウォッカ", unit: "ml", capacity: 700, purchasePrice: 1200, usage: 45, cost: 77 },
      { name: "ジンジャーエール", unit: "ml", capacity: 500, purchasePrice: 130, usage: 120, cost: 31 },
      { name: "ライム", unit: "個", capacity: 1, purchasePrice: 50, usage: 0.25, cost: 13 },
    ],
  },
  {
    id: "aperol-margarita", name: "アペロールマルガリータ", category: "🍸 Original Cocktail",
    cost: 184, price: 650,
    recipe: "テキーラ26ml、アペロール30ml、ライムジュース26ml、ガムシロップ18mlをシェイク。ロックグラスに氷を入れて注ぐ。",
    ingredients: [
      { name: "テキーラ（クエルボ）", unit: "ml", capacity: 750, purchasePrice: 1892, usage: 26, cost: 66 },
      { name: "アペロール", unit: "ml", capacity: 700, purchasePrice: 1776, usage: 30, cost: 76 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 655, usage: 26, cost: 32 },
      { name: "ガムシロップ", unit: "ml", capacity: 1000, purchasePrice: 550, usage: 18, cost: 10 },
    ],
  },
  {
    id: "berry-coconut-cloud", name: "ココナッツベリークラウド", category: "🍸 Original Cocktail",
    cost: 130, price: 650,
    ingredients: [
      { name: "ドライジン（GORDON'S）", unit: "ml", capacity: 700, purchasePrice: 1264, usage: 34, cost: 61 },
      { name: "ブラックベリーシロップ", unit: "ml", capacity: 700, purchasePrice: 1293, usage: 12, cost: 22 },
      { name: "ココナッツクリーム", unit: "ml", capacity: 1000, purchasePrice: 398, usage: 22, cost: 9 },
      { name: "グアバジュース（CHABAA）", unit: "ml", capacity: 1000, purchasePrice: 490, usage: 77, cost: 38 },
    ],
  },
  {
    id: "miami-sunset", name: "マイアミサンセット", category: "🍸 Original Cocktail",
    cost: 155, price: 650,
    ingredients: [
      { name: "バーボン（JIM BEAM 4L）", unit: "ml", capacity: 4000, purchasePrice: 5825, usage: 30, cost: 44 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 20, cost: 64 },
      { name: "オレンジジュース（ゴールドパック）", unit: "ml", capacity: 1000, purchasePrice: 378, usage: 85, cost: 32 },
      { name: "グレナデンシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 788, usage: 15, cost: 15 },
    ],
  },
  {
    id: "espresso-martini", name: "エスプレッソマティーニ", category: "🍸 Original Cocktail",
    cost: 119, price: 650,
    ingredients: [
      { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
      { name: "ウイスキー（JIM BEAM）", unit: "ml", capacity: 4000, purchasePrice: 6180, usage: 20, cost: 31 },
      { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 250, usage: 150, cost: 38 },
      { name: "バニラシロップ", unit: "ml", capacity: 1400, purchasePrice: 860, usage: 15, cost: 9 },
    ],
  },
  {
    id: "umeshu-mojito", name: "梅酒モヒート", category: "🍸 Original Cocktail",
    cost: 173, price: 650,
    ingredients: [
      { name: "梅酒（CHOYA熟成一年）", unit: "ml", capacity: 700, purchasePrice: 1010, usage: 30, cost: 43 },
      { name: "ジンジャーエール", unit: "ml", capacity: 9000, purchasePrice: 1277, usage: 70, cost: 10 },
      { name: "三ツ矢サイダー", unit: "ml", capacity: 12000, purchasePrice: 1450, usage: 50, cost: 6 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 655, usage: 30, cost: 36 },
      { name: "冷凍ライムスライス", unit: "g", capacity: 500, purchasePrice: 780, usage: 50, cost: 78 },
      { name: "ミント（自家栽培）", unit: "枚", capacity: 1, purchasePrice: 0, usage: 4, cost: 0 },
    ],
  },
  {
    id: "non-al-mojito", name: "ノンアルモヒート", category: "🍸 Bar / Cocktail",
    cost: 65, price: 500,
    ingredients: [
      { name: "ライム", unit: "個", capacity: 1, purchasePrice: 50, usage: 0.5, cost: 25 },
      { name: "ミント（自家栽培）", unit: "g", capacity: 50, purchasePrice: 0, usage: 5, cost: 0 },
      { name: "炭酸水", unit: "ml", capacity: 500, purchasePrice: 100, usage: 200, cost: 40 },
      { name: "シロップ", unit: "ml", capacity: 750, purchasePrice: 500, usage: 15, cost: 10 },
    ],
  },
  {
    id: "lemon-sour", name: "レモンサワー", category: "🍸 Bar / Cocktail",
    cost: 156, price: 650,
    recipe: "①よく冷やしたグラスに氷を入れる ②レモンジュース約30mlを入れる ③ウォッカ25mlを入れる ④コアントローをティースプーン1杯(5ml)入れる ⑤ガムシロップ5mlを入れる ⑥ここまでの材料をよく撹拌する ⑦開けたてのソーダを入れる ⑧氷を持ち上げるようにして混ぜる",
    ingredients: [
      { name: "ウォッカ（アブソルート）", unit: "ml", capacity: 750, purchasePrice: 1562, usage: 25, cost: 52 },
      { name: "レモンジュース（ポッカレモン100%）", unit: "ml", capacity: 720, purchasePrice: 972, usage: 30, cost: 41 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 5, cost: 16 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 5, cost: 5 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
  {
    id: "lime-sour", name: "ライムサワー", category: "🍸 Bar / Cocktail",
    cost: 155, price: 650,
    recipe: "①よく冷やしたグラスに氷を入れる ②ライムジュース約30mlを入れる ③ウォッカ25mlを入れる ④コアントローをティースプーン1杯(5ml)入れる ⑤ガムシロップ5mlを入れる ⑥ここまでの材料をよく撹拌する ⑦開けたてのソーダを入れる ⑧氷を持ち上げるようにして混ぜる",
    ingredients: [
      { name: "ウォッカ（アブソルート）", unit: "ml", capacity: 750, purchasePrice: 1562, usage: 25, cost: 52 },
      { name: "ライムジュース（ポッカ）", unit: "ml", capacity: 540, purchasePrice: 655, usage: 30, cost: 36 },
      { name: "ホワイトキュラソー（コアントロー）", unit: "ml", capacity: 700, purchasePrice: 2250, usage: 5, cost: 16 },
      { name: "ガムシロップ（サントリー）", unit: "ml", capacity: 780, purchasePrice: 808, usage: 5, cost: 5 },
      { name: "炭酸水（サンガリア185ml缶）", unit: "本", capacity: 1, purchasePrice: 47, usage: 1, cost: 47 },
    ],
  },
];

// ─── CRUD ───

export async function getMenuItems(): Promise<MenuItem[]> {
  const store = await kv();
  if (!store) return DEFAULT_MENU;
  const saved = await store.get<MenuItem[]>(MENU_KEY);
  return saved && saved.length > 0 ? saved : DEFAULT_MENU;
}

export async function saveMenuItems(items: MenuItem[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(MENU_KEY, items);
}

export async function upsertMenuItem(item: MenuItem): Promise<void> {
  const items = await getMenuItems();
  const idx = items.findIndex((i) => i.id === item.id);
  const updated = recalcItem({ ...item, updatedAt: new Date().toISOString() });
  if (idx >= 0) {
    items[idx] = updated;
  } else {
    items.push(updated);
  }
  await saveMenuItems(items);
}

export async function deleteMenuItem(id: string): Promise<void> {
  const items = await getMenuItems();
  await saveMenuItems(items.filter((i) => i.id !== id));
}

// ─── 領収書から仕入値自動更新 ───
// 領収書の品目名に材料名が含まれていたら、単価を更新する。
// 例: 「コーヒー豆2kg」→ エスプレッソ豆の仕入値を更新

// 材料名 → 領収書の品目名に含まれそうなキーワード
const INGREDIENT_KEYWORDS: Record<string, string[]> = {
  "エスプレッソ豆": ["コーヒー豆", "エスプレッソ", "珈琲豆"],
  "牛乳": ["牛乳", "ミルク"],
  "プロテインパウダー": ["プロテイン"],
  "ココアパウダー": ["ココア"],
  "バナナ": ["バナナ"],
  "ミックスベリー": ["ベリー", "ミックスベリー"],
  "食パン": ["食パン", "パン"],
  "バター": ["バター"],
  "マーガリン": ["マーガリン"],
  "ワッフルミックス": ["ワッフルミックス", "ワッフル粉"],
  "卵": ["卵", "たまご"],
  "抹茶": ["抹茶"],
  "チョコチップ": ["チョコチップ"],
  "ざらめ": ["ざらめ", "ザラメ"],
  "ハイネケン 330ml瓶": ["ハイネケン", "Heineken"],
  "テキーラ": ["テキーラ", "tequila"],
  "アペロール": ["アペロール", "Aperol", "aperol"],
  "ライムジュース": ["ライムジュース", "ライム果汁"],
  "ココナッツミルク": ["ココナッツミルク", "ココナッツ"],
  "シンプルシロップ": ["シロップ", "シンプルシロップ"],
  "バーボンウイスキー": ["バーボン"],
  "ウイスキー(JIM BEAM)": ["ウイスキー", "JIM BEAM", "ジムビーム"],
  "ウォッカ（アブソルート）": ["ウォッカ", "アブソルート", "ABSOLUT"],
  "ホワイトキュラソー（コアントロー）": ["コアントロー", "COINTREAU", "キュラソー"],
  "レモンジュース（ポッカレモン100%）": ["ポッカレモン", "レモンジュース"],
  "ガムシロップ（サントリー）": ["ガムシロップ"],
  "コロナ 330ml瓶": ["コロナ", "Corona"],
  "バドワイザー 330ml瓶": ["バドワイザー", "Budweiser"],
  "梅酒": ["梅酒"],
  "ジンジャーエール": ["ジンジャーエール"],
  "オレンジジュース": ["オレンジジュース", "オレンジ"],
  "ツナ": ["ツナ"],
  "ハム": ["ハム"],
  "チーズ": ["チーズ"],
  "マヨネーズ": ["マヨ"],
  "ケチャップ": ["ケチャップ"],
  "マスタード": ["マスタード"],
  "スパム": ["スパム", "SPAM"],
  "ブロッコリー": ["ブロッコリー"],
};

// 原価系カテゴリ
const COST_CATEGORIES = [
  "コーヒー豆・茶葉",
  "牛乳・シロップ等",
  "フード材料費",
  "その他原価",
];

/**
 * 領収書が保存されたとき、原価系の品目をチェックし、
 * メニューの材料の仕入値を自動更新する。
 * 呼び出し元: saveReceipt の後。
 */
export async function updateCostsFromReceipt(receipt: {
  summary: string;
  total: number;
  category: string;
  lines?: { name: string; amount: number; category: string }[];
}): Promise<{ updated: string[]; skipped: boolean }> {
  const lines = receipt.lines ?? [
    { name: receipt.summary, amount: receipt.total, category: receipt.category },
  ];

  // 原価系の品目だけ対象
  const costLines = lines.filter((l) => COST_CATEGORIES.includes(l.category));
  if (costLines.length === 0) return { updated: [], skipped: true };

  const items = await getMenuItems();
  const updatedNames: string[] = [];
  let changed = false;

  for (const line of costLines) {
    const lineName = line.name.toLowerCase();
    // 各材料のキーワードとマッチするか
    for (const [ingName, keywords] of Object.entries(INGREDIENT_KEYWORDS)) {
      const match = keywords.some((kw) => lineName.includes(kw.toLowerCase()));
      if (!match) continue;

      // マッチした材料を持つ全メニューの仕入値を更新
      for (const item of items) {
        for (const ing of item.ingredients) {
          if (ing.name === ingName) {
            // 仕入値を更新（内容量は維持）
            const newPrice = line.amount;
            if (newPrice > 0 && newPrice !== ing.purchasePrice) {
              ing.purchasePrice = newPrice;
              ing.cost = recalcCost(ing);
              changed = true;
              if (!updatedNames.includes(ingName)) updatedNames.push(ingName);
            }
          }
        }
      }
    }
  }

  if (changed) {
    // 全メニューの合計原価を再計算して保存
    const recalced = items.map(recalcItem);
    await saveMenuItems(recalced);
  }

  return { updated: updatedNames, skipped: false };
}
