"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// ─── 型 ───

type InventoryItem = {
  id: number;
  name: string;
  brand: string;
  category: string;
  unit: string;
  capacity: number;
  price: number;
  supplier: string;
  url: string;
  note: string;
  addedDate: string;
};

// ─── メインページ ───

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // fallback: empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const categories = [...new Set(items.map((i) => i.category))].sort();
  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);

  const totalItems = items.length;
  const categoryCount = categories.length;
  const totalValue = items.reduce((s, i) => s + i.price, 0);

  // 単価計算（1単位あたり）
  const unitPrice = (item: InventoryItem) => {
    if (!item.capacity || !item.price) return 0;
    return Math.round((item.price / item.capacity) * 100) / 100;
  };

  return (
    <div className="wrap">
      <header>
        <h1>📦 仕入れ表</h1>
        <p>仕入れアイテムの管理・単価比較</p>
      </header>
      <Nav />

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <span
            className="spinner"
            style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }}
          />
          読み込み中…
        </div>
      ) : (
        <>
          {/* サマリーカード */}
          <div className="card">
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-val">{totalItems}</span>
                <span className="summary-label">アイテム数</span>
              </div>
              <div className="summary-item">
                <span className="summary-val" style={{ color: "var(--accent)" }}>
                  {categoryCount}
                </span>
                <span className="summary-label">カテゴリ数</span>
              </div>
              <div className="summary-item">
                <span className="summary-val" style={{ color: "var(--ok)" }}>
                  ¥{totalValue.toLocaleString()}
                </span>
                <span className="summary-label">合計仕入値</span>
              </div>
            </div>
          </div>

          {/* カテゴリフィルター */}
          <div className="sub-tabs">
            <button
              className={`sub-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              すべて
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`sub-tab ${filter === cat ? "active" : ""}`}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* テーブル */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="menu-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>商品名</th>
                    <th>ブランド</th>
                    <th>カテゴリ</th>
                    <th>容量</th>
                    <th>仕入値</th>
                    <th>単価(/1{filtered[0]?.unit ?? "単位"})</th>
                    <th>仕入先</th>
                    <th style={{ textAlign: "left" }}>備考</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const up = unitPrice(item);
                    return (
                      <tr key={item.id} className="menu-row">
                        <td style={{ textAlign: "left" }}>
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--accent)", textDecoration: "none" }}
                            >
                              {item.name}
                            </a>
                          ) : (
                            item.name
                          )}
                        </td>
                        <td className="mono muted">{item.brand || "—"}</td>
                        <td className="muted">{item.category}</td>
                        <td className="mono">
                          {item.capacity > 0
                            ? `${item.capacity.toLocaleString()}${item.unit}`
                            : "—"}
                        </td>
                        <td className="mono">
                          {item.price > 0
                            ? `¥${item.price.toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="mono">
                          {up > 0
                            ? `¥${up.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/${item.unit}`
                            : "—"}
                        </td>
                        <td className="muted">{item.supplier || "—"}</td>
                        <td
                          style={{
                            textAlign: "left",
                            fontSize: 12,
                            color: "var(--muted)",
                            maxWidth: 200,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={item.note}
                        >
                          {item.note || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
