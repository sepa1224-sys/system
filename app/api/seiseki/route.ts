import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings, type Settings } from "@/lib/seiseki";
import { paymentsIn } from "@/lib/loans";

export const runtime = "nodejs";
export const maxDuration = 60;

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// GET /api/seiseki?month=2026-08
//   今月の売上（Square実績）と、前提値から出した利益の見込みを返す。
export async function GET(req: NextRequest) {
  try {
    const today = jstToday();
    const month = req.nextUrl.searchParams.get("month") || today.slice(0, 7);
    const from = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const to = `${month}-${String(lastDay).padStart(2, "0")}`;

    const settings = await getSettings();
    const res = await fetch(
      `${req.nextUrl.origin}/api/analytics?from=${from}&to=${to}&withEvents=1`,
      { cache: "no-store" },
    );
    // イベントの日も実際の売上なので含める（withEvents=1）
    const a = await res.json();
    const byDay: { day: string; sales: number; count: number }[] = a?.sales?.byDay ?? [];
    const sales = a?.sales?.total ?? 0;
    const orderCount = a?.sales?.orderCount ?? 0;

    // 今月がまだ途中なら、残り日数と「あと1日いくら必要か」を出す
    const isThisMonth = month === today.slice(0, 7);
    const doneDays = isThisMonth ? Number(today.slice(8, 10)) : lastDay;
    const leftDays = Math.max(0, lastDay - doneDays);

    const target = settings.targets[month] ?? 0;
    const cogs = Math.round(sales * settings.costRate);
    const gross = sales - cogs;
    // 経費は日割り。月末に満額かかる想定で、途中の日は経過分だけ乗せる。
    const spentRate = doneDays / lastDay;
    const fixed = Math.round(settings.fixedCost * spentRate);
    const labor = Math.round(settings.laborCost * spentRate);
    const profit = gross - fixed - labor;

    // 月末まで今のペースで進んだらどうなるか
    const pace = doneDays > 0 ? sales / doneDays : 0;
    const forecastSales = Math.round(pace * lastDay);
    const forecastProfit =
      Math.round(forecastSales * (1 - settings.costRate)) -
      settings.fixedCost -
      settings.laborCost;

    // 目標に届くには残りの日にいくら必要か
    const needPerDay = leftDays > 0 ? Math.max(0, Math.ceil((target - sales) / leftDays)) : 0;
    // 赤字にならないための最低ライン（月商）
    const breakEven = Math.round((settings.fixedCost + settings.laborCost) / (1 - settings.costRate));

    // 借入の返済。元金は費用にならないので利益からは引かないが、
    // 現金は出ていくので別枠で見せる。
    const loanPays = paymentsIn(month);
    const loan = {
      total: loanPays.reduce((s, p) => s + p.total, 0),
      principal: loanPays.reduce((s, p) => s + p.principal, 0),
      interest: loanPays.reduce((s, p) => s + p.interest, 0),
    };

    return NextResponse.json({
      month,
      today,
      loan,
      cashLeft: profit - loan.principal,
      settings,
      days: { total: lastDay, done: doneDays, left: leftDays },
      sales: { total: sales, orderCount, byDay, avgPerDay: Math.round(pace) },
      target,
      achieveRate: target ? Math.round((sales / target) * 1000) / 10 : null,
      needPerDay,
      pnl: { sales, cogs, gross, fixed, labor, profit },
      forecast: { sales: forecastSales, profit: forecastProfit },
      breakEven,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/seiseki  { costRate?, fixedCost?, laborCost?, targets?, breakdown? }
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Settings>;
    const saved = await saveSettings(body);
    return NextResponse.json({ ok: true, settings: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
