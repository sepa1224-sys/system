// 夜フードの作り方。厨房で見ながら作るためのもの。
// 原価表(lib/menu.ts)のrecipeは1行の文字列だが、こちらは手順を1ステップずつ持つ。
// 手順ごとに写真を付けられるようにしてある（言葉だけだと盛り付けが伝わらないため）。

const KEY = "food:recipes";
const PHOTO_PREFIX = "food:photo:";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Step = {
  text: string;
  /** 火加減や時間など、間違えると失敗する数値を強調して出す */
  timing?: string;
  /** 写真のid。/api/food-recipe/photo?id=... で取れる */
  photoId?: string;
};

export type FoodRecipe = {
  id: string;
  name: string;
  category: "夜フード" | "ホットサンド" | "デザート" | "その他";
  /** 提供までの目安（分） */
  minutes?: number;
  ingredients: string[];
  steps: Step[];
  /** 盛り付けのコツ・注意 */
  tips?: string[];
  updatedAt?: string;
};

/**
 * 最初から入れておくレシピ。坂本さんの口述をそのまま手順に落としたもの。
 * 画面から足した分はKVに入り、こちらと合わせて表示する。
 */
export const SEED_RECIPES: FoodRecipe[] = [
  {
    id: "mashed-potato-prosciutto",
    name: "マッシュポテトの生ハム包み",
    category: "夜フード",
    minutes: 5,
    ingredients: [
      "生ハム 5枚",
      "マッシュポテト スプーン5杯（1包みにつき1杯）",
      "ブラックペッパー",
      "オリーブオイル",
      "パセリ",
      "チーズ（削る）",
    ],
    steps: [
      { text: "生ハムをまな板に5枚広げる" },
      {
        text: "生ハムの時計でいう11時〜1時のあたりに、マッシュポテトをスプーン一杯分のせる",
        timing: "1枚につきスプーン1杯",
      },
      { text: "生ハムの左半分をマッシュポテトにかぶせ、そこからくるっと包む" },
      {
        text: "皿に盛り付ける。組体操のように下に3つ、上に2つ重ねる",
        timing: "下3・上2",
      },
      { text: "生ハムに包まれたマッシュポテトの上に、ブラックペッパーをひとつまみのせる" },
      {
        text: "オリーブオイルをかける。包みの上だけでなく、皿の余白にも点々と回しかける",
        timing: "皿にも散らす",
      },
      { text: "パセリを細かく散らす（包みの上と皿の余白の両方）" },
      { text: "チーズを削ってかけて完成", timing: "全体にふんわり" },
    ],
    tips: [
      "包むときは左半分からかぶせると形がきれいに出る",
      "オリーブオイルは皿の余白にも点で散らすと見栄えが上がる",
      "生ハムのフリルが立つように、押しつぶさずふんわり重ねる",
    ],
  },
  {
    id: "mashed-potato",
    name: "マッシュポテト",
    category: "夜フード",
    minutes: 3,
    ingredients: [
      "マッシュポテト ディッシャー1スクープ",
      "ピンクペッパー 3粒",
      "パセリ",
      "クラッカー 3枚",
      "ピクルス 3切れ",
      "チーズ（削る）",
      "小さな木のスプーン",
    ],
    steps: [
      {
        text: "ディッシャーでマッシュポテトを1スクープすくい、木の皿の中央より少しずらしてのせる",
        timing: "1スクープ・中央から少しずらす",
      },
      { text: "マッシュポテトの上にピンクペッパーを3粒のせる", timing: "3粒" },
      { text: "マッシュポテトにパセリをふりかける" },
      { text: "クラッカーを3枚盛り付ける", timing: "3枚" },
      { text: "ピクルスを3切れ盛り付ける", timing: "3切れ" },
      { text: "全体にチーズを削ってふりかける" },
      { text: "小さな木のスプーンを添えて提供" },
    ],
    tips: ["スプーンを添え忘れないこと（すくって食べてもらう料理のため）"],
  },
  {
    id: "blue-cheese-prosciutto",
    name: "ハチミツブルーチーズと生ハム盛り合わせ",
    category: "夜フード",
    minutes: 5,
    ingredients: [
      "ブルーチーズ 30g",
      "蜂蜜",
      "クラッカー 4枚",
      "パセリ",
      "生ハム 4枚",
      "オリーブオイル",
      "チーズ（削る）",
    ],
    steps: [
      {
        text: "ブルーチーズ30gをブロックにカットし、木のまな板の左上に盛り付ける",
        timing: "30g・左上",
      },
      {
        text: "ブルーチーズの上に蜂蜜をかける（お好み焼きにソースをかける要領で線を引くように）",
      },
      { text: "クラッカーを4枚、右下に盛り付ける", timing: "4枚・右下" },
      { text: "クラッカーにパセリをふる" },
      { text: "生ハムを4枚ふわりと包んで盛り付ける", timing: "4枚・ふわりと" },
      { text: "全体の上からオリーブオイルをかける" },
      { text: "チーズを削りかけて完成" },
    ],
    tips: [
      "ブルーチーズは左上、クラッカーは右下。対角に置くと収まりがよい",
      "生ハムは押しつぶさず、ふわりと空気を含ませて包む",
    ],
  },
  {
    id: "basil-sausage-sauerkraut",
    name: "バジルソーセージとザワークラウト",
    category: "夜フード",
    minutes: 12,
    ingredients: [
      "ソーセージ 2本（冷凍）",
      "水 80ml",
      "ローズマリー ひと束",
      "油（スキレット用）",
      "胡椒",
      "白ワイン カクテルカップ大1杯",
      "蜂蜜 少し",
      "バルサミコ酢 カクテルカップ小1杯",
      "マッシュポテト",
      "ピンクペッパー 3粒",
      "パセリ 少々",
      "ザワークラウト",
      "マスタード スプーン1杯",
      "チーズ",
    ],
    steps: [
      { text: "冷凍庫からソーセージを2本出す" },
      { text: "ホットサンドプレートにソーセージを並べ、水80mlを入れる", timing: "水 80ml" },
      { text: "沸騰するまで強火にあてる", timing: "強火・約1分" },
      { text: "沸騰したら中火にする" },
      { text: "2分たったらソーセージをひっくり返す", timing: "中火・2分" },
      { text: "さらに2分たったら、一気に強火にする", timing: "中火2分 → 強火10秒" },
      { text: "一旦火を消して10秒待つ", timing: "10秒" },
      { text: "もう一度10秒だけ強火で火を入れる", timing: "強火10秒" },
      { text: "ホットサンドプレートの水は捨てずに残しておく（あとでソースに使う）" },
      { text: "スキレットに油を引き、ローズマリーをひと束入れて中強火で温める" },
      { text: "スキレットが十分に温まったら中火に戻し、ソーセージを焼く" },
      { text: "3分ほど焼いて、全体に焼き目がつくようにする", timing: "中火・3分" },
      { text: "最後に中強火にして胡椒をふり、白ワインをカクテルカップ大1杯かける", timing: "白ワイン 大1杯" },
      { text: "白ワインが飛びきったらスキレットをどけて、木皿の上に載せる" },
      { text: "残しておいたホットサンドプレート（ソーセージの脂と水が残っている）を弱火で温める", timing: "弱火" },
      { text: "そこに蜂蜜を少しとバルサミコ酢をカクテルカップ小1杯入れて一緒に温める", timing: "バルサミコ 小1杯" },
      {
        text: "ソースを温めている間に、マッシュポテト（ピンクペッパー3粒とパセリ少々をのせる）・ザワークラウト・マスタード スプーン1杯をスキレットに盛り付ける",
        timing: "ピンクペッパー3粒",
      },
      { text: "ソースにとろみが出たら火を止め、ソーセージにかける" },
      { text: "最後にチーズを全体にまぶして完成", timing: "ザワークラウトにはかけない" },
    ],
    tips: [
      "ホットサンドプレートの水を捨てないこと。ソーセージの脂がソースのベースになる",
      "チーズはザワークラウトにかからないようにする",
    ],
  },
];

type Store = Record<string, FoodRecipe>;

async function load(): Promise<Store> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Store>(KEY)) ?? {};
}

/** 画面から足した分を含めた全レシピ。同じidなら足した方を優先する */
export async function getRecipes(): Promise<FoodRecipe[]> {
  const added = await load();
  const map = new Map<string, FoodRecipe>();
  for (const r of SEED_RECIPES) map.set(r.id, r);
  for (const r of Object.values(added)) map.set(r.id, r);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function saveRecipe(r: FoodRecipe): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await load();
  all[r.id] = { ...r, updatedAt: new Date().toISOString() };
  await store.set(KEY, all);
}

export async function savePhoto(id: string, dataUrl: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(PHOTO_PREFIX + id, dataUrl);
}

export async function getPhoto(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(PHOTO_PREFIX + id)) ?? null;
}

export const newRecipeId = () =>
  `fr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
