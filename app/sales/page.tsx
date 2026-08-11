"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type ProductRow = { name: string; qty: number; amount: number };
type HourRow = { hour: number; count: number; amount: number };
type OrderRow = {
  id: string;
  created_jst: string;
  hour: number;
  total: number;
  tax: number;
  items: { name: string; qty: number; amount: number }[];
};
type SalesData = {
  summary: { totalSales: number; totalTax: number; orderCount: number };
  byProduct: ProductRow[];
  byHour: HourRow[];
  orders: OrderRow[];
};

const fmt = (n: number) => n.toLocaleString();
const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + d.getTimezoneOffset() + 540); // JST
  return d.toISOString().slice(0, 10);
};

export default function SalesPage() {
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState<"day" | "range">("day");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"summary" | "products" | "hours" | "orders">(
    "summary"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const q = mode === "day" ? `date=${date}` : `from=${from}&to=${to}`;
      const res = await fetch(`/api/square/sales?${q}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "取得失敗");
      setData(json);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [mode, date, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftDay = (n: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  };

  const maxHourAmount = data
    ? Math.max(...data.byHour.map((h) => h.amount), 1)
    : 1;

  return (
    <div className="wrap">
      <header>
        <h1>📈 売上分析</h1>
        <p>Squareの売上データをリアルタイムで確認</p>
      </header>
      <Nav />

      {/* モード切替 */}
      <div className="sub-tabs" style={{ marginBottom: 12 }}>
        <button
          className={`sub-tab ${mode === "day" ? "active" : ""}`}
          onClick={() => setMode("day")}
        >
          日別
        </button>
        <button
          className={`sub-tab ${mode === "range" ? "active" : ""}`}
          onClick={() => setMode("range")}
        >
          期間
        </button>
      </div>

      {/* 日付選択 */}
      <div className="card" style={{ padding: 14 }}>
        {mode === "day" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "center",
            }}
          >
            <button className="ghost" onClick={() => shiftDay(-1)}>
              ◀
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ width: "auto", textAlign: "center", fontWeight: 700 }}
            />
            <button className="ghost" onClick={() => shiftDay(1)}>
              ▶
            </button>
          </div>
        ) : (
          <div className="row">
            <div>
              <label>開始</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label>終了</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {loading && (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "var(--accent)", borderTopColor: "var(--accent-weak)" }} />
          読み込み中...
        </p>
      )}
      {err && <p className="err">{err}</p>}

      {data && !loading && (
        <>
          {/* サマリカード */}
          <div className="card total-card">
            <div className="total-label">
              売上合計{" "}
              {mode === "day"
                ? date
                : `${from} 〜 ${to}`}
            </div>
            <div className="total-amount">¥{fmt(data.summary.totalSales)}</div>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 6,
                fontSize: 13,
                opacity: 0.85,
              }}
            >
              <span>{data.summary.orderCount}件</span>
              <span>
                客単価 ¥
                {data.summary.orderCount
                  ? fmt(
                      Math.round(
                        data.summary.totalSales / data.summary.orderCount
                      )
                    )
                  : 0}
              </span>
              <span>税 ¥{fmt(data.summary.totalTax)}</span>
            </div>
          </div>

          {/* タブ */}
          <div className="sub-tabs">
            {(
              [
                ["summary", "概要"],
                ["products", "商品別"],
                ["hours", "時間帯"],
                ["orders", "明細"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`sub-tab ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 概要 */}
          {tab === "summary" && (
            <>
              <div className="card">
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-val">
                      {data.summary.orderCount}
                    </span>
                    <span className="summary-label">注文数</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">
                      ¥
                      {data.summary.orderCount
                        ? fmt(
                            Math.round(
                              data.summary.totalSales /
                                data.summary.orderCount
                            )
                          )
                        : 0}
                    </span>
                    <span className="summary-label">客単価</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-val">
                      {data.byProduct.length}
                    </span>
                    <span className="summary-label">商品種類</span>
                  </div>
                </div>
              </div>
              {/* Top 5 商品 */}
              {data.byProduct.length > 0 && (
                <div className="card">
                  <div className="cat-title">売れ筋 TOP 5</div>
                  {data.byProduct.slice(0, 5).map((p, i) => (
                    <div className="result-row" key={p.name}>
                      <div>
                        <span
                          style={{
                            fontWeight: 700,
                            color: "var(--accent)",
                            marginRight: 8,
                          }}
                        >
                          {i + 1}
                        </span>
                        {p.name}
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            marginLeft: 6,
                          }}
                        >
                          ×{p.qty}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        ¥{fmt(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 商品別 */}
          {tab === "products" && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="menu-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>商品名</th>
                    <th>数量</th>
                    <th>売上</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byProduct.map((p) => (
                    <tr key={p.name}>
                      <td style={{ textAlign: "left", fontWeight: 600 }}>
                        {p.name}
                      </td>
                      <td className="mono">{p.qty}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        ¥{fmt(p.amount)}
                      </td>
                    </tr>
                  ))}
                  {data.byProduct.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          textAlign: "center",
                          color: "var(--muted)",
                          padding: 24,
                        }}
                      >
                        データなし
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 時間帯別 */}
          {tab === "hours" && (
            <div className="card">
              <div className="cat-title">時間帯別売上</div>
              {data.byHour.length === 0 ? (
                <p
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    padding: 24,
                  }}
                >
                  データなし
                </p>
              ) : (
                data.byHour.map((h) => (
                  <div key={h.hour} style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>
                        {h.hour}:00〜{h.hour}:59
                      </span>
                      <span>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          ¥{fmt(h.amount)}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            marginLeft: 8,
                          }}
                        >
                          {h.count}件
                        </span>
                      </span>
                    </div>
                    <div className="labor-bar">
                      <div
                        className="labor-bar-fill"
                        style={{
                          width: `${(h.amount / maxHourAmount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 注文明細 */}
          {tab === "orders" && (
            <>
              {data.orders.length === 0 ? (
                <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
                  注文なし
                </div>
              ) : (
                data.orders.map((o) => (
                  <div className="card" key={o.id} style={{ padding: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--muted)",
                        }}
                      >
                        {o.created_jst.slice(11, 16)}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>
                        ¥{fmt(o.total)}
                      </span>
                    </div>
                    {o.items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          padding: "3px 0",
                          borderTop:
                            i === 0 ? "1px solid var(--line)" : "none",
                        }}
                      >
                        <span>
                          {item.name}
                          {item.qty > 1 && (
                            <span
                              style={{
                                color: "var(--muted)",
                                marginLeft: 4,
                              }}
                            >
                              ×{item.qty}
                            </span>
                          )}
                        </span>
                        <span className="mono">¥{fmt(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
