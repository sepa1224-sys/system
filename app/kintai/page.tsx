"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";
import { MEMBERS } from "@/lib/labor";

// 勤怠ページ。LINEのLIFFから開くと名前が自動で入る。
// ワンタップの出勤/退勤に加えて、「昨日14時から25時まで」のような
// 自由入力をAIが整形して登録できる。

type Rec = {
  id: string;
  date: string;
  name: string;
  member: string | null;
  clockIn: string;
  clockOut: string;
  breakMin: number;
  note?: string;
  source: string;
};

type Entry = {
  date: string;
  clockIn: string;
  clockOut: string;
  breakMin: number;
  note: string;
  name: string;
};

declare global {
  interface Window {
    liff?: {
      init: (c: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ displayName: string; userId: string }>;
      getFriendship: () => Promise<{ friendFlag: boolean }>;
    };
  }
}

const hoursOf = (r: Rec): number | null => {
  const p = (s: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
  };
  const a = p(r.clockIn), b = p(r.clockOut);
  if (a === null || b === null) return null;
  let d = b - a;
  if (d <= 0) d += 1440;
  const h = (d - (r.breakMin || 0)) / 60;
  return h > 0 ? Math.round(h * 10) / 10 : null;
};

export default function Kintai() {
  const [name, setName] = useState("");
  const [liffName, setLiffName] = useState("");
  const [month, setMonth] = useState(() =>
    new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7),
  );
  const [records, setRecords] = useState<Rec[]>([]);
  const [summary, setSummary] = useState<Record<string, { hours: number; days: number }>>({});
  const [openRecs, setOpenRecs] = useState<Rec[]>([]);
  const [rate, setRate] = useState(1080);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // 自由入力
  const [text, setText] = useState("");
  // LINE通知の登録状態。うまくいかないとき原因が分かるように画面に出す
  const [lineReg, setLineReg] = useState<string>("");
  // 表示名が名簿と一致しなかったときに、本人が名前を選んで登録するための情報
  const [lineUserId, setLineUserId] = useState<string>("");
  const [proposed, setProposed] = useState<Entry[] | null>(null);
  const [aiReply, setAiReply] = useState("");

  // LIFF初期化（LIFF外なら静かにスキップ）
  useEffect(() => {
    const saved = localStorage.getItem("kintai:name");
    if (saved) setName(saved);
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return;
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        await window.liff!.init({ liffId });
        if (!window.liff!.isLoggedIn()) {
          window.liff!.login();
          return;
        }
        const p = await window.liff!.getProfile();
        setLiffName(p.displayName);
        setLineUserId(p.userId); // 名前を選び直したときに登録できるよう常に持っておく
        if (!saved) setName(p.displayName);
        // シフト提出のリマインドをLINEで送れるように、IDを覚えておく。
        // 名前がスタッフ名簿と一致したときだけサーバー側が保存する
        const staffName = saved || p.displayName;
        try {
          const r = await fetch("/api/staff-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: staffName, userId: p.userId }),
          });
          const rd = await r.json();
          setLineReg(
            rd.skipped
              ? `⚠️ LINEの表示名「${p.displayName}」が名簿と一致しないため、通知の登録ができませんでした`
              : rd.name
                ? `✅ ${rd.name}さんとしてLINE通知に登録しました`
                : "",
          );
        } catch {
          setLineReg("⚠️ LINE通知の登録に失敗しました");
        }
      } catch {
        /* LIFF外で開いた場合など。名前選択で使えるので無視 */
      }
    };
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (name) localStorage.setItem("kintai:name", name);
  }, [name]);

  // 名前を選び直したら、その名前でLINE通知の登録もやり直す。
  // 端末に保存されていた名前が名簿と違うと弾かれるため
  useEffect(() => {
    if (!lineUserId || !name) return;
    fetch("/api/staff-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, userId: lineUserId, forceName: name }),
    })
      .then((r) => r.json())
      .then((rd) => {
        if (rd.name) setLineReg(`✅ ${rd.name}さんとしてLINE通知に登録しました`);
      })
      .catch(() => {});
  }, [name, lineUserId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kintai?month=${month}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setRecords(d.records || []);
      setSummary(d.summary || {});
      setOpenRecs(d.open || []);
      if (d.rate) setRate(d.rate);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const post = async (body: object) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/kintai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "失敗しました");
      return d;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const clockIn = async () => {
    if (!name) { setErr("先に名前を選んでください"); return; }
    const d = await post({ action: "clockin", name });
    if (d) { setMsg(`出勤を記録しました（${d.record.clockIn}）。お疲れさまです！`); load(); }
  };

  const clockOut = async () => {
    if (!name) { setErr("先に名前を選んでください"); return; }
    const brk = prompt("休憩時間（分）を入力してください", "60");
    if (brk === null) return;
    const d = await post({ action: "clockout", name, breakMin: Number(brk) || 0 });
    if (d) { setMsg(`退勤を記録しました（${d.record.clockOut} / 実働${d.hours ?? "?"}時間）`); load(); }
  };

  const parse = async () => {
    if (!name) { setErr("先に名前を選んでください"); return; }
    if (!text.trim()) return;
    const d = await post({ action: "parse", name, text });
    if (d) { setProposed(d.entries); setAiReply(d.reply); }
  };

  const confirmSave = async () => {
    if (!proposed) return;
    const d = await post({ action: "add", records: proposed.map((e) => ({ ...e, source: "ai" })) });
    if (d) {
      setMsg(`${d.count}件登録しました`);
      setProposed(null); setAiReply(""); setText("");
      load();
    }
  };

  const del = async (id: string) => {
    if (!confirm("この記録を削除しますか？")) return;
    await fetch("/api/kintai", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    load();
  };

  const myOpen = openRecs.find((r) => r.name === name || (r.member && r.member === name));
  const mine = records.filter((r) => !name || r.name === name || r.member === name);

  return (
    <div className="wrap">
      <header>
        <h1>⏰ 勤怠</h1>
        <p>{liffName ? `LINE: ${liffName}` : "出勤・退勤の記録"}</p>
      </header>
      <Nav />

      {lineReg && (
        <div className="card" style={{ padding: "10px 14px", fontSize: 12.5, lineHeight: 1.7 }}>
          {lineReg}
          {lineUserId && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["坂本", "町田", "櫻井"].map((n) => (
                <button
                  key={n}
                  onClick={async () => {
                    const r = await fetch("/api/staff-line", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: n, userId: lineUserId, forceName: n }),
                    });
                    const rd = await r.json();
                    if (rd.name) {
                      setLineReg(`✅ ${rd.name}さんとしてLINE通知に登録しました`);
                      setLineUserId("");
                    }
                  }}
                  style={{
                    padding: "7px 14px", borderRadius: 7, fontSize: 13, fontWeight: 700,
                    border: "1px solid var(--line)", background: "#fff", cursor: "pointer",
                  }}
                >
                  {n}として登録
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 名前 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {MEMBERS.map((m) => (
            <button
              key={m}
              className={name === m ? "" : "ghost"}
              onClick={() => setName(m)}
              style={{ minWidth: 70 }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
      {msg && <p style={{ textAlign: "center", color: "var(--accent)", fontWeight: 600 }}>{msg}</p>}

      {/* 打刻 */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={clockIn} disabled={busy || !!myOpen} style={{ fontSize: 18, padding: "14px 28px" }}>
            🏃 出勤
          </button>
          <button onClick={clockOut} disabled={busy} style={{ fontSize: 18, padding: "14px 28px" }}>
            🏠 退勤
          </button>
        </div>
        {myOpen && (
          <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>
            {myOpen.date} {myOpen.clockIn} に出勤中です
          </p>
        )}
      </div>

      {/* AIまとめて入力 */}
      <div className="card" style={{ padding: 14 }}>
        <div className="cat-title">まとめて入力（つけ忘れ・過去の分）</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例）昨日は14時から25時まで、休憩1時間&#10;例）8/8から8/11まで毎日14時〜25時、休憩60分"
          rows={3}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button onClick={parse} disabled={busy || !text.trim()}>
            {busy ? "読み取り中..." : "🤖 AIで整形する"}
          </button>
        </div>
        {proposed && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <p style={{ fontSize: 13 }}>{aiReply}</p>
            {proposed.map((e, i) => (
              <div key={i} className="result-row" style={{ fontSize: 13 }}>
                <span className="mono">{e.date} {e.clockIn}〜{e.clockOut || "?"}</span>
                <span className="mono">休憩{e.breakMin}分</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
              <button onClick={confirmSave} disabled={busy}>✅ この内容で登録</button>
              <button className="ghost" onClick={() => { setProposed(null); setAiReply(""); }}>やり直す</button>
            </div>
          </div>
        )}
      </div>

      {/* 月次サマリ */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {MEMBERS.map((m) => {
          const s = summary[m];
          return (
            <div key={m} className="result-row">
              <span>{m} <span style={{ color: "var(--muted)", fontSize: 12 }}>{s?.days ?? 0}日</span></span>
              <span className="mono">
                {s?.hours ?? 0}h
                <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 6 }}>
                  ¥{Math.round((s?.hours ?? 0) * rate).toLocaleString()}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* 記録一覧 */}
      <div className="card" style={{ padding: 14, overflowX: "auto" }}>
        <div className="cat-title">{month} の記録{name ? `（${name}）` : ""}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
              <th style={{ textAlign: "left", padding: "4px" }}>日付</th>
              <th style={{ textAlign: "left", padding: "4px" }}>名前</th>
              <th style={{ textAlign: "right", padding: "4px" }}>出勤</th>
              <th style={{ textAlign: "right", padding: "4px" }}>退勤</th>
              <th style={{ textAlign: "right", padding: "4px" }}>休憩</th>
              <th style={{ textAlign: "right", padding: "4px" }}>実働</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "4px" }} className="mono">{r.date.slice(5)}</td>
                <td style={{ padding: "4px" }}>{r.member || r.name}</td>
                <td style={{ textAlign: "right", padding: "4px" }} className="mono">{r.clockIn}</td>
                <td style={{ textAlign: "right", padding: "4px" }} className="mono">
                  {r.clockOut || <span style={{ color: "#c0392b" }}>未</span>}
                </td>
                <td style={{ textAlign: "right", padding: "4px" }} className="mono">{r.breakMin}分</td>
                <td style={{ textAlign: "right", padding: "4px" }} className="mono">
                  {hoursOf(r) ?? "—"}
                </td>
                <td style={{ textAlign: "right", padding: "4px" }}>
                  <button className="ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => del(r.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
