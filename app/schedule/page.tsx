"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 店舗スケジュール。いつどこに出店するか、店で何をやるかを月カレンダーで見る。
// 数か月先までを縦に並べるので、スクロールするだけで先の予定が追える。

type Ev = {
  id: string;
  title: string;
  kind: "出店" | "店舗";
  date: string;
  endDate?: string;
  place?: string;
  note?: string;
  daysLeft: number;
};

const COLOR = {
  出店: { bg: "#e8f1fb", border: "#2980b9", text: "#1f5f8b" },
  店舗: { bg: "#fdf0e6", border: "#c87f36", text: "#9c5f22" },
} as const;

const WDAY = ["日", "月", "火", "水", "木", "金", "土"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// イベントが占める日をすべて返す。複数日ならその間も埋める
function daysOf(e: Ev): string[] {
  const out = [e.date];
  if (!e.endDate || e.endDate <= e.date) return out;
  const d = new Date(`${e.date}T00:00:00`);
  while (true) {
    d.setDate(d.getDate() + 1);
    const s = ymd(d);
    if (s > e.endDate) break;
    out.push(s);
  }
  return out;
}

// 予定のある月を、今月から最後の予定の月まで切れ目なく並べる
function monthsToShow(events: Ev[], today: string): { y: number; m: number }[] {
  const last = events.reduce((a, e) => (e.endDate || e.date) > a ? (e.endDate || e.date) : a, today);
  const [ty, tm] = today.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const out: { y: number; m: number }[] = [];
  let y = ty, m = tm;
  while (y < ly || (y === ly && m <= lm)) {
    out.push({ y, m });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export default function SchedulePage() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [today, setToday] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: "", kind: "出店" as "出店" | "店舗", date: "", endDate: "", place: "", note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/schedule");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEvents(d.events || []);
      setToday(d.today || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title || !form.date) { setErr("タイトルと日付を入れてください"); return; }
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setForm({ title: "", kind: "出店", date: "", endDate: "", place: "", note: "" });
      setAdding(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "保存失敗"); }
  };

  const del = async (e: Ev) => {
    if (!confirm(`「${e.title}」を消しますか？`)) return;
    try {
      const res = await fetch(`/api/schedule?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      await load();
    } catch (x) { setErr(x instanceof Error ? x.message : "削除失敗"); }
  };

  // 日付 → その日にあるイベント
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    for (const d of daysOf(e)) {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(e);
    }
  }

  const upcoming = events.filter((e) => (e.endDate || e.date) >= today);
  const next = upcoming[0];

  return (
    <div className="wrap">
      <header>
        <h1>🗓️ 店舗スケジュール</h1>
        <p>出店するイベントと、店でやるイベントの予定</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {next && (
        <div className="card total-card">
          <div className="total-label">つぎの予定</div>
          <div className="total-amount" style={{ fontSize: 26 }}>{next.title}</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
            {next.date.slice(5).replace("-", "/")}
            {next.endDate ? `〜${next.endDate.slice(5).replace("-", "/")}` : ""}
            {" ・ "}
            {next.daysLeft > 0 ? `あと${next.daysLeft}日` : next.daysLeft === 0 ? "今日" : "開催中"}
          </div>
        </div>
      )}

      {/* 種類の見分け */}
      <div className="card" style={{ padding: "10px 14px", display: "flex", gap: 16, justifyContent: "center", fontSize: 12.5 }}>
        {(["出店", "店舗"] as const).map((k) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 3,
              background: COLOR[k].bg, border: `2px solid ${COLOR[k].border}`,
            }} />
            {k === "出店" ? "よそのイベントに出店" : "flat.でやるイベント"}
          </span>
        ))}
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {/* 月カレンダー */}
      {!loading && today && monthsToShow(events, today).map(({ y, m }) => {
        const first = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0).getDate();
        const lead = first.getDay();
        const cells: (string | null)[] = [
          ...Array(lead).fill(null),
          ...Array.from({ length: lastDay }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
        ];
        while (cells.length % 7 !== 0) cells.push(null);
        const count = cells.filter((c) => c && byDay.has(c)).length;

        return (
          <div key={`${y}-${m}`} className="card" style={{ padding: "12px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px 8px" }}>
              <strong style={{ fontSize: 16 }}>{y}年 {m}月</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {count ? `${count}日 予定あり` : "予定なし"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {WDAY.map((w, i) => (
                <div key={w} style={{
                  textAlign: "center", fontSize: 11, fontWeight: 700, padding: "2px 0",
                  color: i === 0 ? "#c0392b" : i === 6 ? "#2980b9" : "var(--muted)",
                }}>{w}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const evs = byDay.get(d) || [];
                const isToday = d === today;
                const dow = new Date(`${d}T00:00:00`).getDay();
                return (
                  <div key={d} style={{
                    minHeight: 58, borderRadius: 6, padding: "3px 3px 4px",
                    border: isToday ? "2px solid var(--accent)" : "1px solid var(--line, #eee)",
                    background: isToday ? "var(--accent-weak, #fdf3e8)" : "transparent",
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: isToday ? 800 : 600, textAlign: "right", paddingRight: 2,
                      color: dow === 0 ? "#c0392b" : dow === 6 ? "#2980b9" : "var(--ink)",
                    }}>{Number(d.slice(8))}</div>
                    {evs.map((e) => (
                      <div key={e.id} title={`${e.title}${e.place ? ` / ${e.place}` : ""}`} style={{
                        marginTop: 2, padding: "2px 3px", borderRadius: 4, fontSize: 9.5,
                        lineHeight: 1.25, fontWeight: 700, wordBreak: "break-word",
                        background: COLOR[e.kind].bg, color: COLOR[e.kind].text,
                        borderLeft: `3px solid ${COLOR[e.kind].border}`,
                      }}>{e.title}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 一覧 */}
      {!loading && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">予定の一覧</div>
          {events.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>まだ予定がありません。</p>
          )}
          {events.map((e) => {
            const over = (e.endDate || e.date) < today;
            return (
              <div key={e.id} style={{
                display: "flex", gap: 10, alignItems: "flex-start",
                padding: "9px 0", borderTop: "1px solid var(--line-soft, #eee)",
                opacity: over ? 0.45 : 1,
              }}>
                <div style={{
                  minWidth: 52, textAlign: "center", padding: "3px 0", borderRadius: 5,
                  background: COLOR[e.kind].bg, color: COLOR[e.kind].text,
                  fontSize: 12, fontWeight: 800, borderLeft: `3px solid ${COLOR[e.kind].border}`,
                }}>
                  {e.date.slice(5).replace("-", "/")}
                  {e.endDate && <div style={{ fontSize: 10, fontWeight: 600 }}>〜{e.endDate.slice(8)}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {e.kind === "出店" ? "🏳️ " : "🏠 "}{e.title}
                  </div>
                  {e.place && <div style={{ fontSize: 12, color: "var(--muted)" }}>{e.place}</div>}
                  {e.note && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{e.note}</div>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", paddingTop: 2 }}>
                  {over ? "終了" : e.daysLeft > 0 ? `あと${e.daysLeft}日` : e.daysLeft === 0 ? "今日" : "開催中"}
                </div>
                <button onClick={() => del(e)} title="消す" style={{
                  border: "none", background: "none", cursor: "pointer",
                  color: "var(--muted)", fontSize: 14, padding: "0 2px",
                }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 追加 */}
      <div className="card" style={{ padding: 14 }}>
        {!adding ? (
          <div style={{ textAlign: "center" }}>
            <button className="primary" onClick={() => setAdding(true)}>＋ 予定を足す</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {(["出店", "店舗"] as const).map((k) => (
                <button key={k} onClick={() => setForm({ ...form, kind: k })} style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
                  border: form.kind === k ? `2px solid ${COLOR[k].border}` : "1px solid var(--line)",
                  background: form.kind === k ? COLOR[k].bg : "#fff",
                  color: form.kind === k ? COLOR[k].text : "var(--ink)",
                }}>{k === "出店" ? "🏳️ 出店" : "🏠 店舗"}</button>
              ))}
            </div>
            <input placeholder="イベント名" value={form.title}
              onChange={(ev) => setForm({ ...form, title: ev.target.value })} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={form.date} style={{ flex: 1 }}
                onChange={(ev) => setForm({ ...form, date: ev.target.value })} />
              <span style={{ fontSize: 12, color: "var(--muted)" }}>〜</span>
              <input type="date" value={form.endDate} style={{ flex: 1 }}
                onChange={(ev) => setForm({ ...form, endDate: ev.target.value })} />
            </div>
            <input placeholder="場所（任意）" value={form.place}
              onChange={(ev) => setForm({ ...form, place: ev.target.value })} />
            <input placeholder="メモ（任意）" value={form.note}
              onChange={(ev) => setForm({ ...form, note: ev.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" onClick={save} style={{ flex: 1 }}>保存</button>
              <button onClick={() => setAdding(false)} style={{ flex: 1 }}>やめる</button>
            </div>
            <p className="hint">複数日にわたるときは右の日付も入れてください（学祭のような2日間）。</p>
          </div>
        )}
      </div>
    </div>
  );
}
