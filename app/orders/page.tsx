"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type OrderItem = { name: string; quantity: number; price: number };

type PendingOrder = {
  id: string;
  source: string;
  orderNumber: string;
  orderDate: string;
  items: OrderItem[];
  total: number;
  subject: string;
  snippet: string;
  status: "pending" | "confirmed" | "skipped";
  account?: string;
  category?: string;
  confirmedAt?: string;
};

const ACCOUNTS = [
  "仕入高",
  "消耗品費",
  "建物附属設備",
  "備品",
  "荷造運賃",
  "雑費",
  "福利厚生費",
  "広告宣伝費",
];

const CATEGORIES = [
  "スピリッツ",
  "リキュール",
  "ビール",
  "ミキサー・炭酸",
  "ジュース・シロップ",
  "食材",
  "グラス・食器",
  "備品・消耗品",
  "内装・設備",
  "その他",
];

const SOURCE_COLORS: Record<string, string> = {
  Amazon: "#ff9900",
  ASKUL: "#0068b7",
  楽天: "#bf0000",
  カクヤス: "#2e7d32",
  リカマン: "#6a1b9a",
  モノタロウ: "#e65100",
  ヨドバシ: "#cc0033",
  その他: "#757575",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [summary, setSummary] = useState({ pending: 0, confirmed: 0, skipped: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editAccount, setEditAccount] = useState<Record<string, string>>({});
  const [editCategory, setEditCategory] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?status=${filter}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setSummary(data.summary || { pending: 0, confirmed: 0, skipped: 0, total: 0 });
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron/amazon-sync");
      const data = await res.json();
      alert(data.message || "同期完了");
      load();
    } catch {
      alert("同期エラー");
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdate = async (id: string, status: "confirmed" | "skipped") => {
    const account = editAccount[id] || "消耗品費";
    const category = editCategory[id] || "その他";
    try {
      await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, account, category }),
      });
      load();
    } catch {
      alert("更新エラー");
    }
  };

  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      return `${dt.getMonth() + 1}/${dt.getDate()}`;
    } catch { return d; }
  };

  const fmtPrice = (n: number) => `¥${n.toLocaleString()}`;

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>📬 注文管理</h1>
        <p>メールから取得した注文の確認・仕訳</p>
      </header>

      {/* サマリー */}
      <div className="summary-grid" style={{ marginBottom: 16 }}>
        <div className="summary-item" style={{ background: summary.pending > 0 ? "#fff4e0" : undefined }}>
          <span className="summary-val">{summary.pending}</span>
          <span className="summary-label">未処理</span>
        </div>
        <div className="summary-item">
          <span className="summary-val">{summary.confirmed}</span>
          <span className="summary-label">確認済</span>
        </div>
        <div className="summary-item">
          <span className="summary-val">{summary.total}</span>
          <span className="summary-label">全件</span>
        </div>
      </div>

      {/* 同期ボタン */}
      <button
        className="primary"
        onClick={handleSync}
        disabled={syncing}
        style={{ marginBottom: 16 }}
      >
        {syncing ? <><span className="spinner" />メール取得中...</> : "メールから注文を取得"}
      </button>

      {/* フィルタ */}
      <div className="sub-tabs" style={{ marginBottom: 16 }}>
        {[
          { key: "pending", label: `未処理 (${summary.pending})` },
          { key: "confirmed", label: `確認済 (${summary.confirmed})` },
          { key: "all", label: "全件" },
        ].map((f) => (
          <button
            key={f.key}
            className={`sub-tab ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 注文リスト */}
      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中...</p>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          {filter === "pending" ? "未処理の注文はありません" : "注文がありません"}
        </div>
      ) : (
        orders.map((order) => {
          const expanded = expandedId === order.id;
          return (
            <div
              key={order.id}
              className={`card meisai ${order.status === "confirmed" ? "done" : ""}`}
              style={{ padding: 0 }}
            >
              {/* ヘッダー */}
              <div
                className="meisai-head"
                onClick={() => setExpandedId(expanded ? null : order.id)}
              >
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      color: "#fff",
                      background: SOURCE_COLORS[order.source] || "#757575",
                      padding: "1px 8px",
                      borderRadius: 999,
                      marginRight: 8,
                    }}
                  >
                    {order.source}
                  </span>
                  <span className="meisai-desc">
                    {order.items.length > 1
                      ? `${order.items[0].name.slice(0, 20)}… 他${order.items.length - 1}件`
                      : order.items[0]?.name.slice(0, 30) || order.subject.slice(0, 30)}
                  </span>
                  <div className="meisai-sub">{fmtDate(order.orderDate)}</div>
                </div>
                <div className="meisai-right">
                  <div className="meisai-amt out">{fmtPrice(order.total)}</div>
                  <div className="meisai-status">
                    {order.status === "pending" && "未処理"}
                    {order.status === "confirmed" && `✓ ${order.account || ""}`}
                    {order.status === "skipped" && "スキップ"}
                  </div>
                </div>
              </div>

              {/* 展開部分 */}
              {expanded && (
                <div className="meisai-body" style={{ padding: "12px 16px 16px" }}>
                  {/* 商品一覧 */}
                  <div style={{ marginBottom: 12 }}>
                    {order.items.map((item, i) => (
                      <div key={i} className="result-row">
                        <div>
                          <div style={{ fontSize: 13 }}>{item.name.slice(0, 40)}</div>
                          {item.quantity > 1 && (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>×{item.quantity}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtPrice(item.price)}</div>
                      </div>
                    ))}
                  </div>

                  {/* 仕訳入力 */}
                  {order.status === "pending" && (
                    <>
                      <label>勘定科目</label>
                      <select
                        value={editAccount[order.id] || "消耗品費"}
                        onChange={(e) => setEditAccount({ ...editAccount, [order.id]: e.target.value })}
                      >
                        {ACCOUNTS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>

                      <label>仕入れカテゴリ</label>
                      <select
                        value={editCategory[order.id] || "その他"}
                        onChange={(e) => setEditCategory({ ...editCategory, [order.id]: e.target.value })}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>

                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button
                          className="primary"
                          style={{ flex: 2 }}
                          onClick={() => handleUpdate(order.id, "confirmed")}
                        >
                          確認・反映
                        </button>
                        <button
                          className="ghost"
                          style={{
                            flex: 1,
                            border: "1px solid var(--line)",
                            borderRadius: 10,
                          }}
                          onClick={() => handleUpdate(order.id, "skipped")}
                        >
                          スキップ
                        </button>
                      </div>
                    </>
                  )}

                  {order.status === "confirmed" && (
                    <div className="decided-box">
                      ✓ {order.account} / {order.category}
                      <br />
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>
                        {order.confirmedAt ? new Date(order.confirmedAt).toLocaleString("ja-JP") : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
