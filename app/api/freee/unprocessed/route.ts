import { NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { matchKb, getDecisions } from "@/lib/kb";
import { matchDocs } from "@/lib/docs";
import { isGoogleConnected } from "@/lib/google";

export const runtime = "nodejs";

type Walletable = { id: number; name: string; type: string };
type WalletTxn = {
  id: number;
  amount: number;
  date: string;
  description: string;
  entry_side: "income" | "expense";
  status: number; // 1=未処理, 2=処理済
  due_amount: number;
  walletable_id: number;
};

export async function GET() {
  if (!(await isConnected())) {
    return NextResponse.json({ connected: false, txns: [] });
  }
  try {
    const { walletables } = await freeeGet<{ walletables: Walletable[] }>(
      "/api/1/walletables",
      { company_id: FREEE_COMPANY_ID },
    );
    const banks = walletables.filter(
      (w) => w.type === "bank_account" || w.type === "wallet",
    );

    const decisions = await getDecisions();
    const out: unknown[] = [];

    for (const w of banks) {
      // limit未指定だとfreeeはデフォルト20件しか返さない（最大100）ため、ページングして全件取得
      let offset = 0;
      const wallet_txns: WalletTxn[] = [];
      for (;;) {
        const { wallet_txns: page } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
          "/api/1/wallet_txns",
          {
            company_id: FREEE_COMPANY_ID,
            walletable_type: w.type,
            walletable_id: String(w.id),
            start_date: "2026-06-01",
            end_date: new Date(Date.now() + 9 * 3600 * 1000)
              .toISOString()
              .slice(0, 10),
            limit: "100",
            offset: String(offset),
          },
        );
        wallet_txns.push(...page);
        if (page.length < 100) break;
        offset += 100;
      }
      for (const t of wallet_txns) {
        if (t.status !== 1) continue; // 未処理のみ
        const hint = await matchKb(t.description);
        const docs = await matchDocs(t.amount, t.description);
        const doc = docs[0];
        // この明細の金額に対応する想定仕訳（書類のpaymentから）
        const pay = doc?.payments.find((p) => p.amount === t.amount);
        out.push({
          id: t.id,
          date: t.date,
          amount: t.amount,
          side: t.entry_side, // expense=出金, income=入金
          description: t.description,
          walletName: w.name,
          hint: hint ? { category: hint.category, note: hint.note } : null,
          doc: doc
            ? {
                id: doc.id,
                title: doc.title,
                type: doc.type,
                summary: doc.summary,
                payNote: pay?.note ?? "",
                suggestedLines: doc.suggestedLines,
                taxReview: doc.taxReview,
                taxReviewReason: doc.taxReviewReason,
              }
            : null,
          decision: decisions[String(t.id)] ?? null,
        });
      }
    }

    // freeeの「自動で経理（新しい順）」と一致：日付降順→同日はID降順
    out.sort((a: any, b: any) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.id - a.id;
    });
    const gmail = await isGoogleConnected();
    return NextResponse.json({ connected: true, gmail, txns: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, txns: [] });
  }
}
