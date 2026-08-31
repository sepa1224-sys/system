"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// みんなで見る「今月の成績」。
// 数字を全員に開くためのページなので、細かい会計用語は使わず
// 「いくら売れて、いくら残るか」だけが分かるようにしている。

type Data = {
  month: string;
  today: string;
  settings: {
    costRate: number; fixedCost: number; laborCost: number;
    targets: Record<string, number>;
    breakdown: { label: string; amount: number }[];
  };
  days: { total: number; done: number; left: number };
  sales: { total: number; orderCount: number; avgPerDay: number; byDay: { day: string; sales: number; count: number }[] };
  target: number;
  achieveRate: number | null;
  needPerDay: number;
  pnl: { sales: number; cogs: number; gross: number; fixed: number; labor: number; profit: number };
  loan: { total: number; principal: number; interest: number };
  split: { カフェ: { sales: number; qty: number }; 物販: { sales: number; qty: number } };
  cashLeft: number;
  forecast: { sales: number; profit: number };
  breakEven: number;
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const monthJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export default function Seiseki() {
  const [month, setMonth] = useState(monthJST());
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ target: "", fixedCost: "", laborCost: "", costRate: "" });

  const load = useCallback(async (m: string) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/seiseki?month=${m}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得に失敗");
      setD(j);
      setForm({
        target: String(j.target || ""),
        fixedCost: String(j.settings.fixedCost),
        laborCost: String(j.settings.laborCost),
        costRate: String(Math.round(j.settings.costRate * 100)),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得に失敗");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { load(month); }, [month, load]);

  const save = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const targets = { ...d.settings.targets, [month]: Number(form.target) || 0 };
      const res = await fetch("/api/seiseki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targets,
          fixedCost: Number(form.fixedCost) || 0,
          laborCost: Number(form.laborCost) || 0,
          costRate: (Number(form.costRate) || 30) / 100,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "保存に失敗");
      setEdit(false);
      await load(month);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally { setBusy(false); }
  };

  const maxDay = d ? Math.max(1, ...d.sales.byDay.map((x) => x.sales)) : 1;
  const profitPositive = (d?.pnl.profit ?? 0) >= 0;

  return (
    <main>
      <Nav />
      <h1>🏅 今月の成績</h1>
      <p className="lead">
        売上はレジ（Square）の実績。原価と経費は決められた前提での概算です。
      </p>

      <div className="bar">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button onClick={() => load(month)} disabled={busy}>{busy ? "…" : "更新"}</button>
        <button className="ghost" onClick={() => setEdit(!edit)}>
          {edit ? "閉じる" : "前提を変える"}
        </button>
      </div>

      {err && <p className="err">{err}</p>}

      {edit && d && (
        <section className="card edit">
          <label>今月の売上目標<input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} inputMode="numeric" /></label>
          <label>運営経費（月・初期投資は含めない）<input value={form.fixedCost} onChange={(e) => setForm({ ...form, fixedCost: e.target.value })} inputMode="numeric" /></label>
          <label>人件費（月・役員報酬＋社保＋委託＋バイト）<input value={form.laborCost} onChange={(e) => setForm({ ...form, laborCost: e.target.value })} inputMode="numeric" /></label>
          <label>原材料費率（%）<input value={form.costRate} onChange={(e) => setForm({ ...form, costRate: e.target.value })} inputMode="numeric" /></label>
          <button onClick={save} disabled={busy}>保存</button>
        </section>
      )}

      {d && (
        <>
          <section className="hero">
            <div className="big">
              <div className="cap">今月の売上</div>
              <div className="num">{fmt(d.sales.total)}</div>
              <div className="sub">{d.sales.orderCount}件 ／ 1日平均 {fmt(d.sales.avgPerDay)}</div>
            </div>
            <div className="big">
              <div className="cap">目標 {d.target ? fmt(d.target) : "未設定"}</div>
              <div className={`num ${(d.achieveRate ?? 0) >= 100 ? "good" : ""}`}>
                {d.achieveRate !== null ? `${d.achieveRate}%` : "—"}
              </div>
              {d.days.left > 0 && d.needPerDay > 0 && (
                <div className="sub">残り{d.days.left}日 ／ 1日 {fmt(d.needPerDay)} で達成</div>
              )}
            </div>
            <div className="big">
              <div className="cap">今のところの利益</div>
              <div className={`num ${profitPositive ? "good" : "bad"}`}>{fmt(d.pnl.profit)}</div>
              <div className="sub">月末見込み {fmt(d.forecast.profit)}</div>
            </div>
          </section>

          {d.target > 0 && (
            <div className="gauge">
              <div className="fill" style={{ width: `${Math.min(100, d.achieveRate ?? 0)}%` }} />
            </div>
          )}

          {d.split && d.split.物販.sales > 0 && (
            <section className="card">
              <h2>売上の内訳</h2>
              <ul className="bd">
                <li>
                  <span>☕ カフェ</span>
                  <b>{fmt(d.split.カフェ.sales)}</b>
                </li>
                <li>
                  <span>👕 物販（Tシャツ・ステッカーなど）</span>
                  <b>{fmt(d.split.物販.sales)}</b>
                </li>
              </ul>
              <p className="note">
                物販は売上の {Math.round((d.split.物販.sales / Math.max(1, d.sales.total)) * 1000) / 10}%。
                カフェとしての実力を見るときは、こちらを除いた {fmt(d.split.カフェ.sales)} で考えます。
              </p>
            </section>
          )}

          <section className="card">
            <h2>お金の流れ</h2>
            <table className="pnl">
              <tbody>
                <tr><th>売上</th><td>{fmt(d.pnl.sales)}</td></tr>
                <tr><th>材料費（{Math.round(d.settings.costRate * 100)}%）</th><td className="minus">−{fmt(d.pnl.cogs)}</td></tr>
                <tr className="mid"><th>粗利</th><td>{fmt(d.pnl.gross)}</td></tr>
                <tr><th>運営経費</th><td className="minus">−{fmt(d.pnl.fixed)}</td></tr>
                <tr><th>人件費</th><td className="minus">−{fmt(d.pnl.labor)}</td></tr>
                <tr className="total"><th>残り</th><td className={profitPositive ? "good" : "bad"}>{fmt(d.pnl.profit)}</td></tr>
              </tbody>
            </table>
            {d.loan.total > 0 && (
              <p className="note loan">
                このほかに借入の返済が {fmt(d.loan.total)}（元金 {fmt(d.loan.principal)}／利息 {fmt(d.loan.interest)}）。
                元金は経費ではないので上の計算には入っていませんが、お金は出ていきます。
                手元に残るのは <b>{fmt(d.cashLeft)}</b> です。
              </p>
            )}
            <p className="note">
              赤字にならない月商は {fmt(d.breakEven)}（1日 {fmt(Math.round(d.breakEven / d.days.total))}）。
              月の途中は経費を日割りで計算しています。
            </p>
          </section>

          <section className="card">
            <h2>経費の中身（月あたり）</h2>
            <ul className="bd">
              {d.settings.breakdown.map((b) => (
                <li key={b.label}><span>{b.label}</span><b>{fmt(b.amount)}</b></li>
              ))}
              {d.settings.laborCost > 0 && (
                <li className="labor"><span>人件費</span><b>{fmt(d.settings.laborCost)}</b></li>
              )}
            </ul>
            <p className="note">
              内装工事や家具など、開店のために一度だけ使ったお金はここに入れていません。
            </p>
          </section>

          <section className="card">
            <h2>日ごとの売上</h2>
            <ul className="days">
              {d.sales.byDay.map((x) => {
                const wd = WD[new Date(`${x.day}T00:00:00+09:00`).getDay()];
                return (
                  <li key={x.day}>
                    <span className="dt">{x.day.slice(5)}<i>{wd}</i></span>
                    <span className="track"><i style={{ width: `${(x.sales / maxDay) * 100}%` }} /></span>
                    <span className="v">{fmt(x.sales)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <style jsx>{`
        main { max-width: 860px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; }
        .bar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
        input { padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
        button { padding: 8px 14px; border: 0; border-radius: 8px; background: #2b6cb0; color: #fff; font-size: 14px; }
        button.ghost { background: #eee; color: #333; }
        .err { color: #c53030; font-size: 13px; }
        .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
        .big { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; }
        .cap { font-size: 12px; color: #777; }
        .num { font-size: 26px; font-weight: 700; margin: 4px 0; letter-spacing: -0.5px; }
        .num.good { color: #1a7f37; }
        .num.bad { color: #c53030; }
        .sub { font-size: 12px; color: #777; }
        .gauge { height: 10px; background: #eee; border-radius: 99px; margin: 12px 0 0; overflow: hidden; }
        .gauge .fill { height: 100%; background: linear-gradient(90deg, #4299e1, #1a7f37); }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; margin-top: 14px; }
        .card h2 { font-size: 15px; margin: 0 0 10px; }
        .edit { display: grid; gap: 10px; }
        .edit label { display: grid; gap: 4px; font-size: 13px; color: #555; }
        table.pnl { width: 100%; border-collapse: collapse; font-size: 14px; }
        table.pnl th { text-align: left; font-weight: 400; color: #555; padding: 6px 0; }
        table.pnl td { text-align: right; padding: 6px 0; font-variant-numeric: tabular-nums; }
        table.pnl .minus { color: #a05252; }
        table.pnl tr.mid th, table.pnl tr.mid td { border-top: 1px solid #eee; font-weight: 600; }
        table.pnl tr.total th, table.pnl tr.total td { border-top: 2px solid #333; font-weight: 700; font-size: 16px; padding-top: 8px; }
        table.pnl .good { color: #1a7f37; }
        table.pnl .bad { color: #c53030; }
        .note { font-size: 12px; color: #777; margin: 10px 0 0; line-height: 1.7; }
        .note.loan { background: #f6f2ea; border-radius: 8px; padding: 9px 11px; color: #6b5b43; }
        .note.loan b { color: #3a2f1f; }
        ul { list-style: none; margin: 0; padding: 0; }
        .bd li { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px dashed #eee; }
        .bd li.labor { color: #2b6cb0; }
        .days li { display: grid; grid-template-columns: 62px 1fr 84px; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
        .days .dt { color: #666; }
        .days .dt i { font-style: normal; margin-left: 3px; color: #aaa; }
        .days .track { background: #f2f2f2; border-radius: 4px; height: 12px; overflow: hidden; }
        .days .track i { display: block; height: 100%; background: #63b3ed; }
        .days .v { text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>
    </main>
  );
}
