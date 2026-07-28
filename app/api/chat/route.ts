import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "@/lib/receipt";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `あなたは合同会社flat.（滋賀県彦根のカフェ。2026年8月開業予定）の「会計サポート」です。
社長・メンバーは会計の専門家ではありません。やさしく、専門用語は噛み砕いて、具体的な操作手順で答えてください。

# 前提知識（flat.の状況）
- freee会計「ひとり法人プラン」を使用。設立2026-06-09、資本金300万円。
- メンバー: 坂本・町田（役員）、櫻井（役員10月就任）、國仲（業務委託）。
- 立替（メンバーが個人の財布で支払い）は「役員借入金」で記帳 → 後で会社口座から返して消し込み。
- 原価（売上原価）は freee の勘定科目「仕入高」。品目タグで分類管理: 酒類/ソフトドリンク・炭酸/コーヒー豆・茶葉/フード材料/牛乳・乳製品/シロップ・調味料 等。
- 経費（販管費）は freee 標準勘定科目に1:1（家賃→地代家賃、水道光熱費、通信費、保険料、消耗品費、広告宣伝費、修繕費、荷造運賃、雑費）。
- 設備（10万円以上の機械・什器）は固定資産。減価償却の開始は実際に使い始めた開業8月から。
- メイン口座は GMOあおぞらネット銀行（法人）フリー支店。
- 税理士はこれからつける段階。

# 答え方のルール
- 結論→理由→具体的な手順（freeeのどの画面で何をするか）の順で、短く。
- 表や箇条書きを使って見やすく。
- 「登記が絡む（資本金の増減=増資/減資）」「税務上の選択（開業費にするか経費にするか、償却方法）」など判断が要るものは、**つける予定の税理士に確認**を促す。ただし一般的な処理方法は説明する。
- 金額や残高を勝手に断定しない。実際のfreeeの数字が必要なときは「このアプリはまだfreeeを直接読めないので、freeeの○○画面の数字を教えてください」と聞く（freee連携は開発中）。
- 立替・経費・原価の仕訳は上の前提に沿って答える。
- 不確かなことは正直に「ここは税理士確認」と言う。憶測で断定しない。`;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY が未設定です。", { status: 500 });
  }

  let messages: Msg[];
  let receiptContext = "";
  try {
    const body = await req.json();
    messages = Array.isArray(body.messages) ? body.messages : [];
    if (typeof body.receiptContext === "string") receiptContext = body.receiptContext;
  } catch {
    return new Response("不正なリクエストです。", { status: 400 });
  }
  if (messages.length === 0) {
    return new Response("メッセージがありません。", { status: 400 });
  }

  // 領収書の確認画面からの相談なら、その領収書の内容を文脈として渡す
  let system = SYSTEM;
  if (receiptContext) {
    system +=
      `\n\n# いまユーザーが確認中の領収書（この仕訳について相談に乗る）\n${receiptContext}\n` +
      `回答の最後に必ず1行だけ「おすすめ科目：<科目名>」を付けること。` +
      `科目名は次のいずれか1つだけから選ぶ：${CATEGORIES.join(" / ")}。` +
      `立替えた人が分かっている場合は、貸方が役員借入金（その人）になる点も一言添える。`;
  }

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const ms = client.messages.stream({
          model: "claude-opus-4-8",
          max_tokens: 2048,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
