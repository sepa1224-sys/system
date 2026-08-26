import { NextRequest, NextResponse } from "next/server";
import { getPhoto } from "@/lib/foodRecipe";

export const runtime = "nodejs";

// GET /api/food-recipe/photo?id=... → 手順写真そのもの
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  const data = await getPhoto(id);
  if (!data) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const m = /^data:([^;]+);base64,(.+)$/.exec(data);
  if (!m) return NextResponse.json({ error: "形式が不正です" }, { status: 500 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=86400" },
  });
}
