// みんなに見せる「今月の成績」の前提値。
// 売上はSquareの実績をそのまま使い、原価と経費はここに置いた前提で概算する。
// 正確な決算はfreeeが正。これは「今月どうなっているか」を全員で見るための道具。

const KEY = "seiseki:settings";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Settings = {
  /** 原材料費率。売上に比例する分 */
  costRate: number;
  /** 毎月出ていく運営経費（家賃・光熱費・消耗品など）。初期投資は含めない */
  fixedCost: number;
  /** 人件費（役員報酬＋社会保険の会社負担＋業務委託＋アルバイト） */
  laborCost: number;
  /** 月ごとの売上目標。"2026-09" → 709500 */
  targets: Record<string, number>;
  /** 経費の内訳。画面で「何にいくらかかっているか」を見せるためだけのもの */
  breakdown: { label: string; amount: number }[];
};

// 売上計画シート（2026-06-27版）の数字と、8月の実績から割り出した経費。
export const DEFAULTS: Settings = {
  costRate: 0.3,
  fixedCost: 288090,
  laborCost: 0,
  targets: {
    "2026-08": 654100,
    "2026-09": 709500,
    "2026-10": 1091200,
    "2026-11": 1527000,
    "2026-12": 1731350,
    "2027-01": 1094300,
    "2027-02": 1038800,
  },
  breakdown: [
    { label: "家賃・管理費・駐車場", amount: 146500 },
    { label: "水道光熱費（仮）", amount: 50000 },
    { label: "消耗品費", amount: 59997 },
    { label: "広告宣伝費", amount: 14447 },
    { label: "決済手数料", amount: 5633 },
    { label: "通信費", amount: 4513 },
    { label: "保険料", amount: 4000 },
    { label: "交際費", amount: 3000 },
  ],
};

export async function getSettings(): Promise<Settings> {
  const store = await kv();
  if (!store) return DEFAULTS;
  const saved = await store.get<Partial<Settings>>(KEY);
  return { ...DEFAULTS, ...(saved ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const next = { ...(await getSettings()), ...patch };
  await store.set(KEY, next);
  return next;
}
