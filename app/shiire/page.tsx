"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";
import InventorySheet from "@/components/InventorySheet";

// 仕入先の発注ページ。1タップで飛べるようにここに置く。
// 「お気に入り」「再購入」のように前に買ったものが並ぶページを優先する。
// （lib/shiire から import するとKV側のコードがクライアントに入るのでここで持つ）
const SHOPS: { name: string; url: string; note: string }[] = [
  {
    name: "容器スタイル",
    url: "https://www.packstyle.jp/wishlist.html",
    note: "お気に入り一覧。バーガー袋ほか包材。¥3,850以上で送料無料",
  },
  {
    name: "アミカ ネットショップ",
    url: "https://www.amicashop.com/",
    note: "ワッフル粉・シロップなど。¥10,000以上で送料無料",
  },
  {
    name: "Amazon 再購入",
    url: "https://www.amazon.co.jp/gp/buyagain",
    note: "過去に買ったものが並ぶ。ジンジャーエールなど",
  },
  {
    name: "Amazon ほしい物リスト",
    url: "https://www.amazon.co.jp/hz/wishlist/ls/8FJVIJUEMZ7L",
    note: "梅シロップなど。定番の仕入れをまとめてある",
  },
  {
    name: "ヨドバシ お気に入り",
    url: "https://order.yodobashi.com/yc/favorite/index.html",
    note: "テキーラ（クエルボ エスペシャル）など",
  },
  {
    name: "カインズ",
    url: "https://www.cainz.com/",
    note: "消耗品・資材",
  },
];

// 仕入れサイクル。領収書の履歴から品目ごとの購入間隔を自動集計し、
// 「そろそろ切れる」ものを教える。手で頻度を登録する必要はない。

type Stat = {
  name: string;
  displayName: string;
  category: string;
  vendor: string;
  count: number;
  dates: string[];
  lastDate: string;
  lastAmount: number;
  totalAmount: number;
  avgIntervalDays: number | null;
  daysSinceLast: number;
  nextDueDate: string | null;
  daysUntilDue: number | null;
  status: "overdue" | "soon" | "ok" | "unknown";
  reliable: boolean;
  spanDays: number;
};

const LABEL: Record<Stat["status"], { text: string; color: string }> = {
  overdue: { text: "買い時すぎ", color: "#c0392b" },
  soon: { text: "もうすぐ", color: "#b5651d" },
  ok: { text: "まだ大丈夫", color: "var(--ok)" },
  unknown: { text: "周期不明", color: "var(--muted)" },
};

export default function Shiire() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [summary, setSummary] = useState<{ total: number; overdue: number; soon: number; tracked: number } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"need" | "all" | "sheet">("need");
  const [advice, setAdvice] = useState("");
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [openName, setOpenName] = useState<string | null>(null);

  // /inventory から来たときは仕入れ表のタブを開く
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "sheet") setTab("sheet");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shiire?min=1");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setStats(d.stats || []);
      setSummary(d.summary || null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const askAdvice = async () => {
    setAdviceBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shiire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soonDays: 3 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "生成に失敗");
      setAdvice(d.advice || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "生成に失敗");
    } finally {
      setAdviceBusy(false);
    }
  };

  // 「そろそろ」は周期が信頼できるものだけ（開業準備のまとめ買いを除く）
  const need = stats.filter((s) => s.reliable && (s.status === "overdue" || s.status === "soon"));
  const list = tab === "need" ? need : stats;

  return (
    <div className="wrap">
      <header>
        <h1>🛒 仕入れ</h1>
        <p>
          {tab === "sheet"
            ? "スプレッドシートの仕入れ表をそのまま表示しています"
            : "領収書の履歴から、品目ごとの購入間隔を自動で集計しています"}
        </p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      {summary && tab !== "sheet" && (
        <div className="card total-card">
          <div className="total-label">そろそろ仕入れ</div>
          <div className="total-amount">{summary.overdue + summary.soon}件</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, opacity: 0.85, flexWrap: "wrap" }}>
            <span>⚠️ 買い時すぎ {summary.overdue}</span>
            <span>⏳ もうすぐ {summary.soon}</span>
            <span>📈 周期がわかる品目 {summary.tracked}/{summary.total}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 14 }}>
        <div className="cat-title">🛍️ 発注ページ</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {SHOPS.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.note}
              style={{
                display: "inline-block",
                padding: "7px 12px",
                borderRadius: 6,
                border: "1px solid var(--line, #ddd)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {s.name} ↗
            </a>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          「お気に入り」「再購入」のページを登録してあるので、前に買ったものがそのまま並びます。
        </p>
      </div>

      {tab !== "sheet" && (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ textAlign: "center" }}>
          <button className="primary" onClick={askAdvice} disabled={adviceBusy}>
            {adviceBusy ? "AIが確認中..." : "🤖 いま何を発注すべきか聞く"}
          </button>
        </div>
        {advice && (
          <div style={{ marginTop: 12, fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            {advice}
          </div>
        )}
      </div>
      )}

      <div className="sub-tabs">
        {(
          [
            ["need", `そろそろ (${need.length})`],
            ["all", `全品目 (${stats.length})`],
            ["sheet", "📦 仕入れ表"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`sub-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "sheet" && <InventorySheet />}

      {tab !== "sheet" && loading && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>集計中…</div>}

      {tab !== "sheet" && !loading && list.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          {tab === "need" ? "🎉 いま急いで買うものはありません。" : "データがありません。"}
        </div>
      )}

      {tab !== "sheet" && !loading && list.map((s) => {
        const open = openName === s.name;
        const lb = LABEL[s.status];
        return (
          <div key={s.name} className="card" style={{ padding: "12px 14px" }}>
            <div
              onClick={() => setOpenName(open ? null : s.name)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.displayName}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                  {s.vendor} ／ {s.count}回購入
                  {s.avgIntervalDays !== null && ` ／ 平均${s.avgIntervalDays}日ごと`}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: s.reliable ? lb.color : "var(--muted)", fontWeight: 700, fontSize: 12.5 }}>
                  {s.reliable ? lb.text : "参考"}
                </div>
                {s.daysUntilDue !== null && (
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {s.daysUntilDue < 0 ? `${-s.daysUntilDue}日超過` : `あと${s.daysUntilDue}日`}
                  </div>
                )}
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div className="result-row"><span>前回購入</span><span className="mono">{s.lastDate}（{s.daysSinceLast}日前）</span></div>
                <div className="result-row"><span>前回金額</span><span className="mono">¥{s.lastAmount.toLocaleString()}</span></div>
                <div className="result-row"><span>累計</span><span className="mono">¥{s.totalAmount.toLocaleString()}</span></div>
                {s.nextDueDate && (
                  <div className="result-row"><span>次回の目安</span><span className="mono">{s.nextDueDate}</span></div>
                )}
                <div className="result-row"><span>科目</span><span>{s.category}</span></div>
                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                  購入日: {s.dates.join(" / ")}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 同じ品目を<b>3回以上・2週間以上にわたって</b>買うと、周期として扱い「そろそろ」に出します。
        それ未満は「参考」表示です（開業準備で数日のうちに何度も買った備品を、定期購入と誤認しないため）。
        領収書を登録し続けるほど精度が上がります。
      </p>
    </div>
  );
}
