import type { Metadata } from "next";

// 内部用の管理画面。親(natsumatsuri)のお客さん向けmetadataを上書きする。
export const metadata: Metadata = {
  title: "夏祭り申込管理 | flat system",
  description: "flat. 業務管理システム",
};

export default function KanriLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
