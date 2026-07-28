import { NextResponse } from "next/server";
import type { SavedReceipt, RLine } from "@/lib/receipts";

export const runtime = "nodejs";

// 商品名から正しいタグを推定
function inferTag(name: string): string | null {
  const n = name.toLowerCase();

  // 酒類
  if (/ジムビーム|jim\s*beam|ウイスキー|whisky|whiskey|バーボン|ウォッカ|vodka|ジン(?!ジャー)|gin(?!ger)|ラム酒|テキーラ|ブランデー|焼酎|日本酒|ワイン|wine|ビール|beer|ハイネケン|コロナ|バドワイザー|budweiser|アペロール|aperol|カンパリ|campari|リキュール|梅酒|スロージン|コアントロー|cointreau|カシス/i.test(name)) {
    return "酒類";
  }

  // ソフトドリンク・炭酸
  if (/炭酸|ソーダ|トニック|tonic|コーラ|cola|ジンジャーエール|ginger\s*ale|サイダー|ラムネ|ペリエ|perrier|ウィルキンソン|wilkinson/i.test(name)) {
    return "ソフトドリンク・炭酸";
  }

  // シロップ・調味料
  if (/シロップ|ガムシロ|グレナディン|モナン|monin|ポッカ.*レモン|レモンジュース|ライム.*ジュース|お酒にプラス|グレープフルーツ|砂糖|塩|醤油|ソース|ケチャップ|マヨネーズ/i.test(name)) {
    return "シロップ・調味料";
  }

  // コーヒー豆・茶葉
  if (/コーヒー豆|珈琲|焙煎|エスプレッソ(?!.*グラス|.*カップ|.*マシン)|茶葉|紅茶|抹茶|ほうじ茶/i.test(name)) {
    return "コーヒー豆・茶葉";
  }

  // 牛乳・乳製品
  if (/牛乳|ミルク|milk|生クリーム|バター|ヨーグルト|チーズ|乳/i.test(name)) {
    return "牛乳・乳製品";
  }

  return null;
}

// GET: ドライラン
export async function GET() {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return NextResponse.json({ error: "KV未設定" }, { status: 500 });

    const { createClient } = await import("@vercel/kv");
    const store = createClient({ url, token });
    const receipts = (await store.get<SavedReceipt[]>("receipts:index")) ?? [];

    const fixes: { id: string; name: string; oldTag: string; newTag: string }[] = [];

    for (const r of receipts) {
      if (!r.lines) continue;
      for (const line of r.lines) {
        const inferred = inferTag(line.name);
        if (!inferred) continue;

        const currentTags = line.tags || [];
        // 間違ったタグが付いていて、正しいタグがまだない場合
        const wrongTag = currentTags.find(t =>
          t !== inferred && ["牛乳・乳製品", "フード材料", "その他原価"].includes(t)
        );
        if (wrongTag || !currentTags.includes(inferred)) {
          fixes.push({
            id: r.id,
            name: line.name,
            oldTag: currentTags.join(", ") || "(なし)",
            newTag: inferred,
          });
        }
      }
    }

    return NextResponse.json({ dryRun: true, fixes: fixes.length, details: fixes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST: 実行
export async function POST() {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return NextResponse.json({ error: "KV未設定" }, { status: 500 });

    const { createClient } = await import("@vercel/kv");
    const store = createClient({ url, token });
    const receipts = (await store.get<SavedReceipt[]>("receipts:index")) ?? [];

    let fixCount = 0;

    for (const r of receipts) {
      if (!r.lines) continue;
      let modified = false;

      for (const line of r.lines) {
        const inferred = inferTag(line.name);
        if (!inferred) continue;

        if (!line.tags) line.tags = [];

        // 間違ったタグを除去
        const wrongIdx = line.tags.findIndex(t =>
          t !== inferred && ["牛乳・乳製品", "フード材料", "その他原価"].includes(t)
        );
        if (wrongIdx >= 0) {
          line.tags.splice(wrongIdx, 1);
          modified = true;
        }

        // 正しいタグを追加
        if (!line.tags.includes(inferred)) {
          line.tags.push(inferred);
          modified = true;
        }
      }

      if (modified) fixCount++;
    }

    await store.set("receipts:index", receipts);

    return NextResponse.json({ ok: true, fixed: fixCount });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
