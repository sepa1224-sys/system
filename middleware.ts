import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authEnabled, hasValidSession, isCronCall } from "@/lib/siteAuth";

// 合言葉を通っていないアクセスを、入口でまとめて止める。
//
// ここを通すかどうかの判断は1か所に集める。新しい画面を作っても
// 自動で守られるので、画面ごとに考えなくてよい。

/** 合言葉なしで通すもの。増やすときは「お客さんが開くか」で判断する */
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/login",
  "/event", // LIFFの固定入口。開催中のイベントへ転送する（ページではない）
  "/djnight", // 配布済みの古いURL
  "/natsumatsuri",
  "/e",
  // LINEのサーバーが叩くもの
  "/api/line/webhook",
  "/api/line/friendship",
  // 外部サービスから戻ってくる先。ここを止めると連携が壊れる
  "/api/freee/callback",
  "/api/google/callback",
]);

/** 配下すべてを通すもの。管理画面が同じ下にぶら下がっていないか必ず確認する */
const PUBLIC_PREFIX = ["/e/"];

/** 静的ファイル。public/ に置いてあるものだけ */
const PUBLIC_FILES = new Set([
  "/manifest.json",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512.svg",
  "/og-djnight.png",
  "/og-oboe.png",
  "/ping.wav",
  "/richmenu-events.png",
]);

/**
 * お客さん向けページと管理画面が、同じ入れ子の下に同居している。
 * ここを取り違えると申込者名簿が外に出るので、名指しで閉める。
 */
const ADMIN_UNDER_PUBLIC = new Set(["/event/kanri", "/natsumatsuri/kanri"]);

function isPublic(req: NextRequest): boolean {
  const { pathname, searchParams } = req.nextUrl;

  if (ADMIN_UNDER_PUBLIC.has(pathname)) return false;
  if (PUBLIC_FILES.has(pathname)) return true;
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIX.some((p) => pathname.startsWith(p))) return true;

  // イベントの申込ページ（/event/oboe など）。/event/kanri は上で閉じてある
  if (pathname.startsWith("/event/")) return true;

  // 申込の読み書きだけ通す。
  // admin=1 / list=1 は申込者の氏名・LINE ID・メールが返るので閉める。
  // PATCH・DELETE も通さない（申込を第三者に消されないため）。
  if (pathname === "/api/event" || pathname === "/api/natsumatsuri") {
    if (req.method === "POST") return true;
    if (req.method === "GET") {
      return !searchParams.has("admin") && !searchParams.has("list");
    }
    return false;
  }

  // 自動実行。Vercelが付けてくるヘッダが合っているときだけ通す
  if (pathname.startsWith("/api/cron/")) {
    return isCronCall(req.headers.get("authorization"));
  }

  return false;
}

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (isPublic(req)) return NextResponse.next();

  if (await hasValidSession(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // APIは画面に飛ばさず、そのまま断る（fetchが妙な挙動をしないように）
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "合言葉が必要です" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // ビルド成果物と画像最適化だけ素通し。それ以外は全部ここを通る
  matcher: ["/((?!_next/static|_next/image).*)"],
};
