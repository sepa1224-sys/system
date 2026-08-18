"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "🧾 領収書" },
    { href: "/shorui", label: "📄 書類" },
    { href: "/meisai", label: "🏦 明細" },
    { href: "/kariire", label: "💴 立替" },
    { href: "/pending", label: "⏳ 処理待ち" },
    { href: "/meishi", label: "🪪 名刺" },
    { href: "/payables", label: "💰 払うもの" },
    { href: "/bills", label: "🔁 定期請求" },
    { href: "/labor", label: "🕒 労働枠" },
    { href: "/kintai", label: "⏰ 勤怠" },
    { href: "/shift", label: "🗓️ シフト" },
    { href: "/report", label: "📊 用途別" },
    { href: "/zeirishi", label: "🧑‍💼 税理士" },
    { href: "/menu", label: "🍽️ メニュー" },
    { href: "/orders", label: "📬 発注" },
    { href: "/inventory", label: "📦 仕入れ表" },
    { href: "/items", label: "🧺 品目台帳" },
    { href: "/shiire", label: "🛒 仕入れ時期" },
    { href: "/todos", label: "✅ ToDo" },
    { href: "/table", label: "🛎️ 注文" },
    { href: "/kitchen", label: "🍳 KDS" },
    { href: "/accounting", label: "📊 経営" },
    { href: "/bunseki", label: "🔍 分析" },
    { href: "/sales", label: "📈 売上" },
    { href: "/soudan", label: "💬 相談" },
    { href: "/natsumatsuri/kanri", label: "🎆 夏祭り申込" },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`tab ${path === t.href ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
