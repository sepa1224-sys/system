"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 品目別の購入台帳。仕訳とは別に「何を何回いくらで買ったか」を積み上げて見る。

type Buy = { date: string; vendor: string; name: string; amount: number; category: string };
type Ledger = {
  item: string;
  count: number;
  total: number;
  first: string;
  last: string;
  daysSinceLast: number;
  avgIntervalDays: number | null;
  categories: string[];
  vendors: string[];
  buys: Buy[];
};

const yen = (n: number) => `¥${n.toLocaleString()}`;

export default function ItemsPage() {
  const [d, setD] = useState<{
    items: number;
    total: number;
    unclassifiedCount: number;
    unclassifiedTotal: number;
    ledgers: Ledger[];
    unclassified: Buy[];
  } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // 未分類に品目を割り当てるための状態。
  // 選択肢は既存の品目一覧（/api/items-map）から出し、新しい名前も打てる
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items-ledger");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得失敗");
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/items-map")
      .then((r) => r.json())
      .then((j) => setItemNames(j.items ?? []))
      .catch(() => {});
  }, [load]);

  // 「この品名はこの品目」と覚えさせる。以降は同じ品名が自動で分類される
  async function saveAssign(name: string) {
    const item = (assign[name] || "").trim();
    if (!item) return;
    setSaving(name);
    try {
      const res = await fetch("/api/items-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: name, item }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "保存失敗");
      setSavedMsg(`「${item}」として覚えました`);
      if (!itemNames.includes(item)) setItemNames((p) => [...p, item].sort());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
    } finally {
      setSaving(null);
    }
  }

  const list = (d?.ledgers ?? []).filter((l) => !q || l.item.includes(q));

  return (
    <div className="wrap">
      <header>
        <h1>🧺 品目台帳</h1>
        <p>仕訳とは別に、何を何回いくらで買ったかを積み上げています</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {d && (
        <div className="card total-card">
          <div className="total-label">品目 {d.items}種類の仕入・購入</div>
          <div className="total-amount">{yen(d.total)}</div>
          {d.unclassifiedCount > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
              未分類 {d.unclassifiedCount}件（{yen(d.unclassifiedTotal)}）
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="品目で絞り込み（例: ペーパー）" />
      </div>

      {list.map((l) => {
        const isOpen = open === l.item;
        return (
          <div key={l.item} className="card" style={{ padding: "12px 14px" }}>
            <div
              onClick={() => setOpen(isOpen ? null : l.item)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
            >
              <div>
                <strong style={{ fontSize: 14.5 }}>{l.item}</strong>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  {l.count}回 ／ 前回 {l.last.slice(5)}（{l.daysSinceLast}日前）
                  {l.avgIntervalDays !== null && ` ／ 平均${l.avgIntervalDays}日`}
                </div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{yen(l.total)}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{isOpen ? "▲" : "▼"}</div>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
                  科目: {l.categories.join("・")} ／ 仕入先: {l.vendors.slice(0, 4).join("・")}
                  {l.vendors.length > 4 && ` ほか${l.vendors.length - 4}`}
                </div>
                {l.buys.map((b, i) => (
                  <div key={i} className="result-row">
                    <span style={{ fontSize: 12.5 }}>
                      <span className="mono">{b.date.slice(5)}</span>{" "}
                      <span style={{ color: "var(--muted)" }}>{b.vendor.slice(0, 14)}</span>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{b.name.slice(0, 40)}</div>
                    </span>
                    <span className="mono" style={{ whiteSpace: "nowrap" }}>{yen(b.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {d && d.unclassified.length > 0 && (
        <div className="card">
          <div className="cat-title">未分類に品目を割り当てる</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px" }}>
            品目を選んで✓を押すと覚えます。同じ品名は以降ずっと自動で分類されます。
            一覧にない品目は、そのまま入力すれば新しく作られます。
          </p>
          {savedMsg && <p style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 700 }}>{savedMsg}</p>}
          <datalist id="item-options">
            {itemNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          {(() => {
            // 同じ品名はまとめて金額を合計する
            const g = new Map<string, { amount: number; count: number; vendor: string }>();
            for (const b of d.unclassified) {
              const cur = g.get(b.name) ?? { amount: 0, count: 0, vendor: b.vendor };
              cur.amount += b.amount;
              cur.count += 1;
              g.set(b.name, cur);
            }
            return [...g.entries()]
              .sort((a, b) => b[1].amount - a[1].amount)
              .slice(0, 40)
              .map(([name, v]) => (
                <div key={name} style={{ padding: "9px 0", borderTop: "1px solid var(--line-soft, #eee)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                      {name.slice(0, 60)}
                      <span style={{ color: "var(--muted)" }}>（{v.vendor}・{v.count}回）</span>
                    </span>
                    <span className="mono" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{yen(v.amount)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input
                      list="item-options"
                      placeholder="品目を選ぶか入力"
                      value={assign[name] ?? ""}
                      onChange={(e) => setAssign((p) => ({ ...p, [name]: e.target.value }))}
                      style={{ flex: 1, fontSize: 13, padding: "7px 10px" }}
                    />
                    <button
                      onClick={() => saveAssign(name)}
                      disabled={!(assign[name] || "").trim() || saving === name}
                      style={{
                        padding: "0 16px", borderRadius: 8, fontWeight: 800, fontSize: 15,
                        border: "none", cursor: "pointer",
                        background: (assign[name] || "").trim() ? "var(--ok)" : "var(--line)",
                        color: "#fff",
                      }}
                    >
                      {saving === name ? "…" : "✓"}
                    </button>
                  </div>
                </div>
              ));
          })()}
        </div>
      )}
    </div>
  );
}
