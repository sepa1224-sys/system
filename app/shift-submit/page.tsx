"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// シフトの希望提出。毎週木曜までに、翌週どの時間なら働けるかを各自が出す。
// 「働ける時間」をそのまま出してもらう。シフトを組む側が
// 朝番9:00-14:30／昼番14:30-19:30／夜番19:30-24:30 に当てはめる。

type Slot = { weekday: number; start: string; end: string };
type Submission = { staff: string; week: string; slots: Slot[]; submittedAt: string };

const WDAYS = [
  { wd: 1, label: "月" }, { wd: 2, label: "火" }, { wd: 3, label: "水" },
  { wd: 4, label: "木" }, { wd: 5, label: "金" }, { wd: 6, label: "土" }, { wd: 0, label: "日" },
];

// 9:00〜24:30 を30分刻みで
const TIMES: string[] = [];
for (let m = 9 * 60; m <= 24 * 60 + 30; m += 30) {
  TIMES.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default function ShiftSubmitPage() {
  const [me, setMe] = useState<string>("");
  const [staff, setStaff] = useState<string[]>([]);
  const [week, setWeek] = useState("");
  const [subs, setSubs] = useState<Record<string, Submission>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"submit" | "all">("submit");

  const load = useCallback(async (w?: string) => {
    try {
      const res = await fetch(`/api/shift-request${w ? `?week=${w}` : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setWeek(d.week);
      setStaff(d.staff || []);
      setSubs(d.submissions || {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 月曜をまたぐと「来週」の指す週が人によって変わり、別の週に出してしまう。
  // 週を選べるようにして、日付をはっきり出す。
  const shiftWeek = (days: number) => {
    if (!week) return;
    const d = new Date(`${week}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    load(d.toISOString().slice(0, 10));
  };


  // 名前を選んだら、提出済みの内容を呼び出して直せるようにする
  useEffect(() => {
    if (me && subs[me]) setSlots(subs[me].slots);
    else setSlots([]);
  }, [me, subs]);

  const dateOf = (wd: number) => {
    if (!week) return "";
    const d = new Date(`${week}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + ((wd + 6) % 7));
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };

  const addSlot = (wd: number) => {
    // その日の既存の枠の後ろから始める。夜も入れる人が2枠目を足す想定
    const exist = slots.filter((s) => s.weekday === wd);
    const start = exist.length ? exist[exist.length - 1].end : "9:00";
    const si = TIMES.indexOf(start);
    const end = TIMES[Math.min(si + 12, TIMES.length - 1)] || "24:30"; // 既定で6時間ぶん
    setSlots((p) => [...p, { weekday: wd, start: TIMES[si] || "9:00", end }]);
  };

  const setSlot = (idx: number, patch: Partial<Slot>) =>
    setSlots((p) => p.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const removeSlot = (idx: number) => setSlots((p) => p.filter((_, i) => i !== idx));

  const save = async () => {
    if (!me) return;
    for (const s of slots) {
      if (toMin(s.end) <= toMin(s.start)) {
        setErr(`${WDAYS.find((w) => w.wd === s.weekday)?.label}曜の ${s.start}〜${s.end} は終わりが始まりより前です`);
        return;
      }
    }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/shift-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff: me, week, slots }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失敗");
      setMsg("提出しました。出し直すといつでも上書きされます。");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(false);
    }
  };

  // 月曜をまたぐと「来週」の指す週が人によって変わるので、
  // 何月何日から何月何日までなのかをはっきり出す。
  const weekLabel = (() => {
    if (!week) return "";
    const s0 = new Date(`${week}T00:00:00Z`);
    const e0 = new Date(`${week}T00:00:00Z`);
    e0.setUTCDate(e0.getUTCDate() + 6);
    const f = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    return `${f(s0)}（月）〜 ${f(e0)}（日）`;
  })();

  return (
    <div className="wrap">
      <header>
        <h1>📝 シフト提出</h1>
        <p>毎週木曜までに、翌週の働ける時間を出してください</p>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, margin: "10px 0 4px", padding: "8px 10px",
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10,
        }}>
          <button type="button" onClick={() => shiftWeek(-7)} style={{
            fontSize: 12, padding: "5px 10px", borderRadius: 6,
            border: "1px solid var(--line)", background: "#fff", cursor: "pointer",
          }}>← 前の週</button>
          <strong style={{ fontSize: 14 }}>{weekLabel}</strong>
          <button type="button" onClick={() => shiftWeek(7)} style={{
            fontSize: 12, padding: "5px 10px", borderRadius: 6,
            border: "1px solid var(--line)", background: "#fff", cursor: "pointer",
          }}>次の週 →</button>
        </div>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card total-card">
        <div className="total-label">提出の対象</div>
        <div className="total-amount" style={{ fontSize: 24 }}>{weekLabel}</div>
        <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
          提出済み: {staff.filter((s) => subs[s]).join("・") || "まだ誰も出していません"}
        </div>
      </div>

      <div className="sub-tabs">
        <button className={`sub-tab ${tab === "submit" ? "active" : ""}`} onClick={() => setTab("submit")}>
          自分の提出
        </button>
        <button className={`sub-tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>
          みんなの提出（シフトを組む用）
        </button>
      </div>

      {tab === "submit" && (
        <>
          <div className="card" style={{ padding: 14 }}>
            <div className="cat-title">1. 名前を選ぶ</div>
            <div style={{ display: "flex", gap: 8 }}>
              {staff.map((s) => (
                <button key={s} onClick={() => { setMe(s); setMsg(""); }} style={{
                  flex: 1, padding: "12px 0", borderRadius: 10, fontSize: 15, fontWeight: 700,
                  border: me === s ? "2px solid var(--accent)" : "1px solid var(--line)",
                  background: me === s ? "var(--accent-weak, #fdf3e8)" : "#fff",
                  cursor: "pointer",
                }}>
                  {s}
                  {subs[s] && <span style={{ fontSize: 10, display: "block", color: "var(--ok)" }}>提出済み</span>}
                </button>
              ))}
            </div>
          </div>

          {me && (
            <div className="card" style={{ padding: 14 }}>
              <div className="cat-title">2. 働ける時間を入れる</div>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
                「＋時間を追加」で1日に何枠でも足せます（例: 昼も夜も入れる日は2枠）。
                入れない日は何も足さなくてOKです。
              </p>
              {WDAYS.map(({ wd, label }) => {
                const mine = slots
                  .map((s, i) => ({ ...s, idx: i }))
                  .filter((s) => s.weekday === wd);
                return (
                  <div key={wd} style={{ padding: "10px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{
                        fontSize: 14,
                        color: wd === 0 ? "#c0392b" : wd === 6 ? "#2980b9" : "var(--ink)",
                      }}>
                        {label}曜（{dateOf(wd)}）
                      </strong>
                      <button onClick={() => addSlot(wd)} style={{
                        fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 6,
                        border: "1px solid var(--line)", background: "#fff", cursor: "pointer",
                      }}>
                        ＋ 時間を追加
                      </button>
                    </div>
                    {mine.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>入れない</div>
                    )}
                    {mine.map((s) => (
                      <div key={s.idx} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                        <select value={s.start} onChange={(e) => setSlot(s.idx, { start: e.target.value })}
                          style={{ flex: 1, fontSize: 14, padding: "8px 6px" }}>
                          {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ color: "var(--muted)" }}>〜</span>
                        <select value={s.end} onChange={(e) => setSlot(s.idx, { end: e.target.value })}
                          style={{ flex: 1, fontSize: 14, padding: "8px 6px" }}>
                          {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button onClick={() => removeSlot(s.idx)} title="消す" style={{
                          border: "none", background: "none", cursor: "pointer",
                          color: "#c0392b", fontSize: 16, padding: "0 4px",
                        }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
              <button className="primary" onClick={save} disabled={saving}
                style={{ width: "100%", marginTop: 12 }}>
                {saving ? "提出中…" : subs[me] ? "出し直す（上書き）" : "この内容で提出"}
              </button>
              {msg && <p style={{ fontSize: 13, color: "var(--ok)", fontWeight: 700, textAlign: "center", marginTop: 8 }}>{msg}</p>}
            </div>
          )}
        </>
      )}

      {tab === "all" && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">みんなの働ける時間（{weekLabel}）</div>
          {WDAYS.map(({ wd, label }) => (
            <div key={wd} style={{ padding: "8px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
              <strong style={{
                fontSize: 13.5,
                color: wd === 0 ? "#c0392b" : wd === 6 ? "#2980b9" : "var(--ink)",
              }}>
                {label}曜（{dateOf(wd)}）
              </strong>
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {staff.map((st) => {
                  const mine = (subs[st]?.slots ?? []).filter((s) => s.weekday === wd);
                  return (
                    <div key={st} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
                      <span style={{ minWidth: 40, fontWeight: 700 }}>{st}</span>
                      <span style={{ color: mine.length ? "var(--ink)" : "var(--muted)" }}>
                        {subs[st]
                          ? mine.length
                            ? mine.map((s) => `${s.start}〜${s.end}`).join(" ／ ")
                            : "入れない"
                          : "（未提出）"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="hint" style={{ marginTop: 10 }}>
            これを見て「🗓️ シフト」のページで割り当ててください。
            基本は 朝番9:00-14:30／昼番14:30-19:30／夜番19:30-24:30 です。
          </p>
        </div>
      )}
    </div>
  );
}
