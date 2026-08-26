import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { matchKb, getDecisions } from "@/lib/kb";
import { getReceipts } from "@/lib/receipts";
import { ITEM_RULES, getOverrides } from "@/lib/freeeItems";
import { ACCOUNTS } from "@/lib/accounts";

export const runtime = "nodejs";
export const maxDuration = 60;

const AdviceSchema = z.object({
  reply: z.string().describe("ユーザーへの会話の返答（説明・確認・質問など）。"),
  needs_document: z
    .boolean()
    .describe("金額だけでは判断できず、契約書・請求書・明細書などが必要なら true。"),
  ready: z.boolean().describe("仕訳（科目分割）を提案できる状態なら true。"),
  partner: z.string().describe("取引先名（摘要や会話から推定。不明なら空）。"),
  lines: z
    .array(
      z.object({
        category: z
          .string()
          .describe(`勘定科目。原則この中から1つ: ${ACCOUNTS.join(" / ")}`),
        taxType: z
          .string()
          .describe(
            "税区分。費用科目や仕入高・固定資産取得=『課対仕入10%』、差入保証金/敷金/長期前払費用/役員借入金など資産負債=『対象外』、雑収入など収入=『課税売上10%』。",
          ),
        item: z
          .string()
          .describe(
            "品目。あとで示す『使える品目』の中から必ず選ぶ。新しい名前は作らない（表記が割れると品目別に集計できなくなるため）。どれにも当てはまらない、または経費・資産・負債の行なら空。",
          ),
        amount: z.number().describe("金額（円）。複数科目に分かれる場合は分割。"),
        memo: z.string().describe("備考（この行の内容。例: 7月分賃料）。"),
      }),
    )
    .describe("科目ごとの内訳。readyがtrueのとき埋める。"),
  kb_keyword: z
    .string()
    .describe("次回同じ取引先を自動判定するためのキーワード（例: エンジョウジ）。"),
  kb_note: z
    .string()
    .describe("覚えておく用途メモ（例: 普段は家賃。初期費用時は保証金/家賃/共益費に分解）。"),
  tax_review: z
    .boolean()
    .describe(
      "税務上の判断が残り、後で税理士に相談すべき論点があるなら true（例: 開業費にまとめるか、即時償却の選択、敷引きの有無など）。",
    ),
  tax_review_reason: z
    .string()
    .describe("税理士に相談すべき論点の内容（tax_reviewがtrueのとき。なければ空）。"),
  tags: z
    .array(z.string())
    .describe(
      "用途タグ（何のための支出か。例: 家具費, 開業準備, 販促）。既存タグに合うものがあれば必ず使う（表記統一）。無ければ簡潔な新タグ。不明なら空配列。",
    ),
});

const SYSTEM = `あなたは合同会社flat.（彦根のカフェ）の会計サポート。freeeの「未処理の銀行明細」を、会話で会計処理（科目決定）する手伝いをする。
# flat.の前提
- **設立日は2026-06-09、開業日は2026-08-08。すでに開業して営業中。**
  - 設立(6/9)〜開業前日(8/7)の支出は、開業準備に直接かかるものなら「開業費にまとめる選択肢がある」と軽く添える程度でよい（毎回長々と説明しない）。
  - 明細の日付が2026-08-08以降なら通常の営業支出。開業費の論点には一切触れない（tax_reviewにもしない）。
  - 2026-08-08より前の明細だけ、開業費にまとめるかの論点があり得る。
  - 過去のノウハウに「開業前」と書いてあっても、開業日以降の明細には当てはめない。
- freee会計ひとり法人プラン・免税事業者・税込経理。会計期間2026-06-01〜2027-05-31。
- メンバーが個人の財布で立替→役員借入金。会社口座から直接払い→その費用/資産。
- 原価は仕入高+品目、経費はfreee標準科目。物件オーナー=円常寺(エンジョウジ)、仲介=ネジマックス。
# 判断のしかた
- 摘要(振込先名)と金額から科目を推定する。過去のノウハウ(下に提示)があれば最優先で使う。ただし「同じ取引先でも用途が違うことがある」ので必ず確認する。
- 金額だけで判断が割れる場合（高額・初期費用・複数用途の可能性・敷金礼金/保証金など）は、推測で断定せず needs_document=true にして「契約書・請求書・支払明細書を送ってください」と reply で促す。
- 書類が添付されたら必ず読み、保証金(=差入保証金/資産・返還)・礼金(=長期前払費用/開業費)・前家賃(=地代家賃)・共益費・仲介手数料(=支払手数料)・保証会社加入金(=支払手数料)等に正しく分解する。
- 登記/税務判断(開業費にするか・即時償却・敷引き等)が絡むものは、**いったん標準的な処理をlinesで提示しつつ**、tax_review=true・tax_review_reasonに論点を入れる(後で税理士と確認するため保管される)。replyにも「いったんこの処理。後で税理士に相談を」と一言添える。
- readyがtrueのときは lines に科目分割を入れる(合計=明細金額)。kb_keyword/kb_note には次回のためのノウハウを必ず入れる。
- 銀行明細の「登録」自体はfreeeのUIで行う前提。あなたは科目を決めて提示する役。`;

function parseDataUrl(d: string) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,(.+)$/.exec(d);
  if (!m) return null;
  const mt = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mediaType: mt, data: m[2] };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }
  let body: {
    txn?: { date: string; amount: number; side: string; description: string };
    messages?: { role: "user" | "assistant"; content: string }[];
    document?: string;
    docContext?: string;
    emailContext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const txn = body.txn;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!txn) return NextResponse.json({ error: "明細がありません" }, { status: 400 });

  const hint = await matchKb(txn.description);
  let system = SYSTEM;
  system += `\n# いま処理する未処理明細\n日付:${txn.date} / 区分:${
    txn.side === "income" ? "入金" : "出金"
  } / 金額:${txn.amount}円 / 摘要:${txn.description}`;
  if (hint) {
    system += `\n# 過去のノウハウ（この取引先に一致）\nキーワード「${hint.keyword}」→ 科目候補「${hint.category}」。メモ:${hint.note}\nただし今回も同じ用途とは限らないので確認すること。`;
  }
  if (body.docContext) {
    system += `\n# 保管庫で見つかった関連書類（この明細の金額に一致）\n${body.docContext}\nこの書類の支払いである可能性が高い。replyの冒頭で「これは『〇〇』の支払いですね」と確認し、書類の内訳に沿って lines を提案すること。`;
  }
  if (body.emailContext) {
    system += `\n# Gmailで見つかった関連メール（この明細の金額に一致）\n${body.emailContext}\nこのメールの取引の支払いである可能性がある。メール内容から取引先・用途を読み取り、科目を提案。確証が薄ければ確認質問を。`;
  }
  try {
    // 品目は領収書経由と同じ語彙から選ばせる。名前が割れると
    // 品目別の集計が「コーヒー豆」と「コーヒー豆・茶葉」に割れて意味をなさない
    const overrides = await getOverrides();
    const items = [
      ...new Set([...ITEM_RULES.map((r) => r.item), ...Object.values(overrides)]),
    ].sort();
    if (items.length) {
      system += `\n# 使える品目（この中から選ぶ。新しい名前は作らない）\n[${items.join(", ")}]`;
    }
  } catch {
    /* KV未設定でも継続 */
  }

  try {
    const tset = new Set<string>();
    for (const r of await getReceipts()) for (const t of r.tags ?? []) if (t) tset.add(t);
    for (const d of Object.values(await getDecisions())) for (const t of d.tags ?? []) if (t) tset.add(t);
    if (tset.size > 0) {
      system += `\n# 既存の用途タグ\n[${[...tset].join(", ")}] ← 合うものがあれば必ずこれを使う（表記統一）。無ければ簡潔な新タグ。`;
    }
  } catch {
    /* KV未設定でも継続 */
  }

  // 会話メッセージを組み立て（書類があれば最後のuserメッセージに添付）
  type Block =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
    | { type: "document"; source: { type: "base64"; media_type: string; data: string } };
  const anthMsgs = messages.map((m) => ({
    role: m.role,
    content: m.content as string | Block[],
  }));
  const doc = body.document ? parseDataUrl(body.document) : null;
  if (doc) {
    const block: Block =
      doc.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: doc.mediaType, data: doc.data } }
        : { type: "image", source: { type: "base64", media_type: doc.mediaType, data: doc.data } };
    const lastUser = [...anthMsgs].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const text = typeof lastUser.content === "string" ? lastUser.content : "";
      lastUser.content = [
        ...(doc.mediaType === "application/pdf" ? [block] : []),
        { type: "text", text: text || "この書類を読んで科目を判定してください。" },
        ...(doc.mediaType !== "application/pdf" ? [block] : []),
      ] as Block[];
    } else {
      anthMsgs.push({ role: "user", content: [block, { type: "text", text: "この書類を読んで科目を判定してください。" }] as Block[] });
    }
  }
  if (anthMsgs.length === 0) {
    anthMsgs.push({ role: "user", content: "この明細の科目を判定してください。" });
  }

  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      output_format: betaZodOutputFormat(AdviceSchema),
      system,
      messages: anthMsgs as unknown as Anthropic.Beta.BetaMessageParam[],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return NextResponse.json({ error: "判定できませんでした" }, { status: 422 });
    }
    return NextResponse.json({ advice: res.parsed_output });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
