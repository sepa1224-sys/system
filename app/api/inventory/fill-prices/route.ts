import { NextRequest, NextResponse } from "next/server";
import {
  gmailSearch,
  googleErrorPayload,
  isGoogleConnected,
  sheetsGet,
  sheetsUpdate,
  type Mail,
} from "@/lib/google";
import { SHEET_ID, SHEET_RANGE } from "@/lib/inventorySheet";

export const runtime = "nodejs";
export const maxDuration = 60;

// 仕入れ表の価格が空の行を、購入メールから埋める。
//
// 商品名は表とメールで表記が揺れる（表「ジンジャエール（缶）」/ メール「コカ・コーラ
// カナダドライ ジンジャーエール 160ml缶×30本」）ので、行の名前ではなく
// C列のURLに入っている商品名を手がかりにする。こちらは購入したページそのものなので確実。

type Row = { row: number; name: string; supplier: string; url: string; price: string };

// 表記揺れを吸収する。長音・中黒・空白・全半角を落として比較用の文字列にする。
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ー・、。\s（）()［］\[\]【】"'`,.\-_/×]/g, "");
}

// Amazonの商品URLから商品名を取り出す。
// 例: /コカ・コーラ-カナダドライ-ジンジャーエール-缶-160ml×30本/dp/B00158V46K
function nameFromUrl(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const seg = path.split("/").filter(Boolean);
    // /dp/ の直前が商品名スラッグ
    const i = seg.findIndex((s) => s === "dp" || s === "gp");
    const slug = i > 0 ? seg[i - 1] : seg[0] || "";
    return slug.replace(/-/g, " ").trim();
  } catch {
    return "";
  }
}

// 検索に使う語を選ぶ。長めのカタカナ・漢字語ほど効くので長い順に。
function keywords(name: string): string[] {
  return name
    .split(/[\s×]+/)
    .map((w) => w.replace(/[0-9]+(ml|g|本|個|枚|袋|缶)?$/i, "").trim())
    .filter((w) => w.length >= 3)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
}

type Hit = { date: string; product: string; qty: number; unitPrice: number; subject: string };

// Amazonの注文確認メールは
//   * 商品名
//   数量: 3
//   1454 JPY
// という並び。ここの金額は1個あたりの単価。
function parseAmazon(mail: Mail): Hit[] {
  const lines = mail.body.split("\n").map((l) => l.trim());
  const out: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("*")) continue;
    const product = lines[i].replace(/^\*\s*/, "");
    if (!product) continue;
    let qty = 1;
    let unitPrice = 0;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const q = /^数量:\s*(\d+)/.exec(lines[j]);
      if (q) qty = Number(q[1]);
      const p = /^([\d,]+)\s*JPY/.exec(lines[j]);
      if (p) { unitPrice = Number(p[1].replace(/,/g, "")); break; }
    }
    if (unitPrice > 0) out.push({ date: mail.date, product, qty, unitPrice, subject: mail.subject });
  }
  return out;
}

// 商品名がどれくらい一致しているか。共通する2文字のかたまりの割合で見る。
function score(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  const grams = new Set<string>();
  for (let i = 0; i < x.length - 1; i++) grams.add(x.slice(i, i + 2));
  if (!grams.size) return 0;
  let hit = 0;
  for (const g of grams) if (y.includes(g)) hit++;
  return hit / grams.size;
}

async function findPrice(row: Row): Promise<Hit | null> {
  const target = nameFromUrl(row.url) || row.name;
  const words = keywords(target);
  if (!words.length) return null;

  const seen = new Map<string, Mail>();
  for (const w of words) {
    let mails: Mail[] = [];
    try {
      mails = await gmailSearch(`from:auto-confirm@amazon.co.jp ${w}`, 10);
    } catch { continue; }
    for (const m of mails) seen.set(m.id, m);
    if (seen.size) break; // 1語で見つかれば十分
  }

  const hits = [...seen.values()].flatMap(parseAmazon).filter((h) => score(target, h.product) >= 0.5);
  if (!hits.length) return null;
  // 値段は変わるので、いちばん新しい注文を採用する
  hits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return hits[0];
}

type Result = {
  row: number;
  name: string;
  supplier: string;
  found: boolean;
  price?: number;
  orderedAt?: string;
  qty?: number;
  product?: string;
  cell?: string;
  reason?: string;
};

async function collect(): Promise<Result[]> {
  const values = await sheetsGet(SHEET_ID, SHEET_RANGE);
  const rows: Row[] = [];
  values.forEach((r, i) => {
    const c = (n: number) => (r[n] == null ? "" : String(r[n]).trim());
    const [name, supplier, url, price] = [c(0), c(1), c(2), c(3)];
    // 見出し行(A列だけ)と、すでに価格が入っている行は対象外
    if (!name || !supplier || price) return;
    rows.push({ row: i + 1, name, supplier, url, price });
  });

  const results: Result[] = [];
  for (const row of rows) {
    const hit = row.url ? await findPrice(row) : null;
    results.push({
      row: row.row,
      name: row.name,
      supplier: row.supplier,
      found: !!hit,
      ...(hit
        ? {
            price: hit.unitPrice,
            orderedAt: new Date(hit.date).toISOString().slice(0, 10),
            qty: hit.qty,
            product: hit.product,
            cell: `シート1!D${row.row}`,
          }
        : { reason: row.url ? "購入メールが見つからない" : "URLが未登録" }),
    });
  }
  return results;
}

// GET  → 何を埋められるかを見るだけ
// POST { dryRun:false } → 実際に価格を書き込む
export async function GET() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const results = await collect();
    return NextResponse.json({
      dryRun: true,
      fillable: results.filter((r) => r.found).length,
      results,
    });
  } catch (e) {
    return NextResponse.json(googleErrorPayload(e, "調査に失敗"), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean; rows?: number[] };
    const results = await collect();
    const targets = results.filter(
      (r) => r.found && (!body.rows?.length || body.rows.includes(r.row)),
    );
    if (body.dryRun !== false) {
      return NextResponse.json({ dryRun: true, willWrite: targets });
    }
    for (const t of targets) {
      await sheetsUpdate(SHEET_ID, t.cell!, [[String(t.price)]]);
    }
    return NextResponse.json({ ok: true, written: targets.length, targets });
  } catch (e) {
    return NextResponse.json(googleErrorPayload(e, "書き込みに失敗"), { status: 500 });
  }
}
