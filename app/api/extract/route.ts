import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ReceiptSchema, applyAssetThreshold } from "@/lib/receipt";
import { getReceipts } from "@/lib/receipts";
import { getDecisions, rulesPromptBlock } from "@/lib/kb";

async function existingTags(): Promise<string[]> {
  const set = new Set<string>();
  try {
    for (const r of await getReceipts()) for (const t of r.tags ?? []) if (t) set.add(t);
    for (const d of Object.values(await getDecisions())) for (const t of d.tags ?? []) if (t) set.add(t);
  } catch {
    /* KV未設定でも継続 */
  }
  return [...set];
}

export const runtime = "nodejs";
export const maxDuration = 60;

// data URL (data:image/png;base64,xxxx / data:application/pdf;base64,xxxx) を分解
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(
    dataUrl,
  );
  if (!m) return null;
  const mediaType = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mediaType, data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が未設定です。.env.local に設定してください。" },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }

  const parsed = body.image ? parseDataUrl(body.image) : null;
  if (!parsed) {
    return NextResponse.json(
      { error: "ファイルがありません（png/jpeg/webp/PDF に対応）。" },
      { status: 400 },
    );
  }

  const isPdf = parsed.mediaType === "application/pdf";
  const fileBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: parsed.data },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: parsed.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
          data: parsed.data,
        },
      };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_format: betaZodOutputFormat(ReceiptSchema),
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text:
                "これは日本のカフェ（合同会社flat.）の経費の領収書・レシート（またはメール/注文確認PDF）です。" +
                "日付・店名(支払先)・税込合計金額(total)を読み取ってください。" +
                "\n**重要：金額は必ず税込（消費税を含む）で記録する。**" +
                "レシートが税抜表示の場合（本体価格＋消費税が別行になっている場合）は、各品目に消費税を按分して税込金額にすること。" +
                "totalはレシートの支払総額（税込）に一致させる。" +
                "\n**内訳(lines)に分けてください**：レシートの品目のうち、**用途や科目が違うものは行を分ける**（例: 木材=家具費/消耗品費、コーヒー豆=仕入。DIY材料とカフェ用品が混在する等）。" +
                "用途も科目も同じなら1行にまとめてOK。各行に 品目名・税込金額・科目・用途タグ を付け、金額の合計をtotalに一致させる。" +
                "\n用途タグは既存タグ=[" +
                (await existingTags()).join(", ") +
                "]に合うものがあれば必ずそれを使う(表記統一)。無ければ簡潔な新タグ。" +
                (await rulesPromptBlock()),
            },
          ],
        },
      ] as unknown as Anthropic.Beta.BetaMessageParam[],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "この画像は処理できませんでした。" },
        { status: 422 },
      );
    }

    const receipt = response.parsed_output;
    if (!receipt) {
      return NextResponse.json(
        { error: "領収書を読み取れませんでした。別の画像でお試しください。" },
        { status: 422 },
      );
    }

    // 30万円未満の固定資産は消耗品費に確定補正（AIが誤っても直す）
    receipt.lines = applyAssetThreshold(receipt.lines);

    return NextResponse.json({ receipt });
  } catch (err) {
    console.error("extract error", err);
    const msg = err instanceof Error ? err.message : "抽出に失敗しました。";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
