import { NextRequest, NextResponse } from "next/server";
import { LOANS, schedule, paymentsIn, balanceAt } from "@/lib/loans";

export const runtime = "nodejs";

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// GET /api/loans?month=2026-09
//   借入ごとの返済予定と、指定した月に払う金額を返す。
export async function GET(req: NextRequest) {
  const today = jstToday();
  const month = req.nextUrl.searchParams.get("month") || today.slice(0, 7);

  const loans = LOANS.map((l) => {
    const sc = schedule(l);
    const done = sc.filter((i) => i.date <= today);
    const next = sc.find((i) => i.date > today);
    return {
      ...l,
      rounds: sc.length,
      lastDate: sc[sc.length - 1]?.date,
      balance: done.length ? done[done.length - 1].balance : l.principal,
      paidPrincipal: done.reduce((s, i) => s + i.principal, 0),
      paidInterest: done.reduce((s, i) => s + i.interest, 0),
      totalInterest: sc.reduce((s, i) => s + i.interest, 0),
      next: next ?? null,
      schedule: sc,
    };
  });

  const thisMonth = paymentsIn(month);

  // 年ごとの返済額。何年で終わるか、いつ重いかを見るため
  const byYear: Record<string, { principal: number; interest: number; total: number }> = {};
  for (const l of LOANS) {
    for (const i of schedule(l)) {
      const y = i.date.slice(0, 4);
      byYear[y] = byYear[y] || { principal: 0, interest: 0, total: 0 };
      byYear[y].principal += i.principal;
      byYear[y].interest += i.interest;
      byYear[y].total += i.total;
    }
  }

  return NextResponse.json({
    today,
    month,
    loans,
    thisMonth,
    thisMonthTotal: thisMonth.reduce((s, p) => s + p.total, 0),
    balanceNow: balanceAt(today),
    byYear: Object.entries(byYear)
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => a.year.localeCompare(b.year)),
  });
}
