import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getContacts } from "@/lib/meishi";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM =
  "あなたはflat.の名刺・連絡先データベースのアシスタントです。登録されている連絡先情報とメモをもとに質問に答えてください。" +
  "名前・会社・役職・電話・メール・住所・メモなどを参照して、簡潔かつ正確に答えてください。";

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY が未設定です。", { status: 500 });
  }

  let question: string;
  try {
    const body = await req.json();
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return new Response("不正なリクエストです。", { status: 400 });
  }
  if (!question) {
    return new Response("質問が空です。", { status: 400 });
  }

  // 全連絡先を文脈として渡す
  let contacts = await getContacts();
  const contextText =
    contacts.length === 0
      ? "（連絡先はまだ登録されていません）"
      : contacts
          .map((c) => {
            const lines = [
              `【${c.name}${c.nameKana ? `（${c.nameKana}）` : ""}】`,
              c.company ? `会社: ${c.company}` : null,
              c.title ? `役職: ${c.title}` : null,
              c.phone ? `電話: ${c.phone}` : null,
              c.email ? `メール: ${c.email}` : null,
              c.address ? `住所: ${c.address}` : null,
              c.website ? `Web: ${c.website}` : null,
              c.notes.length > 0
                ? `メモ:\n${c.notes.map((n) => `  - ${n.text}`).join("\n")}`
                : null,
            ]
              .filter(Boolean)
              .join("\n");
            return lines;
          })
          .join("\n\n");

  const system = `${SYSTEM}\n\n# 登録されている連絡先一覧\n${contextText}`;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const ms = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: question }],
        });
        for await (const event of ms) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "エラー";
        controller.enqueue(encoder.encode(`\n\n[エラー: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
