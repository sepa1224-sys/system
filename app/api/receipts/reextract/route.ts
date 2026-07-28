import { NextRequest, NextResponse } from "next/server";
import { getReceipt, getReceiptImage, updateReceiptItems, type RLine } from "@/lib/receipts";
import { updateCostsFromReceipt } from "@/lib/menu";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

// 既存領収書の画像からAIで品目を再抽出し、個別行に分割する
export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "idが必要" }, { status: 400 });

  const receipt = await getReceipt(id);
  if (!receipt) return NextResponse.json({ error: "領収書が見つかりません" }, { status: 404 });

  const imageDataUrl = await getReceiptImage(id);
  if (!imageDataUrl) return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });

  // 画像からAIで品目を個別抽出
  const client = new Anthropic();
  const mediaType = imageDataUrl.startsWith("data:image/png") ? "image/png" as const
    : imageDataUrl.startsWith("data:image/webp") ? "image/webp" as const
    : "image/jpeg" as const;
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        {
          type: "text",
          text: `このレシート画像から、購入した商品を1つずつ個別に読み取ってください。

各商品について以下のJSON配列で返してください:
[
  { "name": "商品名", "amount": 金額(税込・数値), "category": "仕入高", "tags": ["酒類"] }
]

ルール:
- 商品名はレシートに書かれている通りの名前（略称でもOK）
- 金額は各商品の小計（個数×単価）
- categoryはfreee勘定科目: 飲食材料は「仕入高」、備品は「消耗品費」
- tagsは品目分類を付ける: 酒類/ソフトドリンク・炭酸/コーヒー豆・茶葉/牛乳・乳製品/シロップ・調味料/フード材料/グラス・食器/包装資材/掃除・衛生用品 等
- 値引き・割引は別行で amount をマイナスに
- 合計金額の行は含めないでください
- JSONのみ返してください（説明文不要）`,
        },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let lines: RLine[];
  try {
    // JSONブロックを抽出
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("JSON not found");
    lines = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "AI抽出結果のパースに失敗", raw: text }, { status: 500 });
  }

  // 合計チェック
  const extractedTotal = lines.reduce((s, l) => s + l.amount, 0);

  // 領収書の内訳を更新
  await updateReceiptItems(id, lines);

  // メニュー原価を自動更新
  try {
    await updateCostsFromReceipt({
      summary: lines.map((l) => l.name).join("、"),
      total: extractedTotal,
      category: "仕入高",
      lines,
    });
  } catch {
    // メニュー更新失敗はスルー
  }

  return NextResponse.json({
    ok: true,
    receiptId: id,
    originalTotal: receipt.total,
    extractedTotal,
    lineCount: lines.length,
    lines,
  });
}
