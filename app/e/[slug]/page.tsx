import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EventSignup from "@/components/EventSignup";
import { EVENTS, eventOf } from "@/lib/events";

// 個別に案内したいときの入口。LIFFは /e の後ろにパスを足して開けるので、
// https://liff.line.me/{LIFF ID}/djnight のように渡せる。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ev = eventOf(slug);
  if (!ev) return { title: "flat. イベント申込" };
  const title = `${ev.title}｜${ev.dateLabel}`;
  const description = `${ev.dateLabel} ${ev.lead} 参加申込はこちらから`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "flat.", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

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
