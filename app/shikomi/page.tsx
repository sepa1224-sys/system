"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 週間スケジュール（内部用）。店に来たときに何をやるかが分かることが目的。
// 曜日固定ではなく「前回からの経過日数」で出すので、休みや来店のばらつきでずれない。

type DoneLog = { taskId: string; date: string; note?: string; by?: string };
type State = {
  id: string;
  name: string;
  kind: string;
  intervalDays: number;
  qty?: string;
  materials?: string;
  note?: string;
  minutes?: number;
  lastDate: string | null;
  daysSince: number | null;
  nextDate: string | null;
  daysUntil: number | null;
  status: "overdue" | "today" | "soon" | "ok" | "never";
  doneToday: boolean;
  history: DoneLog[];
};

const LABEL: Record<string, { text: string; color: string }> = {
  never: { text: "未実施", color: "#c0392b" },
  overdue: { text: "超過", color: "#c0392b" },
  today: { text: "今日", color: "#b5651d" },
  soon: { text: "まもなく", color: "#b5651d" },
  ok: { text: "余裕あり", color: "var(--muted)" },
};

export default function ShikomiPage() {
  const [d, setD] = useState<{
    today: string;
    states: State[];
    due: State[];
    summary: { due: number; dueMinutes: number; doneToday: number };
  } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shikomi");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const done = async (taskId: string) => {
    setBusy(taskId);
    try {
      await fetch("/api/shikomi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      await load();
    } finally {
      setBusy("");
    }
  };

  const undo = async (taskId: string, date: string) => {
    setBusy(taskId);
    try {
      await fetch(`/api/shikomi?taskId=${taskId}&date=${date}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>📆 週間スケジュール</h1>
        <p>今日やる仕込み・確認</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {d && (
        <div className="card total-card">
          <div className="total-label">今日やること（{d.today.slice(5)}）</div>
          <div className="total-amount">{d.summary.due}件</div>
          {d.summary.dueMinutes > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
              目安 約{d.summary.dueMinutes}分
              {d.summary.doneToday > 0 && ` ／ 完了 ${d.summary.doneToday}件`}
            </div>
          )}
        </div>
      )}

      {d?.due.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 18 }}>
          <strong>今日やる仕込みはありません 🎉</strong>
        </div>
      )}

      {(d?.states ?? []).map((s) => {
        const lab = LABEL[s.status];
        const isOpen = open === s.id;
        return (
          <div
            key={s.id}
            className="card"
            style={{
              padding: "12px 14px",
              borderLeft: `3px solid ${s.doneToday ? "#3f7d58" : lab.color}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.kind}</div>
                <strong style={{ fontSize: 15 }}>{s.name}</strong>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {s.qty && <>分量 {s.qty}　</>}
                  {s.materials && <>材料 {s.materials}</>}
                </div>
                {s.note && (
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{s.note}</div>
                )}
                <div style={{ fontSize: 12, marginTop: 5 }}>
                  {s.doneToday ? (
                    <span style={{ color: "#3f7d58", fontWeight: 700 }}>✅ 今日やりました</span>
                  ) : (
                    <span style={{ color: lab.color, fontWeight: 700 }}>
                      {lab.text}
                      {s.daysUntil !== null && s.daysUntil < 0 && `（${-s.daysUntil}日超過）`}
                      {s.daysUntil !== null && s.daysUntil > 0 && `（あと${s.daysUntil}日）`}
                    </span>
                  )}
                  <span style={{ color: "var(--muted)" }}>
                    {"　"}
                    {s.lastDate ? `前回 ${s.lastDate.slice(5)}（${s.daysSince}日前）` : "記録なし"}
                    {" ／ "}
                    {s.intervalDays}日おき
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {s.doneToday ? (
                  <button
                    onClick={() => undo(s.id, d!.today)}
                    disabled={busy === s.id}
                    style={{ fontSize: 11 }}
                  >
                    取消
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => done(s.id)}
                    disabled={busy === s.id}
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  >
                    {busy === s.id ? "…" : "やった"}
                  </button>
                )}
                {s.history.length > 0 && (
                  <button
                    onClick={() => setOpen(isOpen ? null : s.id)}
                    style={{ fontSize: 11 }}
                  >
                    履歴
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 8, borderTop: "1px solid var(--line-soft, #eee)", paddingTop: 6 }}>
                {s.history.map((h, i) => (
                  <div key={i} className="result-row" style={{ fontSize: 12 }}>
                    <span className="mono">{h.date}</span>
                    <button onClick={() => undo(s.id, h.date)} style={{ fontSize: 10.5 }}>
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 曜日固定ではなく「前回からの経過日数」で出しています。<br />
        作業を増やすときは <code>lib/shikomi.ts</code> の TASKS に足します。
      </p>
    </div>
  );
}
