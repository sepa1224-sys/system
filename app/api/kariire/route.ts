import { NextResponse } from "next/server";
import { getReceipts, receiptLines } from "@/lib/receipts";

export const runtime = "nodejs";

// GET: 役員借入金（立替）の詳細一覧
export async function GET() {
  try {
    const receipts = await getReceipts();

    // 立替（expenseKind === "company"）のみ抽出
    const advances = receipts
      .filter((r) => r.expenseKind === "company" || !r.expenseKind) // 旧データはexpenseKind未設定=立替
      .map((r) => {
        const lines = receiptLines(r);
        return {
          id: r.id,
          date: r.date,
          vendor: r.vendor,
          total: r.total,
          payer: r.payer || "不明",
          category: r.category,
          memo: r.memo,
          registered: !!r.registered,
          registeredAt: r.registered?.at,
          lines: lines.map((l) => ({
            name: l.name,
            amount: l.amount,
            category: l.category,
            tags: l.tags,
          })),
        };
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));

    // 立替者ごとの集計
    const byPayer: Record<string, { total: number; unpaid: number; count: number; unpaidCount: number }> = {};
    for (const a of advances) {
      if (!byPayer[a.payer]) byPayer[a.payer] = { total: 0, unpaid: 0, count: 0, unpaidCount: 0 };
      byPayer[a.payer].total += a.total;
      byPayer[a.payer].count += 1;
      if (!a.registered) {
        byPayer[a.payer].unpaid += a.total;
        byPayer[a.payer].unpaidCount += 1;
      }
    }

    // 科目（タグ）ごとの集計
    const byTag: Record<string, number> = {};
    for (const a of advances) {
      for (const l of a.lines) {
        for (const tag of l.tags || []) {
          byTag[tag] = (byTag[tag] || 0) + l.amount;
        }
      }
    }

    return NextResponse.json({
      summary: {
        totalAmount: advances.reduce((s, a) => s + a.total, 0),
        totalCount: advances.length,
        byPayer,
        byTag: Object.entries(byTag)
          .sort((a, b) => b[1] - a[1])
          .map(([tag, amount]) => ({ tag, amount })),
      },
      advances,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
