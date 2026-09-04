import type { Metadata } from "next";

// お客さん向けページ。LINEやInstagramで共有したときに
// 業務管理システムではなくイベントの案内が見えるようにする。
const TITLE = "flat. DJ NIGHT 9/22";
const DESCRIPTION =
  "9/22（火）flat. DJ NIGHT。飲み放題¥3,500・ほろ酔い3杯¥2,500・エントランス＋1ドリンク¥1,000。参加申込はこちらから🎧";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: TITLE, type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function DjNightLayout({ children }: { children: React.ReactNode }) {
  return children;
}
