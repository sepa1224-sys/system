import { NextRequest, NextResponse } from "next/server";
import { gmailFetchPdfAttachments, isGoogleConnected } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 300;

// メールに添付されてきた請求書・明細書のPDFを、書類保管庫へ自動で取り込む。
// Amazonビジネスの「請求書をメールで受け取る」設定を入れておけば、
// Amazonの適格請求書もここで拾える。容器スタイル・モノタロウ・ラクスルなど
// PDFを送ってくる店はそのまま対象になる。
//
// 取り込んだPDFは /api/docs のAI解析に通して、種類・要点・支払額の索引を作る。
// 索引に金額が入るので、未処理明細と自動で紐づくようになる。

const INGESTED_KEY = "docs:ingestedMails";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

// 請求書らしい添付メールの検索条件。広めに拾って、二重取り込みはKVで防ぐ
const QUERY =
  'has:attachment filename:pdf newer_than:14d (請求書 OR 領収書 OR 明細 OR invoice OR receipt)';

export async function GET(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ error: "Google未接続" }, { status: 400 });
  }
  try {
    const store = await kv();
    const ingested = new Set<string>(
      store ? ((await store.get<string[]>(INGESTED_KEY)) ?? []) : [],
    );

    const atts = await gmailFetchPdfAttachments(QUERY, 10);
    const origin = req.nextUrl.origin;
    const results: { filename: string; from: string; status: string }[] = [];
    let saved = 0;

    for (const a of atts) {
      const key = `${a.mailId}_${a.filename}`;
      if (ingested.has(key)) continue;
      if (saved >= 4) break; // AI解析が重いので1回の実行は4件まで。残りは次回

      // 書類APIに流して、解析＋原本保存までやってもらう
      const res = await fetch(`${origin}/api/docs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: `data:application/pdf;base64,${a.base64}`,
          fileName: a.filename,
        }),
      });
      if (res.ok) {
        ingested.add(key);
        saved++;
        results.push({ filename: a.filename, from: a.from, status: "保存" });
      } else {
        results.push({
          filename: a.filename,
          from: a.from,
          status: `失敗(${res.status})`,
        });
      }
    }

    if (store) await store.set(INGESTED_KEY, [...ingested].slice(-500));
    return NextResponse.json({ ok: true, found: atts.length, saved, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取り込みに失敗" },
      { status: 500 },
    );
  }
}
