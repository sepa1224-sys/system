import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";

export const runtime = "nodejs";

// GET: freeeの取引一覧を取得（処理済み含む）
// ?start_date=2026-05-01&end_date=2026-07-31&keyword=AMAZON
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const sp = req.nextUrl.searchParams;
    const startDate = sp.get("start_date") || "2026-05-01";
    const endDate = sp.get("end_date") || "2026-07-31";

    // freee deals API で取引一覧を取得
    const query: Record<string, string> = {
      company_id: FREEE_COMPANY_ID,
      start_issue_date: startDate,
      end_issue_date: endDate,
      limit: "100",
      offset: "0",
    };

    const { deals } = await freeeGet<{ deals: any[] }>("/api/1/deals", query);

    // 全取引の概要を返す
    const summary = deals.map((d: any) => ({
      id: d.id,
      issue_date: d.issue_date,
      type: d.type,
      amount: d.amount,
      status: d.status,
      details: d.details?.map((det: any) => ({
        account_item_name: det.account_item_id,
        amount: det.amount,
        description: det.description,
        tax_code: det.tax_code,
      })),
      payments: d.payments?.map((p: any) => ({
        amount: p.amount,
        date: p.date,
        from_walletable_id: p.from_walletable_id,
        from_walletable_type: p.from_walletable_type,
      })),
    }));

    return NextResponse.json({ count: deals.length, deals: summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
