// 月次会計データ管理：KVに保存

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

// キー: accounting:2026-08 のように月ごと
function monthKey(ym: string) {
  return `accounting:${ym}`;
}

// 月次データ構造
export type MonthlyData = {
  ym: string; // "2026-08"

  // 資金
  carryover: number; // 前月繰越金
  additionalFunds: number; // 追加資金
  additionalFundsMemo: string;

  // 原価
  costCoffeeBeans: number; // コーヒー豆・茶葉
  costMilkSyrup: number; // 牛乳・シロップ等
  costFoodMaterials: number; // フード材料費
  costPackaging: number; // 包装資材・消耗品
  costOther: number; // その他原価

  // 経費（販管費）
  expRent: number; // 家賃
  expUtilities: number; // 水道光熱費
  expTelecom: number; // 通信費
  expInsurance: number; // 保険料
  expLabor: number; // 人件費（給与・社保）
  expSupplies: number; // 消耗品費
  expAdvertising: number; // 広告宣伝費
  expRepair: number; // 修繕費
  expOther: number; // その他経費
  expDepreciation: number; // 減価償却費

  // 一括経費
  bulkExpenses: { name: string; amount: number }[];

  // KPI
  operatingDays: number; // 営業日数
  visitors: number; // 来客数

  // メモ
  memo: string;
};

export function emptyMonth(ym: string): MonthlyData {
  return {
    ym,
    carryover: 0, additionalFunds: 0, additionalFundsMemo: "",
    costCoffeeBeans: 0, costMilkSyrup: 0, costFoodMaterials: 0,
    costPackaging: 0, costOther: 0,
    expRent: 0, expUtilities: 0, expTelecom: 0, expInsurance: 0,
    expLabor: 0, expSupplies: 0, expAdvertising: 0, expRepair: 0,
    expOther: 0, expDepreciation: 14434,
    bulkExpenses: [],
    operatingDays: 0, visitors: 0,
    memo: "",
  };
}

export async function getMonth(ym: string): Promise<MonthlyData> {
  const client = await kv();
  if (!client) return emptyMonth(ym);
  const data = await client.get<MonthlyData>(monthKey(ym));
  return data || emptyMonth(ym);
}

export async function saveMonth(data: MonthlyData): Promise<void> {
  const client = await kv();
  if (!client) throw new Error("KV未設定");
  await client.set(monthKey(data.ym), data);
}

// 全月データ取得（月次レポート用）
export async function getAllMonths(): Promise<MonthlyData[]> {
  const months = [];
  const year = new Date().getFullYear();
  // 4月始まり
  const ymList = [
    `${year}-04`, `${year}-05`, `${year}-06`, `${year}-07`,
    `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`,
    `${year}-12`, `${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`,
  ];
  for (const ym of ymList) {
    months.push(await getMonth(ym));
  }
  return months;
}

// 計算ヘルパー
export function calcTotals(d: MonthlyData, salesTotal: number) {
  const costTotal = d.costCoffeeBeans + d.costMilkSyrup + d.costFoodMaterials + d.costPackaging + d.costOther;
  const expCash = d.expRent + d.expUtilities + d.expTelecom + d.expInsurance + d.expLabor + d.expSupplies + d.expAdvertising + d.expRepair + d.expOther;
  const expTotal = expCash + d.expDepreciation;
  const bulkTotal = d.bulkExpenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = salesTotal - costTotal;
  const grossMargin = salesTotal > 0 ? grossProfit / salesTotal : 0;
  const operatingProfit = grossProfit - expTotal;
  const operatingMargin = salesTotal > 0 ? operatingProfit / salesTotal : 0;
  const costRate = salesTotal > 0 ? costTotal / salesTotal : 0;
  const avgSpend = d.visitors > 0 ? salesTotal / d.visitors : 0;
  const dailySales = d.operatingDays > 0 ? salesTotal / d.operatingDays : 0;
  const laborRate = salesTotal > 0 ? d.expLabor / salesTotal : 0;
  const startFunds = d.carryover + d.additionalFunds;
  const endBalance = startFunds - costTotal - expCash - bulkTotal + salesTotal;

  return {
    costTotal, expCash, expTotal, bulkTotal,
    grossProfit, grossMargin,
    operatingProfit, operatingMargin,
    costRate, avgSpend, dailySales, laborRate,
    startFunds, endBalance,
  };
}
