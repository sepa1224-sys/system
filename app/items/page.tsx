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
  }, [load]);

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
          <div className="cat-title">未分類（領収書の登録画面で品目を設定できます）</div>
          {d.unclassified.slice(0, 20).map((b, i) => (
            <div key={i} className="result-row">
              <span style={{ fontSize: 12.5 }}>{b.name.slice(0, 34)}</span>
              <span className="mono">{yen(b.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
