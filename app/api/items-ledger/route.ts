import { NextResponse } from "next/server";
import { getReceipts, receiptLines } from "@/lib/receipts";
import { getOverrides, resolveWithOverrides } from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 60;

// 品目ごとの購入台帳。仕訳（勘定科目）とは別に、
// 「ペーパータオルを何回・いくらで買ったか」を積み上げて見るためのもの。

export type Buy = {
  date: string;
  vendor: string;
  name: string;
  amount: number;
  category: string;
};

export type Ledger = {
  item: string;
  count: number;
  total: number;
  first: string;
  last: string;
  daysSinceLast: number;
  /** 2回以上買っていれば平均の購入間隔が出る */
  avgIntervalDays: number | null;
  categories: string[];
  vendors: string[];
  buys: Buy[];
};

const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

export async function GET() {
  try {
    const [overrides, receipts] = await Promise.all([getOverrides(), getReceipts()]);

    const map = new Map<string, Buy[]>();
    const unclassified: Buy[] = [];

    for (const r of receipts) {
      for (const l of receiptLines(r)) {
        const name = (l.name || "").trim();
        if (!name || !l.amount) continue;
        // 消費税の調整行は品目にしない
        if (/^消費税/.test(name)) continue;
        const buy: Buy = {
          date: r.date,
          vendor: r.vendor,
          name,
          amount: l.amount,
          category: l.category,
        };
        const item = resolveWithOverrides(name, overrides);
        if (!item) {
          unclassified.push(buy);
          continue;
        }
        const arr = map.get(item) ?? [];
        arr.push(buy);
        map.set(item, arr);
      }
    }

    const t = today();
    const ledgers: Ledger[] = [...map.entries()]
      .map(([item, buys]) => {
        buys.sort((a, b) => (a.date < b.date ? -1 : 1));
        const dates = [...new Set(buys.map((b) => b.date))];
        // 同じ日にまとめ買いした分は1回として間隔を測る
        const gaps = dates.slice(1).map((d, i) => dayDiff(dates[i], d));
        return {
          item,
          count: buys.length,
          total: buys.reduce((n, b) => n + b.amount, 0),
          first: dates[0],
          last: dates[dates.length - 1],
          daysSinceLast: dayDiff(dates[dates.length - 1], t),
          avgIntervalDays: gaps.length
            ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10
            : null,
          categories: [...new Set(buys.map((b) => b.category))],
          vendors: [...new Set(buys.map((b) => b.vendor))],
          buys: buys.slice().reverse(),
        };
      })
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      items: ledgers.length,
      total: ledgers.reduce((n, l) => n + l.total, 0),
      unclassifiedCount: unclassified.length,
      unclassifiedTotal: unclassified.reduce((n, b) => n + b.amount, 0),
      ledgers,
      unclassified: unclassified.sort((a, b) => b.amount - a.amount).slice(0, 60),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}
