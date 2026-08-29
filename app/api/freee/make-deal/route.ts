import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, freeePost, isConnected } from "@/lib/freee";
import { CATEGORY_MAP } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 300;

const COMPANY = Number(FREEE_COMPANY_ID);

// 領収書が無い明細（ATMの引き出しなど）に対して、金額ぴったりの未決済取引を作る。
// freeeは「金額が近い取引」を勝手に推測して別の取引を掴むため、
// 先に一致する取引を用意しておくと、差額0の候補として正しく提案される。

type WalletTxn = {
  id: number;
  amount: number;
  date: string;
  description: string;
  entry_side: "income" | "expense";
  status: number;
};

async function bankTxns(): Promise<WalletTxn[]> {
  const { walletables } = await freeeGet<{
    walletables: { id: number; name: string; type: string }[];
  }>("/api/1/walletables", { company_id: FREEE_COMPANY_ID });
  const banks = walletables.filter(
    (w) => w.type === "bank_account" || w.type === "wallet",
  );
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const per = await Promise.all(
    banks.map(async (w) => {
      const out: WalletTxn[] = [];
      let offset = 0;
      for (;;) {
        const { wallet_txns: page } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
          "/api/1/wallet_txns",
          {
            company_id: FREEE_COMPANY_ID,
            walletable_type: w.type,
            walletable_id: String(w.id),
            start_date: "2026-06-01",
            end_date: today,
            limit: "100",
            offset: String(offset),
          },
        );
        out.push(...page);
        if (page.length < 100) break;
        offset += 100;
      }
      return out;
    }),
  );
  return per.flat().filter((t) => t.status === 1);
}

// GET /api/freee/make-deal?match=ATM  → 対象になる未処理明細を返す
export async function GET(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const m = req.nextUrl.searchParams.get("match") || "ATM";
    const re = new RegExp(m, "i");
    const txns = (await bankTxns()).filter((t) => re.test(t.description));
    return NextResponse.json({
      match: m,
      count: txns.length,
      txns: txns
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((t) => ({
          id: t.id,
          date: t.date,
          amount: t.amount,
          side: t.entry_side,
          description: t.description,
        })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/freee/make-deal
//   { match: "ATM", category: "現金", feeCategory?: "雑費", dryRun?: true }
//   摘要が match に当たる未処理明細ごとに、同額・同日の未決済取引を作る。
//   feeCategory を指定すると「利用手数料」を含む明細だけそちらの科目にする。
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as {
      match?: string;
      category?: string;
      feeCategory?: string;
      dryRun?: boolean;
      ids?: number[];
      /** 取引を作らず「作成済み」として記録だけする（手動で作った分の重複防止用） */
      markOnly?: { txnId: number; dealId: number }[];
      /** 入金の明細に対して取引を作るときは "income" */
      side?: "expense" | "income";
    };
    const dryRun = body.dryRun !== false;
    const markOnly = body.markOnly;
    const side = body.side === "income" ? "income" : "expense";
    const matchStr = body.match || "ATM";
    const category = body.category || "現金";
    const feeCategory = body.feeCategory;

    // 「現金」は経費科目ではないのでCATEGORY_MAPに無い。freeeから直接引く。
    const resolve = async (name: string) => {
      if (CATEGORY_MAP[name]) return CATEGORY_MAP[name];
      const r = await freeeGet<{ account_items: { id: number; name: string }[] }>(
        "/api/1/account_items",
        { company_id: FREEE_COMPANY_ID },
      );
      const list = r.account_items ?? [];
      const hit = list.find((a) => a.name === name) ?? list.find((a) => a.name.includes(name));
      return hit ? { accountItemId: hit.id, taxCode: 2 } : null;
    };

    const [main, fee] = await Promise.all([
      resolve(category),
      feeCategory ? resolve(feeCategory) : Promise.resolve(null),
    ]);
    if (!main) {
      return NextResponse.json(
        { error: `freeeに勘定科目「${category}」が見つかりません` },
        { status: 400 },
      );
    }

    // 一度取引を作った明細はKVに記録し、次回はスキップする（cronで繰り返し呼んでも安全）
    const doneKey = "makedeal:created";
    const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    let store: { get<T>(k: string): Promise<T | null>; set(k: string, v: unknown): Promise<unknown> } | null = null;
    if (kvUrl && kvToken) {
      const { createClient } = await import("@vercel/kv");
      store = createClient({ url: kvUrl, token: kvToken });
    }
    const done: Record<string, number> = store
      ? ((await store.get<Record<string, number>>(doneKey)) ?? {})
      : {};

    if (markOnly?.length) {
      for (const m of markOnly) done[String(m.txnId)] = m.dealId;
      if (store) await store.set(doneKey, done);
      return NextResponse.json({ ok: true, marked: markOnly.length });
    }

    const re = new RegExp(matchStr, "i");
    const all = await bankTxns();
    const targets = all.filter(
      (t) =>
        t.entry_side === side &&
        re.test(t.description) &&
        !done[String(t.id)] &&
        (!body.ids?.length || body.ids.includes(t.id)),
    );

    const plan = targets.map((t) => {
      const isFee = /手数料/.test(t.description);
      const acc = isFee && fee ? fee : main;
      return {
        txnId: t.id,
        date: t.date,
        amount: t.amount,
        description: t.description,
        account: isFee && feeCategory ? feeCategory : category,
        accountItemId: acc.accountItemId,
        taxCode: acc.taxCode,
      };
    });

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        count: plan.length,
        total: plan.reduce((n, p) => n + p.amount, 0),
        plan,
      });
    }

    const results: { txnId: number; dealId?: number; error?: string }[] = [];
    for (const p of plan) {
      try {
        const res = await freeePost<{ deal: { id: number } }>("/api/1/deals", {
          company_id: COMPANY,
          issue_date: p.date,
          type: side,
          details: [
            {
              account_item_id: p.accountItemId,
              tax_code: p.taxCode,
              amount: p.amount,
              description: p.description.slice(0, 100),
            },
          ],
        });
        results.push({ txnId: p.txnId, dealId: res.deal?.id });
        if (res.deal?.id) done[String(p.txnId)] = res.deal.id;
      } catch (e) {
        results.push({ txnId: p.txnId, error: e instanceof Error ? e.message : "失敗" });
      }
    }
    if (store) await store.set(doneKey, done);
    return NextResponse.json({
      ok: true,
      created: results.filter((r) => r.dealId).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "登録に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/freee/make-deal  { dealIds: [1,2,3] }
// 作りすぎた・科目を間違えた取引を取り消す
export async function DELETE(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const { dealIds } = (await req.json()) as { dealIds?: number[] };
    if (!dealIds?.length) {
      return NextResponse.json({ error: "dealIds が必要です" }, { status: 400 });
    }
    const { freeeDelete } = await import("@/lib/freee");
    const results: { dealId: number; ok: boolean; error?: string }[] = [];
    for (const id of dealIds) {
      try {
        await freeeDelete(`/api/1/deals/${id}`, { company_id: FREEE_COMPANY_ID });
        results.push({ dealId: id, ok: true });
      } catch (e) {
        results.push({ dealId: id, ok: false, error: e instanceof Error ? e.message : "失敗" });
      }
    }
    return NextResponse.json({
      ok: true,
      deleted: results.filter((r) => r.ok).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
