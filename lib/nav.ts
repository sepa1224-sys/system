// 画面の一覧と、メニューでの分け方。components/AppChrome.tsx（サイドバー・スマホの上の帯）と components/Nav.tsx が使う。
// 2026-10-26 「機能が多すぎて探せない」ので、やることの分野ごとに分け直した。
// シフトのことならシフト、仕込みのことなら仕込み・在庫を開けば、その分野の画面だけが並ぶ。
import { keiriMenu } from "@/lib/keiri/nav";

export type NavItem = { href: string; label: string };
export type NavGroup = {
  key: string;
  label: string;
  /** 分野の中をさらに小分けにするときの見出し（経理だけ） */
  sections: { label: string; items: NavItem[] }[];
};

const one = (key: string, label: string, items: NavItem[]): NavGroup => ({ key, label, sections: [{ label: "", items }] });

/** 絵文字を外したページ名 */
const plain = (label: string) => label.replace(/^\S+\s/, "");

export const NAV_GROUPS: NavGroup[] = [
  one("eigyo", "毎日の営業", [
    { href: "/opening", label: "業務チェック" },
    { href: "/table", label: "注文" },
    { href: "/kitchen", label: "KDS" },
    { href: "/stamp", label: "スタンプカード" },
    { href: "/schedule", label: "店舗予定" },
    { href: "/instagram", label: "インスタ" },
    { href: "/threads", label: "Threads" },
  ]),
  one("shift", "シフト・勤怠", [
    { href: "/shift", label: "シフト" },
    { href: "/shift-build", label: "シフトを組む" },
    { href: "/shift-submit", label: "シフト提出" },
    { href: "/kintai", label: "勤怠" },
    { href: "/labor", label: "労働枠" },
  ]),
  one("roumu", "労務", [
    { href: "/roumu/kyuyo", label: "給与" },
    { href: "/roumu/shorui", label: "書類" },
  ]),
  one("shikomi", "仕込み・在庫", [
    { href: "/shikomi", label: "仕込み" },
    { href: "/shikomi/settings", label: "仕込みの設定" },
    { href: "/food", label: "レシピ" },
    { href: "/stockroom", label: "ストック確認" },
    { href: "/purchase", label: "発注リスト" },
    { href: "/shiire", label: "仕入れ" },
    { href: "/orders", label: "購入メール" },
  ]),
  one("menu", "メニュー", [
    { href: "/menu", label: "メニュー" },
    { href: "/menu-admin", label: "メニュー編集" },
    { href: "/buppan", label: "物販登録" },
  ]),
  one("suji", "数字", [
    { href: "/seiseki", label: "今月の成績" },
    { href: "/keikaku", label: "売上計画" },
    { href: "/monthly", label: "月次レポート" },
    { href: "/sales", label: "売上" },
    { href: "/uber", label: "Uber Eats" },
    { href: "/bunseki", label: "分析" },
    { href: "/reports", label: "レポート" },
    { href: "/accounting", label: "経営" },
  ]),
  {
    key: "keiri",
    label: "経理",
    sections: keiriMenu().map((g) => ({
      label: g.label,
      items: g.tabs.map((t) => ({ href: t.href, label: plain(t.label) })),
    })),
  },
  one("event", "イベント", [
    { href: "/shutten/reji", label: "出店レジ" },
    { href: "/shutten", label: "出店準備" },
    { href: "/event/kanri", label: "イベント申込" },
    { href: "/natsumatsuri/kanri", label: "夏祭り申込" },
  ]),
  one("sites", "サイト", [{ href: "/sites", label: "サイト一覧" }]),
  one("sonota", "その他", [
    { href: "/company-info", label: "会社情報" },
    { href: "/meetings", label: "MTG" },
    { href: "/todos", label: "ToDo" },
    { href: "/soudan", label: "相談" },
    { href: "/knowledge", label: "ナレッジ" },
    { href: "/meishi", label: "名刺" },
    { href: "/supporters", label: "支援者チケット" },
    { href: "/help", label: "使い方" },
  ]),
];

export const groupItems = (g: NavGroup) => g.sections.flatMap((s) => s.items);

/** そのページが入っている分野 */
export function groupOf(path: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => groupItems(g).some((i) => i.href === path));
}

/** そのページの名前 */
export function pageLabel(path: string): string | undefined {
  for (const g of NAV_GROUPS) {
    const hit = groupItems(g).find((i) => i.href === path);
    if (hit) return hit.label;
  }
  return undefined;
}
