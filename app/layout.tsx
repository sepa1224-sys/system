import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "flat system",
  description: "領収書をアップすると自動で科目を判定するアプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
