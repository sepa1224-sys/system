"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// イベントの申込管理。受付・入金確認・売上の見込みを見る。
// どのイベントかは登録簿（lib/events.ts）から選ぶ。

type Plan = { id: string; label: string; price: number; detail: string; payUrl: string };
type Entry = {
  id: string; name: string; lineName?: string; email?: string;
  planId: string; paid: boolean; checkedInAt?: string;
  djRequest?: string; photoOk: boolean; note?: string; createdAt: string;
};
type EventRef = { slug: string; title: string; dateLabel: string };
type Summary = {
  people: number; byPlan: Record<string, number>;
  sales: number; gross: number; paid: number; unpaid: number; checkedIn: number;
};

const DJ_FEE = 20000;

export default function EventKanri() {
  const [events, setEvents] = useState<EventRef[]>([]);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/event?admin=1${slug ? `&slug=${slug}` : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEvents(d.events || []);
      if (!slug && d.event?.slug) setSlug(d.event.slug);
      setTitle(d.event ? `${d.event.dateLabel} ${d.event.title}` : "");
      setPlans(d.plans || []);
      setEntries(d.entries || []);
      setSum(d.summary || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, p: Partial<Entry>) => {
    setBusy(id);
    try {
      const res = await fetch("/api/event", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, id, ...p }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新失敗");
    } finally {
      setBusy("");
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`${name}さんの申込を消します。`)) return;
    setBusy(id);
    try {
      const res = await fetch("/api/event", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "削除失敗");
    } finally {
      setBusy("");
    }
  };

  const planOf = (id: string) => plans.find((p) => p.id === id);
  // 人件費は30人までなら2人、それ以上は3人で見る
  const labor = (sum?.people ?? 0) > 30 ? 1100 * 7 * 3 : 1100 * 7 * 2;
  const profit = (sum?.gross ?? 0) - DJ_FEE - labor;

  return (
    <div className="wrap">
      <header>
        <h1>🎧 イベント申込</h1>
        <p>{title || "申込の管理と当日の受付"}</p>
      </header>
      <Nav />

      {events.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {events.map((e) => (
            <button
              key={e.slug}
              onClick={() => setSlug(e.slug)}
              style={{
                padding: "7px 13px", borderRadius: 8, cursor: "pointer",
                fontSize: 12.5, fontWeight: 700,
                border: slug === e.slug ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: slug === e.slug ? "var(--accent)" : "#fff",
                color: slug === e.slug ? "#fff" : "var(--ink)",
              }}
            >
              {e.dateLabel} {e.title}
            </button>
          ))}
        </div>
      )}

      {err && <p className="err">{err}</p>}

      {sum && (
        <div className="card total-card">
          <div className="total-label">申込 {sum.people}人／受付済み {sum.checkedIn}人</div>
          <div className="total-amount">¥{sum.sales.toLocaleString()}</div>
          <div style={{ marginTop: 8, fontSize: 12.5, opacity: 0.9, lineHeight: 1.9 }}>
            入金済み ¥{sum.paid.toLocaleString()}／未入金 ¥{sum.unpaid.toLocaleString()}<br />
            粗利 ¥{sum.gross.toLocaleString()} − DJ¥{DJ_FEE.toLocaleString()} − 人件費¥{labor.toLocaleString()}
            {" = "}
            <strong>{profit >= 0 ? "+" : ""}¥{profit.toLocaleString()}</strong>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">プラン別</div>
        {plans.map((p) => (
          <div key={p.id} style={{
            display: "flex", justifyContent: "space-between",
            fontSize: 13.5, padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)",
          }}>
            <span>{p.label} ¥{p.price.toLocaleString()}</span>
            <strong>{sum?.byPlan[p.id] ?? 0}人</strong>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          事前決済リンク（LINEやInstagramで配る用）
        </p>
        {plans.map((p) => (
          <div key={p.id} style={{ fontSize: 12, padding: "3px 0" }}>
            {p.label}: <a href={p.payUrl} target="_blank" rel="noreferrer">{p.payUrl}</a>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          申込フォーム: <a href={`/e/${slug}`} target="_blank" rel="noreferrer">/e/{slug}</a>
          {" ／ "}
          LINEの入口: <a href="/e" target="_blank" rel="noreferrer">/e</a>（いま受付中のイベントを自動で出します）
        </p>
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">申込一覧（{entries.length}人）</div>
        {entries.length === 0 && <p className="hint">まだ申込がありません。</p>}
        {entries.map((e) => {
          const p = planOf(e.planId);
          return (
            <div key={e.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                    {e.name}
                    {e.lineName && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}>（{e.lineName}）</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                    {p ? `${p.label} ¥${p.price.toLocaleString()}` : e.planId}
                  </div>
                  {e.djRequest && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>🎵 {e.djRequest}</div>
                  )}
                  {e.note && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>📝 {e.note}</div>
                  )}
                  {!e.photoOk && (
                    <div style={{ fontSize: 12, color: "#c0392b", marginTop: 2, fontWeight: 700 }}>
                      📷 写真NG
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                  <button
                    disabled={busy === e.id}
                    onClick={() => patch(e.id, { paid: !e.paid })}
                    style={{
                      padding: "6px 11px", borderRadius: 7, cursor: "pointer",
                      fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
                      border: e.paid ? "2px solid var(--ok)" : "1px solid var(--line)",
                      background: e.paid ? "var(--ok)" : "#fff",
                      color: e.paid ? "#fff" : "var(--muted)",
                    }}
                  >
                    {e.paid ? "入金済み" : "未入金"}
                  </button>
                  <button
                    disabled={busy === e.id}
                    onClick={() => patch(e.id, { checkedInAt: e.checkedInAt ? undefined : new Date().toISOString() })}
                    style={{
                      padding: "6px 11px", borderRadius: 7, cursor: "pointer",
                      fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
                      border: e.checkedInAt ? "2px solid var(--accent)" : "1px solid var(--line)",
                      background: e.checkedInAt ? "var(--accent)" : "#fff",
                      color: e.checkedInAt ? "#fff" : "var(--muted)",
                    }}
                  >
                    {e.checkedInAt ? "受付済み" : "受付する"}
                  </button>
                  <button
                    disabled={busy === e.id}
                    onClick={() => remove(e.id, e.name)}
                    style={{
                      padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                      fontSize: 11, border: "1px solid var(--line)",
                      background: "#fff", color: "var(--muted)",
                    }}
                  >
                    消す
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
