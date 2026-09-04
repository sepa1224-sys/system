import { notFound } from "next/navigation";
import EventSignup from "@/components/EventSignup";
import { EVENTS, eventOf } from "@/lib/events";

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
