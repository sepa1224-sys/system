import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePut, isConnected } from "@/lib/freee";
import { getOrCreateItemId, newItemCache } from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 60;

// 登録済みの取引に、あとから品目を付ける。
// freeeは明細行の差分更新ができないので、既存の行をidごと送り直して item_id を足す。
//
// POST { dealId, item }                    … 全行に同じ品目
// POST { dealId, byAmount: {"2997":"寝具・ファブリック", ...} } … 金額ごとに品目を分ける
// POST { dealId, byDesc: {"ユニボスカ":"文房具", ...} }        … 備考の部分一致で品目を分ける
//   同じ金額の行が複数あるときはbyDescで（byDescが最優先）
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const b = (await req.json()) as {
      dealId?: number;
      item?: string;
      byAmount?: Record<string, string>;
      byDesc?: Record<string, string>;
    };
    if (!b.dealId || (!b.item && !b.byAmount && !b.byDesc)) {
      return NextResponse.json({ error: "dealIdとitem（またはbyAmount）が必要です" }, { status: 400 });
    }

    const res = await freeeGet<{ deal: {
      id: number; issue_date: string; type: string; partner_id?: number;
      details: { id: number; account_item_id: number; tax_code: number; amount: number; description?: string; item_id?: number }[];
    } }>(`/api/1/deals/${b.dealId}`, { company_id: FREEE_COMPANY_ID });
    const deal = res.deal;
    if (!deal) return NextResponse.json({ error: "取引が見つかりません" }, { status: 404 });

    const cache = newItemCache();
    const details = [];
    const applied: { amount: number; item: string | null }[] = [];
    for (const d of deal.details) {
      const descHit = b.byDesc
        ? Object.entries(b.byDesc).find(([k]) => (d.description || "").includes(k))?.[1]
        : undefined;
      const name = descHit ?? (b.byAmount ? b.byAmount[String(d.amount)] : b.item);
      const itemId = name ? await getOrCreateItemId(name, cache) : d.item_id ?? null;
      details.push({
        id: d.id,
        account_item_id: d.account_item_id,
        tax_code: d.tax_code,
        amount: d.amount,
        ...(itemId ? { item_id: itemId } : {}),
        ...(d.description ? { description: d.description } : {}),
      });
      applied.push({ amount: d.amount, item: name ?? null });
    }

    await freeePut(`/api/1/deals/${deal.id}`, {
      company_id: Number(FREEE_COMPANY_ID),
      issue_date: deal.issue_date,
      type: deal.type,
      ...(deal.partner_id ? { partner_id: deal.partner_id } : {}),
      details,
    });
    return NextResponse.json({ ok: true, dealId: deal.id, applied });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}
