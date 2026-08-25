"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 出勤したらやることのチェックリスト。日付が変わればまっさらに戻る。
// 「今日ここまで終わった」が一目で分かることが目的なので、順番どおりに縦に並べる。

type Task = {
  id: string;
  phase: "朝" | "営業中" | "締め" | "週次";
  name: string;
  detail?: string;
  everyDays?: number;
  weekday?: number;
  done: boolean;
  lastDate?: string | null;
  daysSince?: number | null;
  due?: boolean;
};

export default function OpeningPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [date, setDate] = useState("");
  const [total, setTotal] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/opening");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setTasks(d.tasks || []);
      setDate(d.date || "");
      setTotal(d.total || 0);
      setDoneCount(d.doneCount || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flip = async (t: Task) => {
    // 押した瞬間に見た目を変える。通信の返りを待たせない
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    setDoneCount((n) => n + (t.done ? -1 : 1));
    try {
      const res = await fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: t.id, done: !t.done }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
      load();
    }
  };

  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const row = (t: Task) => {
    const skip = (t.everyDays || t.weekday !== undefined) && !t.due;
    return (
      <div
        key={t.id}
        onClick={() => flip(t)}
        style={{
          display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
          padding: "12px 4px", borderTop: "1px solid var(--line-soft, #eee)",
          opacity: skip && !t.done ? 0.45 : 1,
        }}
      >
        <div
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
            border: t.done ? "2px solid var(--ok)" : "2px solid var(--line)",
            background: t.done ? "var(--ok)" : "#fff",
            color: "#fff", fontSize: 16, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {t.done ? "✓" : ""}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 15,
            textDecoration: t.done ? "line-through" : "none",
            color: t.done ? "var(--muted)" : "var(--ink)",
          }}>
            {t.name}
            {t.weekday !== undefined && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, verticalAlign: "middle",
                background: t.due ? "#fdf0e6" : "#eef1f4",
                color: t.due ? "#9c5f22" : "var(--muted)",
              }}>
                毎週{["日","月","火","水","木","金","土"][t.weekday]}曜{t.due ? "・今日やる" : "・今日はなし"}
              </span>
            )}
            {t.everyDays && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, verticalAlign: "middle",
                background: t.due ? "#fdf0e6" : "#eef1f4",
                color: t.due ? "#9c5f22" : "var(--muted)",
              }}>
                {t.everyDays}日に1回{t.due ? "・今日やる" : "・今日はなし"}
              </span>
            )}
          </div>
          {t.detail && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.6 }}>
              {t.detail}
            </div>
          )}
          {t.everyDays && t.lastDate && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
              前回 {t.lastDate.slice(5).replace("-", "/")}（{t.daysSince}日前）
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="wrap">
      <header>
        <h1>✅ 業務チェック</h1>
        <p>その日にやることを、上から順に進めてください</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card total-card">
        <div className="total-label">{date.slice(5).replace("-", "/")} の進み具合</div>
        <div className="total-amount">{doneCount} / {total}</div>
        <div style={{
          height: 8, borderRadius: 4, background: "rgba(255,255,255,0.3)",
          marginTop: 10, overflow: "hidden",
        }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#fff", transition: "width .2s" }} />
        </div>
        {total > 0 && doneCount === total && (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>🎉 今日の分は全部終わりました</div>
        )}
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {!loading && (["朝", "営業中", "締め", "週次"] as const).map((phase) => {
        const list = tasks.filter((t) => t.phase === phase);
        if (!list.length) return null;
        return (
          <div key={phase} className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">
              {phase === "朝"
                ? "🌅 朝（開店前）"
                : phase === "営業中"
                  ? "🕙 営業中（手が空いたとき）"
                  : phase === "締め"
                    ? "🌙 締め（閉店後）"
                    : "📅 週次"}
            </div>
            {list.map(row)}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ チェックは日付が変わると自動でリセットされます。<br />
        判断に迷ったら「❓ 使い方」のチャットで聞いてください。
      </p>
    </div>
  );
}
