"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type OrderItem = { uid: string; name: string; qty: number; amount: number };
type Order = {
  id: string;
  ticket_name: string;
  state: string;
  created_at: string;
  total: number;
  items: OrderItem[];
};

const fmt = (n: number) => `¥${n.toLocaleString()}`;

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const prevCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/square/order");
      const data = await res.json();
      if (res.ok) {
        const newOrders: Order[] = data.orders || [];
        // 新しい注文が来たら音を鳴らす
        if (soundEnabled && newOrders.length > prevCountRef.current && prevCountRef.current > 0) {
          playSound();
        }
        prevCountRef.current = newOrders.length;
        setOrders(newOrders);
        setErr("");
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000); // 8秒ごとにチェック
    return () => clearInterval(iv);
  }, [load]);

  // 通知音
  const playSound = () => {
    try {
      const ctx = new AudioContext();
      // ピンポン音を生成
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.frequency.value = 830;
      osc2.frequency.value = 1100;
      gain.gain.value = 0.3;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.15);
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 1000);
    } catch {}
  };

  // 時刻表示（JST）
  const timeStr = (iso: string) => {
    const d = new Date(iso);
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getHours()}:${String(jst.getMinutes()).padStart(2, "0")}`;
  };

  // 経過時間
  const elapsed = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "たった今";
    if (mins < 60) return `${mins}分前`;
    return `${Math.floor(mins / 60)}時間${mins % 60}分前`;
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1a1a",
      color: "#fff",
      padding: 16,
      fontFamily: "-apple-system, 'Hiragino Kaku Gothic ProN', sans-serif",
    }}>
      {/* ヘッダー */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: "1px solid #333",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>🍳 キッチン</h1>
          <span style={{ fontSize: 12, color: "#888" }}>
            {orders.length}件のオーダー
            {loading && " ・読込中..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playSound(); // テスト音
            }}
            style={{
              background: soundEnabled ? "#2e7d32" : "#444",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {soundEnabled ? "🔔 通知ON" : "🔕 通知OFF"}
          </button>
          <button
            onClick={load}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            🔄
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#e74c3c", fontSize: 14 }}>{err}</p>}

      {/* 注文なし */}
      {!loading && orders.length === 0 && (
        <div style={{
          textAlign: "center",
          color: "#666",
          fontSize: 18,
          marginTop: "30vh",
        }}>
          注文はありません
          <br />
          <span style={{ fontSize: 13 }}>8秒ごとに自動更新中...</span>
        </div>
      )}

      {/* 注文カード一覧 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 12,
      }}>
        {orders.map((o) => {
          const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
          const urgent = mins > 15;
          return (
            <div
              key={o.id}
              style={{
                background: urgent ? "#3d1f1f" : "#2a2a2a",
                border: urgent ? "2px solid #e74c3c" : "1px solid #444",
                borderRadius: 12,
                padding: 16,
                transition: "all 0.3s",
              }}
            >
              {/* テーブル名 & 時刻 */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 12,
              }}>
                <span style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: urgent ? "#e74c3c" : "#b5651d",
                }}>
                  {o.ticket_name || "不明"}
                </span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#888" }}>{timeStr(o.created_at)}</div>
                  <div style={{
                    fontSize: 11,
                    color: urgent ? "#e74c3c" : "#666",
                    fontWeight: urgent ? 700 : 400,
                  }}>
                    {elapsed(o.created_at)}
                    {urgent && " ⚠️"}
                  </div>
                </div>
              </div>

              {/* 商品リスト */}
              {o.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop: i === 0 ? "1px solid #444" : "none",
                    borderBottom: "1px solid #333",
                    fontSize: 16,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{
                    background: "#b5651d",
                    color: "#fff",
                    borderRadius: 8,
                    padding: "2px 10px",
                    fontWeight: 800,
                    fontSize: 18,
                    minWidth: 30,
                    textAlign: "center",
                  }}>
                    {item.qty}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
