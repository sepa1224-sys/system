// 相談チャットに渡す社内データの文脈。
// KVにある領収書・仕入れ表・メニュー・払うものを、1行1レコードの圧縮形式にして渡す。
// 生JSONだと3万トークン超えるが、この形式なら全部合わせて1万トークン前後で収まる。

import { getReceipts, receiptLines } from "@/lib/receipts";
import { getInventoryItems } from "@/lib/inventory";
import { getMenuItems } from "@/lib/menu";
import { getPayables } from "@/lib/payables";

// 1セクションあたりの上限（文字）。超えたら古いものから落として、落とした件数を明記する。
const SECTION_LIMIT = 20000;

function clip(lines: string[], label: string): string {
  let total = 0;
  const kept: string[] = [];
  for (const l of lines) {
    if (total + l.length > SECTION_LIMIT) break;
    kept.push(l);
    total += l.length + 1;
  }
  const dropped = lines.length - kept.length;
  return (
    kept.join("\n") +
    (dropped > 0 ? `\n（※${label}は文字数上限のため${dropped}件を省略。全${lines.length}件）` : "")
  );
}

async function receiptsBlock(): Promise<string> {
  const rs = await getReceipts();
  if (rs.length === 0) return "";
  const lines = rs.map((r) => {
    const items = receiptLines(r)
      .map((l) => `${l.name}¥${l.amount}[${l.category}]`)
      .join("; ");
    const reg = r.registered ? "freee登録済" : "未登録";
    const kind =
      r.expenseKind === "card" ? "会社カード" : r.expenseKind === "labor" ? "労働枠" : r.expenseKind === "cash" ? "現金" : "立替";
    return `${r.date}|${r.vendor}|¥${r.total}|${kind}:${r.payer}|${reg}|${items}`;
  });
  const unreg = rs.filter((r) => !r.registered).length;
  const sum = rs.reduce((a, r) => a + (r.total || 0), 0);
  return (
    `## 領収書（全${rs.length}件・合計¥${sum.toLocaleString()}・freee未登録${unreg}件）\n` +
    `形式: 日付|店名|合計|支払区分:立替者|freee状態|品目¥金額[科目]; ...\n` +
    clip(lines, "領収書")
  );
}

async function inventoryBlock(): Promise<string> {
  const items = await getInventoryItems();
  if (items.length === 0) return "";
  const lines = items.map((i) => {
    const unit = i.capacity ? `¥${(i.price / i.capacity).toFixed(3)}/${i.unit}` : "";
    const sup = i.supplier || "仕入先未記入";
    return `${i.name}${i.brand ? `(${i.brand})` : ""}|${i.category}|${i.capacity}${i.unit}|¥${i.price}|${unit}|${sup}${i.note ? `|${i.note}` : ""}`;
  });
  return (
    `## 仕入れ表（全${items.length}件）\n` +
    `形式: 品名(ブランド)|カテゴリ|容量|仕入価格|単価|仕入先|備考\n` +
    clip(lines, "仕入れ表")
  );
}

async function menuBlock(): Promise<string> {
  const items = await getMenuItems();
  if (items.length === 0) return "";
  const lines = items.map((m) => {
    const rate = m.price ? `${((m.cost / m.price) * 100).toFixed(1)}%` : "売価未定";
    const ings = m.ingredients
      .map((g) => `${g.name}${g.usage}${g.unit}(¥${Math.round(g.cost)})`)
      .join("; ");
    const recipe = m.recipe ? `\n  作り方: ${m.recipe}` : "";
    return `${m.name}|${m.category}|売価${m.price ?? "未定"}|原価¥${Math.round(m.cost)}|${rate}|${ings}${recipe}`;
  });
  return (
    `## メニュー・原価（全${items.length}品）\n` +
    `形式: 品名|カテゴリ|売価|原価|原価率|材料使用量(原価); ...\n` +
    clip(lines, "メニュー")
  );
}

async function payablesBlock(): Promise<string> {
  const { payables, total, source, updatedAt } = await getPayables();
  if (payables.length === 0) return "";
  const lines = payables.map(
    (p) => `${p.payee}|¥${p.amount}|${p.description}|${p.account}`,
  );
  return (
    `## 払うもの（役員借入金の未返済・全${payables.length}件・合計¥${total.toLocaleString()}` +
    `・${source === "live" ? "freee実データ" : `スナップショット${updatedAt}`}）\n` +
    `形式: 相手|金額|内容|科目\n` +
    clip(lines, "払うもの")
  );
}

/**
 * 相談チャットのsystemに追記する社内データ。
 * どれか1つが落ちても他は返す（KV未設定やfreee未接続でも動く）。
 */
export async function buildDataContext(): Promise<string> {
  const blocks = await Promise.all(
    [receiptsBlock, inventoryBlock, menuBlock, payablesBlock].map((fn) =>
      fn().catch(() => ""),
    ),
  );
  const body = blocks.filter(Boolean).join("\n\n");
  if (!body) return "";
  return (
    `\n\n# 社内データ（このアプリが実際に持っている数字。ここから答えてよい）\n` +
    `以下は推測ではなく保存済みの実データ。金額・件数・原価はここを根拠に断定して答えること。\n` +
    `ここに無いことは「データに無い」と正直に答える。勝手に補完しない。\n\n` +
    body
  );
}
