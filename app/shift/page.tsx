"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Nav from "@/components/Nav";

// シフト表。曜日テンプレート（火・水）を月に一括展開して、あとは個別に直す運用。
// 営業時間(10:00〜24:30)に穴が空いている日と、2人体制の長さがひと目で分かるようにしてある。

type Entry = {
  id: string;
  date: string;
  staff: string;
  start: string;
  end: string;
  note?: string;
};

type Day = {
  date: string;
  entries: Entry[];
  totalMinutes: number;
  gaps: string[];
  doubleMinutes: number;
};

type Data = {
  month: string;
  staff: string[];
  patterns: { label: string; start: string; end: string; staff?: string }[];
  days: Day[];
  totals: Record<string, { minutes: number; days: number }>;
  totalMinutes: number;
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];
// タイムラインの描画範囲。開店前の仕込み(9:00)から閉店(24:30)まで
const T0 = 9 * 60;
const T1 = 24 * 60 + 30;

const COLOR: Record<string, string> = {
  坂本: "#2d6a9f",
  町田: "#b5651d",
  櫻井: "#3f7d58",
  バイト: "#8a5fa8",
};

const toMin = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v || "").trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const hhmm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const hoursText = (min: number) => `${(min / 60).toFixed(1)}h`;

const monthDays = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// 9:00〜24:30 を30分×31コマのグリッドに載せる。1人1行なので、
// 中抜けのある人は同じ行に2本のバーが並ぶ（何時に帰って何時に戻るかが見える）。
const SLOTS = (T1 - T0) / 30; // 31
const col = (min: number) => Math.round((min - T0) / 30) + 1;

// 意図的に誰も入れない時間帯（lib/shift.ts の IDLE_WINDOWS と揃える）
const IDLE: [number, number][] = [[18 * 60, 19 * 60]];
const isIdle = (min: number) => IDLE.some(([s, e]) => s <= min && min < e);

function Timeline({ entries }: { entries: Entry[] }) {
  const staff = Array.from(new Set(entries.map((e) => e.staff)));

  // 30分ごとの配置人数。0人＝無人、2人以上＝2オペ
  const counts = Array.from({ length: SLOTS }, (_, i) => {
    const m = T0 + i * 30;
    return entries.filter((e) => {
      const s = toMin(e.start);
      let t = toMin(e.end);
      if (s === null || t === null) return false;
      if (t <= s) t += 24 * 60;
      return s <= m && m < t;
    }).length;
  });

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${SLOTS}, 1fr)`,
  };

  return (
    <div style={{ marginTop: 10, overflowX: "auto" }}>
      <div style={{ minWidth: 460 }}>
        {/* 目盛り（3時間おき） */}
        <div style={{ ...grid, marginBottom: 2 }}>
          {[9, 12, 15, 18, 21, 24].map((h) => (
            <span
              key={h}
              style={{
                gridColumn: col(h * 60),
                fontSize: 10,
                color: "var(--muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* 1人1行 */}
        {staff.map((name) => {
          const mine = entries.filter((e) => e.staff === name);
          const total = mine.reduce((n, e) => {
            const s = toMin(e.start) ?? 0;
            let t = toMin(e.end) ?? 0;
            if (t <= s) t += 24 * 60;
            return n + (t - s);
          }, 0);
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 34, fontSize: 11, fontWeight: 700, color: COLOR[name], flexShrink: 0 }}>
                {name}
              </span>
              <div style={{ ...grid, flex: 1, height: 19, background: "var(--line-soft, #ececec)", borderRadius: 3 }}>
                {mine.map((e) => {
                  const s = toMin(e.start) ?? T0;
                  let t = toMin(e.end) ?? T1;
                  if (t <= s) t += 24 * 60;
                  return (
                    <div
                      key={e.id}
                      title={`${e.staff} ${e.start}〜${e.end}`}
                      style={{
                        gridColumn: `${col(s)} / ${col(t)}`,
                        gridRow: 1,
                        background: COLOR[name] || "#777",
                        borderRadius: 3,
                        color: "#fff",
                        fontSize: 9.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {e.start}-{e.end}
                    </div>
                  );
                })}
              </div>
              <span style={{ width: 32, fontSize: 10.5, color: "var(--muted)", textAlign: "right", flexShrink: 0 }}>
                {hoursText(total)}
              </span>
            </div>
          );
        })}

        {/* 人数の帯。赤=無人、濃い=2人以上 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span style={{ width: 34, fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>人数</span>
          <div style={{ ...grid, flex: 1, height: 13, borderRadius: 3, overflow: "hidden" }}>
            {counts.map((c, i) => {
              const m = T0 + i * 30;
              const idle = isIdle(m);
              return (
                <div
                  key={i}
                  title={idle ? `${hhmm(m)} アイドリング` : `${hhmm(m)} ${c}人`}
                  style={{
                    gridColumn: i + 1,
                    // アイドリングは意図的に空けている時間なので、無人（赤）とは区別する
                    background: idle
                      ? "repeating-linear-gradient(45deg,#d8d2c4,#d8d2c4 3px,#eae5da 3px,#eae5da 6px)"
                      : c === 0
                        ? "#c0392b"
                        : c === 1
                          ? "#c9d3dd"
                          : "#4a7fb5",
                  }}
                />
              );
            })}
          </div>
          <span style={{ width: 32, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}

export default function Shift() {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);

  // 追加フォーム
  const [fStaff, setFStaff] = useState("坂本");
  const [fStart, setFStart] = useState("9:00");
  const [fEnd, setFEnd] = useState("14:00");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/shift?month=${month}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const dayMap = useMemo(() => {
    const m: Record<string, Day> = {};
    for (const d of data?.days || []) m[d.date] = d;
    return m;
  }, [data]);

  const expand = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expand", month }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "展開失敗");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "展開失敗");
    } finally {
      setBusy(false);
    }
  };

  const add = async (date: string) => {
    if (toMin(fStart) === null || toMin(fEnd) === null) {
      setErr("時刻は 9:00 のような形式で入れてください");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{ date, staff: fStaff, start: fStart, end: fEnd }],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失敗");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/shift?ids=${id}`, { method: "DELETE" });
      await load();
    } catch {
      setErr("削除失敗");
    } finally {
      setBusy(false);
    }
  };

  const dates = monthDays(month);
  const staffList = data?.staff || ["坂本", "町田", "櫻井", "バイト"];
  const gapDays = (data?.days || []).filter((d) => d.gaps.length > 0);

  return (
    <div className="wrap">
      <header>
        <h1>🗓️ シフト</h1>
        <p>曜日パターンを月に展開して、あとは個別に調整します</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button onClick={() => setMonth(shiftMonth(month, -1))}>← 前月</button>
        <strong style={{ fontSize: 16 }}>{month.replace("-", "年")}月</strong>
        <button onClick={() => setMonth(shiftMonth(month, 1))}>翌月 →</button>
      </div>

      {data && (
        <div className="card total-card">
          <div className="total-label">今月の延べ人時</div>
          <div className="total-amount">{hoursText(data.totalMinutes)}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5, flexWrap: "wrap", justifyContent: "center" }}>
            {staffList
              .filter((s) => data.totals[s])
              .map((s) => (
                <span key={s}>
                  <b>{s}</b> {hoursText(data.totals[s].minutes)}（{data.totals[s].days}日）
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 14, textAlign: "center" }}>
        <button className="primary" onClick={expand} disabled={busy}>
          {busy ? "処理中…" : "📋 曜日パターンをこの月に展開"}
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          火曜・水曜のパターンを、まだ割当のない日にだけ入れます。<br />
          手で直した日は上書きしません。
        </p>
      </div>

      {gapDays.length > 0 && (
        <div className="card" style={{ padding: 14, borderLeft: "3px solid #c0392b" }}>
          <strong style={{ color: "#c0392b", fontSize: 14 }}>
            ⚠️ 誰も入っていない時間がある日が {gapDays.length} 日あります
          </strong>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>
            {gapDays.slice(0, 6).map((d) => (
              <div key={d.date}>
                {d.date.slice(5)}（{WD[new Date(d.date + "T00:00:00Z").getUTCDay()]}） {d.gaps.join("、")}
              </div>
            ))}
            {gapDays.length > 6 && <div>ほか {gapDays.length - 6} 日</div>}
          </div>
        </div>
      )}

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {!loading &&
        dates.map((date) => {
          const wd = new Date(date + "T00:00:00Z").getUTCDay();
          const day = dayMap[date];
          const open = openDate === date;
          const entries = day?.entries || [];
          return (
            <div key={date} className="card" style={{ padding: "10px 14px" }}>
              <div
                onClick={() => setOpenDate(open ? null : date)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
              >
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {Number(date.slice(8))}日
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 12.5, color: wd === 0 ? "#c0392b" : wd === 6 ? "#2d6a9f" : "var(--muted)" }}>
                    ({WD[wd]})
                  </span>
                  {date === today && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--accent)" }}>今日</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
                  {entries.length === 0 ? (
                    "未割当"
                  ) : (
                    <>
                      {hoursText(day.totalMinutes)}
                      {day.gaps.length > 0 && <span style={{ color: "#c0392b" }}> ／ 穴{day.gaps.length}</span>}
                    </>
                  )}
                </div>
              </div>

              {entries.length > 0 && <Timeline entries={entries} />}

              {open && (
                <div style={{ marginTop: 12 }}>
                  {entries.map((e) => (
                    <div key={e.id} className="result-row">
                      <span>
                        <b style={{ color: COLOR[e.staff] }}>{e.staff}</b> {e.start}〜{e.end}
                      </span>
                      <button onClick={() => remove(e.id)} disabled={busy} style={{ fontSize: 11 }}>
                        削除
                      </button>
                    </div>
                  ))}
                  {day?.gaps.length ? (
                    <p style={{ fontSize: 12, color: "#c0392b", marginTop: 6 }}>
                      無人: {day.gaps.join("、")}
                    </p>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={fStaff} onChange={(ev) => setFStaff(ev.target.value)} style={{ width: "auto", flex: "0 0 auto" }}>
                      {staffList.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <input value={fStart} onChange={(ev) => setFStart(ev.target.value)} placeholder="9:00" style={{ width: 68, flex: "0 0 auto" }} />
                    <span>〜</span>
                    <input value={fEnd} onChange={(ev) => setFEnd(ev.target.value)} placeholder="14:00" style={{ width: 68, flex: "0 0 auto" }} />
                    <button className="primary" onClick={() => add(date)} disabled={busy} style={{ flex: "0 0 auto" }}>
                      追加
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(data?.patterns || []).map((p) => (
                      <button
                        key={p.label}
                        onClick={() => {
                          setFStart(p.start);
                          setFEnd(p.end);
                          if (p.staff) setFStaff(p.staff);
                        }}
                        style={{ fontSize: 11, padding: "3px 8px" }}
                      >
                        {p.label} {p.start}-{p.end}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ <b>18:00〜19:00 はアイドリング</b>として意図的に空けているので、無人の警告は出しません（帯では斜線で表示）。<br />
        穴の判定は営業時間（10:00〜24:30）で行います。9:00〜10:00の仕込みは人数に数えますが、穴の対象外です。<br />
        曜日パターンを変えたいときは <code>lib/shift.ts</code> の WEEKDAY_TEMPLATES を直します。
      </p>
    </div>
  );
}
