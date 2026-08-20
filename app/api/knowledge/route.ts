import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  CATEGORIES,
  getKnowledge,
  saveKnowledge,
  deleteKnowledge,
  newId,
  type Knowledge,
} from "@/lib/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

const Draft = z.object({
  title: z.string().describe("一覧に出す短い見出し。20字以内"),
  question: z.string().describe("どんなときに知りたくなるかを、質問の形で1文"),
  answer: z.string().describe("答え。手順があれば番号付きで。専門用語は噛み砕く"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()).describe("検索用のキーワード2〜5個"),
});

// GET /api/knowledge?q=... → 一覧（qがあれば絞り込み）
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const all = await getKnowledge();
    const list = q
      ? all.filter((k) =>
          [k.title, k.question, k.answer, k.category, ...(k.tags ?? [])]
            .join(" ")
            .includes(q),
        )
      : all;
    return NextResponse.json({ count: list.length, total: all.length, entries: list });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/knowledge
//   { action: "draft", raw, source? } … 文章をAIが整形して返す（保存しない）
//   { action: "save", entry }         … 整形結果を保存する
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      action?: string;
      raw?: string;
      source?: string;
      entry?: Partial<Knowledge>;
    };

    if (b.action === "draft") {
      const raw = (b.raw || "").trim();
      if (!raw) {
        return NextResponse.json({ error: "内容が空です" }, { status: 400 });
      }
      const client = new Anthropic();
      const res = await client.beta.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 900,
        output_format: betaZodOutputFormat(Draft),
        system:
          "あなたは滋賀県彦根のカフェ flat. の運営ナレッジを整理する担当です。" +
          "スタッフが書いたメモを、あとで誰が読んでも分かる形に整えてください。" +
          "書かれていないことを足さない。分量は元のメモに見合ったぶんだけにする。" +
          "読む相手はアルバイトを含むので、専門用語は噛み砕く。",
        messages: [{ role: "user", content: `次のメモを整形してください。\n\n${raw}` }],
      });
      const d = res.parsed_output;
      if (!d) {
        return NextResponse.json({ error: "整形できませんでした" }, { status: 500 });
      }
      return NextResponse.json({ draft: { ...d, source: b.source ?? "", raw } });
    }

    if (b.action === "save") {
      const e = b.entry ?? {};
      if (!e.title || !e.answer) {
        return NextResponse.json({ error: "title と answer が必要です" }, { status: 400 });
      }
      const now = new Date().toISOString();
      const k: Knowledge = {
        id: e.id || newId(),
        title: e.title,
        question: e.question || e.title,
        answer: e.answer,
        category: e.category || "その他",
        tags: e.tags ?? [],
        source: e.source,
        raw: e.raw,
        createdAt: e.createdAt || now,
        updatedAt: now,
      };
      await saveKnowledge(k);
      return NextResponse.json({ ok: true, entry: k });
    }

    return NextResponse.json({ error: "不明なaction" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "処理に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/knowledge?id=...
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    await deleteKnowledge(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "削除に失敗" },
      { status: 500 },
    );
  }
}
