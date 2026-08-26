import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { gmailSearch, isGoogleConnected, type Mail } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

const QuerySchema = z.object({
  queries: z
    .array(z.string())
    .describe("Gmail検索用キーワード（日本語、2〜4個）。スペース区切りでAND。"),
});

// 明細(カナ摘要+金額)からGmail検索キーワードをAIで生成
async function genQueries(amount: number, description: string): Promise<string[]> {
  try {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 400,
      output_format: betaZodOutputFormat(QuerySchema),
      system:
        "銀行振込の明細(摘要はカナで読みにくい)と金額から、Gmailで関連メールを探す検索語を3〜6個作る。" +
        "カナを漢字や一般的な語に直し、取引の用途も推測。**各要素は1単語(短い固有名詞や用途語)にすること**(GmailはAND検索なので複数語は絞りすぎる)。" +
        "例:『ビワコサンシドウジハナビタイカイ』→['花火','花火大会','出店','ナイトマーケット','出店料','琵琶湖']。広めに当てる。",
      messages: [
        {
          role: "user",
          content: `振込明細: 摘要「${description}」 金額 ${amount}円。Gmail検索キーワードを作って。`,
        },
      ],
    });
    return res.parsed_output?.queries ?? [];
  } catch {
    return [];
  }
}

// ── Amazon専用の突き合わせ ──────────────────────────────
// Amazonは注文単位ではなく「出荷単位」で請求するため、明細の金額が
// 注文メールの合計と一致しないことが多い。そこで直近の注文メールから
// 商品と単価を拾い、金額がぴったり合う商品の組み合わせを探す。
type AmzItem = { name: string; qty: number; unit: number };
type AmzOrder = { orderNumber: string; date: string; items: AmzItem[] };

function parseAmazonOrders(mails: Mail[]): AmzOrder[] {
  const out: AmzOrder[] = [];
  for (const m of mails) {
    const lines = m.body.split("\n").map((l) => l.trim());
    const on = lines.find((l) => /^\d{3}-\d{7}-\d{7}$/.test(l)) || "";
    const items: AmzItem[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("*")) continue;
      const name = lines[i].replace(/^\*\s*/, "");
      let qty = 1, unit = 0;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const q = /^数量:\s*(\d+)/.exec(lines[j]);
        if (q) qty = Number(q[1]);
        const pr = /^([\d,]+)\s*JPY/.exec(lines[j]);
        if (pr) { unit = Number(pr[1].replace(/,/g, "")); break; }
      }
      if (unit > 0) items.push({ name, qty, unit });
    }
    if (items.length) out.push({ orderNumber: on, date: m.date, items });
  }
  return out;
}

/** 注文内の商品（個数の分割も含む）から、合計がamountに一致する組み合わせを探す */
function findAmazonCombos(orders: AmzOrder[], amount: number): string[] {
  const hits: string[] = [];
  for (const o of orders) {
    // 単位は「商品×個数」。出荷が分かれることがあるので1個単位まで割る
    const units: { label: string; value: number }[] = [];
    for (const it of o.items) {
      for (let k = 1; k <= Math.min(it.qty, 5); k++) {
        units.push({ label: `${it.name.slice(0, 40)}×${k}`, value: it.unit * k });
      }
    }
    // 商品ごとに1エントリだけ選ぶ全探索（商品数は多くても6程度）
    const per = o.items.map((it) => {
      const arr = [{ label: "", value: 0 }];
      for (let k = 1; k <= Math.min(it.qty, 5); k++) {
        arr.push({ label: `${it.name.slice(0, 40)}×${k}(¥${it.unit * k})`, value: it.unit * k });
      }
      return arr;
    });
    const walk = (i: number, sum: number, picked: string[]) => {
      if (hits.length >= 3) return;
      if (sum > amount) return;
      if (i === per.length) {
        if (sum === amount && picked.length) {
          hits.push(`注文${o.orderNumber || "(番号不明)"}（${o.date.slice(0, 16)}）: ${picked.join(" + ")} = ¥${amount.toLocaleString()}`);
        }
        return;
      }
      for (const c of per[i]) walk(i + 1, sum + c.value, c.label ? [...picked, c.label] : picked);
    };
    if (per.length <= 8) walk(0, 0, []);
  }
  return hits;
}

export async function POST(req: NextRequest) {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ connected: false, mails: [] });
  }
  let body: { amount?: number; description?: string; keyword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const amount = body.amount ?? 0;
  const description = body.description ?? "";
  const keyword = (body.keyword ?? "").trim();

  // 検索クエリ群を用意：①ユーザー指定 or AI生成キーワード ②金額(カンマ無し)
  let queries: string[] = [];
  if (keyword) queries.push(keyword);
  else queries = await genQueries(amount, description);
  if (amount) queries.push(`${amount}`); // 例: 50000

  try {
    const seen = new Set<string>();
    const mails: Mail[] = [];

    // Amazonの明細なら、先に注文メールから金額一致の組み合わせを探す
    let amazonMatch = "";
    if (amount && /AMAZON|アマゾン/i.test(description)) {
      try {
        const orderMails = await gmailSearch("from:auto-confirm@amazon.co.jp", 12);
        const combos = findAmazonCombos(parseAmazonOrders(orderMails), amount);
        if (combos.length) {
          amazonMatch =
            "【Amazonの出荷単位の突き合わせ】Amazonは出荷ごとに請求するため、注文合計と一致しないことがある。" +
            "直近の注文メールから金額が一致する組み合わせを機械的に探した結果:\n" +
            combos.map((c) => `・${c}`).join("\n") +
            "\nこの組み合わせの商品が、この明細の内容である可能性が高い。";
          // 該当注文のメールも文脈に含める
          for (const m of orderMails) {
            if (mails.length >= 3) break;
            if (combos.some((c) => m.body.includes(c.split("（")[0].replace("注文", ""))) && !seen.has(m.id)) {
              seen.add(m.id);
              mails.push(m);
            }
          }
        }
      } catch {
        /* 突き合わせに失敗しても通常の検索は続ける */
      }
    }
    for (const q of queries) {
      if (mails.length >= 4) break;
      const found = await gmailSearch(q, 3);
      for (const m of found) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          mails.push(m);
        }
      }
    }
    return NextResponse.json({ connected: true, queries, mails, amazonMatch: amazonMatch || undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, queries, mails: [] });
  }
}
