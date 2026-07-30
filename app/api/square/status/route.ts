import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const token = process.env.SQUARE_ACCESS_TOKEN || process.env.SQUARE_TOKEN || "";
  const hasToken = token.length > 0;

  if (!hasToken) {
    return NextResponse.json({
      connected: false,
      error: "SQUARE_ACCESS_TOKEN が環境変数に設定されていません",
    });
  }

  // Square APIでロケーション取得を試す
  try {
    const res = await fetch("https://connect.squareup.com/v2/locations", {
      headers: {
        "Square-Version": "2024-11-20",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({
        connected: false,
        error: data.errors?.[0]?.detail || `API error ${res.status}`,
      });
    }
    const locations = (data.locations || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      status: l.status,
    }));
    return NextResponse.json({ connected: true, locations });
  } catch (e) {
    return NextResponse.json({
      connected: false,
      error: e instanceof Error ? e.message : "接続エラー",
    });
  }
}
