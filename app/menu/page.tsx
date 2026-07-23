"use client";

import { useState, useEffect, Fragment, useCallback } from "react";
import Nav from "@/components/Nav";

// ─── 型 ───

type Ingredient = {
  name: string;
  unit: string;
  capacity: number;
  purchasePrice: number;
  usage: number;
  cost: number;
};

type MenuItem = {
  id: string;
  name: string;
  category: string;
  cost: number;
  price: number | null;
  ingredients: Ingredient[];
  note?: string;
  updatedAt?: string;
};

// ─── サブコンポーネント ───

function CostBadge({ rate }: { rate: number }) {
  const cls = rate <= 0.25 ? "high" : rate <= 0.35 ? "medium" : "low";
  return (
    <span className={`badge ${cls}`}>
      {(rate * 100).toFixed(1)}%
    </span>
  );
}

// ─── メニュー一覧タブ ───

function MenuListView({ items }: { items: MenuItem[] }) {
  const [openItem, setOpenItem] = useState<string | null>(null);

  // カテゴリ順を固定
  const categoryOrder = [
    "☕ Drinks (Cafe)",
    "🍺 Beer",
    "🥤 Smoothie / Protein",
    "🥪 Hot Sandwich",
    "🧇 Sweets (Waffle)",
    "🍰 Sweets",
    "🍸 Bar / Cocktail",
  ];
  const categories = [...new Set(items.map((i) => i.category))].sort(
    (a, b) => {
      const ai = categoryOrder.indexOf(a);
      const bi = categoryOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    },
  );

  const withPrice = items.filter((i) => i.price);
  const avgCostRate =
    withPrice.length > 0
      ? withPrice.reduce((s, i) => s + i.cost / i.price!, 0) / withPrice.length
      : 0;
  const avgProfit =
    withPrice.length > 0
      ? withPrice.reduce((s, i) => s + (i.price! - i.cost), 0) / withPrice.length
      : 0;

  return (
    <>
      {/* サマリーカード */}
      <div className="card">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-val">{items.length}</span>
            <span className="summary-label">メニュー数</span>
          </div>
          <div className="summary-item">
            <span className="summary-val" style={{ color: "var(--ok)" }}>
              ¥{Math.round(avgProfit).toLocaleString()}
            </span>
            <span className="summary-label">平均粗利</span>
          </div>
          <div className="summary-item">
            <span className="summary-val" style={{ color: "var(--accent)" }}>
              {(avgCostRate * 100).toFixed(1)}%
            </span>
            <span className="summary-label">平均原価率</span>
          </div>
        </div>
      </div>

      {/* カテゴリ別テーブル */}
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        return (
          <div key={cat} style={{ marginBottom: 20 }}>
            <h3 className="cat-title">{cat}</h3>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="menu-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>商品</th>
                    <th>原価</th>
                    <th>売価</th>
                    <th>原価率</th>
                    <th>粗利</th>
                  </tr>
                </thead>
                <tbody>
                  {catItems.map((item) => {
                    const rate = item.price ? item.cost / item.price : 0;
                    const profit = item.price ? item.price - item.cost : 0;
                    const isOpen = openItem === item.id;
                    return (
                      <Fragment key={item.id}>
                        <tr
                          className="menu-row"
                          onClick={() => setOpenItem(isOpen ? null : item.id)}
                        >
                          <td style={{ textAlign: "left" }}>
                            <span className={`arrow ${isOpen ? "open" : ""}`}>▶</span>
                            {item.name}
                            {item.note && <small className="note">{item.note}</small>}
                          </td>
                          <td className="mono">
                            {item.cost > 0 ? `¥${item.cost.toLocaleString()}` : "—"}
                          </td>
                          <td className="mono">
                            {item.price ? `¥${item.price.toLocaleString()}` : "—"}
                          </td>
                          <td>
                            {item.price && item.cost > 0 ? (
                              <CostBadge rate={rate} />
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="mono" style={{ color: "var(--ok)" }}>
                            {item.price && item.cost > 0
                              ? `¥${profit.toLocaleString()}`
                              : "—"}
                          </td>
                        </tr>
                        {isOpen && item.ingredients.length > 0 && (
                          <tr>
                            <td colSpan={5} className="detail-cell">
                              <table className="detail-table">
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: "left" }}>材料</th>
                                    <th>内容量</th>
                                    <th>仕入値</th>
                                    <th>使用量</th>
                                    <th>原価</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.ingredients.map((ing, i) => (
                                    <tr key={i}>
                                      <td style={{ textAlign: "left" }}>{ing.name}</td>
                                      <td className="mono muted">
                                        {ing.capacity}{ing.unit}
                                      </td>
                                      <td className="mono muted">
                                        ¥{ing.purchasePrice.toLocaleString()}
                                      </td>
                                      <td className="mono muted">
                                        {ing.usage}{ing.unit}
                                      </td>
                                      <td className="mono">¥{ing.cost.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  <tr className="total-row">
                                    <td colSpan={4} style={{ textAlign: "right" }}>合計</td>
                                    <td className="mono">
                                      ¥{item.ingredients
                                        .reduce((s, i) => s + i.cost, 0)
                                        .toLocaleString()}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                              {item.updatedAt && (
                                <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
                                  最終更新: {new Date(item.updatedAt).toLocaleDateString("ja-JP")}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── 原価計算タブ ───

type CalcRow = {
  id: number;
  name: string;
  unit: string;
  capacity: string;
  purchasePrice: string;
  usage: string;
};

function CalcView() {
  const [menuName, setMenuName] = useState("");
  const [price, setPrice] = useState("");
  const [rows, setRows] = useState<CalcRow[]>([
    { id: 1, name: "", unit: "g", capacity: "", purchasePrice: "", usage: "" },
  ]);
  const [nextId, setNextId] = useState(2);

  const addRow = () => {
    setRows([
      ...rows,
      { id: nextId, name: "", unit: "g", capacity: "", purchasePrice: "", usage: "" },
    ]);
    setNextId(nextId + 1);
  };

  const removeRow = (id: number) => {
    if (rows.length > 1) setRows(rows.filter((r) => r.id !== id));
  };

  const update = (id: number, field: keyof CalcRow, value: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const rowCost = (r: CalcRow) => {
    const c = parseFloat(r.capacity);
    const p = parseFloat(r.purchasePrice);
    const u = parseFloat(r.usage);
    if (!c || !p || isNaN(u)) return 0;
    return (p / c) * u;
  };

  const totalCost = rows.reduce((s, r) => s + rowCost(r), 0);
  const sp = parseFloat(price);
  const costRate = sp ? totalCost / sp : 0;
  const profit = sp ? sp - totalCost : 0;

  return (
    <>
      <div className="card">
        <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>
          メニュー情報
        </p>
        <div className="row">
          <div>
            <label>商品名</label>
            <input
              value={menuName}
              onChange={(e) => setMenuName(e.target.value)}
              placeholder="例: チョコバナナスムージー"
            />
          </div>
          <div>
            <label>売価 (¥)</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="500"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>
          材料を入力
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="calc-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>材料名</th>
                <th>単位</th>
                <th>内容量</th>
                <th>仕入値</th>
                <th>使用量</th>
                <th>原価</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = rowCost(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        value={r.name}
                        onChange={(e) => update(r.id, "name", e.target.value)}
                        placeholder="材料名"
                        style={{ width: "100%", minWidth: 100 }}
                      />
                    </td>
                    <td>
                      <select
                        value={r.unit}
                        onChange={(e) => update(r.id, "unit", e.target.value)}
                        style={{ width: 56 }}
                      >
                        {["g", "ml", "個", "枚", "本", "缶", "袋"].map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={r.capacity}
                        onChange={(e) => update(r.id, "capacity", e.target.value)}
                        placeholder="1000"
                        style={{ width: 72, textAlign: "right" }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={r.purchasePrice}
                        onChange={(e) => update(r.id, "purchasePrice", e.target.value)}
                        placeholder="¥"
                        style={{ width: 72, textAlign: "right" }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={r.usage}
                        onChange={(e) => update(r.id, "usage", e.target.value)}
                        placeholder="使用量"
                        style={{ width: 72, textAlign: "right" }}
                      />
                    </td>
                    <td className="mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                      ¥{Math.round(cost).toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="ghost"
                        onClick={() => removeRow(r.id)}
                        style={{ padding: "4px 8px", fontSize: 13, color: "#b22" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          className="ghost"
          onClick={addRow}
          style={{ marginTop: 8, color: "var(--accent)", fontWeight: 600, fontSize: 13 }}
        >
          ＋ 材料を追加
        </button>
      </div>

      {/* 結果 */}
      <div className="card">
        <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>
          計算結果
        </p>
        <div className="result-row">
          <span>合計原価</span>
          <strong className="mono" style={{ fontSize: 18 }}>
            ¥{Math.round(totalCost).toLocaleString()}
          </strong>
        </div>
        {sp > 0 && (
          <>
            <div className="result-row">
              <span>売価</span>
              <span className="mono">¥{sp.toLocaleString()}</span>
            </div>
            <div className="result-row">
              <span>原価率</span>
              <CostBadge rate={costRate} />
            </div>
            <div className="result-row">
              <span>粗利</span>
              <strong className="mono" style={{ fontSize: 18, color: "var(--ok)" }}>
                ¥{Math.round(profit).toLocaleString()}
              </strong>
            </div>
          </>
        )}
      </div>

      {/* 売価シミュレーション */}
      {totalCost > 0 && (
        <div className="card">
          <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 14 }}>
            売価シミュレーション
          </p>
          {[
            { label: "原価率 20%", rate: 0.2 },
            { label: "原価率 25%", rate: 0.25 },
            { label: "原価率 30%", rate: 0.3 },
            { label: "原価率 35%", rate: 0.35 },
            { label: "原価率 40%", rate: 0.4 },
          ].map((s) => (
            <div key={s.label} className="result-row">
              <span className="muted">{s.label}</span>
              <span className="mono" style={{ fontWeight: 600 }}>
                ¥{(Math.ceil(totalCost / s.rate / 10) * 10).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── メインページ ───

export default function MenuPage() {
  const [tab, setTab] = useState<"list" | "calc">("list");
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
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

  return (
    <div className="wrap">
      <header>
        <h1>☕ flat. メニュー管理</h1>
        <p>メニューの原価・売価を管理 → 領収書登録で仕入値が自動更新されます</p>
      </header>
      <Nav />

      {/* サブタブ */}
      <div className="sub-tabs">
        <button
          className={`sub-tab ${tab === "list" ? "active" : ""}`}
          onClick={() => setTab("list")}
        >
          📋 メニュー一覧
        </button>
        <button
          className={`sub-tab ${tab === "calc" ? "active" : ""}`}
          onClick={() => setTab("calc")}
        >
          🧮 原価計算
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <span
            className="spinner"
            style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }}
          />
          読み込み中…
        </div>
      ) : tab === "list" ? (
        <MenuListView items={items} />
      ) : (
        <CalcView />
      )}
    </div>
  );
}
