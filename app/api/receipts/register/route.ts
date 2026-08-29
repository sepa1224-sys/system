import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { getReceipt, markRegistered, receiptLines } from "@/lib/receipts";
import {
  getOverrides,
  resolveWithOverrides,
  getOrCreateItemId,
  newItemCache,
} from "@/lib/freeeItems";
import { mapCategory, clampIssueDate, YAKUIN_KARIIRE_ID, YAKUIN_KARIIRE_TAX } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

// 勘定科目をfreeeから名前で引く（現金など、IDを埋め込んでいない科目用）
async function findAccountId(name: string): Promise<number | null> {
  try {
    const r = await freeeGet<{ account_items: { id: number; name: string }[] }>(
      "/api/1/account_items",
      { company_id: String(COMPANY) },
    );
    const exact = r.account_items?.find((a) => a.name === name);
    if (exact) return exact.id;
    return r.account_items?.find((a) => a.name.includes(name))?.id ?? null;
  } catch {
    return null;
  }
}

// 立替えた人を取引先として解決（無ければ作成）
async function resolvePartnerId(name: string): Promise<number | undefined> {
  if (!name) return undefined;
  try {
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
    return created.partner?.id;
  } catch {
    return undefined; // 取引先解決に失敗しても登録は続行（取引先なし）
  }
}

export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

  const r = await getReceipt(body.id);
  if (!r) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });
  if (r.registered) {
    return NextResponse.json({ ok: true, already: true, journalId: r.registered.journalId });
  }
  if (!r.date || !r.total) {
    return NextResponse.json({ error: "日付・金額が不足しています" }, { status: 400 });
  }
  // 会社デビットカード払いは銀行明細フロー（明細タブ→取引→消込）で計上する。
  // ここで伝票を切ると同じ買い物が二重計上になる（2026-08-30に84件発覚した事故の再発防止）。
  if (r.expenseKind === "card") {
    return NextResponse.json(
      { error: "会社カード払いは明細タブ側で処理されます（二重計上防止のため登録しません）" },
      { status: 400 },
    );
  }

  // 支払い元によって貸方が変わる。
  //   立替 / 労働枠 → 役員借入金（取引先＝立替えた人。あとで会社から返す）
  //   現金          → 現金（会社の財布から。返す相手なし）
  //   会社カード     → 普通預金（口座直結のデビット。返す相手なし）
  const CREDIT_BY_KIND: Record<string, string> = { cash: "現金", card: "普通預金" };
  const creditName = CREDIT_BY_KIND[r.expenseKind ?? "company"];

  // 役員借入金のときだけ、誰に返すかを取引先として持たせる。
  const partnerId = creditName ? undefined : await resolvePartnerId(r.payer);

  let creditAccountId: number = YAKUIN_KARIIRE_ID;
  if (creditName) {
    const id = await findAccountId(creditName);
    if (!id) {
      return NextResponse.json(
        { error: `freeeに勘定科目「${creditName}」が見つかりません。freee側で科目を確認してください。` },
        { status: 400 },
      );
    }
    creditAccountId = id;
  }
  // 設立前(期首前)の支出はfreeeが受け付けないので、発生日を期首日に丸める。
  const { issueDate, adjusted, original } = clampIssueDate(r.date);
  const dateNote = adjusted ? `（原本日付${original}・設立前支出）` : "";
  const desc = ((r.memo || r.summary || r.vendor || "") + dateNote).slice(0, 100);

  // 内訳（用途/科目ごと）→ 借方を複数行に。合計＝貸方1行。
  // 品目は明細処理と同じ判定（ルール＋覚えさせた対応）で品名から決め、
  // freeeのitem_idにして各行に付ける。決まらない行は品目なしで登録する。
  const lines = receiptLines(r);
  const overrides = await getOverrides().catch(() => ({}) as Record<string, string>);
  const itemCache = newItemCache();
  const debitDetails = [];
  for (const l of lines) {
    const m = mapCategory(l.category);
    const itemName = resolveWithOverrides((l.name || "").trim(), overrides);
    const itemId = itemName ? await getOrCreateItemId(itemName, itemCache) : null;
    debitDetails.push({
      entry_side: "debit",
      account_item_id: m.accountItemId,
      tax_code: m.taxCode,
      amount: l.amount,
      ...(itemId ?? m.itemId ? { item_id: itemId ?? m.itemId } : {}),
      description: (l.name || desc).slice(0, 100),
    });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);

  // 振替伝票: 借)科目（内訳分だけ複数行） / 貸)現金・普通預金・役員借入金のいずれか
  const journal = {
    company_id: COMPANY,
    issue_date: issueDate,
    details: [
      ...debitDetails,
      {
        entry_side: "credit",
        account_item_id: creditAccountId,
        tax_code: YAKUIN_KARIIRE_TAX,
        amount: total,
        ...(partnerId ? { partner_id: partnerId } : {}),
        description: desc,
      },
    ],
  };

  try {
    const res = await freeePost<{ manual_journal: { id: number } }>(
      "/api/1/manual_journals",
      journal,
    );
    const journalId = res.manual_journal?.id;
    if (journalId) await markRegistered(r.id, journalId);
    return NextResponse.json({
      ok: true,
      journalId,
      partnerId: partnerId ?? null,
      dateAdjusted: adjusted,
      issueDate,
      originalDate: original,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "登録に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
