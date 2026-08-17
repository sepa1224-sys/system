import { NextResponse } from "next/server";
import { isGoogleConnected, sheetsGet } from "@/lib/google";
import { SHEET_ID, SHEET_RANGE, SHEET_URL, parseSheet } from "@/lib/inventorySheet";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/inventory/sheet → 仕入れ表スプレッドシートの内容をセクションごとに返す
export async function GET() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const values = await sheetsGet(SHEET_ID, SHEET_RANGE);
    const sections = parseSheet(values);
    const total = sections.reduce((n, s) => n + s.rows.length, 0);
    // 価格が入っていないものは発注前に調べる必要があるので数えておく
    const missingPrice = sections.reduce(
      (n, s) => n + s.rows.filter((r) => !r.price).length,
      0,
    );
    return NextResponse.json({ sheetUrl: SHEET_URL, sections, total, missingPrice });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み取りに失敗" },
      { status: 500 },
    );
  }
}
