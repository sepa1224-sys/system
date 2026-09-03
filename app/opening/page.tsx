"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";

// 出勤したらやることのチェックリスト。日付が変わればまっさらに戻る。
// 「今日ここまで終わった」が一目で分かることが目的なので、順番どおりに縦に並べる。

type Task = {
  id: string;
  phase: "朝" | "営業中" | "締め" | "週次";
  name: string;
  detail?: string;
  everyDays?: number;
  weekday?: number;
  waffleCount?: boolean;
  waffleMorning?: boolean;
  orderList?: boolean;
  pendingOrder?: boolean;
  done: boolean;
  lastDate?: string | null;
  daysSince?: number | null;
  due?: boolean;
};

type PendingOrder = {
  id: string;
  orderedAt: string;
  lines: { itemId: string; name: string; unit: string; qty: number }[];
  note?: string;
};

export default function OpeningPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [date, setDate] = useState("");
  const [total, setTotal] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [recon, setRecon] = useState("");
  // ワッフルの残数。夜に入れて、翌朝の判断に使う
  const [waffle, setWaffle] = useState<{
    flavors: string[];
    morning: { text: string; bake: string[]; mustBake?: boolean };
    night: { text: string; prep: boolean };
    today: Record<string, number> | null;
    bakedToday?: boolean;
    answered?: boolean;
    bakedAt?: string | null;
  } | null>(null);
  // 発注したがまだ届いていないもの
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [wBusy, setWBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [bakedAt, setBakedAt] = useState("");
  const [wSaving, setWSaving] = useState(false);
  const [wMsg, setWMsg] = useState("");
  const [reconBusy, setReconBusy] = useState(false);

  // 会計済みなのに残っているOPEN注文を照合して閉じる。
  // Squareで会計したあとアプリに戻らないと注文が閉じられないので、締めでまとめて片付ける
  const runReconcile = async () => {
    setReconBusy(true);
    setRecon("");
    try {
      const res = await fetch("/api/square/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false, days: 30 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "照合に失敗");
      const left = (d.openCount ?? 0) - (d.closed ?? 0);
      setRecon(
        d.closed > 0
          ? `${d.closed}件を閉じました。${left > 0 ? `${left}件は会計が見つからないので確認してください` : "すべて片付きました"}`
          : left > 0
            ? `閉じられるものはありません。${left}件は会計が見つからないので、会計漏れかもしれません`
            : "残っている注文はありません",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "照合に失敗");
    } finally {
      setReconBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/opening");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setTasks(d.tasks || []);
      setDate(d.date || "");
      setTotal(d.total || 0);
      setDoneCount(d.doneCount || 0);
      setWaffle(d.waffle || null);
      setPendingOrders(d.pendingOrders || []);
      if (d.waffle?.today) {
        const c: Record<string, string> = {};
        for (const [k, v] of Object.entries(d.waffle.today)) c[k] = String(v);
        setCounts(c);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flip = async (t: Task) => {
    // 押した瞬間に見た目を変える。通信の返りを待たせない
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    setDoneCount((n) => n + (t.done ? -1 : 1));
    try {
      const res = await fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: t.id, done: !t.done }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失敗");
      load();
    }
  };

  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  // 朝、焼いたのか冷蔵庫から出したのかを記録する。
  // これが分かると、今夜の生地の仕込みが要るかが自動で決まる
  const recordBaked = async (baked: boolean) => {
    setWBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waffleBaked: baked }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setWBusy(false);
    }
  };

  const markArrived = async (id: string) => {
    try {
      const res = await fetch("/api/purchase", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新に失敗");
    }
  };

  const saveWaffle = async () => {
    if (!waffle) return;
    setWSaving(true);
    setWMsg("");
    try {
      const nums: Record<string, number> = {};
      for (const f of waffle.flavors) nums[f] = Number(counts[f] || 0);
      const res = await fetch("/api/opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waffleCounts: nums, bakedAt: bakedAt || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      setWMsg(d.night?.text || "記録しました");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setWSaving(false);
    }
  };

  const row = (t: Task) => {
    const skip = (t.everyDays || t.weekday !== undefined) && !t.due;
    return (
      <div
        key={t.id}
        onClick={() => flip(t)}
        style={{
          display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
          padding: "12px 4px", borderTop: "1px solid var(--line-soft, #eee)",
          opacity: skip && !t.done ? 0.45 : 1,
        }}
      >
        <div
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
            border: t.done ? "2px solid var(--ok)" : "2px solid var(--line)",
            background: t.done ? "var(--ok)" : "#fff",
            color: "#fff", fontSize: 16, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {t.done ? "✓" : ""}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 15,
            textDecoration: t.done ? "line-through" : "none",
            color: t.done ? "var(--muted)" : "var(--ink)",
          }}>
            {t.name}
            {t.weekday !== undefined && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, verticalAlign: "middle",
                background: t.due ? "#fdf0e6" : "#eef1f4",
                color: t.due ? "#9c5f22" : "var(--muted)",
              }}>
                毎週{["日","月","火","水","木","金","土"][t.weekday]}曜{t.due ? "・今日やる" : "・今日はなし"}
              </span>
            )}
            {t.everyDays && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, verticalAlign: "middle",
                background: t.due ? "#fdf0e6" : "#eef1f4",
                color: t.due ? "#9c5f22" : "var(--muted)",
              }}>
                {t.everyDays}日に1回{t.due ? "・今日やる" : "・今日はなし"}
              </span>
            )}
            {t.pendingOrder && (
              <span style={{
                marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 6px",
                borderRadius: 4, verticalAlign: "middle",
                background: t.due ? "#fdf0e6" : "#eef1f4",
                color: t.due ? "#9c5f22" : "var(--muted)",
              }}>
                {t.due ? `届き待ち${pendingOrders.length}件` : "届き待ちなし"}
              </span>
            )}
          </div>
          {t.detail && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.6 }}>
              {t.detail}
            </div>
          )}
          {t.waffleMorning && waffle && (
            <>
              <div style={{
                marginTop: 7, padding: "9px 11px", borderRadius: 7, fontSize: 13, lineHeight: 1.7,
                background: waffle.morning.bake.length ? "#fde8e8" : "#eaf6ec",
                border: `1px solid ${waffle.morning.bake.length ? "#e0b4b4" : "#b7dfc0"}`,
                color: waffle.morning.bake.length ? "#c0392b" : "var(--ok)",
                fontWeight: 700,
              }}>
                {waffle.morning.bake.length ? "🔥 " : "✅ "}
                {waffle.morning.text}
              </div>
              {/* 実際にどちらをしたかを押す。今夜の仕込みの要否がこれで決まる */}
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>
                  今朝どちらをしましたか
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    { baked: true, label: "🔥 焼いた" },
                    { baked: false, label: "🧊 冷蔵庫から出した" },
                  ] as const).map((b) => {
                    const on = waffle.answered && waffle.bakedToday === b.baked;
                    return (
                      <button
                        key={b.label}
                        onClick={() => recordBaked(b.baked)}
                        disabled={wBusy}
                        style={{
                          padding: "9px 14px", borderRadius: 8, cursor: "pointer",
                          fontSize: 13, fontWeight: 700,
                          border: on ? "2px solid var(--ok)" : "1px solid var(--line)",
                          background: on ? "var(--ok)" : "#fff",
                          color: on ? "#fff" : "var(--ink)",
                        }}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
                {waffle.answered && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, lineHeight: 1.7 }}>
                    {waffle.bakedToday
                      ? "今日焼いたので、残りが2個以下でなければ今夜の生地の仕込みは要りません"
                      : "冷蔵庫のものを出したので、今夜は生地を仕込む必要が出ます"}
                  </div>
                )}
              </div>
            </>
          )}
          {t.orderList && (
            <div onClick={(e) => e.stopPropagation()}>
              <Link
                href="/purchase"
                style={{
                  display: "inline-block", marginTop: 7, fontSize: 13, fontWeight: 700,
                  padding: "8px 14px", borderRadius: 8, textDecoration: "none",
                  background: "var(--accent)", color: "#fff",
                }}
              >
                📋 発注リストを開く
              </Link>
            </div>
          )}
          {t.pendingOrder && (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 7 }}>
              {pendingOrders.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  届き待ちの発注はありません
                </div>
              ) : (
                pendingOrders.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      padding: "9px 11px", borderRadius: 7, marginBottom: 6,
                      background: "#fdf6ec", border: "1px solid #e8d5b0",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {o.orderedAt.slice(5).replace("-", "/")} 発注
                      <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>
                        {Math.round(
                          (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${o.orderedAt}T00:00:00Z`)) / 86400000,
                        )}日前
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.7 }}>
                      {o.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join("・")}
                    </div>
                    <button
                      onClick={() => markArrived(o.id)}
                      style={{
                        marginTop: 7, padding: "7px 14px", borderRadius: 8, border: "none",
                        background: "var(--ok)", color: "#fff", fontSize: 12.5,
                        fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      届いた
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {t.waffleCount && waffle && (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {waffle.flavors.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12.5 }}>{f}</span>
                    <input
                      type="number"
                      min={0}
                      value={counts[f] ?? ""}
                      onChange={(e) => setCounts((p) => ({ ...p, [f]: e.target.value }))}
                      style={{ width: 56, fontSize: 14, padding: "6px 8px", textAlign: "center" }}
                    />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>個</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>いま冷蔵庫にあるものを焼いた日</span>
                <input
                  type="date"
                  value={bakedAt}
                  onChange={(e) => setBakedAt(e.target.value)}
                  style={{ fontSize: 12.5, padding: "5px 7px" }}
                />
              </div>
              <button
                onClick={saveWaffle}
                disabled={wSaving}
                style={{
                  marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {wSaving ? "記録中…" : "残りを記録する"}
              </button>
              {wMsg && (
                <div style={{
                  marginTop: 7, padding: "8px 10px", borderRadius: 7, fontSize: 12.5, lineHeight: 1.7,
                  background: "#fdf6ec", border: "1px solid #e8d5b0", fontWeight: 700,
                }}>
                  {wMsg}
                </div>
              )}
            </div>
          )}
          {t.id === "order-reconcile" && (
            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={runReconcile}
                disabled={reconBusy}
                style={{
                  marginTop: 7, fontSize: 13, fontWeight: 700, padding: "8px 14px",
                  borderRadius: 8, border: "none", cursor: "pointer",
                  background: "var(--accent)", color: "#fff",
                }}
              >
                {reconBusy ? "照合中…" : "🧹 残った注文を片付ける"}
              </button>
              {recon && (
                <div style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 700, marginTop: 6, lineHeight: 1.7 }}>
                  {recon}
                </div>
              )}
            </div>
          )}
          {t.everyDays && t.lastDate && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
              前回 {t.lastDate.slice(5).replace("-", "/")}（{t.daysSince}日前）
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="wrap">
      <header>
        <h1>✅ 業務チェック</h1>
        <p>その日にやることを、上から順に進めてください</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card total-card">
        <div className="total-label">{date.slice(5).replace("-", "/")} の進み具合</div>
        <div className="total-amount">{doneCount} / {total}</div>
        <div style={{
          height: 8, borderRadius: 4, background: "rgba(255,255,255,0.3)",
          marginTop: 10, overflow: "hidden",
        }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#fff", transition: "width .2s" }} />
        </div>
        {total > 0 && doneCount === total && (
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>🎉 今日の分は全部終わりました</div>
        )}
      </div>

      {loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {!loading && (["朝", "営業中", "締め", "週次"] as const).map((phase) => {
        const list = tasks.filter((t) => t.phase === phase);
        if (!list.length) return null;
        return (
          <div key={phase} className="card" style={{ padding: "12px 14px" }}>
            <div className="cat-title">
              {phase === "朝"
                ? "🌅 朝（開店前）"
                : phase === "営業中"
                  ? "🕙 営業中（手が空いたとき）"
                  : phase === "締め"
                    ? "🌙 締め（閉店後）"
                    : "📅 週次"}
            </div>
            {list.map(row)}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ チェックは日付が変わると自動でリセットされます。<br />
        判断に迷ったら「❓ 使い方」のチャットで聞いてください。
      </p>
    </div>
  );
}
