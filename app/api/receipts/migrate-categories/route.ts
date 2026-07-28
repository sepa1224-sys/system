import { NextResponse } from "next/server";
import { getReceipts, type SavedReceipt, type RLine } from "@/lib/receipts";

export const runtime = "nodejs";

// 旧カテゴリ → 新カテゴリ + タグ のマッピング
const MIGRATION: Record<string, { category: string; tag: string }> = {
  "コーヒー豆・茶葉": { category: "仕入高", tag: "コーヒー豆・茶葉" },
  "牛乳・シロップ等": { category: "仕入高", tag: "牛乳・乳製品" },
  "酒類": { category: "仕入高", tag: "酒類" },
  "ソフトドリンク・炭酸": { category: "仕入高", tag: "ソフトドリンク・炭酸" },
  "フード材料費": { category: "仕入高", tag: "フード材料" },
  "包装資材・消耗品": { category: "消耗品費", tag: "包装資材" },
  "その他原価": { category: "仕入高", tag: "その他原価" },
  "その他経費": { category: "雑費", tag: "" },
};

function migrateLine(line: RLine): { line: RLine; changed: boolean } {
  const mapping = MIGRATION[line.category];
  if (!mapping) return { line, changed: false };

  const tags = [...(line.tags || [])];
  if (mapping.tag && !tags.includes(mapping.tag)) {
    tags.push(mapping.tag);
  }

  return {
    line: { ...line, category: mapping.category, tags },
    changed: true,
  };
}

// GET: ドライラン（変更対象を表示）
// POST: 実行
export async function GET() {
  try {
    const receipts = await getReceipts();
    const changes: { id: string; vendor: string; before: string; after: string; addedTag: string }[] = [];

    for (const r of receipts) {
      // レシート全体のcategory
      if (MIGRATION[r.category]) {
        const m = MIGRATION[r.category];
        changes.push({
          id: r.id,
          vendor: r.vendor,
          before: r.category,
          after: m.category,
          addedTag: m.tag,
        });
      }
      // lines内のcategory
      if (r.lines) {
        for (const line of r.lines) {
          if (MIGRATION[line.category]) {
            const m = MIGRATION[line.category];
            changes.push({
              id: r.id,
              vendor: `${r.vendor} > ${line.name}`,
              before: line.category,
              after: m.category,
              addedTag: m.tag,
            });
          }
        }
      }
    }

    return NextResponse.json({
      dryRun: true,
      totalReceipts: receipts.length,
      changesToMake: changes.length,
      changes,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return NextResponse.json({ error: "KV未設定" }, { status: 500 });

    const { createClient } = await import("@vercel/kv");
    const store = createClient({ url, token });
    const receipts = (await store.get<SavedReceipt[]>("receipts:index")) ?? [];

    let changedCount = 0;

    for (const r of receipts) {
      let modified = false;

      // レシート全体のcategory
      if (MIGRATION[r.category]) {
        const m = MIGRATION[r.category];
        r.category = m.category;
        if (m.tag) {
          if (!r.tags) r.tags = [];
          if (!r.tags.includes(m.tag)) r.tags.push(m.tag);
        }
        modified = true;
      }

      // lines
      if (r.lines) {
        for (let i = 0; i < r.lines.length; i++) {
          const result = migrateLine(r.lines[i]);
          if (result.changed) {
            r.lines[i] = result.line;
            modified = true;
          }
        }
      }

      if (modified) changedCount++;
    }

    await store.set("receipts:index", receipts);

    return NextResponse.json({
      ok: true,
      totalReceipts: receipts.length,
      modified: changedCount,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
