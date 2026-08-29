import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePut, isConnected } from "@/lib/freee";
import {
  getOrCreateItemId,
  getOverrides,
  newItemCache,
  resolveWithOverrides,
} from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 300;

// 品目が空いている取引に、備考の商品名から品目をまとめて付ける。
// 備考はレシートやAmazon注文の品名がそのまま入っているので、
// 品目台帳と同じルール（resolveWithOverrides）で判定できる。
//
// POST { dryRun?: true, from?: "2026-06-01", to?: "2026-12-31" }
//   dryRunを省略すると判定結果だけ返す。判定できない備考は unresolved に出す。

type Detail = {
  id: number;
  account_item_id: number;
  tax_code: number;
  amount: number;
  description?: string;
  item_id?: number;
};
type Deal = {
  id: number;
  issue_date: string;
  type: string;
  partner_id?: number;
  details: Detail[];
};

export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const b = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      from?: string;
      to?: string;
    };
    const dryRun = b.dryRun !== false;
    const from = b.from || "2026-06-01";
    const to = b.to || "2027-05-31";

    // 全取引を取る（100件ずつ）
    const deals: Deal[] = [];
    let offset = 0;
    for (;;) {
      const r = await freeeGet<{ deals: Deal[] }>("/api/1/deals", {
        company_id: FREEE_COMPANY_ID,
        start_issue_date: from,
        end_issue_date: to,
        limit: "100",
        offset: String(offset),
      });
      const page = r.deals ?? [];
      deals.push(...page);
      if (page.length < 100) break;
      offset += 100;
      if (offset > 2000) break;
    }

    const overrides = await getOverrides();
    const cache = newItemCache();
    const updated: { dealId: number; date: string; lines: { desc: string; item: string }[] }[] = [];
    const unresolved: Record<string, number> = {};
    let checkedLines = 0;

    for (const deal of deals) {
      if (!deal.details?.length) continue;
      const plan: { d: Detail; item?: string }[] = [];
      let changed = false;
      for (const d of deal.details) {
        if (d.item_id) { plan.push({ d }); continue; }
        checkedLines++;
        const desc = (d.description || "").trim();
        const name = desc ? resolveWithOverrides(desc, overrides) : null;
        if (name) { plan.push({ d, item: name }); changed = true; }
        else {
          plan.push({ d });
          if (desc) unresolved[desc] = (unresolved[desc] ?? 0) + d.amount;
        }
      }
      if (!changed) continue;

      const lines = plan.filter((p) => p.item).map((p) => ({ desc: p.d.description || "", item: p.item! }));
      if (!dryRun) {
        const details = [];
        for (const p of plan) {
          const itemId = p.item ? await getOrCreateItemId(p.item, cache) : p.d.item_id ?? null;
          details.push({
            id: p.d.id,
            account_item_id: p.d.account_item_id,
            tax_code: p.d.tax_code,
            amount: p.d.amount,
            ...(itemId ? { item_id: itemId } : {}),
            ...(p.d.description ? { description: p.d.description } : {}),
          });
        }
        await freeePut(`/api/1/deals/${deal.id}`, {
          company_id: Number(FREEE_COMPANY_ID),
          issue_date: deal.issue_date,
          type: deal.type,
          ...(deal.partner_id ? { partner_id: deal.partner_id } : {}),
          details,
        });
      }
      updated.push({ dealId: deal.id, date: deal.issue_date, lines });
    }

    return NextResponse.json({
      dryRun,
      dealsTotal: deals.length,
      emptyLines: checkedLines,
      dealsToUpdate: updated.length,
      linesToFill: updated.reduce((n, u) => n + u.lines.length, 0),
      updated: updated.slice(0, 100),
      unresolved: Object.entries(unresolved)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([desc, amount]) => ({ desc, amount })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
