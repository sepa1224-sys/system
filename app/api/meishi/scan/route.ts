import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const ContactSchema = z.object({
  name: z.string().describe("氏名（漢字）。読み取れなければ空文字。"),
  nameKana: z.string().describe("フリガナ（カタカナ）。記載なければ空文字。"),
  company: z.string().describe("会社名・組織名。記載なければ空文字。"),
  title: z.string().describe("役職・肩書き。記載なければ空文字。"),
  phone: z.string().describe("電話番号（ハイフン区切り）。記載なければ空文字。"),
  email: z.string().describe("メールアドレス。記載なければ空文字。"),
  address: z.string().describe("住所。記載なければ空文字。"),
  website: z.string().describe("WebサイトURL。記載なければ空文字。"),
});

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mediaType = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mediaType, data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が未設定です。" },
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
      { error: "画像がありません（png/jpeg/webp に対応）。" },
      { status: 400 },
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      output_format: betaZodOutputFormat(ContactSchema),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: parsed.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: parsed.data,
              },
            },
            {
              type: "text",
              text:
                "これは名刺の画像です。名刺に書かれている情報を正確に読み取り、構造化してください。" +
                "氏名・フリガナ・会社名・役職・電話番号・メールアドレス・住所・WebサイトURLを抽出してください。" +
                "記載がない項目は省略してください。電話番号はハイフン区切りで返してください。",
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

    const contact = response.parsed_output;
    if (!contact) {
      return NextResponse.json(
        { error: "名刺を読み取れませんでした。別の画像でお試しください。" },
        { status: 422 },
      );
    }

    return NextResponse.json({ contact });
  } catch (err) {
    console.error("meishi scan error", err);
    const msg = err instanceof Error ? err.message : "抽出に失敗しました。";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
