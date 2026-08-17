import { NextResponse } from "next/server";
import { isGoogleConnected, sheetsGet } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

// 仕入れ表のスプレッドシート。列は 仕入れ物 / 仕入れ先 / URL / 価格 / 容量 / メモ。
// 「ドリンク」「ドリンク（酒）」のような見出し行は A列だけが埋まっていて、
// 残りが空になっているので、それで区切りを判定する。
export const SHEET_ID = "1VJc6EWTerOSL_-IeuL053gGG3hh3LcIxmVOXod02JN8";
const RANGE = "シート1!A1:F500";

export type SheetRow = {
  name: string;
  supplier: string;
  url: string;
  price: string;
  capacity: string;
  note: string;
};
export type Section = { title: string; rows: SheetRow[] };

const cell = (r: (string | number)[], i: number) =>
  r[i] === undefined || r[i] === null ? "" : String(r[i]).trim();

export function parseSheet(values: (string | number)[][]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;

  // 1行目はヘッダー（仕入れ物 / 仕入れ先 / …）なので飛ばす
  for (const row of values.slice(1)) {
    const [name, supplier, url, price, capacity, note] = [0, 1, 2, 3, 4, 5].map((i) =>
      cell(row, i),
    );
    if (!name && !supplier && !url && !price && !capacity && !note) continue;

    // A列だけの行は見出し
    if (name && !supplier && !url && !price && !capacity && !note) {
      cur = { title: name, rows: [] };
      out.push(cur);
      continue;
    }
    if (!name) continue;
    if (!cur) {
      cur = { title: "その他", rows: [] };
      out.push(cur);
    }
    cur.rows.push({ name, supplier, url, price, capacity, note });
  }
  return out.filter((s) => s.rows.length > 0);
}

// GET /api/inventory/sheet → スプレッドシートの内容をセクションごとに返す
export async function GET() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const values = await sheetsGet(SHEET_ID, RANGE);
    const sections = parseSheet(values);
    const total = sections.reduce((n, s) => n + s.rows.length, 0);
    // 価格が入っていないものは発注前に調べる必要があるので数えておく
    const missingPrice = sections.reduce(
      (n, s) => n + s.rows.filter((r) => !r.price).length,
      0,
    );
    return NextResponse.json({
      sheetId: SHEET_ID,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
      sections,
      total,
      missingPrice,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み取りに失敗" },
      { status: 500 },
    );
  }
}
