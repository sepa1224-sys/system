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
  takeoutDrink?: string;
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

const fmtDate = (iso: string) => {
  try {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
};

export default function NatsumatsuriKanri() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

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

  // ホットサンドの味の内訳。hotsand は「予約する：1つ（…） ／ 味: ガーデンメルト」の形。
  // 味の選択は8/16 14:48(JST)に追加したので、それ以前の申込には味が入っていない。
  const hotsand = (() => {
    const byFlavor: Record<string, number> = {};
    const missing: { name: string; qty: number }[] = [];
    let total = 0;
    for (const e of entries) {
      const qty = e.hotsand.includes("2つ") ? 2 : e.hotsand.includes("1つ") ? 1 : 0;
      if (!qty) continue;
      total += qty;
      const m = /味[:：]\s*(.+)$/.exec(e.hotsand);
      const picked = m ? m[1].split(/[・、,]/).map((s) => s.trim()).filter(Boolean) : [];
      for (const f of picked) byFlavor[f] = (byFlavor[f] || 0) + 1;
      if (qty > picked.length) missing.push({ name: e.name, qty: qty - picked.length });
    }
    return { total, byFlavor, missing };
  })();
  const missingQty = hotsand.missing.reduce((n, x) => n + x.qty, 0);
  const drinkList = entries.filter((e) => e.takeoutDrink && e.takeoutDrink !== "いらない");

  // プラン別集計
  const byPlan: Record<string, number> = {};
  const byDrink: Record<string, number> = {};
  let revenue = 0;
  for (const e of entries) {
    byPlan[e.plan] = (byPlan[e.plan] || 0) + 1;
    const m = /¥([\d,]+)/.exec(e.plan);
    if (m) revenue += parseInt(m[1].replace(/,/g, ""), 10);
    if (e.hotsand.includes("2つ")) revenue += 1600;
    else if (e.hotsand.includes("1つ")) revenue += 800;
    if (e.takeoutDrink && e.takeoutDrink !== "いらない") {
      byDrink[e.takeoutDrink] = (byDrink[e.takeoutDrink] || 0) + 1;
      const dm = /¥([\d,]+)/.exec(e.takeoutDrink);
      if (dm) revenue += parseInt(dm[1].replace(/,/g, ""), 10);
    }
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
          <div className="cat-title">🍞 ホットサンド予約（{hotsand.total}個）</div>

          {/* 味ごとの必要数。仕込みはこの数字で用意する */}
          {Object.entries(hotsand.byFlavor).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
            <div key={f} className="result-row">
              <span>{f}</span>
              <span className="mono">{n}個</span>
            </div>
          ))}
          {missingQty > 0 && (
            <div className="result-row">
              <span style={{ color: "#c0392b" }}>味 未選択</span>
              <span className="mono" style={{ color: "#c0392b" }}>{missingQty}個</span>
            </div>
          )}

          <div style={{ marginTop: 10, borderTop: "1px solid var(--line-soft, #eee)", paddingTop: 8 }}>
            {hotsandList.map((e) => {
              const m = /味[:：]\s*(.+)$/.exec(e.hotsand);
              return (
                <div key={e.id} className="result-row">
                  <span>{e.name}</span>
                  <span style={{ textAlign: "right", color: m ? undefined : "#c0392b" }}>
                    {e.hotsand.includes("2つ") ? "2個" : "1個"} ／ {m ? m[1] : "味 未選択"}
                  </span>
                </div>
              );
            })}
          </div>

          {hotsand.missing.length > 0 && (
            <p className="hint" style={{ marginTop: 8, color: "#c0392b" }}>
              ⚠️ {hotsand.missing.map((x) => x.name).join("・")} さんは、味の選択を追加する前（8/16 14:48以前）に申し込まれています。個別に確認してください。
            </p>
          )}
        </div>
      )}

      {drinkList.length > 0 && (
        <div className="card">
          <div className="cat-title">🥤 ドリンクテイクアウト（{drinkList.length}件）</div>
          {Object.entries(byDrink).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
            <div key={d} className="result-row"><span>{d}</span><span className="mono">{n}件</span></div>
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

      <div className="card">
        <div className="cat-title">申込一覧（{entries.length}件・タップで詳細）</div>
        {entries.map((e) => {
          const open = openId === e.id;
          return (
            <div key={e.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <div
                onClick={() => setOpenId(open ? null : e.id)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 4px",
                  cursor: "pointer",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {e.plan.replace(/¥.*/, "")}
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>
                  {open ? "▲ 閉じる" : "▼ 詳細"}
                </div>
              </div>

              {open && (
                <div style={{ padding: "0 4px 14px", fontSize: 13 }}>
                  <div className="result-row"><span>連絡先</span>
                    <span style={{ textAlign: "right" }}>
                      {e.lineName && <div>📱 {e.lineName}</div>}
                      {e.email && <div>✉️ {e.email}</div>}
                    </span>
                  </div>
                  <div className="result-row"><span>参加費</span><span style={{ textAlign: "right" }}>{e.plan}</span></div>
                  <div className="result-row"><span>集合場所</span><span style={{ textAlign: "right" }}>{e.meetPoint}</span></div>
                  <div className="result-row"><span>移動</span><span style={{ textAlign: "right" }}>{e.transport}</span></div>
                  <div className="result-row"><span>🍞 ホットサンド</span><span style={{ textAlign: "right" }}>{e.hotsand}</span></div>
                  <div className="result-row"><span>🥤 ドリンク</span><span style={{ textAlign: "right" }}>{e.takeoutDrink || "いらない"}</span></div>
                  {e.djRequest && (
                    <div className="result-row"><span>🎧 DJ曲</span><span style={{ textAlign: "right" }}>{e.djRequest}</span></div>
                  )}
                  {e.note && (
                    <div className="result-row"><span>備考</span><span style={{ textAlign: "right" }}>{e.note}</span></div>
                  )}
                  <div className="result-row"><span>申込日時</span><span className="mono" style={{ textAlign: "right" }}>{fmtDate(e.createdAt)}</span></div>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button className="ghost" style={{ fontSize: 12 }} onClick={() => del(e)}>この申込を取り消す ✕</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
