import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPurchaseStats } from "@/lib/shiire";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/shiire?soon=3&min=1
// 領収書の履歴から、品目ごとの購入間隔と「そろそろ買う時期」を返す。
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const soonDays = Number(sp.get("soon")) || 3;
    const minCount = Number(sp.get("min")) || 1;
    const stats = await getPurchaseStats({ soonDays, minCount });
    // 「そろそろ」の件数は、周期が信頼できる品目だけで数える
    const rel = stats.filter((s) => s.reliable);
    const summary = {
      total: stats.length,
      overdue: rel.filter((s) => s.status === "overdue").length,
      soon: rel.filter((s) => s.status === "soon").length,
      tracked: rel.length,
    };
    return NextResponse.json({ summary, stats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "集計に失敗", stats: [] },
      { status: 500 },
    );
  }
}

// POST /api/shiire  { action: "advice" }
// 集計結果をClaudeに渡して、発注すべきものを日本語でまとめてもらう。
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 500 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { soonDays?: number };
    const soonDays = body.soonDays ?? 3;
    const stats = await getPurchaseStats({ soonDays, minCount: 2 });

    // 周期が信頼できるものだけをAIに渡す（開業準備の一時的なまとめ買いは除外）
    const target = stats
      .filter((s) => s.reliable && s.avgIntervalDays !== null)
      .slice(0, 60)
      .map((s) => ({
        品目: s.displayName,
        科目: s.category,
        購入先: s.vendor,
        購入回数: s.count,
        平均間隔日数: s.avgIntervalDays,
        前回購入日: s.lastDate,
        前回から経過日数: s.daysSinceLast,
        次回目安日: s.nextDueDate,
        あと何日: s.daysUntilDue,
        前回金額: s.lastAmount,
      }));

    if (target.length === 0) {
      return NextResponse.json({
        advice:
          "まだ仕入れ周期を判断できる品目がありません。\n" +
          "同じ品目を3回以上・2週間以上にわたって買った履歴がたまると、自動で「そろそろ買う時期」が出るようになります。\n" +
          "（開業準備で数日のうちに何度も買った備品は、定期購入ではないので対象外にしています）",
      });
    }

    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content:
            `あなたは滋賀県彦根のカフェ flat. の仕入れ担当です。\n` +
            `今日は ${today}（日本時間）です。\n\n` +
            `以下は領収書の履歴から自動集計した「品目ごとの購入サイクル」です。\n` +
            `平均間隔日数は過去の購入日から計算した実績値、「あと何日」がマイナスなら前回の周期を超えています。\n\n` +
            JSON.stringify(target, null, 1) +
            `\n\n次の点をふまえて、いま発注すべきものを教えてください。\n` +
            `- 「今すぐ買うべきもの」「数日中に買うもの」「まだ大丈夫」に分けて、品目名と理由（経過日数・平均間隔）を簡潔に\n` +
            `- 同じ店でまとめ買いできるものは店ごとにまとめて提案する（例: 業務スーパーで◯◯と◯◯）\n` +
            `- 数字は履歴に載っているものだけを使い、推測で金額や在庫を作らないこと\n` +
            `- 生鮮品（野菜・肉・乳製品）と日持ちする物（酒・消耗品）では判断が違うので、その点にも触れる\n` +
            `- 全体で15行程度に収める`,
        },
      ],
    });
    const advice = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return NextResponse.json({ advice, analyzed: target.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "アドバイス生成に失敗" },
      { status: 500 },
    );
  }
}
