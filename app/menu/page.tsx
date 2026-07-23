"use client";

import { useState, Fragment } from "react";
import Nav from "@/components/Nav";

// ─── データ型 ───

type Ingredient = {
  name: string;
  unit: string;
  capacity: number;
  purchasePrice: number;
  usage: number;
  cost: number;
};

type MenuItem = {
  name: string;
  cost: number;
  price: number | null;
  ingredients: Ingredient[];
  note?: string;
};

type MenuCategory = {
  category: string;
  items: MenuItem[];
};

// ─── スプレッドシートから抽出したメニューデータ ───

const menuData: MenuCategory[] = [
  {
    category: "☕ Drinks (Cafe)",
    items: [
      {
        name: "カフェラテ",
        cost: 71,
        price: 500,
        ingredients: [
          { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 200, cost: 30 },
          { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
        ],
      },
      {
        name: "エスプレッソ",
        cost: 41,
        price: 400,
        ingredients: [
          { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
          { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
        ],
      },
      {
        name: "ブレンドコーヒー (Hot/Ice)",
        cost: 41,
        price: 450,
        ingredients: [
          { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
          { name: "水", unit: "ml", capacity: 600000, purchasePrice: 4000, usage: 40, cost: 0 },
        ],
      },
    ],
  },
  {
    category: "🥤 Smoothie / Protein",
    items: [
      {
        name: "バナナプロテイン",
        cost: 148,
        price: 500,
        ingredients: [
          { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
          { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 130, cost: 20 },
        ],
      },
      {
        name: "ココアバナナプロテイン",
        cost: 160,
        price: 550,
        ingredients: [
          { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
          { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 130, cost: 20 },
          { name: "ココアパウダー", unit: "g", capacity: 1000, purchasePrice: 3980, usage: 3, cost: 12 },
        ],
      },
      {
        name: "ベリーバナナプロテイン",
        cost: 289,
        price: 650,
        ingredients: [
          { name: "プロテインパウダー", unit: "g", capacity: 1000, purchasePrice: 4539, usage: 24, cost: 109 },
          { name: "バナナ", unit: "本", capacity: 3, purchasePrice: 120, usage: 0.5, cost: 20 },
          { name: "牛乳(オーツ)", unit: "ml", capacity: 1000, purchasePrice: 1000, usage: 130, cost: 130 },
          { name: "ミックスベリー", unit: "g", capacity: 1500, purchasePrice: 2998, usage: 15, cost: 30 },
        ],
      },
    ],
  },
  {
    category: "🥪 Hot Sandwich",
    items: [
      {
        name: "ハム＆クリームチーズ",
        cost: 130,
        price: 500,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
          { name: "切り落としハム", unit: "g", capacity: 800, purchasePrice: 905, usage: 40, cost: 45 },
          { name: "クリームチーズ", unit: "g", capacity: 227, purchasePrice: 387, usage: 15, cost: 26 },
          { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 10, cost: 19 },
          { name: "ケチャップ", unit: "g", capacity: 500, purchasePrice: 198, usage: 10, cost: 4 },
          { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
        ],
      },
      {
        name: "ツナブロッコリー",
        cost: 165,
        price: 500,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 6, purchasePrice: 91, usage: 2, cost: 30 },
          { name: "ツナ", unit: "缶", capacity: 1, purchasePrice: 181, usage: 0.3, cost: 54 },
          { name: "冷凍ブロッコリー", unit: "g", capacity: 500, purchasePrice: 192, usage: 30, cost: 12 },
          { name: "マヨネーズ", unit: "g", capacity: 1000, purchasePrice: 528, usage: 15, cost: 8 },
          { name: "シュレッダーチーズ", unit: "g", capacity: 1000, purchasePrice: 1242, usage: 30, cost: 37 },
          { name: "ペストロ", unit: "g", capacity: 185, purchasePrice: 321, usage: 5, cost: 9 },
          { name: "マスタード", unit: "g", capacity: 160, purchasePrice: 308, usage: 5, cost: 10 },
          { name: "マーガリン", unit: "g", capacity: 900, purchasePrice: 478, usage: 10, cost: 5 },
        ],
      },
      {
        name: "スパムおにぎり風",
        cost: 270,
        price: 550,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
          { name: "スパム(缶)", unit: "缶", capacity: 1, purchasePrice: 800, usage: 0.25, cost: 200 },
          { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
        ],
      },
      {
        name: "定番ハムチーズ",
        cost: 170,
        price: 500,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
          { name: "ハム", unit: "枚", capacity: 10, purchasePrice: 400, usage: 2, cost: 80 },
          { name: "チーズ", unit: "g", capacity: 1000, purchasePrice: 1000, usage: 50, cost: 50 },
        ],
      },
      {
        name: "健康的ツナマヨブロッコリー",
        cost: 140,
        price: 480,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
          { name: "ツナ(缶)", unit: "缶", capacity: 3, purchasePrice: 300, usage: 0.5, cost: 50 },
          { name: "ブロッコリー(株)", unit: "株", capacity: 1, purchasePrice: 200, usage: 0.25, cost: 50 },
        ],
      },
      {
        name: "お手頃シュガーバター",
        cost: 104,
        price: 380,
        ingredients: [
          { name: "食パン", unit: "枚", capacity: 8, purchasePrice: 160, usage: 2, cost: 40 },
          { name: "バター", unit: "g", capacity: 200, purchasePrice: 600, usage: 20, cost: 60 },
          { name: "砂糖", unit: "g", capacity: 1000, purchasePrice: 400, usage: 10, cost: 4 },
        ],
      },
    ],
  },
  {
    category: "🧇 Sweets (Waffle)",
    items: [
      {
        name: "プレーンワッフル",
        cost: 34,
        price: 350,
        note: "1バッチ ¥343 → 50g×10枚",
        ingredients: [
          { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
          { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
          { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
          { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
        ],
      },
      {
        name: "チョコチップワッフル",
        cost: 36,
        price: 400,
        note: "1バッチ ¥365 → 50g×10枚",
        ingredients: [
          { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
          { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
          { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
          { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 30, cost: 10 },
          { name: "チョコチップ", unit: "g", capacity: 500, purchasePrice: 525, usage: 30, cost: 32 },
        ],
      },
      {
        name: "抹茶ワッフル",
        cost: 40,
        price: 420,
        note: "1バッチ ¥404 → 50g×10枚",
        ingredients: [
          { name: "ワッフルミックス", unit: "g", capacity: 1000, purchasePrice: 847, usage: 200, cost: 169 },
          { name: "卵", unit: "個", capacity: 10, purchasePrice: 300, usage: 1, cost: 30 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 150, usage: 120, cost: 18 },
          { name: "バター", unit: "g", capacity: 150, purchasePrice: 398, usage: 40, cost: 106 },
          { name: "ざらめ", unit: "g", capacity: 1000, purchasePrice: 332, usage: 60, cost: 20 },
          { name: "抹茶", unit: "g", capacity: 30, purchasePrice: 610, usage: 3, cost: 61 },
        ],
      },
    ],
  },
  {
    category: "🍸 Bar / Cocktail",
    items: [
      {
        name: "バーボンサンライズ",
        cost: 204,
        price: 800,
        ingredients: [
          { name: "バーボンウイスキー", unit: "ml", capacity: 700, purchasePrice: 1540, usage: 45, cost: 99 },
          { name: "ホワイトキュラソー", unit: "ml", capacity: 700, purchasePrice: 1683, usage: 20, cost: 48 },
          { name: "オレンジジュース", unit: "ml", capacity: 6000, purchasePrice: 2667, usage: 65, cost: 29 },
          { name: "グレナデンシロップ", unit: "ml", capacity: 700, purchasePrice: 1936, usage: 10, cost: 28 },
        ],
      },
      {
        name: "ベリーカクテル",
        cost: 179,
        price: 750,
        ingredients: [
          { name: "ライム果汁", unit: "ml", capacity: 1000, purchasePrice: 2019, usage: 10, cost: 20 },
          { name: "クランベリージュース", unit: "ml", capacity: 5660, purchasePrice: 2685, usage: 60, cost: 28 },
          { name: "いちご(冷凍)", unit: "g", capacity: 1000, purchasePrice: 1844, usage: 40, cost: 74 },
          { name: "炭酸水", unit: "ml", capacity: 330, purchasePrice: 156, usage: 120, cost: 57 },
        ],
      },
      {
        name: "梅酒ジンジャー",
        cost: 202,
        price: 700,
        ingredients: [
          { name: "梅酒", unit: "ml", capacity: 700, purchasePrice: 1400, usage: 30, cost: 60 },
          { name: "ジンジャーエール", unit: "ml", capacity: 9000, purchasePrice: 1277, usage: 200, cost: 28 },
          { name: "ミント", unit: "g", capacity: 20, purchasePrice: 245, usage: 2, cost: 25 },
          { name: "ライム", unit: "g", capacity: 1000, purchasePrice: 2970, usage: 30, cost: 89 },
        ],
      },
      {
        name: "エスプレッソウイスキー",
        cost: 118,
        price: 700,
        ingredients: [
          { name: "エスプレッソ豆", unit: "g", capacity: 360, purchasePrice: 860, usage: 17, cost: 41 },
          { name: "ウイスキー(JIM BEAM)", unit: "ml", capacity: 4000, purchasePrice: 6180, usage: 20, cost: 31 },
          { name: "牛乳", unit: "ml", capacity: 1000, purchasePrice: 250, usage: 150, cost: 38 },
          { name: "バニラシロップ", unit: "ml", capacity: 1400, purchasePrice: 860, usage: 15, cost: 9 },
        ],
      },
    ],
  },
];

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

function MenuListView() {
  const [openItem, setOpenItem] = useState<string | null>(null);

  const allItems = menuData.flatMap((c) => c.items);
  const withPrice = allItems.filter((i) => i.price);
  const avgCostRate =
    withPrice.reduce((s, i) => s + i.cost / i.price!, 0) / withPrice.length;
  const avgProfit =
    withPrice.reduce((s, i) => s + (i.price! - i.cost), 0) / withPrice.length;

  return (
    <>
      {/* サマリーカード */}
      <div className="card">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-val">{allItems.length}</span>
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
      {menuData.map((cat) => (
        <div key={cat.category} style={{ marginBottom: 20 }}>
          <h3 className="cat-title">{cat.category}</h3>
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
                {cat.items.map((item) => {
                  const rate = item.price ? item.cost / item.price : 0;
                  const profit = item.price ? item.price - item.cost : 0;
                  const key = `${cat.category}-${item.name}`;
                  const isOpen = openItem === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        className="menu-row"
                        onClick={() => setOpenItem(isOpen ? null : key)}
                      >
                        <td style={{ textAlign: "left" }}>
                          <span className={`arrow ${isOpen ? "open" : ""}`}>▶</span>
                          {item.name}
                          {item.note && <small className="note">{item.note}</small>}
                        </td>
                        <td className="mono">¥{item.cost.toLocaleString()}</td>
                        <td className="mono">
                          {item.price ? `¥${item.price.toLocaleString()}` : "—"}
                        </td>
                        <td>{item.price ? <CostBadge rate={rate} /> : "—"}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>
                          {item.price ? `¥${profit.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                      {isOpen && (
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
                                    ¥{item.ingredients.reduce((s, i) => s + i.cost, 0).toLocaleString()}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
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
      ))}
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

  return (
    <div className="wrap">
      <header>
        <h1>☕ flat. メニュー管理</h1>
        <p>メニューの原価・売価を管理 → Squareデータと合わせて分析</p>
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

      {tab === "list" ? <MenuListView /> : <CalcView />}
    </div>
  );
}
