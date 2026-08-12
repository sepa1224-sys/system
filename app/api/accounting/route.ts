import { NextRequest, NextResponse } from "next/server";
import { getMonth, saveMonth, getAllMonths, type MonthlyData } from "@/lib/accounting";

export const runtime = "nodejs";

// GET: 月次データ取得
// ?ym=2026-08 → 単月, ?all=1 → 全月
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    if (searchParams.get("all")) {
      const months = await getAllMonths();
      return NextResponse.json({ months });
    }
    const ym = searchParams.get("ym") || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const data = await getMonth(ym);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得失敗" }, { status: 500 });
  }
}

// POST: 月次データ保存
export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as MonthlyData;
    if (!data.ym || !/^\d{4}-\d{2}$/.test(data.ym)) {
      return NextResponse.json({ error: "ym が必要（YYYY-MM形式）" }, { status: 400 });
    }
    await saveMonth(data);
    return NextResponse.json({ ok: true, ym: data.ym });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存失敗" }, { status: 500 });
  }
}
