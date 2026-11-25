// Uber Eats Manager（merchants.ubereats.com/manager/orders を開いたタブ）で実行する取り込み用スクリプト。
// 毎週月曜の自動実行（Claude の定期タスク「Uber Eatsの注文を取り込む」）が使う。
//
// 使い方（タブの中で順に）:
//   1. このファイルの中身をそのまま実行 → window.__flatUber ができる
//   2. window.__flatUber.run(10)    … 直近10日の注文を集める（数十秒かかる。終わると status が "collected"）
//   3. window.__flatUber.button()   … 右下に「flatに送る」ボタンを出す。これを押す（ポップアップを開くのにクリックが要る）
//   4. 開いた https://flat-keihi.vercel.app/uber?import=1 が受け取って保存し、結果を返す → status が "sent"
//
// Uber のページは外のサイトへの通信（fetch）を CSP で止めているので、flat の画面を開いて postMessage で渡す。
// 注文者・配達員の名前や電話は取らない（クエリに入れていない）。
// 短時間に呼びすぎると 429 が返るので、一覧は3秒あけて1ページずつ、詳細は1.5秒あけて1件ずつ。429 なら30秒待って取り直す。
(() => {
  const STORE = "437ab348-2564-4cba-85e6-9a753518bf3e";
  const FLAT = "https://flat-keihi.vercel.app";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = { status: "ready", raw: [], log: [], result: null };
  const post = async (url, body) => {
    for (let t = 0; t < 6; t++) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": "x" },
        body: JSON.stringify(body),
      });
      if (r.status === 429) { st.log.push("429"); await sleep(30000); continue; }
      return r.json();
    }
    throw new Error("429が続いたので中止");
  };
  const ymd = (d) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const Q = `query OrderDetails($workflowUUID: ID!, $metadata: Orders_OrderDetailsMetadataInput, $detailsRequestedByRestaurantUUID: ID) {
  orderDetails(workflowUUID: $workflowUUID, metadata: $metadata, detailsRequestedByRestaurantUUID: $detailsRequestedByRestaurantUUID) {
    requestedAt orderId fulfillmentType netPayout
    checkoutInfo { key amount }
    items { name price quantity customizations { name options { name quantity price customizations { name options { name quantity price } } } } }
  }
}`;

  st.run = async (days = 10) => {
    st.status = "collecting";
    try {
      const list = {};
      const now = new Date();
      const filters = {
        currentTab: "", displayCurrencyCode: "",
        locationConstraints: { cities: [], countries: [], locationUuids: [STORE] },
        dateFilter: {
          startDate: `${ymd(new Date(now.getTime() - days * 86400000))} 00:00:00`,
          endDate: `${ymd(now)} 23:59:59`, lastUpdatedAt: "",
        },
        isEatsPassSubscriber: false, search: null, orderIssuesV2: [], issueOrderStatusFilter: [], displayByocIssues: false,
      };
      // 1回目は進行中の注文（liveOrders）で、終わった注文は次のページ（historyOrders）にある。
      // 次のページは pagingInfo ではなく pagination に cursor と nextTable を入れて送る（2026-11-25 画面の通信で確認）
      let page = null;
      let expected = 0;
      for (let i = 0; i < 30; i++) {
        const j = await post("/manager/api/getHistoricOrders?localeCode=ja-JP", {
          filters,
          sort: { sortColumn: "SORT_COLUMN_ORDER_COMPLETED_AT", sortDirection: "SORT_DIRECTION_DESC" },
          pagingInfo: { cursor: "", limit: 20, nextTable: "liveOrders" },
          ...(page ? { pagination: page } : {}),
        });
        for (const o of j.data.orders) list[o.workflowUuid] = o.orderStatus;
        expected = Math.max(expected, Number(j.data.ordersCount) || 0);
        st.log.push(`${i + 1}ページ目: ${j.data.orders.length}件`);
        const p = j.data.paginationResult || {};
        if (!p.nextTable || p.nextTable === "None") break;
        if (page && !p.nextCursor && p.nextTable === page.nextTable) break;
        page = { cursor: p.nextCursor || "", nextTable: p.nextTable, limit: 20 };
        await sleep(3000);
      }
      // 取りこぼしたまま黙って送らない
      const got = Object.keys(list).length;
      if (got < expected) throw new Error(`一覧が足りない（${got}/${expected}件）`);
      st.raw = [];
      for (const [uuid, status] of Object.entries(list)) {
        const j = await post("/manager/graphql?op=OrderDetails", {
          operationName: "OrderDetails",
          query: Q,
          variables: { workflowUUID: uuid, metadata: { isEatsPassSubscriber: false, locale: "ja-JP" }, detailsRequestedByRestaurantUUID: STORE },
        });
        if (j.data && j.data.orderDetails) st.raw.push({ uuid, status, details: j.data.orderDetails });
        await sleep(1500);
      }
      if (st.raw.length < got) throw new Error(`中身が取れない注文がある（${st.raw.length}/${got}件）`);
      st.status = "collected";
    } catch (e) {
      st.status = "error: " + e.message;
    }
    return st.status;
  };

  // 受け取り側の画面を開いて渡す。クリックの中で開かないとポップアップが止められる
  st.send = () => {
    const w = window.open(`${FLAT}/uber?import=1`, "flatUberImport");
    const onMsg = (e) => {
      if (e.origin !== FLAT) return;
      if (e.data && e.data.type === "flat-uber-ready") {
        w.postMessage({ type: "flat-uber-data", raw: st.raw }, FLAT);
      } else if (e.data && e.data.type === "flat-uber-result") {
        st.result = e.data;
        st.status = e.data.ok ? "sent" : "error: " + e.data.error;
        window.removeEventListener("message", onMsg);
      }
    };
    window.addEventListener("message", onMsg);
  };

  st.button = () => {
    const b = document.createElement("button");
    b.id = "flat-uber-send";
    b.textContent = `flatに送る（${st.raw.length}件）`;
    b.style.cssText = "position:fixed;right:24px;bottom:96px;z-index:99999;padding:12px 18px;font-size:15px;font-weight:700;background:#1f6b3a;color:#fff;border:0;border-radius:10px;cursor:pointer";
    b.onclick = () => { st.send(); b.remove(); };
    document.body.appendChild(b);
    return b.textContent;
  };

  window.__flatUber = st;
  return "ready";
})();
