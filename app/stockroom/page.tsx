"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// ストックルームの在庫確認。3日に1回、倉庫から補充する作業のためのリスト。
// 「補充した」か「倉庫に無かった」を押していく。
// 倉庫に無かったものが、そのまま発注すべきものになる。

type Item = {
  id: string;
  name: string;
  group: string;
  par: number;
  unit: string;
  madeInHouse?: boolean;
  note?: string;
};
type Result = "ok" | "short";

const GROUPS = [
  "ドリンク（ノンアル）",
  "ドリンク（酒）",
  "コーヒー・茶",
  "フード",
  "ワッフル",
  "仕込み品",
  "消耗品・包材",
];

export default function StockroomPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [daysSince, setDaysSince] = useState<number | null>(null);
  const [due, setDue] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPar, setEditPar] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stockroom");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setItems(d.items || []);
      setLastDate(d.lastDate);
      setDaysSince(d.daysSince);
      setDue(!!d.due);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (id: string, r: Result) =>
    setResults((p) => ({ ...p, [id]: p[id] === r ? undefined as unknown as Result : r }));

  const shortItems = items.filter((i) => results[i.id] === "short");
  const checked = Object.values(results).filter(Boolean).length;

  const savePar = async (item: Item) => {
    const par = Number(editPar);
    if (!Number.isFinite(par) || par < 0) return;
    try {
      const res = await fetch("/api/stockroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: { ...item, par } }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    }
  };

  const finish = async () => {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/stockroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check: { results, note } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存失敗");
      setMsg(
        d.short > 0
          ? `記録しました。倉庫に無かった ${d.short}件 が発注するものです。`
          : "記録しました。すべて補充できています。",
      );
      setResults({});
      setNote("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>📦 ストックルーム確認</h1>
        <p>3日に1回、倉庫からストックルームへ補充します</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card total-card">
        <div className="total-label">
          {due ? "今日やる作業です" : "前回からまだ日が浅いです"}
        </div>
        <div className="total-amount">{checked} / {items.length}</div>
        <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
          {lastDate
            ? `前回 ${lastDate.slice(5).replace("-", "/")}（${daysSince}日前）`
            : "まだ一度も記録していません"}
        </div>
      </div>

      <div className="card" style={{ padding: "12px 14px", fontSize: 12.5, lineHeight: 1.8, color: "var(--muted)" }}>
        品目ごとに<strong>ストックルームにあるべき数</strong>が書いてあります。倉庫から補充して、
        <strong style={{ color: "var(--ok)" }}>補充OK</strong> か
        <strong style={{ color: "#c0392b" }}>倉庫にない</strong> を押してください。<br />
        「倉庫にない」を押したものが、そのまま<strong>発注するもの</strong>になります。
        数を変えたいときは数字をタップすると直せます。
      </div>

      {GROUPS.map((g) => {
        const list = items.filter((i) => i.group === g);
        if (!list.length) return null;
        return (
          <div key={g} className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">{g}</div>
            {list.map((i) => {
              const r = results[i.id];
              return (
                <div key={i.id} style={{ padding: "9px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {i.name}
                        {i.madeInHouse && (
                          <span style={{
                            marginLeft: 5, fontSize: 10, fontWeight: 700, padding: "1px 6px",
                            borderRadius: 4, background: "#eef1f4", color: "var(--muted)",
                          }}>仕込み</span>
                        )}
                      </div>
                      {editId === i.id ? (
                        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                          <input
                            type="number"
                            value={editPar}
                            onChange={(e) => setEditPar(e.target.value)}
                            style={{ width: 80, fontSize: 13, padding: "5px 8px" }}
                          />
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>{i.unit}</span>
                          <button onClick={() => savePar(i)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--ok)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>保存</button>
                          <button onClick={() => setEditId(null)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "#fff", cursor: "pointer" }}>やめる</button>
                        </div>
                      ) : (
                        <div
                          onClick={() => { setEditId(i.id); setEditPar(String(i.par)); }}
                          style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, cursor: "pointer" }}
                        >
                          あるべき数: <strong style={{ color: "var(--ink)" }}>{i.par}{i.unit}</strong>
                          <span style={{ marginLeft: 4, fontSize: 10.5 }}>（タップで変更）</span>
                          {i.note && <span style={{ marginLeft: 6 }}>／ {i.note}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button
                        onClick={() => set(i.id, "ok")}
                        style={{
                          padding: "7px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: r === "ok" ? "2px solid var(--ok)" : "1px solid var(--line)",
                          background: r === "ok" ? "#eaf6ec" : "#fff",
                          color: r === "ok" ? "var(--ok)" : "var(--muted)",
                        }}
                      >補充OK</button>
                      <button
                        onClick={() => set(i.id, "short")}
                        style={{
                          padding: "7px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: r === "short" ? "2px solid #c0392b" : "1px solid var(--line)",
                          background: r === "short" ? "#fde8e8" : "#fff",
                          color: r === "short" ? "#c0392b" : "var(--muted)",
                        }}
                      >{i.madeInHouse ? "要仕込み" : "倉庫にない"}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {shortItems.length > 0 && (
        <div className="card" style={{ padding: 14, background: "#fdf6ec", borderColor: "#e8d5b0" }}>
          <div className="cat-title">この確認で出た「発注・仕込みが必要なもの」（{shortItems.length}）</div>
          {shortItems.map((i) => (
            <div key={i.id} style={{ fontSize: 13.5, lineHeight: 1.9 }}>
              ・{i.name} <span style={{ color: "var(--muted)" }}>（{i.par}{i.unit}）</span>
              {i.madeInHouse && <span style={{ color: "#9c5f22", fontWeight: 700 }}> ← 仕込む</span>}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <input
          placeholder="メモ（任意）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%", fontSize: 13, padding: "9px 10px", marginBottom: 10 }}
        />
        <button className="primary" onClick={finish} disabled={saving || checked === 0} style={{ width: "100%" }}>
          {saving ? "記録中…" : `この内容で記録する（${checked}件）`}
        </button>
        {msg && <p style={{ fontSize: 13, color: "var(--ok)", fontWeight: 700, textAlign: "center", marginTop: 8 }}>{msg}</p>}
      </div>
    </div>
  );
}
