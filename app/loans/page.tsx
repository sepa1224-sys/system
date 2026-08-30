"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";

// 借入金の返済予定。元金は費用にならないが現金は出ていくので、
// 利益とは別に「毎月いくら要るか」をここで見る。

type Inst = { round: number; date: string; days: number; principal: number; interest: number; total: number; balance: number };
type LoanView = {
  id: string; ref: string; name: string; lender: string;
  principal: number; rate: number; drawdown: string; firstPayment: string;
  rounds: number; lastDate: string; balance: number;
  paidPrincipal: number; paidInterest: number; totalInterest: number;
  next: Inst | null; schedule: Inst[];
};
type Data = {
  today: string; month: string;
  loans: LoanView[];
  thisMonth: { ref: string; name: string; round: number; date: string; principal: number; interest: number; total: number }[];
  thisMonthTotal: number;
  balanceNow: number;
  byYear: { year: string; principal: number; interest: number; total: number }[];
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const monthJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);

export default function Loans() {
  const [month, setMonth] = useState(monthJST());
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    try {
      const res = await fetch(`/api/loans?month=${m}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得に失敗");
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "取得に失敗"); }
  }, []);
  useEffect(() => { load(month); }, [month, load]);

  return (
    <main>
      <Nav />
      <h1>🏦 借入金の返済</h1>
      <p className="lead">
        元金の返済は経費になりません（借金が減るだけ）。経費になるのは利息だけです。
        ただし現金は元金＋利息の両方が出ていくので、利益とは別に見ておく必要があります。
      </p>

      {err && <p className="err">{err}</p>}

      {d && (
        <>
          <section className="hero">
            <div className="big">
              <div className="cap">残っている借金</div>
              <div className="num">{fmt(d.balanceNow)}</div>
              <div className="sub">{d.today} 時点</div>
            </div>
            <div className="big">
              <div className="cap">
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /> の返済
              </div>
              <div className="num">{fmt(d.thisMonthTotal)}</div>
              <div className="sub">
                {d.thisMonth.length === 0
                  ? "この月の返済はありません"
                  : d.thisMonth.map((p) => `${p.ref} ${p.date.slice(5)}`).join(" / ")}
              </div>
            </div>
          </section>

          {d.thisMonth.length > 0 && (
            <section className="card">
              <h2>{month} に引き落とされるお金</h2>
              <table>
                <thead>
                  <tr><th>借入</th><th>引落日</th><th className="r">元金</th><th className="r">利息</th><th className="r">合計</th></tr>
                </thead>
                <tbody>
                  {d.thisMonth.map((p) => (
                    <tr key={p.ref}>
                      <td>{p.ref}<span className="dim"> {p.round}回目</span></td>
                      <td>{p.date}</td>
                      <td className="r">{fmt(p.principal)}</td>
                      <td className="r warn">{fmt(p.interest)}</td>
                      <td className="r b">{fmt(p.total)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td colSpan={2}>合計</td>
                    <td className="r">{fmt(d.thisMonth.reduce((s, p) => s + p.principal, 0))}</td>
                    <td className="r warn">{fmt(d.thisMonth.reduce((s, p) => s + p.interest, 0))}</td>
                    <td className="r">{fmt(d.thisMonthTotal)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="note">
                このうち経費になるのは利息だけです。元金は「借入金」という負債が減るだけなので、利益には影響しません。
              </p>
            </section>
          )}

          {d.loans.map((l) => (
            <section className="card" key={l.id}>
              <h2>{l.ref}　{l.name}</h2>
              <ul className="facts">
                <li><span>借入額</span><b>{fmt(l.principal)}</b></li>
                <li><span>年利</span><b>{(l.rate * 100).toFixed(2)}%</b></li>
                <li><span>残高</span><b>{fmt(l.balance)}</b></li>
                <li><span>返済回数</span><b>全{l.rounds}回</b></li>
                <li><span>完済予定</span><b>{l.lastDate}</b></li>
                <li><span>利息の総額</span><b className="warn">{fmt(l.totalInterest)}</b></li>
              </ul>
              {l.next && (
                <p className="next">
                  次回 <b>{l.next.date}</b>　{fmt(l.next.total)}
                  <span className="dim">（元金 {fmt(l.next.principal)}／利息 {fmt(l.next.interest)}）</span>
                </p>
              )}
              <button className="ghost" onClick={() => setOpen(open === l.id ? null : l.id)}>
                {open === l.id ? "予定表を閉じる" : "返済予定をぜんぶ見る"}
              </button>
              {open === l.id && (
                <div className="scroll">
                  <table>
                    <thead>
                      <tr><th>回</th><th>引落日</th><th className="r">元金</th><th className="r">利息</th><th className="r">支払額</th><th className="r">残高</th></tr>
                    </thead>
                    <tbody>
                      {l.schedule.map((i) => (
                        <tr key={i.round} className={i.date <= d.today ? "past" : ""}>
                          <td>{i.round}</td>
                          <td>{i.date}</td>
                          <td className="r">{i.principal ? fmt(i.principal) : "—"}</td>
                          <td className="r warn">{fmt(i.interest)}</td>
                          <td className="r b">{fmt(i.total)}</td>
                          <td className="r dim">{fmt(i.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <section className="card">
            <h2>年ごとの返済額</h2>
            <div className="scroll">
              <table>
                <thead>
                  <tr><th>年</th><th className="r">元金</th><th className="r">利息</th><th className="r">合計</th><th className="r">月あたり</th></tr>
                </thead>
                <tbody>
                  {d.byYear.map((y) => (
                    <tr key={y.year}>
                      <td>{y.year}年</td>
                      <td className="r">{fmt(y.principal)}</td>
                      <td className="r warn">{fmt(y.interest)}</td>
                      <td className="r b">{fmt(y.total)}</td>
                      <td className="r dim">{fmt(y.total / 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              2026年は据置期間で利息だけ。元金の返済は2027年1月から始まります。
            </p>
          </section>
        </>
      )}

      <style jsx>{`
        main { max-width: 900px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; max-width: 60ch; line-height: 1.7; }
        .err { color: #c53030; font-size: 13px; }
        .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .big { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; }
        .cap { font-size: 12px; color: #777; display: flex; align-items: center; gap: 6px; }
        .num { font-size: 26px; font-weight: 700; margin: 4px 0; }
        .sub { font-size: 12px; color: #777; }
        input { padding: 4px 6px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px; margin-top: 14px; }
        .card h2 { font-size: 15px; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; font-weight: 500; color: #666; font-size: 11.5px; border-bottom: 1px solid #e5e5e5; padding: 6px 8px; }
        td { padding: 6px 8px; border-bottom: 1px solid #f2f2f2; }
        .r { text-align: right; font-variant-numeric: tabular-nums; }
        .b { font-weight: 700; }
        .dim { color: #999; font-weight: 400; }
        .warn { color: #a05252; }
        tr.total td { border-top: 2px solid #333; border-bottom: none; font-weight: 700; }
        tr.past td { color: #aaa; }
        .facts { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; }
        .facts li { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px dashed #eee; padding: 4px 0; }
        .facts span { color: #777; }
        .next { font-size: 13px; margin: 8px 0 10px; }
        button.ghost { background: #eee; color: #333; border: 0; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; }
        .scroll { overflow-x: auto; margin-top: 10px; max-height: 420px; overflow-y: auto; }
        .note { font-size: 12px; color: #777; margin: 10px 0 0; line-height: 1.7; }
      `}</style>
    </main>
  );
}
