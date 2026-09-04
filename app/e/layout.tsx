import type { Metadata } from "next";

// LINEのリッチメニューとLIFFが指す固定の入口。
// イベントが変わってもURLは変えない。
const TITLE = "flat. イベント申込";
const DESCRIPTION = "flat.（滋賀県彦根市）のイベント参加申込はこちらから";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: TITLE, type: "website" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
