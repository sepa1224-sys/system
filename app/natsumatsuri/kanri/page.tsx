"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 夏祭り申込の管理画面（内部用）。/natsumatsuri/kanri

type Entry = {
  id: string;
  name: string;
  lineName: string;
  email?: string;
  plan: string;
  meetPoint: string;
  transport: string;
  hotsand: string;
  djRequest?: string;
  note?: string;
  createdAt: string;
};

type Counts = {
  shuttle: number;
  hanabi: number;
  party: number;
  hotsand: number;
};

export default function NatsumatsuriKanri() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/natsumatsuri?list=1");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEntries(d.entries || []);
      setCounts(d.counts || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (e: Entry) => {
    if (!confirm(`${e.name}（${e.plan}）の申込を取り消しますか？`)) return;
    await fetch("/api/natsumatsuri", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id }),
    });
    load();
  };

  const djList = entries.filter((e) => e.djRequest);
  const hotsandList = entries.filter((e) => e.hotsand.includes("予約する"));

  // プラン別集計
  const byPlan: Record<string, number> = {};
  let revenue = 0;
  for (const e of entries) {
    byPlan[e.plan] = (byPlan[e.plan] || 0) + 1;
    const m = /¥([\d,]+)/.exec(e.plan);
    if (m) revenue += parseInt(m[1].replace(/,/g, ""), 10);
    if (e.hotsand.includes("2つ")) revenue += 1600;
    else if (e.hotsand.includes("1つ")) revenue += 800;
  }

  return (
    <div className="wrap">
      <header>
        <h1>🎆 夏祭り申込管理</h1>
        <p>8/22（土）flat. 夏祭り2026</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {counts && (
        <div className="card total-card">
          <div className="total-label">申込 {entries.length}件 ／ 見込み売上</div>
          <div className="total-amount">¥{revenue.toLocaleString()}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
            <span>🎆 花火 {counts.hanabi}/30</span>
            <span>🚌 送迎 {counts.shuttle}/16</span>
            <span>🪩 パーティ {counts.party}人</span>
            <span>🍞 ホットサンド {counts.hotsand}個</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="cat-title">プラン別</div>
        {Object.entries(byPlan).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
          <div key={p} className="result-row"><span>{p}</span><span className="mono">{n}人</span></div>
        ))}
      </div>

      {hotsandList.length > 0 && (
        <div className="card">
          <div className="cat-title">🍞 ホットサンド予約（{counts?.hotsand}個）</div>
          {hotsandList.map((e) => (
            <div key={e.id} className="result-row">
              <span>{e.name}</span>
              <span>{e.hotsand.includes("2つ") ? "2個" : "1個"}</span>
            </div>
          ))}
        </div>
      )}

      {djList.length > 0 && (
        <div className="card">
          <div className="cat-title">🎧 DJリクエスト曲</div>
          {djList.map((e) => (
            <div key={e.id} style={{ borderBottom: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
              <b>{e.name}</b>: {e.djRequest}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="cat-title">申込一覧</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
              <th style={{ textAlign: "left", padding: 4 }}>名前</th>
              <th style={{ textAlign: "left", padding: 4 }}>連絡先</th>
              <th style={{ textAlign: "left", padding: 4 }}>プラン</th>
              <th style={{ textAlign: "left", padding: 4 }}>集合</th>
              <th style={{ textAlign: "left", padding: 4 }}>移動</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: 4 }}>
                  {e.name}
                  {e.note && <div style={{ color: "var(--muted)", fontSize: 11 }}>{e.note}</div>}
                </td>
                <td style={{ padding: 4 }}>
                  {e.lineName && <span>📱 {e.lineName}</span>}
                  {e.email && <div style={{ fontSize: 11 }}>✉️ {e.email}</div>}
                </td>
                <td style={{ padding: 4 }}>{e.plan.replace(/（.*/, "").replace(/¥.*/, "")}</td>
                <td style={{ padding: 4 }}>{e.meetPoint.slice(0, e.meetPoint.indexOf("（") > 0 ? e.meetPoint.indexOf("（") : undefined)}</td>
                <td style={{ padding: 4 }}>{e.transport.slice(0, 6)}</td>
                <td style={{ padding: 4 }}>
                  <button className="ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => del(e)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
