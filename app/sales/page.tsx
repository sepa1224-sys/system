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
type CashClose = {
  date: string; floatCash: number; cashSales: number; cashOut: number;
  expected: number; counted: number; diff: number; note?: string; closedAt: string;
};

type SalesData = {
  summary: {
    totalSales: number; totalTax: number; orderCount: number;
    cashTotal?: number; untendered?: number;
  };
  byTender?: Record<string, { count: number; amount: number }>;
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
  // レジ締め。釣銭準備金と実際に数えた金額を入れて過不足を出す。
  const [floatCash, setFloatCash] = useState("30000");
  const [countedCash, setCountedCash] = useState("");
  const [cashOut, setCashOut] = useState("0");
  const [closeNote, setCloseNote] = useState("");
  const [closes, setCloses] = useState<CashClose[]>([]);
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState("");

  const loadCloses = useCallback(async () => {
    try {
      const r = await fetch("/api/cash-close");
      const d = await r.json();
      setCloses(d.closes || []);
    } catch { /* 履歴が取れなくても締め自体はできる */ }
  }, []);
  useEffect(() => { loadCloses(); }, [loadCloses]);

  // 同じ営業日の締めがあれば入力欄に復元する（締め直し用）
  useEffect(() => {
    const hit = closes.find((c) => c.date === date);
    if (hit) {
      setFloatCash(String(hit.floatCash));
      setCashOut(String(hit.cashOut));
      setCountedCash(String(hit.counted));
      setCloseNote(hit.note || "");
    }
  }, [closes, date]);
  const [tab, setTab] = useState<"summary" | "close" | "products" | "hours" | "orders">(
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
                ["close", "レジ締め"],
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

          {/* レジ締め */}
          {tab === "close" && (() => {
            const cash = data.summary.cashTotal ?? 0;
            const fl = Number(floatCash) || 0;
            const out = Number(cashOut) || 0;
            const should = fl + cash - out;
            const counted = Number(countedCash) || 0;
            const diff = countedCash === "" ? null : counted - should;
            return (
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 10 }}>💰 レジ締め（{date}）</div>

                <label>釣銭準備金（開始時）</label>
                <input type="number" value={floatCash} onChange={(e) => setFloatCash(e.target.value)}
                  style={{ textAlign: "right", fontSize: 18 }} />

                <label style={{ marginTop: 10 }}>レジから払った現金支出</label>
                <input type="number" value={cashOut} onChange={(e) => setCashOut(e.target.value)}
                  style={{ textAlign: "right", fontSize: 18 }} />

                <div style={{ margin: "14px 0", padding: "12px 14px", borderRadius: 10, background: "var(--card)", border: "1px solid var(--line)" }}>
                  {[
                    ["釣銭準備金", fl, ""],
                    ["＋ 現金売上", cash, `${data.byTender?.["現金"]?.count ?? 0}件`],
                    ["－ 現金支出", -out, ""],
                  ].map(([l, v, note]) => (
                    <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                      <span>{l}{note ? <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 12 }}>{note}</span> : null}</span>
                      <span className="mono">¥{fmt(Math.abs(Number(v)))}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 6, borderTop: "2px solid var(--line)", fontWeight: 700, fontSize: 16 }}>
                    <span>あるべき金額</span><span className="mono">¥{fmt(should)}</span>
                  </div>
                </div>

                <label>実際に数えた金額</label>
                <input type="number" value={countedCash} onChange={(e) => setCountedCash(e.target.value)}
                  placeholder={String(should)} style={{ textAlign: "right", fontSize: 22, fontWeight: 700 }} />

                {diff !== null && (
                  <div style={{
                    marginTop: 12, padding: "14px 0", borderRadius: 10, textAlign: "center",
                    background: diff === 0 ? "#eaf6ec" : "#fdeceb",
                    color: diff === 0 ? "var(--ok)" : "#c0392b", fontSize: 20, fontWeight: 800,
                  }}>
                    {diff === 0 ? "✅ 一致" : `${diff > 0 ? "＋" : "−"}¥${fmt(Math.abs(diff))} ${diff > 0 ? "過剰" : "不足"}`}
                  </div>
                )}

                <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>支払方法別</div>
                  {Object.entries(data.byTender || {}).sort((a, b) => b[1].amount - a[1].amount).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 14 }}>
                      <span>{k} <span style={{ color: "var(--muted)", fontSize: 12 }}>{v.count}件</span></span>
                      <span className="mono">¥{fmt(v.amount)}</span>
                    </div>
                  ))}
                </div>

                <label style={{ marginTop: 12 }}>メモ（差異の理由など）</label>
                <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="例：原因不明の過剰" />

                <button
                  className="primary"
                  style={{ width: "100%", marginTop: 12 }}
                  disabled={closing || countedCash === ""}
                  onClick={async () => {
                    setClosing(true); setCloseMsg("");
                    try {
                      const r = await fetch("/api/cash-close", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          date, floatCash: fl, cashSales: cash, cashOut: out,
                          counted, note: closeNote,
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error || "保存に失敗");
                      setCloseMsg("✅ 締めを保存しました");
                      await loadCloses();
                    } catch (e) {
                      setCloseMsg(e instanceof Error ? e.message : "保存に失敗");
                    } finally { setClosing(false); }
                  }}
                >
                  {closing ? "保存中..." : closes.some((c) => c.date === date) ? "この内容で締め直す" : "レジを締める"}
                </button>
                {closeMsg && <p className="hint" style={{ textAlign: "center" }}>{closeMsg}</p>}

                {closes.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>締めの履歴</div>
                    {closes.slice(0, 10).map((c) => (
                      <div key={c.date} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid var(--line)" }}>
                        <span>{c.date}</span>
                        <span className="mono">現金¥{fmt(c.cashSales)}</span>
                        <span className="mono" style={{ color: c.diff === 0 ? "var(--ok)" : "#c0392b", fontWeight: 700 }}>
                          {c.diff === 0 ? "一致" : `${c.diff > 0 ? "＋" : "−"}¥${fmt(Math.abs(c.diff))}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="hint" style={{ marginTop: 12 }}>
                  ※Squareの「現金管理（ドロワー）」はPOSアプリで打った分しか数えません。
                  このアプリからの現金会計は売上には入りますがドロワーには入らないため、こちらで締めてください。
                </p>
              </div>
            );
          })()}

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
