import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { getReceipt, getReceipts, receiptLines, markRegistered } from "@/lib/receipts";
import { mapCategory, clampIssueDate } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

// 会社カード払いは口座直結のデビットなので、貸方は「普通預金」等の bank_account/wallet 明細に
// 実際の引き落としが出てくる。ここでは領収書(expenseKind=card)を金額一致・日付近傍で
// その未処理明細と突き合わせ、freeeの取引(deals)として"明細に紐づけて"登録する。
// manual_journalsで単独登録すると、後日その明細が別途処理され二重計上になるため、
// deals + payments で明細を直接消し込む（Amazon importと同じ方式）。

type Walletable = { id: number; name: string; type: string };
type WalletTxn = {
  id: number;
  amount: number;
  date: string;
  description: string;
  entry_side: "income" | "expense";
  status: number;
  walletable_id: number;
};

async function getBankWalletables(): Promise<Walletable[]> {
  const { walletables } = await freeeGet<{ walletables: Walletable[] }>(
    "/api/1/walletables",
    { company_id: FREEE_COMPANY_ID },
  );
  return walletables.filter((w) => w.type === "bank_account" || w.type === "wallet");
}

async function getUnprocessedTxns(
  walletables: Walletable[],
  startDate: string,
  endDate: string,
): Promise<(WalletTxn & { walletName: string; walletType: string })[]> {
  const all: (WalletTxn & { walletName: string; walletType: string })[] = [];
  for (const w of walletables) {
    const { wallet_txns } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
      "/api/1/wallet_txns",
      {
        company_id: FREEE_COMPANY_ID,
        walletable_type: w.type,
        walletable_id: String(w.id),
        start_date: startDate,
        end_date: endDate,
      },
    );
    for (const t of wallet_txns) {
      if (t.status === 1 && t.entry_side === "expense") {
        all.push({ ...t, walletName: w.name, walletType: w.type });
      }
    }
  }
  return all;
}

const daysBetween = (a: string, b: string) =>
  Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

// GET: 未登録のカード払い領収書ごとに、候補となる未処理明細を提示
export async function GET() {
  if (!(await isConnected())) {
    return NextResponse.json({ connected: false, matches: [] });
  }
  try {
    const receipts = (await getReceipts()).filter(
      (r) => r.expenseKind === "card" && !r.registered,
    );
    if (receipts.length === 0) {
      return NextResponse.json({ connected: true, matches: [] });
    }

    const dates = receipts.map((r) => r.date).filter(Boolean).sort();
    const startDate = dates[0] || "2026-06-01";
    const endD = new Date(Date.now() + 9 * 3600_000);
    endD.setDate(endD.getDate() + 14); // カード引き落としの反映ラグを見込む
    const endDate = endD.toISOString().slice(0, 10);

    const walletables = await getBankWalletables();
    const txns = await getUnprocessedTxns(walletables, startDate, endDate);

    const matches = receipts.map((r) => {
      const candidates = txns
        .filter((t) => t.amount === r.total)
        .map((t) => ({ ...t, diffDays: daysBetween(t.date, r.date) }))
        .filter((t) => t.diffDays <= 10)
        .sort((a, b) => a.diffDays - b.diffDays);
      return {
        receiptId: r.id,
        date: r.date,
        vendor: r.vendor,
        total: r.total,
        summary: r.summary,
        lines: receiptLines(r).map((l) => ({ name: l.name, amount: l.amount, category: l.category })),
        candidates: candidates.map((c) => ({
          walletTxnId: c.id,
          date: c.date,
          amount: c.amount,
          description: c.description,
          walletName: c.walletName,
          diffDays: Math.round(c.diffDays),
        })),
      };
    });

    return NextResponse.json({ connected: true, matches });
  } catch (e) {
    return NextResponse.json(
      { connected: true, error: e instanceof Error ? e.message : "エラー", matches: [] },
      { status: 500 },
    );
  }
}

// POST { receiptId, walletTxnId }: 選んだ明細で確定登録（deals + payments で消し込み）
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { receiptId?: string; walletTxnId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.receiptId || !body.walletTxnId) {
    return NextResponse.json({ error: "receiptId, walletTxnId が必要です" }, { status: 400 });
  }

  const r = await getReceipt(body.receiptId);
  if (!r) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });
  if (r.registered) {
    return NextResponse.json({ ok: true, already: true, dealId: r.registered.journalId });
  }

  try {
    const walletables = await getBankWalletables();
    const endD = new Date(Date.now() + 9 * 3600_000);
    endD.setDate(endD.getDate() + 14);
    const endDate = endD.toISOString().slice(0, 10);

    let matchedTxn: WalletTxn | null = null;
    let walletType = "";
    let walletName = "";
    for (const w of walletables) {
      const { wallet_txns } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
        "/api/1/wallet_txns",
        {
          company_id: FREEE_COMPANY_ID,
          walletable_type: w.type,
          walletable_id: String(w.id),
          start_date: "2026-06-01",
          end_date: endDate,
        },
      );
      const hit = wallet_txns.find((t) => t.id === Number(body.walletTxnId));
      if (hit) {
        matchedTxn = hit;
        walletType = w.type;
        walletName = w.name;
        break;
      }
    }
    if (!matchedTxn) {
      return NextResponse.json(
        { error: "指定の明細が見つかりません（すでに処理済みか、期間外の可能性があります）" },
        { status: 404 },
      );
    }
    if (matchedTxn.status !== 1) {
      return NextResponse.json({ error: "この明細はすでに処理済みです" }, { status: 409 });
    }
    if (matchedTxn.amount !== r.total) {
      return NextResponse.json({ error: "金額が一致しません" }, { status: 400 });
    }

    const lines = receiptLines(r);
    const desc = (r.memo || r.summary || r.vendor || "").slice(0, 100);
    const details = lines.map((l) => {
      const m = mapCategory(l.category);
      return {
        account_item_id: m.accountItemId,
        tax_code: m.taxCode,
        amount: l.amount,
        ...(m.itemId ? { item_id: m.itemId } : {}),
        description: (l.name || desc).slice(0, 100),
      };
    });

    // 発生日は明細側の日付で計上（freeeの消し込み要件に合わせる）
    const { issueDate } = clampIssueDate(matchedTxn.date);

    const dealBody = {
      company_id: COMPANY,
      issue_date: issueDate,
      type: "expense",
      details,
      payments: [
        {
          amount: matchedTxn.amount,
          from_walletable_type: walletType,
          from_walletable_id: matchedTxn.walletable_id,
          date: matchedTxn.date,
        },
      ],
    };

    const deal = await freeePost<{ deal: { id: number } }>("/api/1/deals", dealBody);
    const dealId = deal.deal?.id;
    if (dealId) await markRegistered(r.id, dealId);

    return NextResponse.json({ ok: true, dealId, walletName });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗しました" },
      { status: 500 },
    );
  }
}
