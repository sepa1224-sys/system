import { NextRequest, NextResponse } from "next/server";
import { getReceipts, receiptLines } from "@/lib/receipts";
import { getOverrides, resolveWithOverrides } from "@/lib/freeeItems";
import { getDecisions, matchKbIn, getKbEntries } from "@/lib/kb";

export const runtime = "nodejs";
export const maxDuration = 300;

// 未処理明細を、まとめて「何を買ったか」まで突き止めるための下ごしらえ。
//
// 情報源は3つ。確実な順に使う。
//   1. 領収書   … 同じ日・同じ金額のレシートがあれば、その内訳がそのまま答え
//   2. 発注     … Gmailから取り込んだネット注文（Amazon/モノタロウ等）の金額一致
//   3. ノウハウ … 過去に同じ取引先で決めた科目
//
// ここでは判定材料を集めて返すだけで、freeeへの登録はしない。
// 人が確認してから /api/kb で確定する。

type Txn = {
  id: number;
  date: string;
  amount: number;
  description: string;
  side: string;
};

async function kvOrders() {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return [];
    const { createClient } = await import("@vercel/kv");
    const store = createClient({ url, token });
    return (await store.get<{
      source: string;
      orderNumber: string;
      orderDate: string;
      total: number;
      items: { name: string; quantity: number; price: number }[];
      status: string;
    }[]>("orders:pending")) ?? [];
  } catch {
    return [];
  }
}

const dayDiff = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

export async function POST(req: NextRequest) {
  try {
    const { txns } = (await req.json()) as { txns?: Txn[] };
    if (!txns?.length) {
      return NextResponse.json({ error: "txnsが必要です" }, { status: 400 });
    }

    const [receipts, orders, overrides, kb, decisions] = await Promise.all([
      getReceipts(),
      kvOrders(),
      getOverrides(),
      getKbEntries(),
      getDecisions(),
    ]);

    const results = txns.map((t) => {
      // すでに決めてあるものは触らない
      if (decisions[String(t.id)]) {
        return { id: t.id, date: t.date, amount: t.amount, source: "決定済み", done: true };
      }

      // ① 領収書と金額一致（10日以内）
      const r = receipts.find(
        (x) => x.total === t.amount && dayDiff(x.date, t.date) <= 10,
      );
      if (r) {
        const lines = receiptLines(r).map((l) => ({
          name: l.name,
          amount: l.amount,
          category: l.category,
          item: resolveWithOverrides((l.name || "").trim(), overrides) || "",
        }));
        return {
          id: t.id, date: t.date, amount: t.amount, description: t.description,
          source: "領収書", vendor: r.vendor, receiptId: r.id, lines,
        };
      }

      // ② 発注（ネット注文）と金額一致（10日以内）
      const o = orders.find(
        (x) =>
          x.status !== "skipped" &&
          x.total === t.amount &&
          dayDiff((x.orderDate || "").slice(0, 10), t.date) <= 10,
      );
      if (o) {
        const lines = (o.items ?? []).map((it) => ({
          name: it.name,
          amount: (it.price ?? 0) * (it.quantity ?? 1),
          category: "",
          item: resolveWithOverrides(it.name || "", overrides) || "",
        }));
        return {
          id: t.id, date: t.date, amount: t.amount, description: t.description,
          source: "注文", vendor: o.source, orderNumber: o.orderNumber, lines,
        };
      }

      // ③ 過去のノウハウ（取引先だけ分かる）
      const hint = matchKbIn(kb, t.description);
      return {
        id: t.id, date: t.date, amount: t.amount, description: t.description,
        source: hint ? "ノウハウのみ" : "不明",
        hintCategory: hint?.category, hintNote: hint?.note,
        lines: [],
      };
    });

    const by = results.reduce<Record<string, number>>((a, r) => {
      a[r.source] = (a[r.source] ?? 0) + 1;
      return a;
    }, {});
    return NextResponse.json({ count: results.length, summary: by, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
