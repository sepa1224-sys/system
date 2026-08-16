import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";

export const runtime = "nodejs";

// GET: 口座明細を全件取得（status問わず）
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const sp = req.nextUrl.searchParams;
    const startDate = sp.get("start_date") || "2026-07-01";
    const endDate = sp.get("end_date") || "2026-07-31";

    // 口座一覧
    const { walletables } = await freeeGet<{ walletables: any[] }>(
      "/api/1/walletables",
      { company_id: FREEE_COMPANY_ID },
    );
    const banks = walletables.filter((w: any) => w.type === "bank_account");

    const all: any[] = [];
    for (const w of banks) {
      // limit未指定だとfreeeはデフォルト20件しか返さない（最大100）ため、ページングして全件取得
      let offset = 0;
      const wallet_txns: any[] = [];
      for (;;) {
        const { wallet_txns: page } = await freeeGet<{ wallet_txns: any[] }>(
          "/api/1/wallet_txns",
          {
            company_id: FREEE_COMPANY_ID,
            walletable_type: w.type,
            walletable_id: String(w.id),
            start_date: startDate,
            end_date: endDate,
            limit: "100",
            offset: String(offset),
          },
        );
        wallet_txns.push(...page);
        if (page.length < 100) break;
        offset += 100;
      }
      for (const t of wallet_txns) {
        all.push({
          id: t.id,
          date: t.date,
          amount: t.amount,
          side: t.entry_side,
          status: t.status, // 1=未処理, 2=処理済
          description: t.description,
          walletName: w.name,
        });
      }
    }

    // 日付降順
    all.sort((a, b) => (a.date < b.date ? 1 : -1));

    // AMAZONだけフィルタするオプション
    const amazonOnly = sp.get("amazon") === "1";
    const filtered = amazonOnly ? all.filter(t => t.description.toUpperCase().includes("AMAZON")) : all;

    return NextResponse.json({ count: filtered.length, txns: filtered });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
