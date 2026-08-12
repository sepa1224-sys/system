"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type OrderItem = { uid: string; name: string; qty: number; amount: number; note?: string };
type Order = {
  id: string;
  ticket_name: string;
  state: string;
  created_at: string;
  total: number;
  items: OrderItem[];
};

// KDS用のアイテム（注文単位ではなくアイテム単位で管理）
type KdsItem = {
  key: string; // order_id + item_uid
  orderId: string;
  table: string;
  name: string;
  qty: number;
  note?: string;
  receivedAt: number; // timestamp
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [inProgress, setInProgress] = useState<KdsItem[]>([]);
  const [done, setDone] = useState<KdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevKeysRef = useRef<Set<string>>(new Set());

  // 通知音（Audio要素を使い回す — iOS対応）
  const initAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio("/ping.wav");
      audioRef.current.load();
    }
  };

  const playSound = () => {
    try {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  };

  // 注文取得
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/square/order");
      const data = await res.json();
      if (res.ok) {
        const newOrders: Order[] = data.orders || [];
        setOrders(newOrders);

        // 新しいアイテムをin progressに追加
        const newKeys = new Set<string>();
        const newItems: KdsItem[] = [];
        for (const o of newOrders) {
          for (const item of o.items) {
            const key = `${o.id}_${item.uid}`;
            newKeys.add(key);
            if (!prevKeysRef.current.has(key)) {
              newItems.push({
                key,
                orderId: o.id,
                table: o.ticket_name || "?",
                name: item.name,
                qty: item.qty,
                note: item.note,
                receivedAt: new Date(o.created_at).getTime(),
              });
            }
          }
        }

        if (newItems.length > 0) {
          const shouldSound = soundEnabledRef.current && prevKeysRef.current.size > 0;
          setInProgress((prev) => {
            const existingKeys = new Set(prev.map((i) => i.key));
            const doneKeys = new Set(done.map((i) => i.key));
            const toAdd = newItems.filter((i) => !existingKeys.has(i.key) && !doneKeys.has(i.key));
            if (toAdd.length > 0 && shouldSound) {
              // 画面反映と同時に少し遅らせて鳴らす
              setTimeout(() => playSound(), 300);
            }
            return [...prev, ...toAdd];
          });
        }

        // 注文から消えたアイテム（キャンセル・削除）をKDSからも除去
        setInProgress((prev) => prev.filter((i) => newKeys.has(i.key)));
        setDone((prev) => prev.filter((i) => newKeys.has(i.key)));

        prevKeysRef.current = newKeys;
        setErr("");
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 6000);
    return () => clearInterval(iv);
  }, [load]);

  // 毎秒タイマー更新
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // 完了済みから消えたOrder（会計済み）のアイテムを自動クリーンアップ
  useEffect(() => {
    const activeOrderIds = new Set(orders.map((o) => o.id));
    setDone((prev) => prev.filter((i) => activeOrderIds.has(i.orderId) || Date.now() - i.receivedAt < 3600000));
  }, [orders]);

  // タップで完了
  const markDone = (key: string) => {
    setInProgress((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item) {
        setDone((d) => [{ ...item, receivedAt: item.receivedAt }, ...d]);
      }
      return prev.filter((i) => i.key !== key);
    });
  };

  // 完了済みからin progressに戻す
  const markUndo = (key: string) => {
    setDone((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item) {
        setInProgress((ip) => [...ip, item]);
      }
      return prev.filter((i) => i.key !== key);
    });
  };

  // 経過時間表示（秒）
  const timerStr = (receivedAt: number) => {
    const secs = Math.floor((now - receivedAt) / 1000);
    if (secs < 60) return `${secs}秒`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}:${String(remSecs).padStart(2, "0")}`;
  };

  // タイマー色
  const timerColor = (receivedAt: number) => {
    const secs = Math.floor((now - receivedAt) / 1000);
    if (secs < 120) return "#4CAF50"; // 緑: 2分未満
    if (secs < 300) return "#FF9800"; // オレンジ: 5分未満
    return "#f44336"; // 赤: 5分以上
  };

  // テーブルごとにグループ化
  const groupByTable = (items: KdsItem[]) => {
    const map: Record<string, KdsItem[]> = {};
    for (const item of items) {
      if (!map[item.table]) map[item.table] = [];
      map[item.table].push(item);
    }
    return Object.entries(map).sort((a, b) => {
      const aMin = Math.min(...a[1].map((i) => i.receivedAt));
      const bMin = Math.min(...b[1].map((i) => i.receivedAt));
      return aMin - bMin;
    });
  };

  const grouped = groupByTable(inProgress);

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
            {inProgress.length}件 調理中
            {done.length > 0 && ` ・ ${done.length}件 完了`}
            {loading && " ・ 更新中..."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundEnabledRef.current = next;
              if (next) {
                initAudio(); // ユーザータップでAudioContextを初期化
                playSound();
              }
            }}
            style={{
              background: soundEnabled ? "#2e7d32" : "#444",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {soundEnabled ? "🔔 ON" : "🔕 OFF"}
          </button>
          <button
            onClick={load}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
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
      {!loading && inProgress.length === 0 && done.length === 0 && (
        <div style={{
          textAlign: "center",
          color: "#666",
          fontSize: 18,
          marginTop: "30vh",
        }}>
          注文はありません
          <br />
          <span style={{ fontSize: 13 }}>6秒ごとに自動更新中...</span>
        </div>
      )}

      {/* In Progress: テーブルごと */}
      {grouped.map(([table, items]) => (
        <div key={table} style={{ marginBottom: 16 }}>
          {/* テーブルヘッダー */}
          <div style={{
            background: "#2a2a2a",
            borderRadius: "12px 12px 0 0",
            padding: "10px 16px",
            borderBottom: "2px solid #b5651d",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#b5651d" }}>
              {table}
            </span>
            <span style={{ fontSize: 12, color: "#888" }}>
              {items.length}品
            </span>
          </div>

          {/* アイテムリスト */}
          {items.sort((a, b) => a.receivedAt - b.receivedAt).map((item) => (
            <div
              key={item.key}
              onClick={() => markDone(item.key)}
              style={{
                background: "#2a2a2a",
                borderBottom: "1px solid #333",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "#3a3a3a";
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "#2a2a2a";
              }}
            >
              <div>
                <span style={{ fontSize: 18, fontWeight: 700 }}>
                  {item.name}
                </span>
                {item.qty > 1 && (
                  <span style={{
                    marginLeft: 8,
                    background: "#b5651d",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "1px 8px",
                    fontWeight: 800,
                    fontSize: 16,
                  }}>
                    ×{item.qty}
                  </span>
                )}
                {item.note && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 13,
                    color: "#aaa",
                    background: "#333",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}>
                    {item.note}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 20,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                color: timerColor(item.receivedAt),
                minWidth: 60,
                textAlign: "right",
              }}>
                {timerStr(item.receivedAt)}
              </span>
            </div>
          ))}

          {/* テーブル下部の角丸 */}
          <div style={{
            background: "#2a2a2a",
            borderRadius: "0 0 12px 12px",
            height: 4,
          }} />
        </div>
      ))}

      {/* 完了済みリスト */}
      {done.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#888",
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: "1px solid #333",
          }}>
            ✅ 完了済み（タップで戻す）
          </div>
          {done.map((item) => (
              <div
                key={item.key}
                onClick={() => markUndo(item.key)}
                style={{
                  background: "#222",
                  borderBottom: "1px solid #2a2a2a",
                  padding: "10px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  opacity: 0.6,
                }}
              >
                <div>
                  <span style={{
                    fontSize: 12,
                    color: "#b5651d",
                    fontWeight: 700,
                    marginRight: 8,
                  }}>
                    {item.table}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, textDecoration: "line-through" }}>
                    {item.name}
                  </span>
                  {item.qty > 1 && (
                    <span style={{ marginLeft: 6, fontSize: 13, color: "#666" }}>×{item.qty}</span>
                  )}
                  {item.note && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: "#555" }}>{item.note}</span>
                  )}
                </div>
                <span style={{
                  fontSize: 12,
                  color: "#555",
                  background: "#2a2a2a",
                  padding: "2px 8px",
                  borderRadius: 4,
                }}>
                  戻す
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
