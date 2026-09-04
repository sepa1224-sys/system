import { NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { matchKbIn, getKbEntries, getDecisions } from "@/lib/kb";
import { matchDocsIn, getDocsIndex } from "@/lib/docs";
import { isGoogleConnected } from "@/lib/google";
import { cardOrdersForMatching } from "@/lib/purchase";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    // ノウハウ・書類索引・判断はKVから1回だけ読む。
    // 以前は明細1件ごとに matchKb/matchDocs がKVを読んでいて、
    // 未処理が100件あると往復200回で1分近くかかっていた。
    // カード払いの発注。明細に出たときの手がかりにする。
    // 発注そのものはfreeeに登録していない（明細側で消し込むため）
    const cardOrders = await cardOrdersForMatching();

    const [decisions, kbEntries, docsIndex, gmail] = await Promise.all([
      getDecisions(),
      getKbEntries(),
      getDocsIndex(),
      isGoogleConnected(),
    ]);
    const out: unknown[] = [];

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // 口座ごとの取得は互いに独立しているので並列で回す
    const perBank = await Promise.all(
      banks.map(async (w) => {
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
              end_date: today,
              limit: "100",
              offset: String(offset),
            },
          );
          wallet_txns.push(...page);
          if (page.length < 100) break;
          offset += 100;
        }
        return { w, wallet_txns };
      }),
    );

    for (const { w, wallet_txns } of perBank) {
      for (const t of wallet_txns) {
        if (t.status !== 1) continue; // 未処理のみ
        const hint = matchKbIn(kbEntries, t.description);
        const doc = matchDocsIn(docsIndex, t.amount, t.description)[0];
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
          // 金額が一致し、発注から10日以内のもの
          purchase:
            cardOrders
              .filter((o) => {
                if (o.paidAmount !== t.amount) return false;
                const days =
                  (Date.parse(`${t.date}T00:00:00Z`) -
                    Date.parse(`${o.orderedAt}T00:00:00Z`)) /
                  86400000;
                return days >= 0 && days <= 10;
              })
              .map((o) => ({
                id: o.id,
                shop: o.shop ?? "",
                orderedAt: o.orderedAt,
                amount: o.paidAmount ?? 0,
                items: o.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join("・"),
              }))[0] ?? null,
        });
      }
    }

    // freeeの「自動で経理（新しい順）」と一致：日付降順→同日はID降順
    out.sort((a: any, b: any) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.id - a.id;
    });
    return NextResponse.json({ connected: true, gmail, txns: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, txns: [] });
  }
}
