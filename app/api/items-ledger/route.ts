import { NextResponse } from "next/server";
import { getReceipts, receiptLines } from "@/lib/receipts";
import type { PendingOrder } from "../cron/amazon-sync/route";
import { getDecisions } from "@/lib/kb";
import { getOverrides, resolveWithOverrides } from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 60;

// 品目ごとの購入台帳。仕訳（勘定科目）とは別に、
// 「ペーパータオルを何回・いくらで買ったか」を積み上げて見るためのもの。
//
// もとになるのは3つ。買い方が違っても同じ台帳に集まるようにしている。
//   1. 領収書        … 店で買ってレシートを撮ったもの
//   2. 注文          … Gmailから取り込んだネット購入（Amazon・モノタロウなど）
//   3. 明細で決めた分 … 銀行明細をAIと相談して仕訳したもの（注文メールが無いもの）
// 3つ目は品名から判定するのではなく、そのとき人が決めた品目をそのまま使う。

export type Buy = {
  date: string;
  vendor: string;
  name: string;
  amount: number;
  category: string;
  /** どこから来た記録か */
  from: "領収書" | "注文" | "明細";
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

// Gmailから取り込んだ注文。取り込めなくても台帳自体は出したいので、失敗しても空で返す
async function getOrders(): Promise<PendingOrder[]> {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return [];
    const { createClient } = await import("@vercel/kv");
    const store = createClient({ url, token });
    return (await store.get<PendingOrder[]>("orders:pending")) ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [overrides, receipts, orders, decisions] = await Promise.all([
      getOverrides(),
      getReceipts(),
      getOrders(),
      getDecisions().catch(() => ({})),
    ]);

    const map = new Map<string, Buy[]>();
    const unclassified: Buy[] = [];

    for (const r of receipts) {
      for (const l of receiptLines(r)) {
        const name = (l.name || "").trim();
        if (!name || !l.amount) continue;
        // 消費税の調整行は品目にしない
        if (/^消費税/.test(name)) continue;
        // 小口現金の入出金はお金の移動であって購入ではない
        if (/小口現金/.test(name)) continue;
        const buy: Buy = {
          date: r.date,
          vendor: r.vendor,
          name,
          amount: l.amount,
          category: l.category,
          from: "領収書",
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

    // 注文（Amazonなど）。見送った分は買っていないので入れない
    // 同じ注文が「注文確認」と「出荷通知」の2通から二重に入ることがある。
    // 注文番号＋金額が同じものは1回だけ数える
    const seenOrder = new Set<string>();
    for (const o of orders) {
      if (o.status === "skipped") continue;
      const dupKey = `${o.source}_${o.orderNumber}_${o.total}`;
      if (o.orderNumber && seenOrder.has(dupKey)) continue;
      seenOrder.add(dupKey);
      for (const it of o.items ?? []) {
        const name = (it.name || "").trim();
        const amount = (it.price ?? 0) * (it.quantity ?? 1);
        if (!name || !amount) continue;
        const buy: Buy = {
          date: (o.orderDate || "").slice(0, 10),
          vendor: o.source,
          name,
          amount,
          category: o.account || "仕入高",
          from: "注文",
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

    // 明細で決めた分。品目は人が決めているので、品名からの判定はしない
    for (const d of Object.values(decisions)) {
      for (const l of d.lines ?? []) {
        const item = (l.item || "").trim();
        if (!item || !l.amount) continue;
        const buy: Buy = {
          date: (d.date || d.decidedAt || "").slice(0, 10),
          vendor: d.partner || d.description || "明細",
          name: l.memo || item,
          amount: l.amount,
          category: l.category,
          from: "明細",
        };
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
