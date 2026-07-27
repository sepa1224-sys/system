import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";

export const runtime = "nodejs";

// ─── freeeの科目名 → account_item_id を取得 ───
async function getAccountItemMap(): Promise<Record<string, number>> {
  const { account_items } = await freeeGet<{ account_items: { id: number; name: string }[] }>(
    "/api/1/account_items",
    { company_id: FREEE_COMPANY_ID },
  );
  const map: Record<string, number> = {};
  for (const a of account_items) {
    map[a.name] = a.id;
  }
  return map;
}

// ─── 口座一覧を取得 ───
type Walletable = { id: number; name: string; type: string };
async function getWalletables(): Promise<Walletable[]> {
  const { walletables } = await freeeGet<{ walletables: Walletable[] }>(
    "/api/1/walletables",
    { company_id: FREEE_COMPANY_ID },
  );
  return walletables;
}

// ─── 未処理明細を取得 ───
type WalletTxn = {
  id: number;
  amount: number;
  date: string;
  description: string;
  entry_side: "income" | "expense";
  status: number;
  walletable_id: number;
};

async function getUnprocessedTxns(walletables: Walletable[]): Promise<(WalletTxn & { walletName: string; walletType: string })[]> {
  const banks = walletables.filter(w => w.type === "bank_account" || w.type === "wallet");
  const all: (WalletTxn & { walletName: string; walletType: string })[] = [];
  for (const w of banks) {
    const { wallet_txns } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
      "/api/1/wallet_txns",
      {
        company_id: FREEE_COMPANY_ID,
        walletable_type: w.type,
        walletable_id: String(w.id),
        start_date: "2026-05-01",
        end_date: "2026-07-31",
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

// ─── 税区分コードを判定 ───
function taxCode(rate: string): number {
  // freee税区分: 課対仕入10% = 116, 課対仕入8%(軽) = 120
  if (rate === "8%") return 120;
  return 116; // 10%
}

// ─── Amazon仕訳データの型 ───
type AmazonItem = {
  paymentDate: string;    // 支払い確定日
  bankAmount: number;     // 銀行引落金額
  orderDate: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  amountExTax: number;    // 税抜
  tax: number;            // 消費税
  amountIncTax: number;   // 税込
  taxRate: string;
  shipping: number;       // 配送料（税込）
  account: string;        // 勘定科目
  payer: string;          // 立替区分
  counterAccount: string; // 相手勘定
  seller: string;
  invoiceNumber: string;
};

// ─── GET: マッチング結果をプレビュー ───
export async function GET() {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続", connected: false });
  }
  try {
    const walletables = await getWalletables();
    const txns = await getUnprocessedTxns(walletables);
    const accountMap = await getAccountItemMap();

    // AMAZONの未処理明細だけ抽出
    const amazonTxns = txns.filter(t =>
      t.description.includes("AMAZON") || t.description.includes("amazon")
    );

    return NextResponse.json({
      connected: true,
      amazonTxns: amazonTxns.map(t => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        description: t.description,
        walletName: t.walletName,
        walletableId: t.walletable_id,
        walletType: t.walletType,
      })),
      walletables: walletables.map(w => ({ id: w.id, name: w.name, type: w.type })),
      accountNames: Object.keys(accountMap),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" });
  }
}

// ─── POST: Amazon仕訳データを受け取り、freeeに取引登録 ───
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const { items, dryRun } = (await req.json()) as { items: AmazonItem[]; dryRun?: boolean };

    const walletables = await getWalletables();
    const txns = await getUnprocessedTxns(walletables);
    const accountMap = await getAccountItemMap();

    // 支払いグループ（同じ支払日+金額 = 1つの銀行取引）
    const groups = new Map<string, AmazonItem[]>();
    for (const item of items) {
      if (!item.paymentDate) continue; // 未確定はスキップ
      const key = `${item.paymentDate}:${item.bankAmount}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const results: { key: string; status: string; dealId?: number; items: string[] }[] = [];

    for (const [key, groupItems] of groups) {
      const [payDate, bankAmountStr] = key.split(":");
      const bankAmount = Number(bankAmountStr);

      // freeeの日付形式に変換 (2026/07/27 → 2026-07-27)
      const freeeDate = payDate.replace(/\//g, "-");

      // 銀行未処理明細とマッチング（日付+金額）
      const matchedTxn = txns.find(t => t.date === freeeDate && t.amount === bankAmount);

      // 勘定科目IDを解決
      const details = groupItems.map(item => {
        const accId = accountMap[item.account];
        if (!accId) throw new Error(`勘定科目「${item.account}」がfreeeに見つかりません`);
        return {
          account_item_id: accId,
          tax_code: taxCode(item.taxRate),
          amount: item.amountIncTax,
          description: `${item.productName}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
          // インボイス番号があればメモに
          ...(item.invoiceNumber ? { tag_ids: [], segment_1_tag_id: undefined } : {}),
        };
      });

      // 相手勘定（支払元）の口座を特定
      let fromWalletableId: number | undefined;
      let fromWalletableType: string | undefined;

      if (matchedTxn) {
        fromWalletableId = matchedTxn.walletable_id;
        fromWalletableType = matchedTxn.walletType;
      } else if (groupItems[0].counterAccount.includes("GMO")) {
        // GMOあおぞらネット銀行を探す
        const gmo = walletables.find(w => w.name.includes("GMO") || w.name.includes("あおぞら"));
        if (gmo) {
          fromWalletableId = gmo.id;
          fromWalletableType = gmo.type;
        }
      }

      if (dryRun) {
        results.push({
          key,
          status: matchedTxn ? "マッチ済" : "未処理明細なし（新規取引として登録）",
          items: groupItems.map(i => `${i.productName} ¥${i.amountIncTax}`),
        });
        continue;
      }

      // freee取引を作成
      const dealBody: Record<string, unknown> = {
        company_id: Number(FREEE_COMPANY_ID),
        issue_date: freeeDate,
        type: "expense",
        details,
        payments: fromWalletableId ? [{
          amount: bankAmount,
          from_walletable_type: fromWalletableType,
          from_walletable_id: fromWalletableId,
          date: freeeDate,
        }] : [],
      };

      const deal = await freeePost<{ deal: { id: number } }>("/api/1/deals", dealBody);
      results.push({
        key,
        status: "登録完了",
        dealId: deal.deal.id,
        items: groupItems.map(i => `${i.productName} ¥${i.amountIncTax}`),
      });
    }

    // 支払い未確定分
    const pending = items.filter(i => !i.paymentDate);

    return NextResponse.json({
      ok: true,
      registered: results,
      pending: pending.map(i => ({ name: i.productName, amount: i.amountIncTax })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録失敗" },
      { status: 500 },
    );
  }
}
