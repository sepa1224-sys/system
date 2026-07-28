"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type LineItem = { name: string; amount: number; category: string; tags: string[] };
type Advance = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  payer: string;
  category: string;
  memo: string;
  registered: boolean;
  registeredAt?: string;
  lines: LineItem[];
};
type PayerSummary = { total: number; unpaid: number; count: number; unpaidCount: number };
type TagSummary = { tag: string; amount: number };
type Summary = {
  totalAmount: number;
  totalCount: number;
  byPayer: Record<string, PayerSummary>;
  byTag: TagSummary[];
};

export default function KariirePage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPayer, setFilterPayer] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kariire");
      const data = await res.json();
      setAdvances(data.advances || []);
      setSummary(data.summary || null);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const payers = summary ? Object.keys(summary.byPayer).sort() : [];

  const filtered = advances.filter((a) => {
    if (filterPayer !== "all" && a.payer !== filterPayer) return false;
    if (filterStatus === "unpaid" && a.registered) return false;
    if (filterStatus === "paid" && !a.registered) return false;
    return true;
  });

  const filteredTotal = filtered.reduce((s, a) => s + a.total, 0);

  const fmt = (n: number) => `¥${n.toLocaleString()}`;

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>💴 役員借入金（立替）</h1>
        <p>誰がいくら何を立て替えたか</p>
      </header>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中...</p>
      ) : !summary ? (
        <p>データなし</p>
      ) : (
        <>
          {/* 立替者ごとのサマリー */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {payers.map((p) => {
              const s = summary.byPayer[p];
              return (
                <div
                  key={p}
                  className="card"
                  style={{
                    flex: 1, textAlign: "center", padding: 14, cursor: "pointer",
                    border: filterPayer === p ? "2px solid var(--accent)" : undefined,
                  }}
                  onClick={() => setFilterPayer(filterPayer === p ? "all" : p)}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{fmt(s.total)}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.count}件</div>
                  {s.unpaid > 0 && (
                    <div style={{ fontSize: 11, color: "#b22", marginTop: 2 }}>
                      未返済 {fmt(s.unpaid)}（{s.unpaidCount}件）
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 品目タグ集計 */}
          {summary.byTag.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>何に使った？</div>
              {summary.byTag.slice(0, 10).map((t) => (
                <div key={t.tag} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
                  <span>{t.tag}</span>
                  <span style={{ fontWeight: 700 }}>{fmt(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {/* フィルタ */}
          <div className="sub-tabs" style={{ marginBottom: 12 }}>
            {[
              { key: "all", label: "全件" },
              { key: "unpaid", label: "未返済" },
              { key: "paid", label: "返済済" },
            ].map((f) => (
              <button
                key={f.key}
                className={`sub-tab ${filterStatus === f.key ? "active" : ""}`}
                onClick={() => setFilterStatus(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
            {filterPayer !== "all" && `${filterPayer}の`}
            {filterStatus === "unpaid" ? "未返済" : filterStatus === "paid" ? "返済済" : "全"}立替: {filtered.length}件 / {fmt(filteredTotal)}
          </div>

          {/* 明細リスト */}
          {filtered.map((a) => {
            const expanded = expandedId === a.id;
            return (
              <div
                key={a.id}
                className={`card meisai ${a.registered ? "done" : ""}`}
                style={{ padding: 0 }}
              >
                <div
                  className="meisai-head"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                >
                  <div>
                    <span style={{
                      display: "inline-block", fontSize: 10, fontWeight: 700,
                      color: a.payer === "坂本" ? "#b5651d" : a.payer === "櫻井" ? "#2e7d32" : "#555",
                      background: a.payer === "坂本" ? "#f3e6d8" : a.payer === "櫻井" ? "#e6f4ea" : "#eee",
                      padding: "1px 8px", borderRadius: 999, marginRight: 6,
                    }}>
                      {a.payer}
                    </span>
                    <span className="meisai-desc">{a.vendor}</span>
                    <div className="meisai-sub">{a.date}</div>
                  </div>
                  <div className="meisai-right">
                    <div className="meisai-amt out">{fmt(a.total)}</div>
                    <div className="meisai-status">
                      {a.registered ? "✓ freee登録済" : "未登録"}
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--line)" }}>
                    {a.lines.map((l, i) => (
                      <div key={i} className="result-row">
                        <div>
                          <div style={{ fontSize: 13 }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {l.category}
                            {l.tags?.length > 0 && ` / ${l.tags.join(", ")}`}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(l.amount)}</div>
                      </div>
                    ))}
                    {a.memo && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                        メモ: {a.memo}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
