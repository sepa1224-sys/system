import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_GUIDE } from "@/lib/systemGuide";
import { getKnowledge, toPrompt } from "@/lib/knowledge";

export const runtime = "nodejs";
export const maxDuration = 60;

// このシステムの使い方に答えるチャット。会計の判断は /soudan の担当。
export async function POST(req: NextRequest) {
  let messages: { role: "user" | "assistant"; content: string }[] = [];
  let path = "";
  try {
    const body = await req.json();
    messages = Array.isArray(body.messages) ? body.messages : [];
    if (typeof body.path === "string") path = body.path;
  } catch {
    return new Response("不正なリクエストです。", { status: 400 });
  }
  if (messages.length === 0) {
    return new Response("メッセージがありません。", { status: 400 });
  }

  // 店のナレッジを読み込む。書かれていることは、これを最優先で答える。
  const knowledge = await getKnowledge().catch(() => []);

  const client = new Anthropic();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = await client.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 1500,
          system:
            SYSTEM_GUIDE +
            toPrompt(knowledge) +
            "\n\n# 答えられないとき\n" +
            "ナレッジにも書かれておらず、システムの説明からも分からないことは、" +
            "推測で答えないでください。「これは分かりません」とはっきり伝えたうえで、" +
            "『分かる人に聞いて、答えを /knowledge に登録しておくと次から答えられます』" +
            "と案内してください。" +
            (path
              ? `\n\n# いまユーザーが開いている画面\n${path}\n「この画面」と言われたらここのこと。`
              : ""),
          messages,
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(new TextEncoder().encode(ev.delta.text));
          }
        }
      } catch (e) {
        controller.enqueue(
          new TextEncoder().encode(
            `\n\nエラーが起きました: ${e instanceof Error ? e.message : "不明"}`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
