import type { Metadata } from "next";

// お客さん向けページなので、LINE等でリンクを共有したときに
// 「flat system / flat. 業務管理システム」ではなく、夏祭りの案内が見えるようにする。
export const metadata: Metadata = {
  title: "flat. 夏祭り2026 参加申込",
  description: "8/22（土）flat. 夏祭り2026。サンセットchill・手持ち花火大会・盆踊りパーティー。参加申込はこちらから🎆",
};

export default function NatsumatsuriLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
