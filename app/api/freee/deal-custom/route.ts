import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeDelete, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { CATEGORY_MAP, clampIssueDate } from "@/lib/freeeMap";
import { getOrCreateItemId, newItemCache } from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 60;

const COMPANY = Number(FREEE_COMPANY_ID);

// POST { date, type: "expense"|"income", partner?, ref?, details: [{account, amount, item?, description?, taxCode?}] }
// 科目や行構成を自由に指定して未決済取引を1本作る。
// 借入金の入金・役員借入金の返済・資産計上を伴う支払いなど、
// カテゴリ表に無い科目の明細を消込できる形にするためのもの。
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: {
    date?: string;
    type?: "expense" | "income";
    partner?: string;
    ref?: string;
    details?: { account: string; amount: number; item?: string; description?: string; taxCode?: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.date || !body.type || !body.details?.length) {
    return NextResponse.json({ error: "date, type, details が必要です" }, { status: 400 });
  }
  try {
    const { account_items } = await freeeGet<{
      account_items: { id: number; name: string }[];
    }>("/api/1/account_items", { company_id: String(COMPANY) });
    const findAccount = (name: string) => {
      const mapped = CATEGORY_MAP[name];
      if (mapped) return { id: mapped.accountItemId, tax: mapped.taxCode };
      const exact = account_items.find((a) => a.name === name);
      const near = exact ?? account_items.find((a) => a.name.includes(name));
      return near ? { id: near.id, tax: 2 } : null;
    };

    let partnerId: number | null = null;
    if (body.partner) {
      const list = await freeeGet<{ partners: { id: number; name: string }[] }>(
        "/api/1/partners",
        { company_id: String(COMPANY), keyword: body.partner, limit: "50" },
      );
      partnerId =
        list.partners?.find((p) => p.name === body.partner)?.id ??
        (await freeePost<{ partner: { id: number } }>("/api/1/partners", {
          company_id: COMPANY,
          name: body.partner,
        })).partner?.id ?? null;
    }

    const cache = newItemCache();
    const details = [];
    for (const d of body.details) {
      const acc = findAccount(d.account);
      if (!acc) {
        return NextResponse.json(
          { error: `勘定科目が見つかりません: ${d.account}` },
          { status: 400 },
        );
      }
      const itemId = d.item ? await getOrCreateItemId(d.item, cache) : null;
      details.push({
        account_item_id: acc.id,
        tax_code: d.taxCode ?? acc.tax,
        amount: d.amount,
        ...(itemId ? { item_id: itemId } : {}),
        ...(d.description ? { description: d.description.slice(0, 100) } : {}),
      });
    }

    const { issueDate } = clampIssueDate(body.date);
    const res = await freeePost<{ deal: { id: number } }>("/api/1/deals", {
      company_id: COMPANY,
      issue_date: issueDate,
      type: body.type,
      ...(partnerId ? { partner_id: partnerId } : {}),
      ...(body.ref ? { ref_number: body.ref.slice(0, 20) } : {}),
      details,
    });
    return NextResponse.json({ ok: true, dealId: res.deal?.id ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}

// DELETE ?dealId=123 … 間違えて作った未決済取引を消す
export async function DELETE(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "dealIdが必要です" }, { status: 400 });
  try {
    await freeeDelete(`/api/1/deals/${dealId}`, { company_id: String(COMPANY) });
    return NextResponse.json({ ok: true, deleted: Number(dealId) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
