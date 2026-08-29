import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// 毎週月曜の朝、Squareからの振込明細に「売掛金の未決済取引」を自動で作る。
// 売上と手数料はfreeeのSquare連携が計上済みなので、振込は売掛金の回収として
// 消し込むだけでよい。取引を作っておけば、freeeでは消込を選んで登録するだけになる。
// 一度作った明細はmake-deal側のKV記録でスキップされるので、何度呼んでも安全。
export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/freee/make-deal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match: "スクエア",
        category: "売掛金",
        side: "income",
        dryRun: false,
      }),
    });
    const d = await res.json();
    return NextResponse.json({ ok: res.ok, ...d });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラー" },
      { status: 500 },
    );
  }
}
