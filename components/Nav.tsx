"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// 画面が増えて一覧から探せなくなったので、分野で分ける。
// いま開いているページが属する分野を最初に開き、
// タブを押せば他の分野に移れる。選んだ分野は次に来たときも覚えている。

type Group = { key: string; label: string; tabs: { href: string; label: string }[] };

const GROUPS: Group[] = [
  {
    key: "keiri",
    label: "経理",
    tabs: [
      { href: "/", label: "🧾 領収書" },
      { href: "/meisai", label: "🏦 明細" },
      { href: "/pending", label: "⏳ 処理待ち" },
      { href: "/kariire", label: "💴 立替" },
      { href: "/payables", label: "💰 払うもの" },
      { href: "/bills", label: "🔁 定期請求" },
      { href: "/loans", label: "🏦 借入返済" },
      { href: "/items", label: "🧺 品目台帳" },
      { href: "/report", label: "📊 用途別" },
      { href: "/shorui", label: "📄 書類" },
      { href: "/contracts", label: "📜 契約書" },
      { href: "/zeirishi", label: "🧑‍💼 税理士" },
    ],
  },
  {
    key: "tenpo",
    label: "店舗運営",
    tabs: [
      { href: "/table", label: "🛎️ 注文" },
      { href: "/kitchen", label: "🍳 KDS" },
      { href: "/opening", label: "✅ 業務チェック" },
      { href: "/shift", label: "🗓️ シフト" },
      { href: "/shift-submit", label: "📝 シフト提出" },
      { href: "/kintai", label: "⏰ 勤怠" },
      { href: "/labor", label: "🕒 労働枠" },
      { href: "/schedule", label: "🗓️ 店舗予定" },
      { href: "/shikomi", label: "📆 週間予定" },
      { href: "/menu", label: "🍽️ メニュー" },
      { href: "/food", label: "🍳 フードレシピ" },
      { href: "/orders", label: "📬 発注" },
      { href: "/shiire", label: "🛒 仕入れ" },
      { href: "/stockroom", label: "📦 ストック確認" },
      { href: "/todos", label: "✅ ToDo" },
    ],
  },
  {
    key: "keiei",
    label: "数字を見る",
    tabs: [
      { href: "/seiseki", label: "🏅 今月の成績" },
      { href: "/sales", label: "📈 売上" },
      { href: "/bunseki", label: "🔍 分析" },
      { href: "/accounting", label: "📊 経営" },
    ],
  },
  {
    key: "sonota",
    label: "その他",
    tabs: [
      { href: "/soudan", label: "💬 相談" },
      { href: "/knowledge", label: "📚 ナレッジ" },
      { href: "/meishi", label: "🪪 名刺" },
      { href: "/natsumatsuri/kanri", label: "🎆 夏祭り申込" },
      { href: "/help", label: "❓ 使い方" },
    ],
  },
];

const STORE_KEY = "nav:group";

export default function Nav() {
  const path = usePathname();
  // いま開いているページがある分野。無ければ最後に選んだ分野。
  const owner = GROUPS.find((g) => g.tabs.some((t) => t.href === path));
  const [group, setGroup] = useState<string>(owner?.key ?? "keiri");

  useEffect(() => {
    if (owner) {
      setGroup(owner.key);
      try { localStorage.setItem(STORE_KEY, owner.key); } catch { /* 保存できなくても動く */ }
      return;
    }
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && GROUPS.some((g) => g.key === saved)) setGroup(saved);
    } catch { /* 保存できなくても動く */ }
  }, [owner]);

  const current = GROUPS.find((g) => g.key === group) ?? GROUPS[0];

  return (
    <nav className="nav">
      <div className="groups">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => {
              setGroup(g.key);
              try { localStorage.setItem(STORE_KEY, g.key); } catch { /* 保存できなくても動く */ }
            }}
            className={`group ${g.key === group ? "on" : ""}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="tabs">
        {current.tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`tab ${path === t.href ? "active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <style jsx>{`
        .nav { margin-bottom: 14px; }
        .groups {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid var(--line, #e5e2dc);
          margin-bottom: 10px;
          overflow-x: auto;
        }
        .group {
          border: 0;
          background: none;
          padding: 9px 14px;
          font-size: 14px;
          font-weight: 700;
          color: var(--muted, #8a8580);
          cursor: pointer;
          white-space: nowrap;
          border-bottom: 3px solid transparent;
          margin-bottom: -2px;
          border-radius: 0;
        }
        .group:hover { color: var(--fg, #3a3532); }
        .group.on {
          color: var(--accent, #a4622a);
          border-bottom-color: var(--accent, #a4622a);
        }
        .group:focus-visible {
          outline: 2px solid var(--accent, #a4622a);
          outline-offset: -2px;
        }
      `}</style>
    </nav>
  );
}
