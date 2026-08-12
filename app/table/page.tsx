"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type MenuItem = {
  id: string;
  name: string;
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
type CartItem = { catalog_object_id: string; name: string; price: number; quantity: number };

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
  };

  // カートに追加
  const addToCart = (item: MenuItem) => {
    const v = item.variations[0];
    if (!v) return;
    setCart((prev) => {
      const exists = prev.find((c) => c.catalog_object_id === v.id);
      if (exists) {
        return prev.map((c) =>
          c.catalog_object_id === v.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { catalog_object_id: v.id, name: item.name, price: v.price, quantity: 1 }];
    });
  };

  // カートから削除
  const removeFromCart = (catalogId: string) => {
    setCart((prev) => {
      const item = prev.find((c) => c.catalog_object_id === catalogId);
      if (item && item.quantity > 1) {
        return prev.map((c) =>
          c.catalog_object_id === catalogId ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      return prev.filter((c) => c.catalog_object_id !== catalogId);
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
            </div>
          )}

          {/* メニュー選択 */}
          <div className="card">
            <div className="cat-title">
              {selected} {currentOrder ? "に追加" : "の注文"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {menu.map((item) => {
                const v = item.variations[0];
                if (!v || v.price == null) return null;
                const inCart = cart.find((c) => c.catalog_object_id === v.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    style={{
                      flex: "1 1 calc(50% - 4px)",
                      minWidth: 0,
                      padding: "10px 8px",
                      borderRadius: 10,
                      border: inCart ? "2px solid var(--accent)" : "1px solid var(--line)",
                      background: inCart ? "var(--accent-weak)" : "var(--card)",
                      textAlign: "left",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    <div style={{ marginBottom: 2 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(v.price)}</div>
                    {inCart && (
                      <span style={{
                        position: "absolute", top: -6, right: -6,
                        background: "var(--accent)", color: "#fff",
                        borderRadius: "50%", width: 22, height: 22,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {inCart.quantity}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* カート */}
          {cart.length > 0 && (
            <div className="card" style={{ position: "sticky", bottom: 16 }}>
              {cart.map((c) => (
                <div key={c.catalog_object_id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", fontSize: 14,
                }}>
                  <span>{c.name} ×{c.quantity}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.price * c.quantity)}</span>
                    <button
                      onClick={() => removeFromCart(c.catalog_object_id)}
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
