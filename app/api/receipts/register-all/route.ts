import { NextRequest, NextResponse } from "next/server";
import { isConnected } from "@/lib/freee";
import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";
import { CATEGORY_MAP, clampIssueDate, FISCAL_START } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 300;

type Issue = { level: "error" | "warn"; message: string };

// 登録前に1件ずつ点検する。errorが1つでもあれば、その領収書は登録しない。
function inspect(r: SavedReceipt): Issue[] {
  const out: Issue[] = [];
  if (!r.date) out.push({ level: "error", message: "日付が空" });
  if (!r.total) out.push({ level: "error", message: "金額が空" });

  const lines = receiptLines(r);
  if (lines.length === 0) out.push({ level: "error", message: "内訳が無い" });

  for (const l of lines) {
    if (!CATEGORY_MAP[l.category]) {
      out.push({ level: "error", message: `科目「${l.category}」はfreeeに対応が無い（${l.name}）` });
    }
    if ((l.amount || 0) <= 0) {
      out.push({ level: "warn", message: `金額が0以下の行（${l.name}）` });
    }
    if ((l.amount || 0) >= 300000) {
      out.push({ level: "warn", message: `30万円以上。固定資産の判断が要る（${l.name} ¥${l.amount.toLocaleString()}）` });
    }
  }

  const sum = lines.reduce((s, l) => s + (l.amount || 0), 0);
  if (r.total && sum !== r.total) {
    out.push({ level: "warn", message: `内訳の合計¥${sum.toLocaleString()}が総額¥${r.total.toLocaleString()}と一致しない` });
  }

  if (r.date && r.date < FISCAL_START) {
    const { issueDate } = clampIssueDate(r.date);
    out.push({ level: "warn", message: `期首前の日付。${issueDate}に丸めて登録される` });
  }
  if (r.date && r.date > new Date().toISOString().slice(0, 10)) {
    out.push({ level: "warn", message: "未来の日付" });
  }

  const kind = r.expenseKind ?? "company";
  if ((kind === "company" || kind === "labor") && !r.payer) {
    out.push({ level: "warn", message: "立替者が未設定。取引先なしで登録される" });
  }
  return out;
}

// POST { dryRun?: boolean, ids?: string[] }
//   dryRun=true（既定）… 点検だけして登録しない
//   dryRun=false        … errorが無いものを順に登録する。失敗しても止めずに最後まで走る
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { dryRun?: boolean; ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* 空ボディはdryRun扱い */
  }
  const dryRun = body.dryRun !== false;

  const all = await getReceipts();
  const targets = all.filter(
    (r) => !r.registered && (!body.ids?.length || body.ids.includes(r.id)),
  );

  const checked = targets.map((r) => {
    const issues = inspect(r);
    return {
      id: r.id,
      date: r.date,
      vendor: r.vendor,
      total: r.total,
      expenseKind: r.expenseKind ?? "company",
      payer: r.payer,
      issues,
      blocked: issues.some((i) => i.level === "error"),
    };
  });

  const ready = checked.filter((c) => !c.blocked);
  const blocked = checked.filter((c) => c.blocked);
  const summary = {
    target: targets.length,
    ready: ready.length,
    blocked: blocked.length,
    warned: ready.filter((c) => c.issues.length > 0).length,
    readyAmount: ready.reduce((s, c) => s + (c.total || 0), 0),
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, summary, checked });
  }

  // 本実行。1件ずつ既存の登録APIと同じ経路を通す。
  const origin = req.nextUrl.origin;
  const results: { id: string; ok: boolean; journalId?: number; error?: string }[] = [];
  for (const c of ready) {
    try {
      const res = await fetch(`${origin}/api/receipts/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const d = await res.json();
      if (res.ok && d.ok) results.push({ id: c.id, ok: true, journalId: d.journalId });
      else results.push({ id: c.id, ok: false, error: d.error || `HTTP ${res.status}` });
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : "失敗" });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    dryRun: false,
    summary: { ...summary, registered: okCount, failed: results.length - okCount },
    results,
    blocked,
  });
}
