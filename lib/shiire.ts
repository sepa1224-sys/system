// 仕入れサイクル分析。
// 領収書の履歴（いつ・何を買ったか）から、品目ごとの購入間隔を自動で割り出し、
// 「そろそろ切れる」時期を推定する。手で頻度を登録しなくても、買った実績が
// そのまま記録になる。

import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";

// 商品ではない行（税額調整・送料・値引きなど）。仕入れ周期の対象から外す。
const NOISE_PATTERNS = [
  /消費税/, /税額/, /内税/, /外税/,
  /送料/, /配送料/, /手数料/,
  /値引/, /割引/, /ポイント/, /調整/,
  /^合計/, /^小計/, /^お?釣/,
];

export function isNoiseItem(name: string): boolean {
  const s = String(name || "").trim();
  if (!s) return true;
  return NOISE_PATTERNS.some((p) => p.test(s));
}

/** 品目名から数量・単価表記などのノイズを落として、同じ商品をまとめられる形にする */
export function normalizeItemName(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/　/g, " ");
  // 括弧内の補足（まとめ売り値下、一括割引後 等）を先に除去
  s = s.replace(/[（(][^）)]*[）)]/g, " ");
  // 「@1,080×2」「@495×2」など単価×数量
  s = s.replace(/@\s*[\d,]+\s*[×xX*✕╳]\s*\d+/g, " ");
  // 「2コ×単100」「5コ×単148」など 数量×単価
  s = s.replace(/\d+\s*(コ|個|本|枚|点|袋|缶|パック|P|ｹ|ヶ)?\s*[×xX*✕╳]\s*単?\s*[\d,]+/g, " ");
  // 「×3」「x2」など末尾の数量
  s = s.replace(/[×xX*✕╳]\s*\d+\s*(コ|個|本|枚|点|袋|缶|パック)?/g, " ");
  // 「3個」「2コ」「4点」など単独の数量
  s = s.replace(/\d+\s*(コ|個|本|枚|点|袋|缶|パック|ヶ)(入)?(?![a-zA-Z])/g, " ");
  // 残った金額表記
  s = s.replace(/[¥￥][\d,]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export type PurchaseStat = {
  name: string; // 正規化後の品目名
  displayName: string; // 直近の実際の表記
  category: string;
  vendor: string; // 直近の購入先
  count: number; // 購入回数
  dates: string[]; // 購入日（昇順）
  lastDate: string;
  lastAmount: number;
  totalAmount: number;
  avgIntervalDays: number | null; // 購入間隔の中央値（購入2回以上のときだけ）
  daysSinceLast: number;
  /** 次に買うべき推定日。間隔が分かる品目のみ */
  nextDueDate: string | null;
  /** 推定日まであと何日（マイナスは超過） */
  daysUntilDue: number | null;
  status: "overdue" | "soon" | "ok" | "unknown";
  /** 周期の信頼度。開業準備中にまとめ買いしただけの物を「定期購入」と誤認しないための指標 */
  reliable: boolean;
  spanDays: number; // 初回購入から前回購入までの期間
};

const DAY = 86_400_000;
const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY);

/**
 * 領収書から品目ごとの購入サイクルを集計する。
 * minCount=1 なら1回しか買っていないものも含める（間隔は不明扱い）。
 */
export function analyzePurchases(
  receipts: SavedReceipt[],
  opts: { minCount?: number; soonDays?: number } = {},
): PurchaseStat[] {
  const minCount = opts.minCount ?? 1;
  const soonDays = opts.soonDays ?? 3;
  const today = jstToday();

  type Acc = {
    displayName: string;
    category: string;
    vendor: string;
    dates: string[];
    amounts: number[];
    lastDate: string;
  };
  const map = new Map<string, Acc>();

  for (const r of receipts) {
    if (!r.date) continue;
    for (const l of receiptLines(r)) {
      if (isNoiseItem(l.name)) continue;
      const key = normalizeItemName(l.name);
      if (!key || key.length < 2) continue;
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          displayName: l.name,
          category: l.category || "不明",
          vendor: r.vendor || "",
          dates: [r.date],
          amounts: [l.amount || 0],
          lastDate: r.date,
        });
      } else {
        cur.dates.push(r.date);
        cur.amounts.push(l.amount || 0);
        if (r.date > cur.lastDate) {
          cur.lastDate = r.date;
          cur.displayName = l.name;
          cur.vendor = r.vendor || cur.vendor;
          cur.category = l.category || cur.category;
        }
      }
    }
  }

  const out: PurchaseStat[] = [];
  for (const [name, a] of map) {
    if (a.dates.length < minCount) continue;
    const dates = [...a.dates].sort();
    // 同日の重複購入は1回として扱う（1回の買い物で複数行に分かれることがあるため）
    const uniqDates = [...new Set(dates)];

    // 間隔は中央値を使う（開業準備の連日購入のような外れ値に引っ張られないため）
    let avgInterval: number | null = null;
    const intervals: number[] = [];
    for (let i = 1; i < uniqDates.length; i++) {
      intervals.push(dayDiff(uniqDates[i], uniqDates[i - 1]));
    }
    if (intervals.length > 0) {
      const sorted = [...intervals].sort((x, y) => x - y);
      const mid = Math.floor(sorted.length / 2);
      avgInterval =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    }

    const spanDays = uniqDates.length >= 2 ? dayDiff(uniqDates[uniqDates.length - 1], uniqDates[0]) : 0;
    // 開業準備中に数日で何度も買った備品を「定期購入」と誤認しないための条件。
    // 3回以上買っていて、初回から前回まで2週間以上にわたっていれば周期とみなす。
    const reliable = uniqDates.length >= 3 && spanDays >= 14;

    const daysSinceLast = dayDiff(today, a.lastDate);
    let nextDueDate: string | null = null;
    let daysUntilDue: number | null = null;
    let status: PurchaseStat["status"] = "unknown";

    if (avgInterval && avgInterval > 0) {
      const due = new Date(new Date(a.lastDate).getTime() + avgInterval * DAY);
      nextDueDate = due.toISOString().slice(0, 10);
      daysUntilDue = dayDiff(nextDueDate, today);
      status = daysUntilDue < 0 ? "overdue" : daysUntilDue <= soonDays ? "soon" : "ok";
    }

    out.push({
      name,
      displayName: a.displayName,
      category: a.category,
      vendor: a.vendor,
      count: uniqDates.length,
      dates: uniqDates,
      lastDate: a.lastDate,
      lastAmount: a.amounts[a.amounts.length - 1] || 0,
      totalAmount: a.amounts.reduce((s, x) => s + x, 0),
      avgIntervalDays: avgInterval,
      daysSinceLast,
      nextDueDate,
      daysUntilDue,
      status,
      reliable,
      spanDays,
    });
  }

  // 信頼できる周期のものを優先し、その中で急ぎ順 → 購入回数が多い順
  const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
  out.sort((x, y) => {
    if (x.reliable !== y.reliable) return x.reliable ? -1 : 1;
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    if (x.daysUntilDue !== null && y.daysUntilDue !== null) return x.daysUntilDue - y.daysUntilDue;
    return y.count - x.count;
  });
  return out;
}

export async function getPurchaseStats(
  opts: { minCount?: number; soonDays?: number } = {},
): Promise<PurchaseStat[]> {
  const receipts = await getReceipts();
  return analyzePurchases(receipts, opts);
}
