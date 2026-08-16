// 仕入れサイクル分析。
// 領収書の履歴（いつ・何を買ったか）から、品目ごとの購入間隔を自動で割り出し、
// 「そろそろ切れる」時期を推定する。手で頻度を登録しなくても、買った実績が
// そのまま記録になる。

import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";

/** 品目名から数量・単価表記などのノイズを落として、同じ商品をまとめられる形にする */
export function normalizeItemName(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  // 全角空白・記号の揺れを吸収
  s = s.replace(/　/g, " ");
  // 「@1,080×2」「×3」「 2コ×単85」などの数量・単価表記を除去
  s = s.replace(/@[\d,]+\s*[×xX*]\s*\d+/g, " ");
  s = s.replace(/\d+\s*(コ|個|本|枚|点|袋|缶|パック|P|ｹ)\s*[×xX*]\s*[単]?[\d,]*/g, " ");
  s = s.replace(/[×xX*]\s*\d+\s*(コ|個|本|枚|点|袋|缶|パック)?/g, " ");
  s = s.replace(/\d+\s*(コ|個|本|枚|点|袋|缶|パック)(入)?/g, " ");
  // 括弧内の補足（まとめ売り値下、一括割引後 等）を除去
  s = s.replace(/[（(][^）)]*[）)]/g, " ");
  // 金額・数字だけの断片を除去
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
  avgIntervalDays: number | null; // 平均購入間隔（購入2回以上のときだけ）
  daysSinceLast: number;
  /** 次に買うべき推定日。間隔が分かる品目のみ */
  nextDueDate: string | null;
  /** 推定日まであと何日（マイナスは超過） */
  daysUntilDue: number | null;
  status: "overdue" | "soon" | "ok" | "unknown";
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

    let avgInterval: number | null = null;
    if (uniqDates.length >= 2) {
      let sum = 0;
      for (let i = 1; i < uniqDates.length; i++) {
        sum += dayDiff(uniqDates[i], uniqDates[i - 1]);
      }
      avgInterval = Math.round((sum / (uniqDates.length - 1)) * 10) / 10;
    }

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
    });
  }

  // 急ぎ順（超過が大きいものが上）→ 購入回数が多い順
  const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
  out.sort((x, y) => {
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
