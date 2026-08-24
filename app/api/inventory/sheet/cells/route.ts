import { NextRequest, NextResponse } from "next/server";
import { isGoogleConnected, sheetsGet, sheetsInsertRows, sheetsUpdate } from "@/lib/google";
import { SHEET_ID } from "@/lib/inventorySheet";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/inventory/sheet/cells?range=シート1!A1:F600
// 行番号つきで生の値を返す（どのセルを直すか特定するため）
export async function GET(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const range = req.nextUrl.searchParams.get("range") || "シート1!A1:F600";
    const values = await sheetsGet(SHEET_ID, range);
    // 先頭行が何行目かを range から拾って、行番号を添えて返す
    const m = /![A-Z]+(\d+)/.exec(range);
    const from = m ? Number(m[1]) : 1;
    const rows = values.map((r, i) => ({ row: from + i, cells: r }));
    return NextResponse.json({ range, count: rows.length, rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み取りに失敗" },
      { status: 500 },
    );
  }
}

// POST /api/inventory/sheet/cells  { updates: [{ range: "シート1!C11", value: "..." }] }
// セル単位で書き換える。範囲を絞って渡すので、意図しない行を壊さない。
export async function POST(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const body = (await req.json()) as {
      updates?: { range: string; value: string }[];
      insert?: { tab: string; startRow: number; count: number };
    };
    // 先に行を空ける。あとから updates でその行を埋める
    if (body.insert) {
      const { tab, startRow, count } = body.insert;
      if (!tab || !startRow || !count) {
        return NextResponse.json({ error: "insertの指定が足りません" }, { status: 400 });
      }
      await sheetsInsertRows(SHEET_ID, tab, startRow, count);
    }
    const updates = body.updates || [];
    if (!updates.length) {
      return NextResponse.json({ ok: true, inserted: body.insert ?? null, updated: [] });
    }
    const done: string[] = [];
    for (const u of updates) {
      if (!/^[^!]+![A-Z]+\d+$/.test(u.range)) {
        return NextResponse.json({ error: `rangeが単一セルではない: ${u.range}` }, { status: 400 });
      }
      await sheetsUpdate(SHEET_ID, u.range, [[u.value]]);
      done.push(u.range);
    }
    return NextResponse.json({ ok: true, inserted: body.insert ?? null, updated: done });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "書き込みに失敗" },
      { status: 500 },
    );
  }
}
