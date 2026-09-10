import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventSignup from "@/components/EventSignup";
import { EVENTS, eventOf } from "@/lib/events";

// LINEやSNSにURLを貼ったときのプレビュー。
// これが無いとルートの「flat. 業務管理システム」が出てしまい、
// お客さんに送るリンクとして具合が悪い。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ev = eventOf(slug);
  if (!ev) return { title: "flat. イベント申込" };
  const title = `${ev.title}｜${ev.dateLabel}`;
  const price = ev.plans.map((p) => `${p.label.replace(/^\S+\s/, "")}¥${p.price.toLocaleString()}`).join("／");
  const description = `${ev.dateLabel} ${ev.lead} ${price}　参加申込はこちらから`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "flat.",
      type: "website",
      ...(ev.ogImage ? { images: [{ url: ev.ogImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ev.ogImage ? { images: [ev.ogImage] } : {}),
    },
  };
}

// 個別に案内したいときの入口。
// LIFFはエンドポイントの後ろにパスを足して開けるので、
// https://liff.line.me/{LIFF ID}/djnight のように渡せる。
// /event/kanri は固定のパスなので、そちらが優先されて管理ページが開く。
export function generateStaticParams() {
  return EVENTS.map((e) => ({ slug: e.slug }));
}

export default async function EventBySlug({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!eventOf(slug)) notFound();
  return <EventSignup slug={slug} />;
}
