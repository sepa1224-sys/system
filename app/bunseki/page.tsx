"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 経営分析。/api/analytics が Square売上・領収書・原価表を自動集計する。
// 手入力の月次管理（/accounting）とは別に、実データをそのまま見るためのページ。

type Analytics = {
  period: { from: string; to: string };
  excludedEvents: {
    applied: boolean;
    windows: { date: string; fromHour: number; label: string }[];
    sales: { label: string; sales: number; count: number }[];
    total: number;
  };
  sales: {
    total: number; tax: number; orderCount: number;
    byDay: { day: string; sales: number; count: number }[];
    byMonth: { month: string; sales: number; count: number; days: number; perDay: number }[];
    byWeekday: { weekday: number; name: string; sales: number; count: number; days: number; avgSales: number }[];
    byTender: { tender: string; count: number; amount: number }[];
  };
  products: {
    name: string; qty: number; amount: number; cost: number;
    gross: number; rate: number | null; hasCost: boolean;
  }[];
  productCostCoverage: {
    knownSales: number; unknownSales: number; knownCost: number; estGross: number;
  };
  expenses: {
    total: number; cogs: number; receiptCount: number;
    byCategory: { category: string; amount: number }[];
    byTag: { tag: string; amount: number }[];
  };
  pnl: {
    sales: number; theoreticalCogs: number; actualPurchases: number;
    otherExpenses: number; grossByTheory: number; cashFlow: number;
  };
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const todayJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function Bunseki() {
  const t = todayJST();
  const [from, setFrom] = useState(t.slice(0, 8) + "01");
  const [to, setTo] = useState(t);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"pnl" | "products" | "expenses" | "days" | "month" | "weekday">("pnl");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/analytics?from=${from}&to=${to}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const setMonth = (offset: number) => {
    const d = new Date(from + "T00:00:00");
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear(), m = d.getMonth();
    const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const last = new Date(y, m + 1, 0);
    const lastS = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    setFrom(first);
    setTo(lastS < t ? lastS : t);
  };

  return (
    <div className="wrap">
      <header>
        <h1>🔍 経営分析</h1>
        <p>Square売上・領収書・原価表からの自動集計（手入力なし）</p>
      </header>
      <Nav />

      {/* 期間 */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <button className="ghost" onClick={() => setMonth(-1)}>◀ 前月</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>〜</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="ghost" onClick={() => setMonth(1)}>翌月 ▶</button>
        </div>
      </div>

      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}
      {loading && <p style={{ textAlign: "center", color: "var(--muted)" }}>集計中...</p>}

      {data && !loading && (
        <>
          {/* サマリ */}
          <div className="card total-card">
            <div className="total-label">{data.period.from} 〜 {data.period.to}</div>
            <div className="total-amount">{fmt(data.sales.total)}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
              <span>{data.sales.orderCount}件</span>
              <span>客単価 {data.sales.orderCount ? fmt(data.sales.total / data.sales.orderCount) : "—"}</span>
              <span>理論粗利 {fmt(data.pnl.grossByTheory)}</span>
              <span>支出 {fmt(data.expenses.total)}</span>
            </div>
          </div>

          {data.excludedEvents?.applied && data.excludedEvents.total > 0 && (
            <div className="card" style={{ padding: "10px 14px", background: "#fdf6ec", borderColor: "#e8d5b0" }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                <strong>イベントの売上を分析から外しています。</strong>
                {data.excludedEvents.sales.map((e) => (
                  <span key={e.label}> {e.label} {fmt(e.sales)}（{e.count}件）</span>
                ))}
                <br />
                通常営業とは客層も単価も違うため、平常日の傾向がぶれないように除いています。
              </div>
            </div>
          )}

          <div className="sub-tabs">
            {([["pnl", "損益"], ["products", "商品別"], ["expenses", "支出"], ["days", "日別"], ["month", "月別"], ["weekday", "曜日別"]] as const).map(([k, l]) => (
              <button key={k} className={`sub-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {/* 損益 */}
          {tab === "pnl" && (
            <div className="card">
              <div className="cat-title">この期間の実態</div>
              {[
                ["売上高（Square実績）", data.pnl.sales],
                ["理論原価（原価表 × 売れた数）", -data.pnl.theoreticalCogs],
                ["理論粗利", data.pnl.grossByTheory],
              ].map(([l, v]) => (
                <div key={l as string} className="result-row">
                  <span>{l as string}</span>
                  <span className="mono" style={{ fontWeight: 700, color: (v as number) < 0 ? "#c0392b" : undefined }}>
                    {fmt(Math.abs(v as number))}{(v as number) < 0 ? " −" : ""}
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "2px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
                {[
                  ["実際の仕入（領収書の仕入高）", data.pnl.actualPurchases],
                  ["その他の支出（消耗品・経費等）", data.pnl.otherExpenses],
                  ["キャッシュフロー（売上 − 全支出）", data.pnl.cashFlow],
                ].map(([l, v]) => (
                  <div key={l as string} className="result-row">
                    <span>{l as string}</span>
                    <span className="mono" style={{ fontWeight: 700, color: (l as string).startsWith("キャッシュ") && (v as number) < 0 ? "#c0392b" : undefined }}>
                      {fmt(v as number)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                理論原価＝原価表の1皿原価×売れた数。実際の仕入は買い置き分も含むため、
                開業期は仕入が先行して大きく出ます。日常の判断は理論粗利、
                資金繰りはキャッシュフローを見てください。
              </p>
              {data.productCostCoverage.unknownSales > 0 && (
                <p className="hint" style={{ color: "#c0392b" }}>
                  ⚠ 売上のうち {fmt(data.productCostCoverage.unknownSales)} は原価表に無い商品のため、
                  理論原価に含まれていません（商品別タブで「原価未登録」を確認）。
                </p>
              )}
            </div>
          )}

          {/* 商品別 */}
          {tab === "products" && (
            <div className="card" style={{ overflowX: "auto" }}>
              <div className="cat-title">商品別の売上と粗利</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "6px 4px" }}>商品</th>
                    <th style={{ textAlign: "right", padding: "6px 4px" }}>個数</th>
                    <th style={{ textAlign: "right", padding: "6px 4px" }}>売上</th>
                    <th style={{ textAlign: "right", padding: "6px 4px" }}>粗利</th>
                    <th style={{ textAlign: "right", padding: "6px 4px" }}>原価率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.name} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "6px 4px" }}>{p.name}</td>
                      <td style={{ textAlign: "right", padding: "6px 4px" }} className="mono">{p.qty}</td>
                      <td style={{ textAlign: "right", padding: "6px 4px" }} className="mono">{fmt(p.amount)}</td>
                      <td style={{ textAlign: "right", padding: "6px 4px" }} className="mono">
                        {p.hasCost ? fmt(p.gross) : <span style={{ color: "#c0392b" }}>原価未登録</span>}
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 4px" }} className="mono">
                        {p.hasCost && p.rate !== null ? `${p.rate}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 支出 */}
          {tab === "expenses" && (
            <>
              <div className="card">
                <div className="cat-title">科目別（領収書 {data.expenses.receiptCount}件 / {fmt(data.expenses.total)}）</div>
                {data.expenses.byCategory.map((c) => (
                  <div key={c.category} className="result-row">
                    <span>{c.category}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="cat-title">用途タグ別 上位</div>
                {data.expenses.byTag.map((tg) => (
                  <div key={tg.tag} className="result-row">
                    <span>{tg.tag}</span>
                    <span className="mono">{fmt(tg.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 月別 */}
          {tab === "month" && (
            <div className="card">
              <div className="cat-title">月別売上</div>
              {data.sales.byMonth.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>データがありません。</p>
              ) : (
                data.sales.byMonth.map((m) => {
                  const max = Math.max(...data.sales.byMonth.map((x) => x.sales), 1);
                  return (
                    <div key={m.month} style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft, #eee)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{m.month.replace("-", "年")}月</span>
                        <span className="mono" style={{ fontWeight: 700 }}>{fmt(m.sales)}</span>
                      </div>
                      <div style={{ background: "var(--line)", borderRadius: 4, height: 14, overflow: "hidden" }}>
                        <div style={{ width: `${(m.sales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                        営業{m.days}日 ・ 1日平均 {fmt(m.perDay)} ・ {m.count}件
                      </div>
                    </div>
                  );
                })
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                月をまたいで比べるときは「1日平均」を見てください。営業日数が違うと合計では比べられません。
              </p>
            </div>
          )}

          {/* 曜日別 */}
          {tab === "weekday" && (
            <div className="card">
              <div className="cat-title">曜日別売上（1日あたりの平均）</div>
              {data.sales.byWeekday.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>データがありません。</p>
              ) : (
                data.sales.byWeekday.map((w) => {
                  const max = Math.max(...data.sales.byWeekday.map((x) => x.avgSales), 1);
                  const color = w.weekday === 0 ? "#c0392b" : w.weekday === 6 ? "#2980b9" : "var(--ink)";
                  return (
                    <div key={w.weekday} style={{ display: "grid", gridTemplateColumns: "34px 1fr 90px 52px", gap: 8, alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                      <span style={{ fontWeight: 800, color }}>{w.name}</span>
                      <div style={{ background: "var(--line)", borderRadius: 4, height: 16, overflow: "hidden" }}>
                        <div style={{ width: `${(w.avgSales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                      <span className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{fmt(w.avgSales)}</span>
                      <span className="mono" style={{ textAlign: "right", color: "var(--muted)", fontSize: 11.5 }}>{w.days}日</span>
                    </div>
                  );
                })
              )}
              <p className="hint" style={{ marginTop: 10 }}>
                棒の長さは1日あたりの平均売上です。右端は集計に入った営業日数で、
                日数が少ない曜日はまだ当てになりません。
              </p>
            </div>
          )}

          {/* 日別 */}
          {tab === "days" && (
            <div className="card">
              <div className="cat-title">日別売上</div>
              {data.sales.byDay.map((d) => {
                const max = Math.max(...data.sales.byDay.map((x) => x.sales), 1);
                return (
                  <div key={d.day} style={{ display: "grid", gridTemplateColumns: "84px 1fr 90px 44px", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
                    <span className="mono">{d.day.slice(5)}</span>
                    <div style={{ background: "var(--line)", borderRadius: 4, height: 14, overflow: "hidden" }}>
                      <div style={{ width: `${(d.sales / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                    <span className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{fmt(d.sales)}</span>
                    <span className="mono" style={{ textAlign: "right", color: "var(--muted)" }}>{d.count}件</span>
                  </div>
                );
              })}
              <div className="result-row" style={{ borderTop: "2px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
                <span style={{ fontWeight: 700 }}>支払方法別</span><span />
              </div>
              {data.sales.byTender.map((tn) => (
                <div key={tn.tender} className="result-row">
                  <span>{tn.tender} <span style={{ color: "var(--muted)", fontSize: 12 }}>{tn.count}件</span></span>
                  <span className="mono">{fmt(tn.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
