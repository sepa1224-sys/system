import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePut, isConnected } from "@/lib/freee";

export const runtime = "nodejs";
export const maxDuration = 300;

const COMPANY = Number(FREEE_COMPANY_ID);

// 税区分を間違えて登録した取引を直す。
// 例: 仕入なのに「課売返一8%（コード116・売上の返品）」が入っていた。
// 支出の取引は原則「課対仕入10%」。飲食料品は軽減8%だが、酒類は対象外なので10%。

type Detail = {
  id: number;
  account_item_id: number;
  tax_code: number;
  amount: number;
  description?: string;
};
type Deal = {
  id: number;
  issue_date: string;
  type: string;
  amount: number;
  details: Detail[];
  partner_id?: number;
  ref_number?: string;
};

async function getDeal(id: number): Promise<Deal> {
  const r = await freeeGet<{ deal: Deal }>(`/api/1/deals/${id}`, {
    company_id: FREEE_COMPANY_ID,
  });
  return r.deal;
}

// POST /api/freee/fix-tax { from: 116, to: 136, dealIds?: number[], dryRun?: true }
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const b = (await req.json().catch(() => ({}))) as {
      from?: number;
      to?: number;
      dealIds?: number[];
      dryRun?: boolean;
    };
    const from = Number(b.from);
    const to = Number(b.to);
    const dryRun = b.dryRun !== false;
    if (!from || !to) {
      return NextResponse.json({ error: "from と to（税区分コード）が必要です" }, { status: 400 });
    }
    if (!b.dealIds?.length) {
      return NextResponse.json({ error: "dealIds が必要です" }, { status: 400 });
    }

    const results: {
      dealId: number;
      changed: number;
      ok?: boolean;
      error?: string;
      lines?: string[];
    }[] = [];

    for (const id of b.dealIds) {
      try {
        const deal = await getDeal(id);
        const targets = deal.details.filter((d) => d.tax_code === from);
        if (targets.length === 0) {
          results.push({ dealId: id, changed: 0 });
          continue;
        }
        const lines = targets.map(
          (d) => `${d.description ?? ""} ¥${d.amount.toLocaleString()}`,
        );
        if (dryRun) {
          results.push({ dealId: id, changed: targets.length, lines });
          continue;
        }
        // details は全行を送り直す必要がある。既存のidを維持して税区分だけ差し替える。
        await freeePut(`/api/1/deals/${id}`, {
          company_id: COMPANY,
          issue_date: deal.issue_date,
          type: deal.type,
          ...(deal.partner_id ? { partner_id: deal.partner_id } : {}),
          details: deal.details.map((d) => ({
            id: d.id,
            account_item_id: d.account_item_id,
            tax_code: d.tax_code === from ? to : d.tax_code,
            amount: d.amount,
            ...(d.description ? { description: d.description } : {}),
          })),
        });
        results.push({ dealId: id, changed: targets.length, ok: true, lines });
      } catch (e) {
        results.push({
          dealId: id,
          changed: 0,
          error: e instanceof Error ? e.message : "失敗",
        });
      }
    }

    return NextResponse.json({
      dryRun,
      from,
      to,
      totalChanged: results.reduce((n, r) => n + r.changed, 0),
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗" },
      { status: 500 },
    );
  }
}
