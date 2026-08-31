import { NextRequest, NextResponse } from "next/server";
import { getStaffLineIds, pushLine } from "@/lib/staffLine";
import { getBills, getPayments } from "@/lib/bills";
import { paymentsIn } from "@/lib/loans";

export const runtime = "nodejs";
export const maxDuration = 120;

// 週2回（月・木の朝）、経理でやることをLINEで知らせる。
// 明細が溜まってから気づくと腰が重くなるので、少ないうちに片付けてもらう。
// 送るのは坂本だけ（経理を触るのが坂本のため）。
const TARGET = "坂本";
const BASE = "https://flat-keihi.vercel.app";

const jstNow = () => new Date(Date.now() + 9 * 3600_000);

export async function GET(req: NextRequest) {
  try {
    const now = jstNow();
    const day = now.getUTCDay(); // 0=日 1=月 4=木
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (!force && day !== 1 && day !== 4) {
      return NextResponse.json({ skipped: true, reason: "月曜・木曜ではありません" });
    }
    const today = now.toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    // 未処理の銀行明細
    let txnLines: string[] = [];
    let txnCount = 0;
    try {
      const res = await fetch(`${req.nextUrl.origin}/api/freee/unprocessed`, { cache: "no-store" });
      const d = await res.json();
      const txns: { date: string; amount: number; description: string }[] = d?.txns ?? [];
      txnCount = txns.length;
      txnLines = txns
        .slice(0, 5)
        .map((t) => `・${t.date.slice(5)} ¥${t.amount.toLocaleString()} ${t.description.slice(0, 18)}`);
    } catch {
      /* freeeが落ちていても他は知らせる */
    }

    // 今月まだ払っていない定期請求
    let billLines: string[] = [];
    try {
      const [bills, payments] = await Promise.all([getBills(), getPayments()]);
      const paid = new Set(
        payments.filter((p) => p.month === month && p.paidAt).map((p) => p.billId),
      );
      billLines = bills
        .filter((b) => b.active && b.startMonth <= month && !paid.has(b.id))
        .map((b) => `・${b.payee} ¥${b.amount.toLocaleString()}${b.dueDay ? `（${b.dueDay}日）` : ""}`);
    } catch {
      /* 定期請求が読めなくても続ける */
    }

    // 今月の借入返済
    const loans = paymentsIn(month);
    const loanTotal = loans.reduce((s, p) => s + p.total, 0);

    const parts: string[] = ["【flat. 経理】やることの確認です"];
    if (txnCount > 0) {
      parts.push(
        "",
        `■ 未処理の銀行明細 ${txnCount}件`,
        ...txnLines,
        ...(txnCount > 5 ? [`ほか${txnCount - 5}件`] : []),
        `${BASE}/meisai`,
      );
    }
    if (billLines.length > 0) {
      parts.push("", `■ ${month} の支払いでまだのもの`, ...billLines, `${BASE}/bills`);
    }
    if (loans.length > 0) {
      parts.push(
        "",
        `■ 公庫の引き落とし ${loans[0].date.slice(5)}　¥${loanTotal.toLocaleString()}`,
        "口座の残高を確認してください",
      );
    }
    if (parts.length === 1) {
      parts.push("", "未処理の明細も、払い忘れもありません。きれいです✨");
    }

    const message = parts.join("\n");
    const ids = await getStaffLineIds();
    const id = ids[TARGET];
    if (!id) {
      return NextResponse.json({
        ok: false,
        error: "坂本のLINEが未登録です（勤怠のLINE打刻を一度開くと登録されます）",
        message,
      });
    }
    await pushLine(id, message);
    return NextResponse.json({ ok: true, txnCount, bills: billLines.length, message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
