import { NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";

export const runtime = "nodejs";

// GET /api/freee/taxes → 税区分コードと名称の対応
export async function GET() {
  if (!(await isConnected())) {
    return NextResponse.json({ error: "freee未接続" }, { status: 400 });
  }
  try {
    const r = await freeeGet<{
      taxes: { code: number; name_ja?: string; name?: string }[];
    }>("/api/1/taxes/codes", { company_id: FREEE_COMPANY_ID });
    return NextResponse.json({
      taxes: (r.taxes ?? []).map((t) => ({ code: t.code, name: t.name_ja ?? t.name ?? "" })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}
