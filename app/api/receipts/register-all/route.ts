import { NextRequest, NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { getReceipts, receiptLines, type SavedReceipt } from "@/lib/receipts";
import { CATEGORY_MAP, clampIssueDate, FISCAL_START } from "@/lib/freeeMap";

export const runtime = "nodejs";
export const maxDuration = 300;

type Issue = { level: "error" | "warn"; message: string };

export type BankTxn = { date: string; amount: number; description: string };

/**
 * 会社口座の明細（出金）を取ってくる。日付がおかしい領収書でも、
 * 金額がぴったり一致する明細が1件だけ見つかれば実在の支払いだと確認できる。
 */
async function loadBankTxns(): Promise<BankTxn[]> {
  try {
    const { walletables } = await freeeGet<{
      walletables: { id: number; name: string; type: string }[];
    }>("/api/1/walletables", { company_id: FREEE_COMPANY_ID });
    const banks = walletables.filter(
      (w) => w.type === "bank_account" || w.type === "wallet",
    );
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const per = await Promise.all(
      banks.map(async (w) => {
        const out: BankTxn[] = [];
        let offset = 0;
        for (;;) {
          const { wallet_txns: page } = await freeeGet<{
            wallet_txns: {
              date: string;
              amount: number;
              description: string;
              entry_side: string;
            }[];
          }>("/api/1/wallet_txns", {
            company_id: FREEE_COMPANY_ID,
            walletable_type: w.type,
            walletable_id: String(w.id),
            start_date: FISCAL_START,
            end_date: today,
            limit: "100",
            offset: String(offset),
          });
          for (const t of page) {
            if (t.entry_side === "expense") {
              out.push({ date: t.date, amount: t.amount, description: t.description });
            }
          }
          if (page.length < 100) break;
          offset += 100;
        }
        return out;
      }),
    );
    return per.flat();
  } catch {
    // 明細が取れなくても点検自体は続ける（マッチ無し扱いになる）
    return [];
  }
}

/** 金額がぴったり一致する明細を返す。候補が複数あると特定できないのでnull */
function matchBank(r: SavedReceipt, txns: BankTxn[]): BankTxn | null {
  const hits = txns.filter((t) => t.amount === r.total);
  return hits.length === 1 ? hits[0] : null;
}

// 品名から見て明らかに合っていない科目を拾う。仕訳の妥当性チェック。
const CATEGORY_HINTS: { re: RegExp; expect: string[]; label: string }[] = [
  { re: /送料|宅急便|宅配便|配送料|運賃|ゆうパック/, expect: ["荷造運賃", "通信費"], label: "送料" },
  { re: /出店料|広告|チラシ|ポスター|シール|ステッカー|名刺/, expect: ["広告宣伝費", "販売促進費"], label: "広告・販促" },
  { re: /ガソリン|軽油|高速|駐車/, expect: ["旅費交通費", "車両費"], label: "交通費" },
];

// 登録前に1件ずつ点検する。errorが1つでもあれば、その領収書は登録しない。
function inspect(r: SavedReceipt, bank: BankTxn[]): Issue[] {
  const out: Issue[] = [];
  if (!r.date) out.push({ level: "error", message: "日付が空" });
  if (!r.total) out.push({ level: "error", message: "金額が空" });

  const lines = receiptLines(r);
  if (lines.length === 0) out.push({ level: "error", message: "内訳が無い" });

  for (const l of lines) {
    if (!CATEGORY_MAP[l.category]) {
      out.push({ level: "error", message: `科目「${l.category}」はfreeeに対応が無い（${l.name}）` });
    }
    if ((l.amount || 0) <= 0) {
      out.push({ level: "warn", message: `金額が0以下の行（${l.name}）` });
    }
    if ((l.amount || 0) >= 300000) {
      out.push({ level: "warn", message: `30万円以上。固定資産の判断が要る（${l.name} ¥${l.amount.toLocaleString()}）` });
    }
    // 品名と科目が噛み合っていないものを拾う（送料なのに雑費、など）
    for (const h of CATEGORY_HINTS) {
      if (h.re.test(l.name || "") && !h.expect.includes(l.category)) {
        out.push({
          level: "warn",
          message: `${h.label}なのに科目が「${l.category}」。${h.expect.join("か")}が妥当（${l.name}）`,
        });
      }
    }
  }

  const sum = lines.reduce((s, l) => s + (l.amount || 0), 0);
  if (r.total && sum !== r.total) {
    out.push({ level: "warn", message: `内訳の合計¥${sum.toLocaleString()}が総額¥${r.total.toLocaleString()}と一致しない` });
  }

  // 期首前の日付は原則ペンディング。OCRの読み違い（2018年など）をそのまま
  // 期首に丸めて登録すると、あとから気づけなくなるため。
  // ただし金額が一致する銀行明細が1件だけ見つかれば、実在の支払いと確認できるので通す。
  if (r.date && r.date < FISCAL_START) {
    const { issueDate } = clampIssueDate(r.date);
    const hit = matchBank(r, bank);
    if (hit) {
      out.push({
        level: "warn",
        message: `期首前の日付だが、銀行明細（${hit.date} ¥${hit.amount.toLocaleString()}）と金額が一致。${issueDate}に丸めて登録される`,
      });
    } else {
      out.push({
        level: "error",
        message: `期首前の日付（${r.date}）。銀行明細に一致する支払いが無いため保留。日付を確認して直してください`,
      });
    }
  }
  if (r.date && r.date > new Date().toISOString().slice(0, 10)) {
    out.push({ level: "warn", message: "未来の日付" });
  }

  const kind = r.expenseKind ?? "company";
  if ((kind === "company" || kind === "labor") && !r.payer) {
    out.push({ level: "warn", message: "立替者が未設定。取引先なしで登録される" });
  }
  return out;
}

// POST { dryRun?: boolean, ids?: string[] }
//   dryRun=true（既定）… 点検だけして登録しない
//   dryRun=false        … errorが無いものを順に登録する。失敗しても止めずに最後まで走る
export async function POST(req: NextRequest) {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続です" }, { status: 400 });
  }
  let body: { dryRun?: boolean; ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* 空ボディはdryRun扱い */
  }
  const dryRun = body.dryRun !== false;

  const all = await getReceipts();
  const targets = all.filter(
    (r) => !r.registered && (!body.ids?.length || body.ids.includes(r.id)),
  );

  // 期首前の領収書があるときだけ銀行明細を取りに行く（毎回取ると遅いため）
  const needBank = targets.some((r) => r.date && r.date < FISCAL_START);
  const bank = needBank ? await loadBankTxns() : [];

  const checked = targets.map((r) => {
    const issues = inspect(r, bank);
    return {
      id: r.id,
      date: r.date,
      vendor: r.vendor,
      total: r.total,
      expenseKind: r.expenseKind ?? "company",
      payer: r.payer,
      issues,
      blocked: issues.some((i) => i.level === "error"),
    };
  });

  const ready = checked.filter((c) => !c.blocked);
  const blocked = checked.filter((c) => c.blocked);
  const summary = {
    target: targets.length,
    ready: ready.length,
    blocked: blocked.length,
    warned: ready.filter((c) => c.issues.length > 0).length,
    readyAmount: ready.reduce((s, c) => s + (c.total || 0), 0),
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, summary, checked });
  }

  // 本実行。1件ずつ既存の登録APIと同じ経路を通す。
  const origin = req.nextUrl.origin;
  const results: { id: string; ok: boolean; journalId?: number; error?: string }[] = [];
  for (const c of ready) {
    try {
      const res = await fetch(`${origin}/api/receipts/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const d = await res.json();
      if (res.ok && d.ok) results.push({ id: c.id, ok: true, journalId: d.journalId });
      else results.push({ id: c.id, ok: false, error: d.error || `HTTP ${res.status}` });
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e instanceof Error ? e.message : "失敗" });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    dryRun: false,
    summary: { ...summary, registered: okCount, failed: results.length - okCount },
    results,
    blocked,
  });
}
