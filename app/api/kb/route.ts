import { NextRequest, NextResponse } from "next/server";
import { saveKbEntry, saveDecision, saveReview } from "@/lib/kb";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { clampIssueDate, mapCategory, CATEGORY_MAP } from "@/lib/freeeMap";
import { getOrCreateItemId, newItemCache } from "@/lib/freeeItems";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: {
    txnId?: number;
    date?: string;
    description?: string;
    amount?: number;
    partner?: string;
    lines?: { category: string; amount: number; taxType?: string; item?: string; memo?: string }[];
    kbKeyword?: string;
    kbNote?: string;
    taxReview?: boolean;
    taxReviewReason?: string;
    tags?: string[];
    side?: "expense" | "income";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const {
    txnId,
    date = "",
    description = "",
    amount = 0,
    partner = "",
    lines = [],
    kbKeyword,
    kbNote = "",
    taxReview = false,
    taxReviewReason = "",
    tags,
  } = body;
  if (!txnId || lines.length === 0) {
    return NextResponse.json({ error: "決定内容が不足しています" }, { status: 400 });
  }

  // ノウハウを保存（次回同じ取引先を自動提案）
  if (kbKeyword) {
    await saveKbEntry({ keyword: kbKeyword, category: lines[0].category, note: kbNote });
  }
  // 明細の決定を保存
  await saveDecision({
    txnId,
    partner,
    lines,
    note: kbNote,
    decidedAt: new Date(Date.now()).toISOString(),
    date,
    description,
    amount,
    tags: tags?.filter((t) => t && t.trim()).map((t) => t.trim()),
  });

  // freeeへ未決済の取引を自動で作る。
  // これでfreee側は「未決済取引の消込」を選んで登録を押すだけになり、手入力が要らない。
  // 作れなかった場合（未接続・科目名が引けない等）は、これまで通りコピペで登録する。
  let dealId: number | undefined;
  let dealError: string | undefined;
  if (body.side !== "income") {
    try {
      if (!(await isConnected())) throw new Error("freee未接続");

      // 勘定科目: まず対応表、無ければfreeeの科目一覧から名前の完全一致で引く
      const accounts = await freeeGet<{ account_items: { id: number; name: string }[] }>(
        "/api/1/account_items",
        { company_id: FREEE_COMPANY_ID },
      );
      const byName = new Map((accounts.account_items ?? []).map((a) => [a.name, a.id]));
      const cache = newItemCache();
      const details = [];
      for (const l of lines) {
        const mapped = CATEGORY_MAP[l.category];
        const accountId = mapped?.accountItemId ?? byName.get(l.category);
        if (!accountId) throw new Error(`科目が見つからない: ${l.category}`);
        // 税区分: 対象外と書かれていれば対象外、それ以外は課対仕入
        const taxCode = /対象外|非課税/.test(l.taxType || "") ? 2 : (mapped?.taxCode ?? 34);
        const itemId = l.item ? await getOrCreateItemId(l.item, cache) : null;
        details.push({
          account_item_id: accountId,
          tax_code: taxCode,
          amount: l.amount,
          ...(itemId ? { item_id: itemId } : {}),
          description: (l.memo || description).slice(0, 100),
        });
      }

      // 取引先: 同名があれば使い、無ければ作る
      let partnerId: number | undefined;
      const pn = (partner || "").trim();
      if (pn) {
        try {
          const list = await freeeGet<{ partners: { id: number; name: string }[] }>(
            "/api/1/partners",
            { company_id: FREEE_COMPANY_ID, limit: "3000" },
          );
          partnerId = list.partners?.find((p) => p.name === pn)?.id;
          if (!partnerId) {
            const created = await freeePost<{ partner: { id: number } }>("/api/1/partners", {
              company_id: Number(FREEE_COMPANY_ID),
              name: pn,
            });
            partnerId = created.partner?.id;
          }
        } catch {
          /* 取引先が付けられなくても登録は続ける */
        }
      }

      const { issueDate } = clampIssueDate(date);
      const deal = await freeePost<{ deal: { id: number } }>("/api/1/deals", {
        company_id: Number(FREEE_COMPANY_ID),
        issue_date: issueDate,
        type: "expense",
        ...(partnerId ? { partner_id: partnerId } : {}),
        details,
      });
      dealId = deal.deal?.id;
    } catch (e) {
      dealError = e instanceof Error ? e.message : "取引の自動作成に失敗";
    }
  }

  // 税理士に相談すべき論点があれば、相談リストに保管
  if (taxReview && taxReviewReason) {
    const treatment = lines
      .map((l) => `${l.category} ¥${l.amount.toLocaleString()}`)
      .join(" / ");
    await saveReview({
      id: String(txnId),
      date,
      summary: `${partner || description}`,
      amount,
      treatment,
      issue: taxReviewReason,
    });
  }

  return NextResponse.json({ ok: true, dealId, dealError });
}
