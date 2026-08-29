import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { clampIssueDate, YAKUIN_KARIIRE_ID, YAKUIN_KARIIRE_TAX } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

async function findAccountId(name: string): Promise<number | null> {
  if (name === "役員借入金") return YAKUIN_KARIIRE_ID;
  const r = await freeeGet<{ account_items: { id: number; name: string }[] }>(
    "/api/1/account_items",
    { company_id: String(COMPANY) },
  );
  const exact = r.account_items?.find((a) => a.name === name);
  if (exact) return exact.id;
  return r.account_items?.find((a) => a.name.includes(name))?.id ?? null;
}

async function findOrCreatePartnerId(name: string): Promise<number | null> {
  const list = await freeeGet<{ partners: { id: number; name: string }[] }>(
    "/api/1/partners",
    { company_id: String(COMPANY), keyword: name, limit: "50" },
  );
  const hit = list.partners?.find((p) => p.name === name);
  if (hit) return hit.id;
  const created = await freeePost<{ partner: { id: number } }>("/api/1/partners", {
    company_id: COMPANY,
    name,
  });
  return created.partner?.id ?? null;
}

// POST { date, amount, debitAccount, creditAccount, partner?, description? }
// 経費ではないお金の動き（現金移動・役員借入金など）を振替伝票で1本切る。
// レシート登録が経費科目前提なので、そこに乗らないものはこちらを使う。
// 税区分は両側とも対象外で固定（お金の移動にしか使わない想定）。
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: {
    date?: string;
    amount?: number;
    debitAccount?: string;
    creditAccount?: string;
    partner?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const { date, amount, debitAccount, creditAccount } = body;
  if (!date || !amount || !debitAccount || !creditAccount) {
    return NextResponse.json(
      { error: "date, amount, debitAccount, creditAccount が必要です" },
      { status: 400 },
    );
  }
  try {
    const [debitId, creditId] = await Promise.all([
      findAccountId(debitAccount),
      findAccountId(creditAccount),
    ]);
    if (!debitId || !creditId) {
      return NextResponse.json(
        { error: `勘定科目が見つかりません: ${!debitId ? debitAccount : creditAccount}` },
        { status: 400 },
      );
    }
    const partnerId = body.partner ? await findOrCreatePartnerId(body.partner) : null;
    const { issueDate } = clampIssueDate(date);
    const desc = (body.description || "").slice(0, 100);
    const res = await freeePost<{ manual_journal: { id: number } }>(
      "/api/1/manual_journals",
      {
        company_id: COMPANY,
        issue_date: issueDate,
        details: [
          {
            entry_side: "debit",
            account_item_id: debitId,
            tax_code: YAKUIN_KARIIRE_TAX,
            amount,
            description: desc,
          },
          {
            entry_side: "credit",
            account_item_id: creditId,
            tax_code: YAKUIN_KARIIRE_TAX,
            amount,
            ...(partnerId ? { partner_id: partnerId } : {}),
            description: desc,
          },
        ],
      },
    );
    return NextResponse.json({ ok: true, journalId: res.manual_journal?.id ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}
