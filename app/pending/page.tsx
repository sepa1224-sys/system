"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

const CATEGORIES = [
  "仕入高", "消耗品費", "家賃", "水道光熱費", "通信費",
  "保険料", "広告宣伝費", "修繕費", "荷造運賃", "旅費交通費",
  "交際費", "雑費", "設備（固定資産）",
];

type PendingExpense = {
  id: string;
  date: string;
  amount: number;
  vendor: string;
  source: string;
  description: string;
  payer: string;
  status: "pending" | "registered" | "skipped";
  category?: string;
  tags?: string[];
  receiptId?: string;
  registeredAt?: string;
  note?: string;
};

type FilterStatus = "pending" | "registered" | "skipped" | "all";

function payerStyle(payer: string): React.CSSProperties {
  if (payer === "坂本") return { color: "#b5651d", background: "#f3e6d8" };
  if (payer === "櫻井") return { color: "#2e7d32", background: "#e6f4ea" };
  return { color: "#555", background: "#eee" };
}

function sourceStyle(): React.CSSProperties {
  return { color: "#2c5d8a", background: "#e6eef6" };
}

export default function PendingPage() {
  const [items, setItems] = useState<PendingExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<Record<string, string>>({});
  const [editCategory, setEditCategory] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pending-expenses");
      const data = await res.json();
      setItems(data.items || []);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => `¥${n.toLocaleString()}`;

  const filtered = items.filter((e) =>
    filterStatus === "all" ? true : e.status === filterStatus,
  );

  const pendingCount = items.filter((e) => e.status === "pending").length;
  const pendingTotal = items
    .filter((e) => e.status === "pending")
    .reduce((s, e) => s + e.amount, 0);
  const totalAll = items.reduce((s, e) => s + e.amount, 0);

  async function patch(id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      await fetch("/api/pending-expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      await load();
      setExpandedId(null);
    } catch { /* */ } finally {
      setSaving(null);
    }
  }

  async function handleRegister(item: PendingExpense) {
    const category = editCategory[item.id] || item.category || "";
    const note = editNote[item.id] ?? item.note ?? "";
    await patch(item.id, { status: "registered", category, note });
  }

  async function handleSkip(item: PendingExpense) {
    const note = editNote[item.id] ?? item.note ?? "";
    await patch(item.id, { status: "skipped", note });
  }

  async function handleSaveNote(item: PendingExpense) {
    const note = editNote[item.id] ?? item.note ?? "";
    const category = editCategory[item.id] || item.category || undefined;
    await patch(item.id, { note, category });
  }

  const tabs: { key: FilterStatus; label: string }[] = [
    { key: "pending", label: "処理待ち" },
    { key: "registered", label: "登録済" },
    { key: "skipped", label: "スキップ" },
    { key: "all", label: "全件" },
  ];

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>⏳ 経理処理待ち</h1>
        <p>銀行明細等で見つかったレシートなし経費</p>
      </header>

      {/* サマリーカード */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div className="card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>処理待ち</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{pendingCount}件</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#b22", marginTop: 2 }}>
            {fmt(pendingTotal)}
          </div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>全件合計</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{items.length}件</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{fmt(totalAll)}</div>
        </div>
      </div>

      {/* フィルタタブ */}
      <div className="sub-tabs" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`sub-tab ${filterStatus === t.key ? "active" : ""}`}
            onClick={() => setFilterStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
        {filtered.length}件 / {fmt(filtered.reduce((s, e) => s + e.amount, 0))}
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--muted)", marginTop: 32 }}>
          {filterStatus === "pending" ? "処理待ちはありません" : "データなし"}
        </p>
      ) : (
        filtered.map((item) => {
          const expanded = expandedId === item.id;
          const isSaving = saving === item.id;
          const isDone = item.status !== "pending";

          return (
            <div
              key={item.id}
              className={`card meisai ${isDone ? "done" : ""}`}
              style={{ padding: 0 }}
            >
              {/* 行ヘッダー（クリックで展開） */}
              <div
                className="meisai-head"
                onClick={() => setExpandedId(expanded ? null : item.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                    {/* 立替者バッジ */}
                    <span style={{
                      display: "inline-block", fontSize: 10, fontWeight: 700,
                      padding: "1px 8px", borderRadius: 999,
                      ...payerStyle(item.payer),
                    }}>
                      {item.payer || "未設定"}
                    </span>
                    {/* ソースバッジ */}
                    {item.source && (
                      <span style={{
                        display: "inline-block", fontSize: 10,
                        padding: "1px 7px", borderRadius: 999,
                        ...sourceStyle(),
                      }}>
                        {item.source}
                      </span>
                    )}
                    <span className="meisai-desc">{item.vendor}</span>
                  </div>
                  <div className="meisai-sub">{item.date}</div>
                </div>
                <div className="meisai-right">
                  <div className="meisai-amt out">{fmt(item.amount)}</div>
                  <div className="meisai-status">
                    {item.status === "registered"
                      ? "✓ 登録済"
                      : item.status === "skipped"
                      ? "— スキップ"
                      : "処理待ち"}
                  </div>
                </div>
              </div>

              {/* 展開エリア */}
              {expanded && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--line)" }}>
                  {/* 摘要 */}
                  {item.description && (
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
                      摘要: {item.description}
                    </div>
                  )}

                  {/* 勘定科目 */}
                  <label>勘定科目</label>
                  <select
                    value={editCategory[item.id] ?? item.category ?? ""}
                    onChange={(e) =>
                      setEditCategory((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    disabled={isDone}
                  >
                    <option value="">-- 選択してください --</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  {/* メモ */}
                  <label>メモ</label>
                  <input
                    type="text"
                    placeholder="処理メモ、freeeへの備考など"
                    value={editNote[item.id] ?? item.note ?? ""}
                    onChange={(e) =>
                      setEditNote((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    disabled={isDone}
                  />

                  {/* 登録済の場合は登録日を表示 */}
                  {item.registeredAt && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                      登録日: {new Date(item.registeredAt).toLocaleDateString("ja-JP")}
                    </div>
                  )}
                  {item.receiptId && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      領収書ID: {item.receiptId}
                    </div>
                  )}

                  {/* アクションボタン */}
                  {!isDone && (
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button
                        className="primary"
                        style={{ flex: 2, fontSize: 14, padding: "10px 12px" }}
                        disabled={isSaving}
                        onClick={() => handleRegister(item)}
                      >
                        {isSaving ? "保存中..." : "✓ 登録"}
                      </button>
                      <button
                        style={{
                          flex: 1, fontSize: 13, padding: "10px 12px",
                          background: "#f0ede9", color: "var(--muted)",
                          border: "1px solid var(--line)", borderRadius: 10,
                        }}
                        disabled={isSaving}
                        onClick={() => handleSkip(item)}
                      >
                        スキップ
                      </button>
                      <button
                        style={{
                          flex: 1, fontSize: 13, padding: "10px 12px",
                          background: "#fff", color: "var(--accent)",
                          border: "1px solid var(--accent)", borderRadius: 10,
                        }}
                        disabled={isSaving}
                        onClick={() => handleSaveNote(item)}
                      >
                        保存
                      </button>
                    </div>
                  )}

                  {/* 処理済みのものはステータス変更ボタン */}
                  {isDone && (
                    <button
                      style={{
                        marginTop: 12, width: "100%", fontSize: 13,
                        background: "#f0ede9", color: "var(--muted)",
                        border: "1px solid var(--line)", borderRadius: 10,
                        padding: "9px 12px",
                      }}
                      disabled={isSaving}
                      onClick={() => patch(item.id, { status: "pending" })}
                    >
                      {isSaving ? "..." : "処理待ちに戻す"}
                    </button>
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
