"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// ミーティングの議題と決定事項。
// 当日その場で「決まったこと」を書き、宿題にチェックを入れる。
// 決めるだけで終わって誰も動かない、を防ぐのが目的。

type Action = { id: string; who: string; what: string; due?: string; done?: boolean };
type Topic = {
  id: string; title: string; owner?: string; status: string;
  why?: string; points: string[]; decision?: string; actions: Action[];
};
type Meeting = { id: string; date: string; title: string; note?: string; topics: Topic[] };
type Open = { meeting: string; date: string; topic: string; action: Action };

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  未着手: { bg: "#eef1f4", fg: "#6b6660" },
  進行中: { bg: "#fdf0e6", fg: "#9c5f22" },
  要決定: { bg: "#fde8e8", fg: "#c0392b" },
  完了: { bg: "#eaf6ec", fg: "#2e7d4f" },
  保留: { bg: "#eef1f4", fg: "#6b6660" },
};
const STATUSES = ["未着手", "進行中", "要決定", "完了", "保留"];

const md = (d: string) => d.slice(5).replace("-", "/");

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [open, setOpen] = useState<Open[]>([]);
  const [sel, setSel] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"agenda" | "todo">("agenda");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setMeetings(d.meetings || []);
      setOpen(d.open || []);
      setSel((s) => s || d.meetings?.[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cur = meetings.find((m) => m.id === sel);

  const save = async (m: Meeting) => {
    setMeetings((p) => p.map((x) => (x.id === m.id ? m : x)));
    setSaving(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting: m }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(false);
    }
  };

  const patchTopic = (topicId: string, patch: Partial<Topic>) => {
    if (!cur) return;
    save({ ...cur, topics: cur.topics.map((t) => (t.id === topicId ? { ...t, ...patch } : t)) });
  };

  const toggleAction = (topicId: string, actionId: string) => {
    if (!cur) return;
    save({
      ...cur,
      topics: cur.topics.map((t) =>
        t.id !== topicId
          ? t
          : { ...t, actions: t.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)) },
      ),
    });
  };

  const addAction = (topicId: string) => {
    if (!cur) return;
    const who = prompt("誰が？（例: 坂本）");
    if (who === null) return;
    const what = prompt("何を？");
    if (!what) return;
    save({
      ...cur,
      topics: cur.topics.map((t) =>
        t.id !== topicId
          ? t
          : { ...t, actions: [...t.actions, { id: `x${Date.now()}`, who: who || "", what }] },
      ),
    });
  };

  const addTopic = () => {
    if (!cur) return;
    const title = prompt("議題は？");
    if (!title) return;
    save({
      ...cur,
      topics: [...cur.topics, { id: `t${Date.now()}`, title, status: "未着手", points: [], actions: [] }],
    });
  };

  const addMeeting = async () => {
    const date = prompt("日付は？（YYYY-MM-DD）", new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
    if (!date) return;
    await save({ id: date, date, title: `${md(date)} 定例MTG`, topics: [] });
    setSel(date);
  };

  return (
    <div className="wrap">
      <header>
        <h1>🗣 MTG</h1>
        <p>議題と決めたこと。宿題は誰かに必ず割り当てる</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="sub-tabs">
        <button className={`sub-tab ${tab === "agenda" ? "active" : ""}`} onClick={() => setTab("agenda")}>
          議題
        </button>
        <button className={`sub-tab ${tab === "todo" ? "active" : ""}`} onClick={() => setTab("todo")}>
          残っている宿題（{open.length}）
        </button>
      </div>

      {tab === "todo" && (
        <div className="card" style={{ padding: "12px 14px" }}>
          <div className="cat-title">まだ終わっていない宿題</div>
          {open.length === 0 && <p className="hint">ありません。</p>}
          {open.map((o, i) => (
            <div key={i} style={{ padding: "9px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
              <div style={{ fontSize: 13.5 }}>
                <strong>{o.action.who || "担当未定"}</strong>　{o.action.what}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                {md(o.date)} {o.topic}
                {o.action.due && `　期限 ${md(o.action.due)}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "agenda" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {meetings.map((m) => (
              <button
                key={m.id}
                onClick={() => setSel(m.id)}
                style={{
                  padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12.5, fontWeight: 700,
                  border: sel === m.id ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: sel === m.id ? "var(--accent)" : "#fff",
                  color: sel === m.id ? "#fff" : "var(--ink)",
                }}
              >
                {m.title}
              </button>
            ))}
            <button
              onClick={addMeeting}
              style={{
                padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                fontSize: 12.5, border: "1px dashed var(--line)", background: "#fff",
                color: "var(--muted)",
              }}
            >
              ＋ MTGを足す
            </button>
          </div>

          {cur && cur.topics.map((t, i) => {
            const c = STATUS_COLOR[t.status] ?? STATUS_COLOR["未着手"];
            return (
              <div key={t.id} className="card" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>
                    {i + 1}. {t.title}
                  </div>
                  <select
                    value={t.status}
                    onChange={(e) => patchTopic(t.id, { status: e.target.value })}
                    style={{
                      width: "auto", flex: "0 0 auto", fontSize: 11.5, fontWeight: 700,
                      padding: "4px 22px 4px 8px", borderRadius: 5, border: "none",
                      background: c.bg, color: c.fg,
                    }}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "var(--muted)", marginTop: 5,
                }}>
                  <span style={{ flexShrink: 0 }}>ボールを持つ人</span>
                  <input
                    value={t.owner ?? ""}
                    onChange={(e) => patchTopic(t.id, { owner: e.target.value })}
                    placeholder="未定"
                    style={{ width: 100, flex: "0 0 auto", fontSize: 12, padding: "4px 8px" }}
                  />
                </div>

                {t.why && (
                  <div style={{
                    marginTop: 10, padding: "10px 12px", borderRadius: 8,
                    background: "#fdf6ec", border: "1px solid #e8d5b0",
                    fontSize: 12.5, lineHeight: 1.9,
                  }}>
                    <strong>なぜやるのか</strong><br />{t.why}
                  </div>
                )}

                {t.points.length > 0 && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13, lineHeight: 1.9 }}>
                    {t.points.map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                )}

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
                    決まったこと（当日書く）
                  </div>
                  <textarea
                    defaultValue={t.decision ?? ""}
                    onBlur={(e) => {
                      if (e.target.value !== (t.decision ?? "")) patchTopic(t.id, { decision: e.target.value });
                    }}
                    placeholder="この議題で決まったことを書く"
                    style={{
                      width: "100%", boxSizing: "border-box", minHeight: 60,
                      fontSize: 13, padding: "9px 10px", lineHeight: 1.8,
                    }}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>宿題</div>
                  {t.actions.map((a) => (
                    <div
                      key={a.id}
                      onClick={() => toggleAction(t.id, a.id)}
                      style={{
                        display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer",
                        padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)",
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                        border: a.done ? "2px solid var(--ok)" : "2px solid var(--line)",
                        background: a.done ? "var(--ok)" : "#fff", color: "#fff",
                        fontSize: 13, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{a.done ? "✓" : ""}</div>
                      <div style={{
                        flex: 1, fontSize: 13, lineHeight: 1.7,
                        textDecoration: a.done ? "line-through" : "none",
                        color: a.done ? "var(--muted)" : "var(--ink)",
                      }}>
                        <strong>{a.who || "担当未定"}</strong>　{a.what}
                        {a.due && <span style={{ color: "#c0392b", fontSize: 11.5 }}>　期限 {md(a.due)}</span>}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => addAction(t.id)}
                    style={{
                      marginTop: 7, fontSize: 12, padding: "6px 12px", borderRadius: 7,
                      border: "1px dashed var(--line)", background: "#fff",
                      color: "var(--muted)", cursor: "pointer",
                    }}
                  >
                    ＋ 宿題を足す
                  </button>
                </div>
              </div>
            );
          })}

          {cur && (
            <button
              onClick={addTopic}
              style={{
                width: "100%", padding: "12px", borderRadius: 9, cursor: "pointer",
                border: "1px dashed var(--line)", background: "#fff",
                fontSize: 13.5, fontWeight: 700, color: "var(--muted)",
              }}
            >
              ＋ 議題を足す
            </button>
          )}
        </>
      )}

      {saving && <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>保存中…</p>}
    </div>
  );
}
