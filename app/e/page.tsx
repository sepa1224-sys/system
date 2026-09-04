import EventSignup from "@/components/EventSignup";
import { currentEvent } from "@/lib/events";

// LINEのリッチメニューとLIFFはこのURLだけを指す。
// いま受け付けているイベントを自動で出すので、
// イベントが変わってもLINE側の設定は触らなくてよい。
export default function EventEntry() {
  const ev = currentEvent();
  if (!ev) {
    return (
      <div style={{
        maxWidth: 480, margin: "0 auto", padding: "80px 20px",
        textAlign: "center", fontFamily: "system-ui, sans-serif",
        background: "#14171c", color: "#f2efe9", minHeight: "100vh",
      }}>
        <h1 style={{ fontSize: 22 }}>flat.</h1>
        <p style={{ fontSize: 14, lineHeight: 2, color: "#b7b2a8" }}>
          いま受け付けているイベントはありません。<br />
          次の企画をお待ちください🌙
        </p>
      </div>
    );
  }
  return <EventSignup slug={ev.slug} />;
}
