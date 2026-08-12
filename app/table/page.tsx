"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  variations: { id: string; name: string; price: number }[];
};
type OrderItem = { uid: string; name: string; qty: number; amount: number; catalog_object_id: string };
type Order = {
  id: string;
  ticket_name: string;
  state: string;
  version: number;
  total: number;
  items: OrderItem[];
};
type CartItem = { catalog_object_id: string; name: string; price: number; quantity: number; note?: string };

// Hot/Ice 選択可能なメニュー
const HOT_ICE_ITEMS = new Set([
  "コーヒー", "アメリカーノ", "カフェラテ", "ソイラテ",
  "抹茶ラテ", "チョコレートミルク", "ドリップコーヒー",
]);

// バリエーション選択が必要なメニュー
const VARIANT_ITEMS: Record<string, { label: string; value: string; color: string; bg: string }[]> = {
  "ワッフル": [
    { label: "プレーン", value: "プレーン", color: "#8B6914", bg: "#FFF8E1" },
    { label: "チョコ", value: "チョコ", color: "#5D4037", bg: "#EFEBE9" },
    { label: "抹茶", value: "抹茶", color: "#2E7D32", bg: "#E8F5E9" },
  ],
};

const TABLES = [
  // A: 壁側テーブル（上段、右から）
  { id: "A1", label: "A1", area: "A", x: 78, y: 8, w: 16, h: 14 },
  { id: "A2", label: "A2", area: "A", x: 60, y: 8, w: 16, h: 14 },
  { id: "A3", label: "A3", area: "A", x: 42, y: 8, w: 16, h: 14 },
  { id: "A4", label: "A4", area: "A", x: 24, y: 8, w: 16, h: 14 },
  // B: 右壁ソファ（右側、上から）
  { id: "B1", label: "B1", area: "B", x: 80, y: 26, w: 16, h: 12 },
  { id: "B2", label: "B2", area: "B", x: 80, y: 40, w: 16, h: 12 },
  { id: "B3", label: "B3", area: "B", x: 80, y: 54, w: 16, h: 12 },
  { id: "B4", label: "B4", area: "B", x: 80, y: 68, w: 16, h: 12 },
  // C: 中央ソファ
  { id: "C1", label: "C1", area: "C", x: 55, y: 32, w: 18, h: 12 },
  { id: "C2", label: "C2", area: "C", x: 55, y: 46, w: 18, h: 12 },
  { id: "C3", label: "C3", area: "C", x: 55, y: 60, w: 18, h: 12 },
  { id: "C4", label: "C4", area: "C", x: 55, y: 74, w: 18, h: 12 },
  // T: 畳
  { id: "T1", label: "T1", area: "T", x: 10, y: 55, w: 30, h: 22 },
];

const fmt = (n: number) => `¥${n.toLocaleString()}`;

export default function TablePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [hotIcePending, setHotIcePending] = useState<MenuItem | null>(null);
  const [variantPending, setVariantPending] = useState<MenuItem | null>(null);
  const [payMode, setPayMode] = useState(false);
  const [tendered, setTendered] = useState("");
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<{ change: number } | null>(null);

  // OPEN注文を取得
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/square/order");
      const data = await res.json();
      if (res.ok) setOrders(data.orders || []);
    } catch {}
  }, []);

  // メニュー取得
  const loadMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/square/menu");
      const data = await res.json();
      if (res.ok) setMenu(data.items || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
    loadMenu();
    const iv = setInterval(loadOrders, 10000);
    return () => clearInterval(iv);
  }, [loadOrders, loadMenu]);

  // テーブルの注文を見つける
  const orderFor = (tableId: string) =>
    orders.find((o) => o.ticket_name === tableId);

  // テーブルタップ
  const tapTable = (tableId: string) => {
    setSelected(tableId);
    setCart([]);
    setErr("");
    setMsg("");
    setPayMode(false);
    setPayResult(null);
    setTendered("");
  };

  // カートに追加
  const addToCart = (item: MenuItem, tempNote?: string) => {
    const v = item.variations[0];
    if (!v) return;
    // バリエーション選択が必要
    if (VARIANT_ITEMS[item.name] && !tempNote) {
      setVariantPending(item);
      return;
    }
    // Hot/Ice選択が必要
    if (HOT_ICE_ITEMS.has(item.name) && !tempNote) {
      setHotIcePending(item);
      return;
    }
    const note = tempNote || undefined;
    const cartKey = `${v.id}_${note || ""}`;
    setCart((prev) => {
      const exists = prev.find((c) => c.catalog_object_id === v.id && c.note === note);
      if (exists) {
        return prev.map((c) =>
          c.catalog_object_id === v.id && c.note === note ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { catalog_object_id: v.id, name: item.name, price: v.price, quantity: 1, note }];
    });
  };

  const selectHotIce = (choice: "Hot" | "Ice") => {
    if (hotIcePending) {
      addToCart(hotIcePending, choice);
      setHotIcePending(null);
    }
  };

  const selectVariant = (choice: string) => {
    if (variantPending) {
      addToCart(variantPending, choice);
      setVariantPending(null);
    }
  };

  // カートから削除
  const removeFromCart = (catalogId: string, note?: string) => {
    setCart((prev) => {
      const item = prev.find((c) => c.catalog_object_id === catalogId && c.note === note);
      if (item && item.quantity > 1) {
        return prev.map((c) =>
          c.catalog_object_id === catalogId && c.note === note ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      return prev.filter((c) => !(c.catalog_object_id === catalogId && c.note === note));
    });
  };

  // 注文送信
  const submitOrder = async () => {
    if (!selected || !cart.length) return;
    setSending(true);
    setErr("");
    setMsg("");
    try {
      const existing = orderFor(selected);
      const items = cart.map((c) => ({
        catalog_object_id: c.catalog_object_id,
        quantity: c.quantity,
        note: c.note || undefined,
      }));

      let res;
      if (existing) {
        // 追加注文
        res = await fetch("/api/square/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: existing.id,
            items,
            version: existing.version,
          }),
        });
      } else {
        // 新規注文
        res = await fetch("/api/square/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: selected, items }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送信失敗");

      setMsg(existing ? "追加注文を送りました" : "注文を送りました");
      setCart([]);
      await loadOrders();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const currentOrder = selected ? orderFor(selected) : null;

  return (
    <div className="wrap">
      <header>
        <h1>🪑 テーブルマップ</h1>
        <p>テーブルをタップして注文</p>
      </header>
      <Nav />

      {/* フロアマップ */}
      <div className="card" style={{ padding: 12, position: "relative", aspectRatio: "1.1", overflow: "hidden" }}>
        {/* キッチン */}
        <div style={{
          position: "absolute", left: "2%", top: "2%", width: "20%", height: "40%",
          background: "#f0ede8", borderRadius: 8, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 12, color: "var(--muted)", border: "1px dashed var(--line)",
        }}>
          🍳 キッチン
        </div>

        {/* 入口 */}
        <div style={{
          position: "absolute", left: "38%", bottom: "1%", fontSize: 11, color: "var(--muted)",
          textAlign: "center",
        }}>
          ▲ 入口
        </div>

        {/* レジ */}
        <div style={{
          position: "absolute", left: "5%", bottom: "2%", fontSize: 11, color: "var(--muted)",
        }}>
          💰 レジ
        </div>

        {/* テーブル */}
        {TABLES.map((t) => {
          const order = orderFor(t.id);
          const isSelected = selected === t.id;
          const isOccupied = !!order;
          return (
            <button
              key={t.id}
              onClick={() => tapTable(t.id)}
              style={{
                position: "absolute",
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${t.w}%`,
                height: `${t.h}%`,
                borderRadius: 10,
                border: isSelected ? "3px solid var(--accent)" : "2px solid var(--line)",
                background: isOccupied ? "var(--accent)" : "var(--card)",
                color: isOccupied ? "#fff" : "var(--ink)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                fontSize: 14,
                fontWeight: 700,
                transition: "all 0.15s",
                boxShadow: isSelected ? "0 0 0 2px var(--accent-weak)" : "none",
              }}
            >
              {t.label}
              {isOccupied && (
                <span style={{ fontSize: 10, fontWeight: 500, marginTop: 2 }}>
                  {fmt(order.total)}
                </span>
              )}
            </button>
          );
        })}

        {/* エリアラベル */}
        <div style={{ position: "absolute", left: "24%", top: "2%", fontSize: 10, color: "var(--muted)" }}>
          A 壁側テーブル
        </div>
        <div style={{ position: "absolute", right: "2%", top: "24%", fontSize: 10, color: "var(--muted)", writingMode: "vertical-rl" }}>
          B ソファ
        </div>
        <div style={{ position: "absolute", left: "56%", top: "26%", fontSize: 10, color: "var(--muted)" }}>
          C 中央
        </div>
        <div style={{ position: "absolute", left: "10%", top: "50%", fontSize: 10, color: "var(--muted)" }}>
          T 畳
        </div>
      </div>

      {/* 凡例 */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, border: "2px solid var(--line)", background: "var(--card)", verticalAlign: "middle", marginRight: 4 }} />
          空席
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: "var(--accent)", verticalAlign: "middle", marginRight: 4 }} />
          注文中
        </span>
      </div>

      {/* 選択中のテーブル */}
      {selected && (
        <>
          {/* 現在の注文 */}
          {currentOrder && (
            <div className="card">
              <div className="cat-title">{selected} の注文中</div>
              {currentOrder.items.map((item, i) => (
                <div key={i} className="result-row">
                  <span>
                    {item.name}
                    {item.qty > 1 && <span style={{ color: "var(--muted)", marginLeft: 4 }}>×{item.qty}</span>}
                  </span>
                  <span className="mono" style={{ fontWeight: 700 }}>{fmt(item.amount)}</span>
                </div>
              ))}
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--line)" }}>
                合計 {fmt(currentOrder.total)}
              </div>

              {/* 会計ボタン */}
              {!payMode && !payResult && (
                <button
                  onClick={() => { setPayMode(true); setTendered(""); }}
                  style={{
                    width: "100%", marginTop: 12, padding: "14px 0", borderRadius: 10,
                    background: "var(--ok)", color: "#fff", fontSize: 16, fontWeight: 700,
                    border: "none", cursor: "pointer",
                  }}
                >
                  💰 会計する（{fmt(currentOrder.total)}）
                </button>
              )}

              {/* 決済フロー */}
              {payMode && !payResult && (
                <div style={{ marginTop: 12, borderTop: "2px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ textAlign: "center", fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    {fmt(currentOrder.total)}
                  </div>
                  <label>お預かり金額</label>
                  <input
                    type="number"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={String(currentOrder.total)}
                    style={{ textAlign: "right", fontSize: 20, fontWeight: 700 }}
                    autoFocus
                  />
                  {tendered && Number(tendered) >= currentOrder.total && (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                      お釣り: {fmt(Number(tendered) - currentOrder.total)}
                    </div>
                  )}
                  {tendered && Number(tendered) < currentOrder.total && (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#c0392b" }}>
                      金額が不足しています
                    </div>
                  )}
                  {/* よく使う金額ボタン */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {[currentOrder.total, 500, 1000, 2000, 3000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTendered(String(amt))}
                        style={{
                          flex: "1 1 calc(25% - 6px)", padding: "8px 0", borderRadius: 8,
                          border: "1px solid var(--line)", background: "var(--card)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {amt === currentOrder.total ? "ぴったり" : `¥${amt.toLocaleString()}`}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button
                      className="ghost"
                      onClick={() => setPayMode(false)}
                      style={{ flex: 1 }}
                    >
                      キャンセル
                    </button>
                    <button
                      disabled={paying || !tendered || Number(tendered) < currentOrder.total}
                      onClick={async () => {
                        setPaying(true);
                        setErr("");
                        try {
                          const res = await fetch("/api/square/pay", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              order_id: currentOrder.id,
                              amount: currentOrder.total,
                              tendered: Number(tendered),
                            }),
                          });
                          const d = await res.json();
                          if (!res.ok) throw new Error(d.error || "決済失敗");
                          setPayResult({ change: d.payment.change });
                          setPayMode(false);
                          await loadOrders();
                        } catch (e: any) {
                          setErr(e.message);
                        } finally {
                          setPaying(false);
                        }
                      }}
                      style={{
                        flex: 2, padding: "14px 0", borderRadius: 10,
                        background: (!tendered || Number(tendered) < currentOrder.total) ? "#cbb9a8" : "var(--ok)",
                        color: "#fff", fontSize: 16, fontWeight: 700,
                        border: "none", cursor: "pointer",
                      }}
                    >
                      {paying ? "処理中..." : "現金で決済"}
                    </button>
                  </div>
                  {err && <p className="err">{err}</p>}
                </div>
              )}

              {/* 決済完了 */}
              {payResult && (
                <div style={{ marginTop: 12, borderTop: "2px solid var(--line)", paddingTop: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ok)", marginBottom: 4 }}>
                    会計完了
                  </div>
                  {payResult.change > 0 && (
                    <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>
                      お釣り: {fmt(payResult.change)}
                    </div>
                  )}
                  <button
                    className="primary"
                    onClick={() => {
                      setPayResult(null);
                      setSelected(null);
                      setCart([]);
                    }}
                    style={{ marginTop: 16 }}
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          )}

          {/* メニュー選択（カテゴリ別） */}
          {(() => {
            // カテゴリ名ベースのフォールバック分類
            const FALLBACK: Record<string, string> = {};
            const HOTSAND_NAMES = ["ガーデンメルト","クラシックメルト"];
            const FOOD_NAMES = ["マッシュポテト","マッシュポテトの生ハム包み","ブルーチーズと生ハム盛り合わせ","Wabi-Sabi Shrimp","バジルソーセージとザワークラウト","オリーブ・ザワークラウト・マッシュポテトの3種盛り","アヒージョ 自家製パンを添えて"];
            const ALCOHOL_NAMES = ["ハイボール","ジンジャーハイボール","コークハイ","ジントニック","ジンバック","レモンサワー","ライムサワー","グレープフルーツサワー","アペロールマルガリータ","ココナッツベリークラウド","マイアミサンセット","エスプレッソマティーニ","梅酒モヒート","サッポロラガー（中瓶）","ハイネケン","バドワイザー","コロナ","カルピスサワー","紅茶サワー","ジンハイボール","梅サワー","ワイン（グラス）","ワイン（ボトル）","緑茶ハイ","ウーロンハイ","紅茶ハイ","ジャスミンハイ","飲み放題＋ウェルカムビール1杯"];
            const CAFE_NAMES = ["コーヒー","エスプレッソ","アメリカーノ","コールドブリュー","カフェラテ","ソイラテ","オーツラテ（Ice/Hot）","抹茶ラテ","ドリップコーヒー","チョコレートミルク","プロテインスムージー"];
            const DESSERT_NAMES = ["アフォガート","ワッフル"];
            const SOFT_NAMES = ["オレンジジュース","アップルジュース","パイナップルジュース","グアバジュース","アイスティー","ウーロン茶","緑茶","コカ・コーラ","ジンジャーエール","梅ライムソーダ","ゆずレモネード","ソーダ","飲み放題（ソフトドリンクのみ）"];
            HOTSAND_NAMES.forEach(n => FALLBACK[n] = "🥪 ホットサンド");
            FOOD_NAMES.forEach(n => FALLBACK[n] = "🍽️ フード");
            ALCOHOL_NAMES.forEach(n => FALLBACK[n] = "🍺 アルコール");
            CAFE_NAMES.forEach(n => FALLBACK[n] = "☕ カフェドリンク");
            DESSERT_NAMES.forEach(n => FALLBACK[n] = "🍰 デザート");
            SOFT_NAMES.forEach(n => FALLBACK[n] = "🥤 ソフトドリンク");

            const validItems = menu.filter(item => {
              const v = item.variations[0];
              return v && v.price != null;
            });

            // カテゴリ分類
            const grouped: Record<string, MenuItem[]> = {};
            const CAT_ORDER = ["🥪 ホットサンド", "🍽️ フード", "☕ カフェドリンク", "🥤 ソフトドリンク", "🍺 アルコール", "🍰 デザート", "その他"];
            for (const item of validItems) {
              const cat = item.category || FALLBACK[item.name] || "その他";
              if (!grouped[cat]) grouped[cat] = [];
              grouped[cat].push(item);
            }

            // 順序付きカテゴリリスト
            const cats = CAT_ORDER.filter(c => grouped[c]);
            // CAT_ORDERに無いカテゴリも追加
            for (const c of Object.keys(grouped)) {
              if (!cats.includes(c)) cats.push(c);
            }

            return cats.map(cat => (
              <div className="card" key={cat}>
                <div className="cat-title">
                  {cat}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {grouped[cat].map((item) => {
                    const v = item.variations[0];
                    const totalInCart = cart.filter((c) => c.catalog_object_id === v.id).reduce((s, c) => s + c.quantity, 0);
                    const hasHotIce = HOT_ICE_ITEMS.has(item.name);
                    const hasVariant = !!VARIANT_ITEMS[item.name];
                    return (
                      <button
                        key={item.id}
                        onClick={() => addToCart(item)}
                        style={{
                          flex: "1 1 calc(50% - 4px)",
                          minWidth: 0,
                          padding: "10px 8px",
                          borderRadius: 10,
                          border: totalInCart ? "2px solid var(--accent)" : "1px solid var(--line)",
                          background: totalInCart ? "var(--accent-weak)" : "var(--card)",
                          textAlign: "left",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          position: "relative",
                        }}
                      >
                        <div style={{ marginBottom: 2 }}>
                          {item.name}
                          {hasHotIce && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>H/I</span>}
                          {hasVariant && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>味選択</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(v.price)}</div>
                        {totalInCart > 0 && (
                          <span style={{
                            position: "absolute", top: -6, right: -6,
                            background: "var(--accent)", color: "#fff",
                            borderRadius: "50%", width: 22, height: 22,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {totalInCart}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {/* バリエーション選択 */}
          {variantPending && VARIANT_ITEMS[variantPending.name] && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }} onClick={() => setVariantPending(null)}>
              <div className="card" style={{ width: 300, margin: 0 }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                  {variantPending.name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {VARIANT_ITEMS[variantPending.name].map((v) => (
                    <button
                      key={v.value}
                      onClick={() => selectVariant(v.value)}
                      style={{
                        padding: "12px 0", borderRadius: 10,
                        border: `2px solid ${v.color}`, background: v.bg,
                        color: v.color, fontSize: 15, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Hot/Ice選択 */}
          {hotIcePending && (
            <div style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            }} onClick={() => setHotIcePending(null)}>
              <div className="card" style={{ width: 280, margin: 0 }} onClick={e => e.stopPropagation()}>
                <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                  {hotIcePending.name}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => selectHotIce("Hot")}
                    style={{
                      flex: 1, padding: "14px 0", borderRadius: 10,
                      border: "2px solid #c0392b", background: "#fde8e8",
                      color: "#c0392b", fontSize: 16, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    🔥 Hot
                  </button>
                  <button
                    onClick={() => selectHotIce("Ice")}
                    style={{
                      flex: 1, padding: "14px 0", borderRadius: 10,
                      border: "2px solid #2980b9", background: "#e8f4fd",
                      color: "#2980b9", fontSize: 16, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    🧊 Ice
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* カート */}
          {cart.length > 0 && (
            <div className="card" style={{ position: "sticky", bottom: 16 }}>
              {cart.map((c, idx) => (
                <div key={`${c.catalog_object_id}_${c.note || ""}`} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", fontSize: 14,
                }}>
                  <span>
                    {c.name}
                    {c.note && <span style={{
                      fontSize: 11, marginLeft: 4, padding: "1px 6px", borderRadius: 4,
                      background: c.note === "Hot" ? "#fde8e8" : "#e8f4fd",
                      color: c.note === "Hot" ? "#c0392b" : "#2980b9",
                    }}>{c.note}</span>}
                    {" "}×{c.quantity}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.price * c.quantity)}</span>
                    <button
                      onClick={() => removeFromCart(c.catalog_object_id, c.note)}
                      style={{
                        width: 28, height: 28, borderRadius: 8, fontSize: 16,
                        border: "1px solid var(--line)", background: "#fff", color: "#c0392b",
                        padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      −
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, marginTop: 6, paddingTop: 8, borderTop: "2px solid var(--line)" }}>
                {fmt(cartTotal)}
              </div>
              {err && <p className="err">{err}</p>}
              {msg && <p className="saved">{msg}</p>}
              <button
                className="primary"
                onClick={submitOrder}
                disabled={sending}
                style={{ marginTop: 10 }}
              >
                {sending ? (
                  <><span className="spinner" />送信中...</>
                ) : currentOrder ? (
                  `追加注文を送る（${fmt(cartTotal)}）`
                ) : (
                  `注文を送る（${fmt(cartTotal)}）`
                )}
              </button>
            </div>
          )}

          {/* 閉じるボタン */}
          <button
            className="ghost"
            onClick={() => { setSelected(null); setCart([]); setErr(""); setMsg(""); }}
            style={{ width: "100%", textAlign: "center", marginBottom: 24 }}
          >
            テーブル選択に戻る
          </button>
        </>
      )}
    </div>
  );
}
