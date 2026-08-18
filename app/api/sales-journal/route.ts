import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";

export const runtime = "nodejs";
export const maxDuration = 300;

const COMPANY = Number(FREEE_COMPANY_ID);
const KEY = "sales:journaled"; // 登録済みの日付 → 伝票ID

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

async function getDone(): Promise<Record<string, number>> {
  const store = await kv();
  return store ? ((await store.get<Record<string, number>>(KEY)) ?? {}) : {};
}

async function markDone(date: string, journalId: number) {
  const store = await kv();
  if (!store) return;
  const cur = (await store.get<Record<string, number>>(KEY)) ?? {};
  cur[date] = journalId;
  await store.set(KEY, cur);
}

/** 勘定科目を名前で引く。完全一致を優先し、無ければ部分一致 */
async function accountId(name: string): Promise<number | null> {
  const r = await freeeGet<{ account_items: { id: number; name: string }[] }>(
    "/api/1/account_items",
    { company_id: FREEE_COMPANY_ID },
  );
  const list = r.account_items ?? [];
  return (
    list.find((a) => a.name === name)?.id ??
    list.find((a) => a.name.includes(name))?.id ??
    null
  );
}

type Day = { date: string; cash: number; other: number; total: number; count: number };

/** Squareの売上を日別・支払方法別に集計する。現金とそれ以外（カード/PayPay）に分ける */
async function squareDays(origin: string, from: string, to: string): Promise<Day[]> {
  const res = await fetch(`${origin}/api/square/sales?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Square売上の取得に失敗(${res.status})`);
  const d = (await res.json()) as {
    orders?: {
      created_jst: string;
      total: number;
      tenders?: { type: string; amount: number }[];
    }[];
  };
  const map = new Map<string, Day>();
  for (const o of d.orders ?? []) {
    const date = (o.created_jst || "").slice(0, 10);
    if (!date) continue;
    const cur = map.get(date) ?? { date, cash: 0, other: 0, total: 0, count: 0 };
    const tenders = o.tenders ?? [];
    if (tenders.length === 0) {
      // 支払方法が取れないものは「その他」に寄せる（Squareの入金で回収される）
      cur.other += o.total;
    } else {
      for (const t of tenders) {
        if (t.type === "CASH") cur.cash += t.amount;
        else cur.other += t.amount;
      }
    }
    cur.total += o.total;
    cur.count += 1;
    map.set(date, cur);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// GET /api/sales-journal?from=2026-08-08&to=2026-08-18
//   日別の売上と、freeeへの登録状況を返す
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const sp = req.nextUrl.searchParams;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = sp.get("from") || "2026-08-08";
    const to = sp.get("to") || today;

    const [days, done] = await Promise.all([
      squareDays(req.nextUrl.origin, from, to),
      getDone(),
    ]);
    const rows = days.map((d) => ({ ...d, journalId: done[d.date] ?? null }));
    const pending = rows.filter((r) => !r.journalId);
    return NextResponse.json({
      from,
      to,
      days: rows,
      summary: {
        days: rows.length,
        pending: pending.length,
        cash: rows.reduce((n, r) => n + r.cash, 0),
        other: rows.reduce((n, r) => n + r.other, 0),
        total: rows.reduce((n, r) => n + r.total, 0),
        pendingTotal: pending.reduce((n, r) => n + r.total, 0),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/sales-journal { from, to, dates?, dryRun? }
//   日ごとに振替伝票を作る:
//     借) 現金    …その日の現金売上
//     借) 売掛金  …カード・PayPay（あとでSquareの入金で消し込む）
//     貸) 売上高  …合計
//   登録済みの日は二重計上しないよう飛ばす。
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      from?: string;
      to?: string;
      dates?: string[];
      dryRun?: boolean;
    };
    const dryRun = body.dryRun !== false;
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const from = body.from || "2026-08-08";
    const to = body.to || today;

    const [cashId, arId, salesId] = await Promise.all([
      accountId("現金"),
      accountId("売掛金"),
      accountId("売上高"),
    ]);
    const missing = [!cashId && "現金", !arId && "売掛金", !salesId && "売上高"].filter(
      Boolean,
    );
    if (missing.length) {
      return NextResponse.json(
        { error: `freeeに勘定科目が見つかりません: ${missing.join("・")}` },
        { status: 400 },
      );
    }

    const days = await squareDays(req.nextUrl.origin, from, to);
    const done = await getDone();
    const targets = days.filter(
      (d) =>
        d.total > 0 && !done[d.date] && (!body.dates?.length || body.dates.includes(d.date)),
    );

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        accounts: { cash: cashId, ar: arId, sales: salesId },
        targets,
        summary: {
          days: targets.length,
          cash: targets.reduce((n, d) => n + d.cash, 0),
          other: targets.reduce((n, d) => n + d.other, 0),
          total: targets.reduce((n, d) => n + d.total, 0),
        },
      });
    }

    const results: { date: string; journalId?: number; error?: string }[] = [];
    for (const d of targets) {
      const details = [
        ...(d.cash > 0
          ? [{ entry_side: "debit", account_item_id: cashId, tax_code: 2, amount: d.cash }]
          : []),
        ...(d.other > 0
          ? [{ entry_side: "debit", account_item_id: arId, tax_code: 2, amount: d.other }]
          : []),
        { entry_side: "credit", account_item_id: salesId, tax_code: 2, amount: d.total },
      ];
      try {
        const res = await freeePost<{ manual_journal: { id: number } }>(
          "/api/1/manual_journals",
          { company_id: COMPANY, issue_date: d.date, details },
        );
        const id = res.manual_journal?.id;
        if (id) await markDone(d.date, id);
        results.push({ date: d.date, journalId: id });
      } catch (e) {
        results.push({ date: d.date, error: e instanceof Error ? e.message : "失敗" });
      }
    }
    return NextResponse.json({
      ok: true,
      registered: results.filter((r) => r.journalId).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}
