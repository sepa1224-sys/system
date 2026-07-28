import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ACCOUNTS } from "@/lib/accounts";
import { addDoc, getDocsIndex } from "@/lib/docs";

export const runtime = "nodejs";
export const maxDuration = 60;

const DocSchema = z.object({
  type: z
    .enum(["請求書", "契約書", "領収書", "支払明細書", "見積書", "その他"])
    .describe("書類の種類。"),
  title: z.string().describe("書類の名前（例: 京町テナント 賃貸借契約書）。"),
  date: z.string().describe("書類の日付。YYYY-MM-DD。不明なら空。"),
  summary: z.string().describe("会計に関わる要点の要約（3〜5行）。"),
  payments: z
    .array(
      z.object({
        payee: z.string().describe("支払先（例: 円常寺 / ネジマックス）。"),
        amount: z.number().describe("支払金額（円）。明細と照合するため正確に。"),
        note: z.string().describe("その支払いの内容。"),
      }),
    )
    .describe("この書類で発生する支払い（freeeの明細と金額で照合する用）。"),
  suggestedLines: z
    .array(
      z.object({
        category: z
          .string()
          .describe(`科目。原則この中から1つ: ${ACCOUNTS.join(" / ")}`),
        taxType: z
          .string()
          .describe("税区分。費用/仕入=課対仕入10%、保証金/敷金/前払費用/借入金=対象外、収入=課税売上10%。"),
        item: z
          .string()
          .describe("品目タグ。仕入高のとき: 酒類/ソフトドリンク・炭酸/コーヒー豆・茶葉/フード材料/牛乳・乳製品/シロップ・調味料 等。消耗品費のとき: グラス・食器/掃除・衛生用品/事務用品 等。該当なしは空。"),
        amount: z.number(),
        memo: z.string(),
      }),
    )
    .describe("想定される仕訳（科目分割）。"),
  taxReview: z.boolean().describe("税理士に相談すべき論点があれば true。"),
  taxReviewReason: z.string().describe("税理士論点（あれば）。"),
});

const SYSTEM = `あなたは合同会社flat.（彦根のカフェ、2026年8月開業予定／freee免税・税込経理）の会計サポート。
アップされた書類（請求書・契約書・支払明細書・領収書）を読み、後でfreeeの口座明細と突き合わせて会計処理するための情報を抽出する。
- payments には「支払先＋金額」を正確に（明細の金額照合に使う。1書類に複数支払いがあれば全部）。
- suggestedLines には想定仕訳を。保証金=差入保証金(資産)、礼金=長期前払費用、前家賃/共益費=地代家賃、仲介手数料/家賃保証加入金=支払手数料、設備(10万以上)=工具器具備品。
- 開業前の支出で開業費にまとめるか等、税務判断が残るものは taxReview=true＋論点を。`;

function parseDataUrl(d: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(d);
  if (!m) return null;
  const mt = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mediaType: mt, data: m[2] };
}

export async function GET() {
  const docs = await getDocsIndex();
  return NextResponse.json({ docs });
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }
  let body: { file?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const parsed = body.file ? parseDataUrl(body.file) : null;
  if (!parsed) {
    return NextResponse.json({ error: "書類がありません（PDF/画像）" }, { status: 400 });
  }

  try {
    const client = new Anthropic();
    const block =
      parsed.mediaType === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: parsed.mediaType, data: parsed.data } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: parsed.mediaType, data: parsed.data } };
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2000,
      output_format: betaZodOutputFormat(DocSchema),
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [block, { type: "text", text: "この書類を読み取り、支払先・金額・想定仕訳・税理士論点を抽出してください。" }],
        },
      ] as unknown as Anthropic.Beta.BetaMessageParam[],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json({ error: "読み取れませんでした" }, { status: 422 });
    }
    const d = res.parsed_output;
    const id = `d_${Date.now()}`;
    await addDoc(
      {
        id,
        fileName: body.fileName ?? "書類",
        type: d.type,
        title: d.title,
        date: d.date,
        summary: d.summary,
        payments: d.payments,
        suggestedLines: d.suggestedLines,
        taxReview: d.taxReview,
        taxReviewReason: d.taxReviewReason,
      },
      { base64: parsed.data, mediaType: parsed.mediaType },
    );
    return NextResponse.json({ ok: true, id, doc: d });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
