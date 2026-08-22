"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type MenuItem = {
  id: string;
  name: string;
  category: string;
  variations: { id: string; name: string; price: number }[];
};
type OrderItem = { uid: string; name: string; qty: number; amount: number; catalog_object_id: string; note?: string };
type Order = {
  id: string;
  ticket_name: string;
  state: string;
  version: number;
  total: number;
  items: OrderItem[];
};
type CartItem = { catalog_object_id: string; name: string; price: number; quantity: number; note?: string };

// 注文画面に出さないメニュー。
// ソイラテ・オーツラテはSquareのカタログに独立商品として残っているが、
// 実際はカフェラテのミルク変更オプション(+50円)なので、ここで隠す。
const HIDDEN_ITEMS = new Set(["ソイラテ", "オーツラテ（Ice/Hot）"]);

// Hot/Ice 選択可能なメニュー
const HOT_ICE_ITEMS = new Set([
  "コーヒー", "アメリカーノ", "カフェラテ",
  "抹茶ラテ", "チョコレートミルク", "ドリップコーヒー",
]);

// バリエーション選択が必要なメニュー
const VARIANT_ITEMS: Record<string, { label: string; value: string; color: string; bg: string }[]> = {
  "ワッフル": [
    { label: "プレーン", value: "プレーン", color: "#8B6914", bg: "#FFF8E1" },
    { label: "チョコ", value: "チョコ", color: "#5D4037", bg: "#EFEBE9" },
    { label: "抹茶", value: "抹茶", color: "#2E7D32", bg: "#E8F5E9" },
  ],
  "プロテインスムージー": [
    { label: "チョコ", value: "チョコ", color: "#5D4037", bg: "#EFEBE9" },
    { label: "バニラ", value: "バニラ", color: "#8B6914", bg: "#FFF8E1" },
    { label: "ブルーベリー", value: "ブルーベリー", color: "#4A148C", bg: "#F3E5F5" },
  ],
};

// 仕込み在庫管理対象
const STOCK_MANAGED = new Set(["ガーデンメルト", "クラシックメルト"]);

// ソイ変更可能なラテ系（+50円）
const SOY_ITEMS = new Set([
  "カフェラテ", "抹茶ラテ", "チョコレートミルク",
]);

// 座標はキッチンから見た向き（元の配置を左に90度回転した状態）
const TABLES = [
  // A: 壁側テーブル
  { id: "A1", label: "A1", area: "A", x: 8, y: 6, w: 14, h: 16 },
  { id: "A2", label: "A2", area: "A", x: 8, y: 24, w: 14, h: 16 },
  { id: "A3", label: "A3", area: "A", x: 8, y: 42, w: 14, h: 16 },
  { id: "A4", label: "A4", area: "A", x: 8, y: 60, w: 14, h: 16 },
  // B: 右壁ソファ（右側、上から）
  { id: "B1", label: "B1", area: "B", x: 26, y: 4, w: 12, h: 16 },
  { id: "B2", label: "B2", area: "B", x: 40, y: 4, w: 12, h: 16 },
  { id: "B3", label: "B3", area: "B", x: 54, y: 4, w: 12, h: 16 },
  { id: "B4", label: "B4", area: "B", x: 68, y: 4, w: 12, h: 16 },
  // C: 中央ソファ
  { id: "C1", label: "C1", area: "C", x: 32, y: 27, w: 12, h: 18 },
  { id: "C2", label: "C2", area: "C", x: 46, y: 27, w: 12, h: 18 },
  { id: "C3", label: "C3", area: "C", x: 60, y: 27, w: 12, h: 18 },
  { id: "C4", label: "C4", area: "C", x: 74, y: 27, w: 12, h: 18 },
  // T: 畳
  { id: "T1", label: "T1", area: "T", x: 52, y: 62, w: 34, h: 20 },
];

const fmt = (n: number) => `¥${n.toLocaleString()}`;

// 時間帯で昼/夜を自動判定（JST: 6:00-18:30=昼、18:30-6:00=夜）
function autoMode(): "day" | "night" {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const h = jst.getUTCHours();
  const m = jst.getUTCMinutes();
  const mins = h * 60 + m;
  // 6:00 (360) 〜 18:30 (1110) = 昼
  return mins >= 360 && mins < 1110 ? "day" : "night";
}

// 盆踊りパーティの参加費。通常のメニューとは別扱いにして、
// パーティモードのときだけ出す。
const PARTY_NAMES = [
  "花火＋パーティ（飲み放題）",
  "花火＋パーティ（3杯）",
  "花火のみ",
  "パーティのみ（飲み放題）",
  "パーティのみ（ほろ酔い3杯）",
  "パーティのみ（ノンアル飲み放題）",
  "パーティのみ（入場のみ）",
];
const PARTY_SET = new Set(PARTY_NAMES);

export default function TablePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [mode, setMode] = useState<"day" | "night">(autoMode());
  const [selected, setSelected] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [hotIcePending, setHotIcePending] = useState<MenuItem | null>(null);
  const [variantPending, setVariantPending] = useState<MenuItem | null>(null);
  const [soyPending, setSoyPending] = useState<{ item: MenuItem; note: string } | null>(null);
  const [payMode, setPayMode] = useState(false);
  // お客さんが席を移ったときの移動先。空なら移動UIを閉じている
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [tendered, setTendered] = useState("");
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<{ change: number } | null>(null);
  const [squareAppId, setSquareAppId] = useState("");
  const [squareCallbackUrl, setSquareCallbackUrl] = useState("");
  // 夜でもテイクアウトを受けられるように、カウンター注文の画面を夜モードでも開けるようにする
  const [takeout, setTakeout] = useState(false);
  // 店内利用かテイクアウトか。伝票名になり、KDSにもこの名前で出る。
  const [orderType, setOrderType] = useState<"店内" | "テイクアウト" | "パーティ受付">("店内");
  // パーティモード：参加費だけを出す受付用の画面
  const [party, setParty] = useState(false);
  // 別会計：会計する品目のuid。空なら注文全体を会計する
  const [splitSel, setSplitSel] = useState<Set<string>>(new Set());
  // 昼モード: カウンター注文のstate
  const [dayOrderId, setDayOrderId] = useState<string | null>(null);
  const [dayVersion, setDayVersion] = useState(0);
  const [dayTotal, setDayTotal] = useState(0);
  const [dayItems, setDayItems] = useState<{ uid: string; name: string; qty: number; amount: number }[]>([]);
  // 仕込み在庫
  const [stock, setStock] = useState<Record<string, number>>({});

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
      if (res.ok) setMenu((data.items || []).filter((i: MenuItem) => !HIDDEN_ITEMS.has(i.name)));
    } catch {}
  }, []);

  // 在庫取得
  const loadStock = useCallback(async () => {
    try {
      const res = await fetch("/api/stock");
      const data = await res.json();
      if (res.ok) {
        const map: Record<string, number> = {};
        for (const item of data.items || []) map[item.name] = item.count;
        setStock(map);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
    loadMenu();
    loadStock();
    // Square App ID取得
    fetch("/api/square/config")
      .then(r => r.json())
      .then(d => {
        setSquareAppId(d.appId || "");
        setSquareCallbackUrl(d.callbackUrl || "");
      })
      .catch(() => {});
    // Square POSからのコールバック検知。
    // callback_urlはDeveloper Dashboardに登録したURLと完全一致させる必要があるため、
    // クエリに注文IDを載せられない。遷移前にsessionStorageへ退避してある。
    const params = new URLSearchParams(window.location.search);
    let cardOrderId = params.get("card_order"); // 旧形式（クエリ付きcallback_url）の互換
    let posError = "";
    if (params.has("data")) {
      try {
        const d = JSON.parse(params.get("data") || "{}") as { error_code?: string };
        if (d.error_code) posError = d.error_code;
      } catch {
        /* パースできない場合はエラー扱いしない */
      }
      if (!cardOrderId) cardOrderId = sessionStorage.getItem("card_pending_order");
    }
    if (posError) {
      setErr(`カード決済に失敗しました（${posError}）`);
      sessionStorage.removeItem("card_pending_order");
      window.history.replaceState({}, "", "/table");
    } else if (cardOrderId) {
      // Square POSで決済完了 → OPEN注文をCOMPLETEDに
      fetch("/api/square/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: cardOrderId,
          amount: 0,
          tendered: 0,
          method: "card_close",
        }),
      }).catch(() => {}).finally(() => {
        sessionStorage.removeItem("card_pending_order");
        loadOrders();
      });
      window.history.replaceState({}, "", "/table");
    }
    const iv = setInterval(loadOrders, 10000);
    return () => clearInterval(iv);
  }, [loadOrders, loadMenu]);

  // テーブルの注文を見つける
  const orderFor = (tableId: string) =>
    orders.find((o) => o.ticket_name === tableId);

  // テーブルタップ
  const tapTable = (tableId: string) => {
    setSelected(tableId);
    setSplitSel(new Set());
    setCart([]);
    setErr("");
    setMsg("");
    setPayMode(false);
    setPayResult(null);
    setTendered("");
  };

  // カートに追加
  const addToCart = (item: MenuItem, tempNote?: string) => {
    // 選んだバリエーション（チョコ/抹茶/Hot/Ice等）に対応する価格・カタログIDを使う。
    // 以前は常に variations[0] を使っていたため、チョコ・抹茶を選んでも
    // プレーンの価格(¥400)とIDで登録されていた。
    // note は "Ice/ソイ" のように連結されることがあるので includes で判定する。
    const v =
      (tempNote ? item.variations.find((x) => x.name && tempNote.includes(x.name)) : undefined) ||
      item.variations[0];
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
    // ソイ変更の場合は+50円
    const isSoy = note?.includes("ソイ");
    const price = isSoy ? v.price + 50 : v.price;
    setCart((prev) => {
      const exists = prev.find((c) => c.catalog_object_id === v.id && c.note === note);
      if (exists) {
        return prev.map((c) =>
          c.catalog_object_id === v.id && c.note === note ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { catalog_object_id: v.id, name: item.name, price, quantity: 1, note }];
    });
  };

  const selectHotIce = (choice: "Hot" | "Ice") => {
    if (hotIcePending) {
      // ソイ変更可能ならソイ選択画面へ
      if (SOY_ITEMS.has(hotIcePending.name)) {
        setSoyPending({ item: hotIcePending, note: choice });
        setHotIcePending(null);
        return;
      }
      addToCart(hotIcePending, choice);
      setHotIcePending(null);
    }
  };

  const selectSoy = (isSoy: boolean) => {
    if (soyPending) {
      const note = isSoy ? `${soyPending.note}/ソイ` : soyPending.note;
      addToCart(soyPending.item, note);
      setSoyPending(null);
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
        name: c.name, // 消費税（店内10%/持ち帰り8%・酒類10%）の判定に使う
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
      await loadStock();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  // 昼モード: カウンター注文送信 → 即会計
  const submitDayOrder = async (payMethod: "cash" | "card" | "paypay", tenderedAmt?: number) => {
    if (!cart.length) return;
    setSending(true);
    setErr("");
    setMsg("");
    try {
      const items = cart.map((c) => ({
        catalog_object_id: c.catalog_object_id,
        quantity: c.quantity,
        note: c.note || undefined,
        name: c.name, // 消費税（店内10%/持ち帰り8%・酒類10%）の判定に使う
      }));
      const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);

      // 注文作成（ticket_name: "counter"）
      const orderRes = await fetch("/api/square/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: orderType, orderType, items }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || "注文作成失敗");

      const orderId = orderData.order.id;

      if (payMethod === "card") {
        // カード: Square POSに飛ばす。
        // callback_urlは登録済みURLと完全一致が必要なのでクエリを付けず、注文IDは退避しておく。
        sessionStorage.setItem("card_pending_order", orderId);
        const posData = {
          amount_money: { amount: total, currency_code: "JPY" },
          callback_url: squareCallbackUrl || `${window.location.origin}/table`,
          client_id: squareAppId,
          version: "1.3",
          notes: orderType,
          options: { supported_tender_types: ["CREDIT_CARD"] },
        };
        const encoded = encodeURIComponent(JSON.stringify(posData));
        window.location.href = `square-commerce-v1://payment/create?data=${encoded}`;
        return;
      }

      // 現金 or PayPay: APIで決済
      const payRes = await fetch("/api/square/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          amount: total,
          tendered: tenderedAmt || total,
          method: payMethod === "paypay" ? "paypay" : undefined,
        }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData.error || "決済失敗");

      const change = payMethod === "cash" ? Math.max(0, (tenderedAmt || total) - total) : 0;
      setPayResult({ change });
      setCart([]);
      await loadStock();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  // 会計。別会計で品目が選ばれていれば、その分を新しい注文に切り出してから会計する。
  // 元注文には残りの品目が残るので、続けて次の人の会計ができる。
  const settle = async (method: "cash" | "card" | "paypay", tenderedAmt?: number) => {
    const order = selected ? orders.find((o) => o.ticket_name === selected) : null;
    if (!order) return;
    const picked = order.items.filter((i) => splitSel.has(i.uid));
    const split = picked.length > 0 && picked.length < order.items.length;
    let targetId = order.id;
    let amount = order.total;
    setPaying(true);
    setErr("");
    try {
      if (split) {
        amount = picked.reduce((sum, i) => sum + i.amount, 0);
        // 1) 選択分を新しい注文として作る
        const res = await fetch("/api/square/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: `${order.ticket_name}分`,
            items: picked.map((i) => ({
              catalog_object_id: i.catalog_object_id,
              quantity: i.qty,
              note: i.note,
              name: i.name, // 消費税の判定に使う
            })),
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "分割注文の作成に失敗");
        targetId = d.order.id;

        // 2) 元注文から選択分を外す。失敗したら作った注文を取り消して中断する
        const delRes = await fetch("/api/square/order", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            version: order.version,
            item_uids: picked.map((i) => i.uid),
          }),
        });
        if (!delRes.ok) {
          const dd = await delRes.json().catch(() => ({}));
          await fetch("/api/square/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: targetId, method: "card_close" }),
          }).catch(() => {});
          throw new Error(dd.error || "元の注文から品目を外せませんでした");
        }
      }

      if (method === "card") {
        if (!squareAppId) throw new Error("Square Application IDが未設定です");
        sessionStorage.setItem("card_pending_order", targetId);
        const posData = {
          amount_money: { amount, currency_code: "JPY" },
          callback_url: squareCallbackUrl || `${window.location.origin}/table`,
          client_id: squareAppId,
          version: "1.3",
          notes: order.ticket_name || "",
          options: { supported_tender_types: ["CREDIT_CARD"] },
        };
        window.location.href = `square-commerce-v1://payment/create?data=${encodeURIComponent(JSON.stringify(posData))}`;
        return;
      }

      const payRes = await fetch("/api/square/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: targetId,
          amount,
          tendered: tenderedAmt || amount,
          method: method === "paypay" ? "paypay" : undefined,
        }),
      });
      const pd = await payRes.json();
      if (!payRes.ok) throw new Error(pd.error || "会計に失敗");
      setPayResult({ change: pd.payment?.change ?? (tenderedAmt || amount) - amount });
      setSplitSel(new Set());
      setPayMode(false);
      setTendered("");
      await loadOrders();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPaying(false);
    }
  };

  const currentOrder = selected ? orderFor(selected) : null;
  // 別会計で選ばれている品目。1つも選ばれていなければ注文全体が対象。
  const splitItems = currentOrder ? currentOrder.items.filter((i) => splitSel.has(i.uid)) : [];
  const isSplit = splitItems.length > 0 && splitItems.length < (currentOrder?.items.length ?? 0);
  const payTargetTotal = isSplit
    ? splitItems.reduce((s, i) => s + i.amount, 0)
    : currentOrder?.total ?? 0;

  return (
    <div className="wrap">
      <header>
        <h1>🛎️ 注文</h1>
        <p>{party ? "🎆 盆踊りパーティ 受付" : mode === "day" || takeout ? `カウンター注文（${orderType}）` : "テーブル注文"}</p>
      </header>
      <Nav />

      {/* 昼/夜 切替 */}
      <div className="sub-tabs" style={{ marginBottom: 12 }}>
        <button className={`sub-tab ${mode === "day" && !party ? "active" : ""}`} onClick={() => { setMode("day"); setParty(false); setTakeout(false); setOrderType("店内"); setSelected(null); setCart([]); setPayMode(false); setPayResult(null); }}>
          ☀️ 昼（カウンター）
        </button>
        <button className={`sub-tab ${mode === "night" && !party ? "active" : ""}`} onClick={() => { setMode("night"); setParty(false); setCart([]); setPayMode(false); setPayResult(null); }}>
          🌙 夜（テーブル）
        </button>
        <button className={`sub-tab ${party ? "active" : ""}`} onClick={() => { setMode("day"); setParty(true); setTakeout(false); setOrderType("パーティ受付"); setSelected(null); setCart([]); setPayMode(false); setPayResult(null); }}>
          🎆 パーティ
        </button>
      </div>

      {/* 仕込み管理 */}
      {!party && (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🥪 仕込み在庫</span>
        </div>
        {[...STOCK_MANAGED].map((name) => {
          const count = stock[name] ?? 0;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={async () => { await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, delta: -1 }) }); loadStock(); }}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", fontSize: 18, fontWeight: 700, color: "#c0392b", cursor: "pointer" }}
                >−</button>
                <span style={{ fontSize: 22, fontWeight: 800, minWidth: 36, textAlign: "center", color: count === 0 ? "#c0392b" : "var(--ink)" }}>{count}</span>
                <button
                  onClick={async () => { await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, delta: 1 }) }); loadStock(); }}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line)", background: "#fff", fontSize: 18, fontWeight: 700, color: "var(--ok)", cursor: "pointer" }}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ===== 昼モード / 夜のテイクアウト ===== */}
      {(mode === "day" || takeout) && (
        <>
          {takeout && (
            <button
              onClick={() => { setTakeout(false); setOrderType("店内"); setCart([]); setPayMode(false); setPayResult(null); }}
              style={{
                width: "100%", padding: "10px 0", marginBottom: 10, borderRadius: 10,
                border: "1px solid var(--line)", background: "#fff", fontSize: 14,
                fontWeight: 700, cursor: "pointer",
              }}
            >
              ← テーブルに戻る
            </button>
          )}
          {/* 決済完了 */}
          {payResult && (
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ok)", marginBottom: 4 }}>会計完了</div>
              {payResult.change > 0 && (
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>お釣り: {fmt(payResult.change)}</div>
              )}
              <button className="primary" onClick={() => { setPayResult(null); setCart([]); setErr(""); setMsg(""); setPayMode(false); setTendered(""); }} style={{ marginTop: 16 }}>
                次の注文へ
              </button>
            </div>
          )}

          {!payResult && (
            <>
              {/* メニュー選択（カテゴリ別） — 夜と同じロジック */}
              {(() => {
                const FALLBACK: Record<string, string> = {};
                const HOTSAND_NAMES = ["ガーデンメルト","クラシックメルト"];
                const FOOD_NAMES = ["マッシュポテト","マッシュポテトの生ハム包み","ブルーチーズと生ハム盛り合わせ","Wabi-Sabi Shrimp","バジルソーセージとザワークラウト","オリーブ・ザワークラウト・マッシュポテトの3種盛り","アヒージョ 自家製パンを添えて"];
                const ALCOHOL_NAMES = ["ハイボール","ジンジャーハイボール","コークハイ","ジントニック","ジンバック","レモンサワー","ライムサワー","グレープフルーツサワー","アペロールマルガリータ","ココナッツベリークラウド","マイアミサンセット","エスプレッソマティーニ","梅酒モヒート","サッポロラガー（中瓶）","ハイネケン","バドワイザー","コロナ","カルピスサワー","紅茶サワー","ジンハイボール","梅サワー","ワイン（グラス）","ワイン（ボトル）","緑茶ハイ","ウーロンハイ","紅茶ハイ","ジャスミンハイ","飲み放題＋ウェルカムビール1杯"];
                const CAFE_NAMES = ["コーヒー","エスプレッソ","アメリカーノ","コールドブリュー","カフェラテ","ソイラテ","オーツラテ（Ice/Hot）","抹茶ラテ","ドリップコーヒー","チョコレートミルク","プロテインスムージー"];
                const DESSERT_NAMES = ["アフォガート","ワッフル"];
                const APPAREL_NAMES = ["flat. Tシャツ", "ステッカー（小）", "ステッカー（大）"];
                const SOFT_NAMES = ["オレンジジュース","アップルジュース","パイナップルジュース","グアバジュース","アイスティー","ウーロン茶","緑茶","コカ・コーラ","ジンジャーエール","梅ライムソーダ","ゆずレモネード","ソーダ","飲み放題（ソフトドリンクのみ）"];
                HOTSAND_NAMES.forEach(n => FALLBACK[n] = "🥪 ホットサンド");
                FOOD_NAMES.forEach(n => FALLBACK[n] = "🍽️ フード");
                ALCOHOL_NAMES.forEach(n => FALLBACK[n] = "🍺 アルコール");
                CAFE_NAMES.forEach(n => FALLBACK[n] = "☕ カフェドリンク");
                DESSERT_NAMES.forEach(n => FALLBACK[n] = "🍰 デザート");
                SOFT_NAMES.forEach(n => FALLBACK[n] = "🥤 ソフトドリンク");
                APPAREL_NAMES.forEach(n => FALLBACK[n] = "👕 アパレル");
                PARTY_NAMES.forEach(n => FALLBACK[n] = "🎆 パーティ参加費");

                const validItems = menu.filter(item => {
                  const v = item.variations[0];
                  if (!v || v.price == null) return false;
                  // 参加費は普段のメニューには出さない
                  return party ? PARTY_SET.has(item.name) : !PARTY_SET.has(item.name);
                });
                const grouped: Record<string, MenuItem[]> = {};
                const CAT_ORDER = ["🎆 パーティ参加費", "🥪 ホットサンド", "🍽️ フード", "☕ カフェドリンク", "🥤 ソフトドリンク", "🍺 アルコール", "🍰 デザート", "👕 アパレル", "その他"];
                for (const item of validItems) {
                  const cat = item.category || FALLBACK[item.name] || "その他";
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(item);
                }
                const cats = CAT_ORDER.filter(c => grouped[c]);
                for (const c of Object.keys(grouped)) { if (!cats.includes(c)) cats.push(c); }

                return cats.map(cat => (
                  <div className="card" key={cat}>
                    <div className="cat-title">{cat}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {grouped[cat].map((item) => {
                        const v = item.variations[0];
                        const totalInCart = cart.filter((c) => c.catalog_object_id === v.id).reduce((s, c) => s + c.quantity, 0);
                        const hasHotIce = HOT_ICE_ITEMS.has(item.name);
                        const hasVariant = !!VARIANT_ITEMS[item.name];
                        const isStockManaged = STOCK_MANAGED.has(item.name);
                        const stockCount = isStockManaged ? (stock[item.name] ?? 0) : -1;
                        const soldOut = isStockManaged && stockCount <= 0;
                        return (
                          <button key={item.id} onClick={() => !soldOut && addToCart(item)} disabled={soldOut} style={{
                            flex: "1 1 calc(50% - 4px)", minWidth: 0, padding: "10px 8px", borderRadius: 10,
                            border: totalInCart ? "2px solid var(--accent)" : "1px solid var(--line)",
                            background: soldOut ? "#f0ede8" : totalInCart ? "var(--accent-weak)" : "var(--card)",
                            textAlign: "left", fontSize: 13, fontWeight: 600, cursor: soldOut ? "not-allowed" : "pointer", position: "relative",
                            opacity: soldOut ? 0.5 : 1,
                          }}>
                            <div style={{ marginBottom: 2 }}>
                              {item.name}
                              {hasHotIce && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>H/I</span>}
                              {hasVariant && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>味選択</span>}
                              {isStockManaged && (
                                <span style={{ fontSize: 10, marginLeft: 4, padding: "1px 5px", borderRadius: 4, fontWeight: 700, background: soldOut ? "#fde8e8" : "#e8f5e9", color: soldOut ? "#c0392b" : "var(--ok)" }}>
                                  {soldOut ? "売切" : `残${stockCount}`}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(v.price)}</div>
                            {totalInCart > 0 && (
                              <span style={{
                                position: "absolute", top: -6, right: -6, background: "var(--accent)", color: "#fff",
                                borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center",
                                justifyContent: "center", fontSize: 12, fontWeight: 700,
                              }}>{totalInCart}</span>
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
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setVariantPending(null)}>
                  <div className="card" style={{ width: 300, margin: 0 }} onClick={e => e.stopPropagation()}>
                    <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{variantPending.name}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {VARIANT_ITEMS[variantPending.name].map((v) => (
                        <button key={v.value} onClick={() => selectVariant(v.value)} style={{
                          padding: "12px 0", borderRadius: 10, border: `2px solid ${v.color}`, background: v.bg,
                          color: v.color, fontSize: 15, fontWeight: 700, cursor: "pointer",
                        }}>{v.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Hot/Ice選択 */}
              {hotIcePending && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setHotIcePending(null)}>
                  <div className="card" style={{ width: 280, margin: 0 }} onClick={e => e.stopPropagation()}>
                    <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{hotIcePending.name}</div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => selectHotIce("Hot")} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "2px solid #c0392b", background: "#fde8e8", color: "#c0392b", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>🔥 Hot</button>
                      <button onClick={() => selectHotIce("Ice")} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "2px solid #2980b9", background: "#e8f4fd", color: "#2980b9", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>🧊 Ice</button>
                    </div>
                  </div>
                </div>
              )}

              {/* カート + 会計 */}
              {cart.length > 0 && (
                <div className="card" style={{ position: "sticky", bottom: 16 }}>
                  {cart.map((c) => (
                    <div key={`${c.catalog_object_id}_${c.note || ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14 }}>
                      <span>
                        {c.name}
                        {c.note && <span style={{ fontSize: 11, marginLeft: 4, padding: "1px 6px", borderRadius: 4, background: c.note === "Hot" ? "#fde8e8" : c.note === "Ice" ? "#e8f4fd" : "#f0f0f0", color: c.note === "Hot" ? "#c0392b" : c.note === "Ice" ? "#2980b9" : "var(--ink)" }}>{c.note}</span>}
                        {" "}×{c.quantity}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="mono" style={{ fontWeight: 700 }}>{fmt(c.price * c.quantity)}</span>
                        <button onClick={() => removeFromCart(c.catalog_object_id, c.note)} style={{ width: 28, height: 28, borderRadius: 8, fontSize: 16, border: "1px solid var(--line)", background: "#fff", color: "#c0392b", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ textAlign: "right", fontWeight: 700, fontSize: 18, marginTop: 6, paddingTop: 8, borderTop: "2px solid var(--line)" }}>
                    {fmt(cartTotal)}
                  </div>
                  {err && <p className="err">{err}</p>}

                  {/* 店内 / テイクアウト（伝票名になりKDSに出る） */}
                  {!payMode && !party && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4, fontWeight: 600 }}>
                        提供方法
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["店内", "テイクアウト"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setOrderType(t)}
                            style={{
                              flex: 1, padding: "12px 0", borderRadius: 10,
                              border: orderType === t ? "2px solid var(--ok)" : "1px solid var(--line)",
                              background: orderType === t ? "#eaf6ec" : "#fff",
                              color: orderType === t ? "var(--ok)" : "var(--ink)",
                              fontSize: 15, fontWeight: 700, cursor: "pointer",
                            }}
                          >
                            {t === "店内" ? "🍽 店内" : "🥡 テイクアウト"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 現金会計モード */}
                  {payMode ? (
                    <div style={{ marginTop: 10 }}>
                      <label>お預かり金額</label>
                      <input type="number" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(cartTotal)} style={{ textAlign: "right", fontSize: 20, fontWeight: 700 }} autoFocus />
                      {tendered && Number(tendered) >= cartTotal && (
                        <div style={{ textAlign: "center", marginTop: 8, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>お釣り: {fmt(Number(tendered) - cartTotal)}</div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {[cartTotal, 500, 1000, 2000, 3000, 5000, 10000].map((amt) => (
                          <button key={amt} onClick={() => setTendered(String(amt))} style={{ flex: "1 1 calc(25% - 6px)", padding: "8px 0", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            {amt === cartTotal ? "ぴったり" : `¥${amt.toLocaleString()}`}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="ghost" onClick={() => setPayMode(false)} style={{ flex: 1 }}>戻る</button>
                        <button
                          disabled={sending || !tendered || Number(tendered) < cartTotal}
                          onClick={() => submitDayOrder("cash", Number(tendered))}
                          style={{ flex: 2, padding: "14px 0", borderRadius: 10, background: (!tendered || Number(tendered) < cartTotal) ? "#cbb9a8" : "var(--ok)", color: "#fff", fontSize: 16, fontWeight: 700, border: "none", cursor: "pointer" }}
                        >{sending ? "処理中..." : "現金で決済"}</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => { setPayMode(true); setTendered(""); }} style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "var(--ok)", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>💴 現金</button>
                      <button onClick={() => submitDayOrder("card")} disabled={!squareAppId} style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "#2980b9", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>💳 カード</button>
                      <button onClick={() => { if (confirm("PayPay支払い済みですか？")) submitDayOrder("paypay"); }} disabled={sending} style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "#e60020", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}>PayPay</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ===== 夜モード ===== */}
      {mode === "night" && !takeout && (<>

      {/* テイクアウト（夜でも受けられる） */}
      <button
        onClick={() => { setTakeout(true); setOrderType("テイクアウト"); setSelected(null); setCart([]); setPayMode(false); setPayResult(null); }}
        style={{
          width: "100%", padding: "14px 0", marginBottom: 12, borderRadius: 10,
          border: "none", background: "#8e6f4e", color: "#fff",
          fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}
      >
        🥡 テイクアウト注文
      </button>

      {/* フロアマップ */}
      <div className="card" style={{ padding: 12, position: "relative", aspectRatio: "0.91", overflow: "hidden" }}>
        {/* キッチン。レジはこの中の右上にある */}
        <div style={{
          position: "absolute", left: "16%", top: "84%", width: "44%", height: "14%",
          background: "#f0ede8", borderRadius: 8, fontSize: 12, color: "var(--muted)",
          border: "1px dashed var(--line)",
        }}>
          <span style={{ position: "absolute", left: 8, bottom: 6 }}>🍳 キッチン</span>
          <span style={{ position: "absolute", right: 6, top: 4, fontSize: 10.5 }}>💰 レジ</span>
        </div>

        {/* 入口 */}
        <div style={{
          position: "absolute", right: "1%", top: "60%", fontSize: 11, color: "var(--muted)",
          textAlign: "center",
        }}>
          入口 ▶
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

        {/* 畳だけラベルを残す。A/B/Cはテーブル名で分かるので出さない */}
        <div style={{ position: "absolute", left: "52%", top: "57%", fontSize: 10, color: "var(--muted)" }}>
          畳
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <div className="cat-title" style={{ marginBottom: 0 }}>{selected} の注文中</div>
                <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setMoveTo(moveTo === null ? "" : null)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid var(--line)", background: "var(--card)",
                    cursor: "pointer", fontWeight: 600,
                  }}
                >
                  ↔ 席を移動
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`${selected} の注文を全てキャンセルしますか？`)) return;
                    try {
                      const res = await fetch("/api/square/order", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ order_id: currentOrder.id, version: currentOrder.version }),
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error);
                      setSelected(null);
                      await loadOrders();
                    } catch (e: any) { setErr(e.message); }
                  }}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid #e0b4b4", background: "#fde8e8", color: "#c0392b",
                    cursor: "pointer", fontWeight: 600,
                  }}
                >
                  全キャンセル
                </button>
                </div>
              </div>

              {/* 席の移動。空いているテーブルを選ぶとその席へ付け替える */}
              {moveTo !== null && (
                <div style={{ marginTop: 8, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    移動先の席を選んでください（{selected} → ?）
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {TABLES.filter((t) => t.id !== selected && !orderFor(t.id)).map((t) => (
                      <button
                        key={t.id}
                        onClick={async () => {
                          if (!currentOrder) return;
                          try {
                            const res = await fetch("/api/square/move", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                order_id: currentOrder.id,
                                version: currentOrder.version,
                                to: t.id,
                              }),
                            });
                            const d = await res.json();
                            if (!res.ok) throw new Error(d.error);
                            setMoveTo(null);
                            setSelected(t.id);
                            await loadOrders();
                          } catch (e: any) { setErr(e.message); }
                        }}
                        style={{ fontSize: 13, fontWeight: 700, padding: "8px 14px" }}
                      >
                        {t.id}
                      </button>
                    ))}
                  </div>
                  {TABLES.filter((t) => t.id !== selected && !orderFor(t.id)).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>空いている席がありません</div>
                  )}
                </div>
              )}
              {currentOrder.items.map((item, i) => (
                <div key={i} className="result-row" style={{ alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={splitSel.has(item.uid)}
                    onChange={(e) => {
                      setSplitSel((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(item.uid);
                        else next.delete(item.uid);
                        return next;
                      });
                    }}
                    style={{ width: 20, height: 20, marginRight: 10, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>
                    {item.name}
                    {item.qty > 1 && <span style={{ color: "var(--muted)", marginLeft: 4 }}>×{item.qty}</span>}
                  </span>
                  <span className="mono" style={{ fontWeight: 700, marginRight: 8 }}>{fmt(item.amount)}</span>
                  <button
                    onClick={async () => {
                      if (!confirm(`${item.name} を削除しますか？`)) return;
                      try {
                        const res = await fetch("/api/square/order", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            order_id: currentOrder.id,
                            version: currentOrder.version,
                            item_uid: item.uid,
                          }),
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error);
                        await loadOrders();
                        if (d.remaining === 0) setSelected(null);
                      } catch (e: any) { setErr(e.message); }
                    }}
                    style={{
                      width: 26, height: 26, borderRadius: 6, fontSize: 14,
                      border: "1px solid var(--line)", background: "#fff", color: "#c0392b",
                      padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: "2px solid var(--line)" }}>
                合計 {fmt(currentOrder.total)}
              </div>
              {splitSel.size > 0 && (
                <div style={{
                  marginTop: 8, padding: "8px 10px", borderRadius: 8,
                  background: "#f4efe7", display: "flex", justifyContent: "space-between",
                  alignItems: "center", fontSize: 14, fontWeight: 700,
                }}>
                  <span>
                    別会計 {splitItems.length}点
                    {!isSplit && <span style={{ color: "var(--muted)", fontWeight: 400 }}>（全部なので通常会計）</span>}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {fmt(payTargetTotal)}
                    <button
                      onClick={() => setSplitSel(new Set())}
                      style={{
                        border: "1px solid var(--line)", background: "#fff", borderRadius: 6,
                        fontSize: 12, padding: "4px 8px", cursor: "pointer", fontWeight: 600,
                      }}
                    >
                      選択解除
                    </button>
                  </span>
                </div>
              )}

              {/* 会計ボタン */}
              {!payMode && !payResult && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => { setPayMode(true); setTendered(""); }}
                    style={{
                      flex: 1, padding: "14px 0", borderRadius: 10,
                      background: "var(--ok)", color: "#fff", fontSize: 15, fontWeight: 700,
                      border: "none", cursor: "pointer",
                    }}
                  >
                    💴 現金
                  </button>
                  <button
                    onClick={() => settle("card")}
                    disabled={paying}
                    style={{
                      flex: 1, padding: "14px 0", borderRadius: 10,
                      background: "#2980b9", color: "#fff", fontSize: 15, fontWeight: 700,
                      border: "none", cursor: "pointer",
                    }}
                  >
                    💳 カード
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`${isSplit ? `選択した${splitItems.length}点（${fmt(payTargetTotal)}）` : selected} をPayPay支払い済みにしますか？`)) return;
                      settle("paypay");
                    }}
                    disabled={paying}
                    style={{
                      flex: 1, padding: "14px 0", borderRadius: 10,
                      background: "#e60020", color: "#fff", fontSize: 15, fontWeight: 700,
                      border: "none", cursor: "pointer",
                    }}
                  >
                    PayPay
                  </button>
                </div>
              )}

              {/* 決済フロー */}
              {payMode && !payResult && (
                <div style={{ marginTop: 12, borderTop: "2px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ textAlign: "center", fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
                    {fmt(payTargetTotal)}
                  </div>
                  <label>お預かり金額</label>
                  <input
                    type="number"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={String(payTargetTotal)}
                    style={{ textAlign: "right", fontSize: 20, fontWeight: 700 }}
                    autoFocus
                  />
                  {tendered && Number(tendered) >= payTargetTotal && (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>
                      お釣り: {fmt(Number(tendered) - payTargetTotal)}
                    </div>
                  )}
                  {tendered && Number(tendered) < payTargetTotal && (
                    <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#c0392b" }}>
                      金額が不足しています
                    </div>
                  )}
                  {/* よく使う金額ボタン */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    {[payTargetTotal, 500, 1000, 2000, 3000, 5000, 10000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTendered(String(amt))}
                        style={{
                          flex: "1 1 calc(25% - 6px)", padding: "8px 0", borderRadius: 8,
                          border: "1px solid var(--line)", background: "var(--card)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {amt === payTargetTotal ? "ぴったり" : `¥${amt.toLocaleString()}`}
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
                      disabled={paying || !tendered || Number(tendered) < payTargetTotal}
                      onClick={() => settle("cash", Number(tendered))}
                      style={{
                        flex: 2, padding: "14px 0", borderRadius: 10,
                        background: (!tendered || Number(tendered) < payTargetTotal) ? "#cbb9a8" : "var(--ok)",
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
            ["flat. Tシャツ", "ステッカー（小）", "ステッカー（大）"].forEach(n => FALLBACK[n] = "👕 アパレル");
            PARTY_NAMES.forEach(n => FALLBACK[n] = "🎆 パーティ参加費");

            const validItems = menu.filter(item => {
              const v = item.variations[0];
              // 参加費はパーティモード専用なので、テーブル注文には出さない
              return v && v.price != null && !PARTY_SET.has(item.name);
            });

            // カテゴリ分類
            const grouped: Record<string, MenuItem[]> = {};
            const CAT_ORDER = ["🥪 ホットサンド", "🍽️ フード", "☕ カフェドリンク", "🥤 ソフトドリンク", "🍺 アルコール", "🍰 デザート", "👕 アパレル", "その他"];
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
                    const isStockManaged = STOCK_MANAGED.has(item.name);
                    const stockCount = isStockManaged ? (stock[item.name] ?? 0) : -1;
                    const soldOut = isStockManaged && stockCount <= 0;
                    return (
                      <button
                        key={item.id}
                        onClick={() => !soldOut && addToCart(item)}
                        disabled={soldOut}
                        style={{
                          flex: "1 1 calc(50% - 4px)",
                          minWidth: 0,
                          padding: "10px 8px",
                          borderRadius: 10,
                          border: totalInCart ? "2px solid var(--accent)" : "1px solid var(--line)",
                          background: soldOut ? "#f0ede8" : totalInCart ? "var(--accent-weak)" : "var(--card)",
                          textAlign: "left",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: soldOut ? "not-allowed" : "pointer",
                          position: "relative",
                          opacity: soldOut ? 0.5 : 1,
                        }}
                      >
                        <div style={{ marginBottom: 2 }}>
                          {item.name}
                          {hasHotIce && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>H/I</span>}
                          {hasVariant && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>味選択</span>}
                          {isStockManaged && (
                            <span style={{ fontSize: 10, marginLeft: 4, padding: "1px 5px", borderRadius: 4, fontWeight: 700, background: soldOut ? "#fde8e8" : "#e8f5e9", color: soldOut ? "#c0392b" : "var(--ok)" }}>
                              {soldOut ? "売切" : `残${stockCount}`}
                            </span>
                          )}
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

      </>)}

      {/* ソイ変更選択（昼夜共通） */}
      {soyPending && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setSoyPending(null)}>
          <div className="card" style={{ width: 280, margin: 0 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{soyPending.item.name}</div>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{soyPending.note}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => selectSoy(false)} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "2px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                🥛 通常
              </button>
              <button onClick={() => selectSoy(true)} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: "2px solid #8BC34A", background: "#F1F8E9", color: "#558B2F", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                🌱 ソイ +¥50
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
