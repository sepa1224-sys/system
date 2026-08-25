import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { getReceipt, getReceipts, receiptLines, markRegistered, clearRegistered } from "@/lib/receipts";
import { mapCategory, clampIssueDate } from "@/lib/freeeMap";
import { itemIdForProduct, newItemCache, getOverrides, resolveWithOverrides } from "@/lib/freeeItems";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMPANY = Number(FREEE_COMPANY_ID);

// 会社カード払いは口座直結のデビットなので、貸方は「普通預金」等の bank_account/wallet 明細に
// 実際の引き落としが出てくる。ここでは領収書(expenseKind=card)を金額一致・日付近傍で
// その未処理明細と突き合わせて内訳を確定させ、freeeの取引(deals)として登録する。
//
// 重要: freeeの公開APIには「既存のwallet_txnをこの取引で消し込む」フィールドは存在しない
// （payments配列は from_walletable_id/amount/date を渡すだけの支払行で、指定した時点で
// その取引は"決済済み"になり、明細側のstatusとは一切連動しない。実際に試したところ
// wallet_txn.status は 1(消込待ち) のまま変化しなかった）。
// freeeが明細を消し込めるのは「未決済（payments無し）の取引」に対してのみ
// （自動登録ルールの条件6/7「未決済取引の消込」がこれに該当）。
// そのため、ここでは payments を付けずに未決済の取引として登録する。
// 明細との消込自体は freee の「自動で経理」画面で行う（金額が一致する未決済取引として
// 提案されるはず）。

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

/** 仕入先を名前で引く。無ければ作る。「Amazonにいくら使ったか」を集計できるようにする */
async function resolvePartnerId(name: string): Promise<number | undefined> {
  const n = (name || "").trim();
  if (!n) return undefined;
  try {
    const list = await freeeGet<{ partners: { id: number; name: string }[] }>(
      "/api/1/partners",
      { company_id: FREEE_COMPANY_ID, limit: "3000" },
    );
    const hit = list.partners?.find((p) => p.name === n);
    if (hit) return hit.id;
    const created = await freeePost<{ partner: { id: number } }>("/api/1/partners", {
      company_id: Number(FREEE_COMPANY_ID),
      name: n,
    });
    return created.partner?.id;
  } catch {
    // 取引先が付けられなくても登録は続ける
    return undefined;
  }
}

async function getBankWalletables(): Promise<Walletable[]> {
  const { walletables } = await freeeGet<{ walletables: Walletable[] }>(
    "/api/1/walletables",
    { company_id: FREEE_COMPANY_ID },
  );
  return walletables.filter((w) => w.type === "bank_account" || w.type === "wallet");
}

// freeeのwallet_txns一覧は limit未指定だとデフォルト20件しか返らない（最大100）。
// 1口座で20件を超えることは普通にあるため、必ずページングして全件取得する。
async function fetchAllWalletTxns(
  w: Walletable,
  startDate: string,
  endDate: string,
): Promise<WalletTxn[]> {
  const all: WalletTxn[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { wallet_txns } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
      "/api/1/wallet_txns",
      {
        company_id: FREEE_COMPANY_ID,
        walletable_type: w.type,
        walletable_id: String(w.id),
        start_date: startDate,
        end_date: endDate,
        limit: String(limit),
        offset: String(offset),
      },
    );
    all.push(...wallet_txns);
    if (wallet_txns.length < limit) break;
    offset += limit;
  }
  return all;
}

async function getUnprocessedTxns(
  walletables: Walletable[],
  startDate: string,
  endDate: string,
): Promise<(WalletTxn & { walletName: string; walletType: string })[]> {
  const all: (WalletTxn & { walletName: string; walletType: string })[] = [];
  for (const w of walletables) {
    const wallet_txns = await fetchAllWalletTxns(w, startDate, endDate);
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

    const overrides = await getOverrides();
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
        lines: receiptLines(r).map((l) => ({
          name: l.name,
          amount: l.amount,
          category: l.category,
          // freeeに送られる品目。登録前に画面で確認できるようにする
          item: resolveWithOverrides((l.name || "").trim(), overrides) || "",
        })),
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
    let walletName = "";
    for (const w of walletables) {
      const wallet_txns = await fetchAllWalletTxns(w, "2026-06-01", endDate);
      const hit = wallet_txns.find((t) => t.id === Number(body.walletTxnId));
      if (hit) {
        matchedTxn = hit;
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

    // 品目は銘柄まで分ける（ビール（ハイネケン）など）。ルールに無いものは品目なし。
    const cache = newItemCache();
    const details = await Promise.all(
      lines.map(async (l) => {
        const m = mapCategory(l.category);
        const itemId = m.itemId ?? (await itemIdForProduct(l.name || "", cache));
        return {
          account_item_id: m.accountItemId,
          tax_code: m.taxCode,
          amount: l.amount,
          ...(itemId ? { item_id: itemId } : {}),
          description: (l.name || desc).slice(0, 100),
        };
      }),
    );

    // 仕入先を入れておくと、freee側で取引先別の集計ができる
    const partnerId = await resolvePartnerId(r.vendor);

    // 発生日は明細側の日付に合わせる（金額一致・日付一致で freee の消込候補になりやすくするため）
    const { issueDate } = clampIssueDate(matchedTxn.date);

    // payments は付けない＝未決済の取引として作成。
    // freeeの「自動で経理」画面で、この明細の消込候補として提案されるはず。
    const dealBody = {
      company_id: COMPANY,
      issue_date: issueDate,
      type: "expense",
      ...(partnerId ? { partner_id: partnerId } : {}),
      details,
    };

    const deal = await freeePost<{ deal: { id: number } }>("/api/1/deals", dealBody);
    const dealId = deal.deal?.id;
    if (dealId) await markRegistered(r.id, dealId);

    return NextResponse.json({ ok: true, dealId, walletName, unsettled: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE { receiptId, dealId }: 誤って作成した取引を取り消す（登録フラグも戻す）
export async function DELETE(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { receiptId?: string; dealId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.receiptId || !body.dealId) {
    return NextResponse.json({ error: "receiptId, dealId が必要です" }, { status: 400 });
  }
  try {
    const { freeeDelete } = await import("@/lib/freee");
    await freeeDelete(`/api/1/deals/${body.dealId}`, { company_id: String(COMPANY) });
    await clearRegistered(body.receiptId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}
