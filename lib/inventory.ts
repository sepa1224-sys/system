// 仕入れ表管理：KVに保存し、仕入れアイテムを管理する。

const INVENTORY_KEY = "inventory:items";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type InventoryItem = {
  id: number;
  name: string;
  brand: string;
  category: string;
  unit: string;
  capacity: number;
  price: number;
  supplier: string;
  url: string;
  note: string;
  addedDate: string;
};

// ─── 初期データ ───

export const DEFAULT_INVENTORY: InventoryItem[] = [
  {
    id: 1,
    name: "スロージン",
    brand: "GORDON'S",
    category: "リキュール",
    unit: "ml",
    capacity: 700,
    price: 4621,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B004CYAWH6",
    note: "",
    addedDate: "2026-07-26",
  },
  {
    id: 5,
    name: "ロンドン ドライジン",
    brand: "GORDON'S",
    category: "スピリッツ",
    unit: "ml",
    capacity: 700,
    price: 1264,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B0952KV9NH",
    note: "37.5度 正規品 ¥1,264（税込）",
    addedDate: "2026-07-26",
  },
  {
    id: 6,
    name: "縦縞グラス（エスプレッソマティーニ用）",
    brand: "",
    category: "グラス・食器",
    unit: "個",
    capacity: 1,
    price: 0,
    supplier: "",
    url: "",
    note: "エスプレッソマティーニ提供用。仕入先・価格未定",
    addedDate: "2026-07-26",
  },
  {
    id: 7,
    name: "ロックグラス 330ml（アペロールマティーニ用）",
    brand: "",
    category: "グラス・食器",
    unit: "個",
    capacity: 1,
    price: 0,
    supplier: "カインズ",
    url: "",
    note: "アペロールマティーニ提供用 330ml",
    addedDate: "2026-07-26",
  },
  {
    id: 2,
    name: "グレナディン・シロップ",
    brand: "MONIN",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 700,
    price: 1293,
    supplier: "アスクル",
    url: "https://askul.co.jp/p/AXK5107/",
    note: "6本ケース ¥7,758（1本あたり¥1,293）",
    addedDate: "2026-07-26",
  },
  {
    id: 3,
    name: "ココナッツミルク",
    brand: "業務スーパー",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 1000,
    price: 398,
    supplier: "業務スーパー",
    url: "",
    note: "旧: kara(アスクル) 200ml ¥182 → 単価半額以下",
    addedDate: "2026-07-26",
  },
  {
    id: 4,
    name: "100%ジュース グァバ&グレープ",
    brand: "CHABAA",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 1000,
    price: 490,
    supplier: "楽天（ハルナプロデュース）",
    url: "https://item.rakuten.co.jp/izmic-ec/632237-01/",
    note: "12本ケース ¥5,880（1本あたり¥490）送料無料",
    addedDate: "2026-07-26",
  },
  {
    id: 8,
    name: "冷凍ライムスライス",
    brand: "アスク トロピカルマリア",
    category: "フード材料",
    unit: "g",
    capacity: 500,
    price: 780,
    supplier: "A-プライス",
    url: "https://a-price.jp/products/1100928",
    note: "1枚約50g。1ドリンクに1枚使用",
    addedDate: "2026-07-26",
  },
  {
    id: 9,
    name: "ジンジャーエール PET 1.5L×6本",
    brand: "カナダドライ（CANADA DRY）",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 9000,
    price: 1277,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B0886LTJT9",
    note: "定期おトク便なら¥1,213。1本あたり¥213",
    addedDate: "2026-07-26",
  },
  {
    id: 10,
    name: "The CHOYA 熟成一年 梅酒",
    brand: "チョーヤ（CHOYA）",
    category: "リキュール",
    unit: "ml",
    capacity: 700,
    price: 1010,
    supplier: "SAKE People",
    url: "https://sake-people.com/products/2set-1ot-00002",
    note: "6本セット ¥6,060（1本¥1,010）1万円以上で送料無料",
    addedDate: "2026-07-26",
  },
  {
    id: 11,
    name: "クエルボ エスペシャル ゴールド テキーラ",
    brand: "Jose Cuervo",
    category: "スピリッツ",
    unit: "ml",
    capacity: 750,
    price: 1892,
    supplier: "楽天（Vodkavakka）",
    url: "https://item.rakuten.co.jp/vodkavakka/600676/",
    note: "40度 正規品 送料別¥598",
    addedDate: "2026-07-26",
  },
  {
    id: 12,
    name: "お酒にプラスライム",
    brand: "ポッカサッポロ",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 540,
    price: 655,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B0BXCWJFMY",
    note: "6個セット ¥3,932（1個¥655）果汁80%",
    addedDate: "2026-07-26",
  },
  {
    id: 13,
    name: "三ツ矢サイダー 缶 250ml×20本",
    brand: "アサヒ飲料",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 5000,
    price: 1400,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B004P6HUNA",
    note: "税込¥1,400（1本¥70）。2026-08-24時点はタイムセール、通常は¥1,555前後",
    addedDate: "2026-07-26",
  },
  {
    id: 14,
    name: "アペロール",
    brand: "APEROL",
    category: "リキュール",
    unit: "ml",
    capacity: 700,
    price: 1776,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B0753CHW13",
    note: "法人価格¥1,776（税込）",
    addedDate: "2026-07-26",
  },
  {
    id: 15,
    name: "Wガムシロップ 業務用",
    brand: "ジーエスフード",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 1000,
    price: 550,
    supplier: "アスクル",
    url: "https://askul.co.jp/p/WJW0123/",
    note: "12本ケース ¥6,600（1本¥550）",
    addedDate: "2026-07-26",
  },
  {
    id: 16,
    name: "ジムビーム バーボン 4L",
    brand: "JIM BEAM",
    category: "スピリッツ",
    unit: "ml",
    capacity: 4000,
    price: 5825,
    supplier: "リカマンオンライン",
    url: "https://likaman-online.com/c/westernliquor/519818-4",
    note: "4本ケース ¥23,298 送料無料（1本¥5,825）",
    addedDate: "2026-07-26",
  },
  {
    id: 17,
    name: "コアントロー ホワイトキュラソー",
    brand: "COINTREAU",
    category: "リキュール",
    unit: "ml",
    capacity: 700,
    price: 2250,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B005Q8FQZU",
    note: "40度 並行輸入品 送料¥598",
    addedDate: "2026-07-26",
  },
  {
    id: 18,
    name: "グレナデンシロップ",
    brand: "サントリー",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 780,
    price: 788,
    supplier: "ビックカメラ",
    url: "https://biccamera.com/bc/item/1762439/",
    note: "¥788（税込）送料¥550（5,500円以上で無料）",
    addedDate: "2026-07-26",
  },
  {
    id: 19,
    name: "オレンジジュース 業務用 1L",
    brand: "ゴールドパック",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 1000,
    price: 378,
    supplier: "アスクル",
    url: "https://askul.co.jp/p/8496108/",
    note: "アウトレット 6本入 ¥2,268（1本¥378）12本なら¥4,500（1本¥375）",
    addedDate: "2026-07-26",
  },
  {
    id: 20,
    name: "炭酸水 185ml缶",
    brand: "サンガリア",
    category: "ジュース・シロップ",
    unit: "本",
    capacity: 1,
    price: 47,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B00K3ANFZY",
    note: "90本(3ケース) ¥4,230（¥47/本）送料無料",
    addedDate: "2026-07-26",
  },
  {
    id: 21,
    name: "コカ・コーラ PET 1.5L×6本",
    brand: "Coca-Cola",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 9000,
    price: 1088,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B08KH27PKW",
    note: "定期おトク便¥1,088。1本あたり¥181",
    addedDate: "2026-07-26",
  },
  {
    id: 22,
    name: "アブソルート ウォッカ",
    brand: "ABSOLUT",
    category: "スピリッツ",
    unit: "ml",
    capacity: 750,
    price: 1562,
    supplier: "リカマンオンライン",
    url: "https://likaman-online.com/c/westernliquor/spirits/vodka/609653",
    note: "40度 正規品 ¥1,562（税込）",
    addedDate: "2026-07-28",
  },
  {
    id: 23,
    name: "ガムシロップ",
    brand: "サントリー",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 780,
    price: 808,
    supplier: "カクヤス",
    url: "https://kakuyasu.co.jp/products/00000918",
    note: "12本1ケース ¥9,696（1本¥808）",
    addedDate: "2026-07-27",
  },
  {
    id: 24,
    name: "お酒にプラス レモン 540ml",
    brand: "ポッカサッポロ",
    category: "ジュース・シロップ",
    unit: "ml",
    capacity: 540,
    price: 597,
    supplier: "大和心（かぜとゆき）",
    url: "https://yamato-gokoro.co.jp/",
    note: "税込・送料無料。ポッカレモン100%から切り替え（2026-08-24）",
    addedDate: "2026-07-27",
  },
  {
    id: 25,
    name: "コロナ エキストラ 330ml瓶×24本",
    brand: "Corona",
    category: "ビール",
    unit: "本",
    capacity: 24,
    price: 5980,
    supplier: "リカマンオンライン",
    url: "https://likaman-online.com/p/cart",
    note: "1本あたり¥249。2ケース購入（¥11,960）",
    addedDate: "2026-07-27",
  },
  {
    id: 26,
    name: "ハイネケン ロングネック 330ml瓶×24本",
    brand: "Heineken",
    category: "ビール",
    unit: "本",
    capacity: 24,
    price: 6580,
    supplier: "リカマンオンライン",
    url: "https://likaman-online.com/p/cart",
    note: "1本あたり¥274。2ケース購入（¥13,160）",
    addedDate: "2026-07-27",
  },
  {
    id: 27,
    name: "バドワイザー 330ml瓶×24本",
    brand: "Budweiser",
    category: "ビール",
    unit: "本",
    capacity: 24,
    price: 5380,
    supplier: "リカマンオンライン",
    url: "https://likaman-online.com/p/cart",
    note: "1本あたり¥224。1ケース購入（¥5,380）",
    addedDate: "2026-07-27",
  },
  {
    id: 28,
    name: "トニックウォーター 185ml×30本",
    brand: "神戸居留地",
    category: "ミキサー・炭酸",
    unit: "本",
    capacity: 30,
    price: 2011,
    supplier: "Amazon",
    url: "https://www.amazon.co.jp/dp/B072ZVDQZ7",
    note: "1本あたり¥67（税込）。定期おトク便5%OFFで¥67/本",
    addedDate: "2026-07-28",
  },
];

// ─── CRUD ───

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const store = await kv();
  if (!store) return DEFAULT_INVENTORY;
  const saved = await store.get<InventoryItem[]>(INVENTORY_KEY);
  return saved && saved.length > 0 ? saved : DEFAULT_INVENTORY;
}

export async function saveInventoryItems(items: InventoryItem[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(INVENTORY_KEY, items);
}

export async function upsertInventoryItem(item: InventoryItem): Promise<void> {
  const items = await getInventoryItems();
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items[idx] = item;
  } else {
    items.push(item);
  }
  await saveInventoryItems(items);
}

export async function deleteInventoryItem(id: number): Promise<void> {
  const items = await getInventoryItems();
  await saveInventoryItems(items.filter((i) => i.id !== id));
}
