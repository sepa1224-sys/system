import type { Metadata } from "next";

// お客さん向けページなので、LINE等でリンクを共有したときに
// 「flat system / flat. 業務管理システム」ではなく、夏祭りの案内が見えるようにする。
const TITLE = "flat. 夏祭り2026 参加申込";
const DESCRIPTION =
  "8/22（土）flat. 夏祭り2026。サンセットchill・手持ち花火大会・盆踊りパーティー。参加申込はこちらから🎆";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: TITLE,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function NatsumatsuriLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
