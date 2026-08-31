"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import { CONTRACT_KINDS } from "@/lib/contracts";

// 契約書。中身より「いつまでに動くか」が大事なので、
// 解約予告の期限が近いものを上に出す。

type Status = { noticeBy?: string; daysToNotice?: number; daysToEnd?: number; alert: "" | "soon" | "passed"; message: string };
type Contract = {
  id: string; title: string; kind: string; party: string; partyContact?: string;
  signedOn?: string; startDate: string; endDate?: string;
  autoRenew: boolean; renewMonths?: number; noticeMonths?: number;
  monthlyAmount?: number; paymentTerms?: string; initialCost?: number;
  notes?: string; active: boolean; status: Status;
};

const fmt = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const blank = {
  title: "", kind: "その他", party: "", partyContact: "", signedOn: "",
  startDate: "", endDate: "", autoRenew: true, renewMonths: 12, noticeMonths: 1,
  monthlyAmount: "", paymentTerms: "", initialCost: "", notes: "",
};

export default function Contracts() {
  const [list, setList] = useState<Contract[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<typeof blank & { id?: string }>({ ...blank });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得に失敗");
      setList(j.contracts);
    } catch (e) { setErr(e instanceof Error ? e.message : "取得に失敗"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          monthlyAmount: form.monthlyAmount ? Number(form.monthlyAmount) : undefined,
          initialCost: form.initialCost ? Number(form.initialCost) : undefined,
          renewMonths: form.renewMonths ? Number(form.renewMonths) : undefined,
          noticeMonths: form.noticeMonths ? Number(form.noticeMonths) : undefined,
          file: file || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "保存に失敗");
      setForm({ ...blank }); setFile(""); setOpen(false);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "保存に失敗"); }
    finally { setBusy(false); }
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setFile(String(r.result));
    r.readAsDataURL(f);
  };

  const showFile = async (id: string) => {
    const res = await fetch(`/api/contracts?file=${id}`);
    const j = await res.json();
    if (!res.ok) { setErr(j.error || "ファイルがありません"); return; }
    setViewing(j.file);
  };

  const sorted = list
    ? [...list].sort((a, b) => {
        const rank = (c: Contract) => (c.status.alert === "passed" ? 0 : c.status.alert === "soon" ? 1 : 2);
        return rank(a) - rank(b) || (a.endDate || "9999").localeCompare(b.endDate || "9999");
      })
    : [];

  return (
    <main>
      <Nav />
      <h1>📜 契約書</h1>
      <p className="lead">
        いま生きている約束をまとめる場所です。大事なのは中身より期限で、
        解約予告の期限を過ぎると自動で更新されてしまいます。
      </p>

      {err && <p className="err">{err}</p>}

      <button className="add" onClick={() => setOpen(!open)}>
        {open ? "閉じる" : "＋ 契約を登録"}
      </button>

      {open && (
        <section className="card form">
          <label>契約名<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="京町パーキング 駐車場使用契約" /></label>
          <label>種類
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label>相手先<input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} placeholder="株式会社◯◯" /></label>
          <label>連絡先<input value={form.partyContact} onChange={(e) => setForm({ ...form, partyContact: e.target.value })} placeholder="TEL・住所" /></label>
          <div className="row">
            <label>締結日<input type="date" value={form.signedOn} onChange={(e) => setForm({ ...form, signedOn: e.target.value })} /></label>
            <label>開始日<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label>満了日<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          <div className="row">
            <label className="ck">
              <input type="checkbox" checked={form.autoRenew} onChange={(e) => setForm({ ...form, autoRenew: e.target.checked })} />
              自動更新する
            </label>
            <label>更新の単位（か月）<input value={form.renewMonths} onChange={(e) => setForm({ ...form, renewMonths: Number(e.target.value) })} inputMode="numeric" /></label>
            <label>解約予告（か月前）<input value={form.noticeMonths} onChange={(e) => setForm({ ...form, noticeMonths: Number(e.target.value) })} inputMode="numeric" /></label>
          </div>
          <div className="row">
            <label>毎月の金額<input value={form.monthlyAmount} onChange={(e) => setForm({ ...form, monthlyAmount: e.target.value })} inputMode="numeric" placeholder="42000" /></label>
            <label>契約時の一時金<input value={form.initialCost} onChange={(e) => setForm({ ...form, initialCost: e.target.value })} inputMode="numeric" placeholder="礼金・保証金" /></label>
          </div>
          <label>支払条件<input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="毎月月末までに翌月分を振込" /></label>
          <label>覚えておくこと<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="特約など" /></label>
          <label>契約書のPDF・写真<input type="file" accept="application/pdf,image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} /></label>
          {file && <p className="ok">ファイルを読み込みました</p>}
          <button onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        </section>
      )}

      {sorted.map((c) => (
        <section className={`card contract ${c.status.alert}`} key={c.id}>
          <div className="head">
            <div>
              <span className="kind">{c.kind}</span>
              <h2>{c.title}</h2>
              <p className="party">{c.party}{c.partyContact ? ` ／ ${c.partyContact}` : ""}</p>
            </div>
            {c.monthlyAmount ? <div className="amt">{fmt(c.monthlyAmount)}<span>／月</span></div> : null}
          </div>

          <p className={`status ${c.status.alert}`}>
            {c.status.alert === "passed" ? "⚠️ " : c.status.alert === "soon" ? "🔔 " : ""}
            {c.status.message}
          </p>

          <ul className="facts">
            <li><span>期間</span><b>{c.startDate} 〜 {c.endDate || "定めなし"}</b></li>
            <li><span>更新</span><b>{c.autoRenew ? `自動更新（${c.renewMonths ?? 12}か月ごと）` : "自動更新なし"}</b></li>
            {c.noticeMonths ? <li><span>解約予告</span><b>{c.noticeMonths}か月前</b></li> : null}
            {c.initialCost ? <li><span>契約時の一時金</span><b>{fmt(c.initialCost)}</b></li> : null}
            {c.signedOn ? <li><span>締結日</span><b>{c.signedOn}</b></li> : null}
          </ul>

          {c.paymentTerms && <p className="terms">支払条件：{c.paymentTerms}</p>}
          {c.notes && <p className="notes">{c.notes}</p>}

          <div className="acts">
            <button className="ghost" onClick={() => showFile(c.id)}>契約書を見る</button>
            <button className="ghost danger" onClick={async () => {
              if (!confirm(`${c.title} を削除しますか？`)) return;
              await fetch(`/api/contracts?id=${c.id}`, { method: "DELETE" });
              await load();
            }}>削除</button>
          </div>
        </section>
      ))}

      {list && list.length === 0 && <p className="empty">まだ契約が登録されていません。</p>}

      {viewing && (
        <div className="viewer" onClick={() => setViewing("")}>
          {viewing.startsWith("data:application/pdf")
            ? <iframe src={viewing} title="契約書" />
            : <img src={viewing} alt="契約書" />}
        </div>
      )}

      <style jsx>{`
        main { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; max-width: 58ch; line-height: 1.7; }
        .err { color: #c53030; font-size: 13px; }
        .ok { color: #2f855a; font-size: 12px; margin: 0; }
        .add { border: 0; background: #2b6cb0; color: #fff; padding: 9px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 16px; margin-top: 14px; }
        .form { display: grid; gap: 10px; }
        .form label { display: grid; gap: 4px; font-size: 12.5px; color: #555; }
        .form .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .form .ck { flex-direction: row; display: flex; align-items: center; gap: 8px; font-size: 13px; }
        input, select, textarea { padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; }
        .form > button { border: 0; background: #2b6cb0; color: #fff; padding: 10px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .contract.soon { border-color: #e0b072; background: #fffaf2; }
        .contract.passed { border-color: #d99; background: #fff6f5; }
        .head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .kind { font-size: 11px; background: #eef2f6; color: #4a5b6b; padding: 2px 8px; border-radius: 99px; }
        .contract h2 { font-size: 16px; margin: 6px 0 2px; }
        .party { font-size: 12.5px; color: #777; margin: 0; }
        .amt { font-size: 20px; font-weight: 700; white-space: nowrap; }
        .amt span { font-size: 11px; color: #888; font-weight: 400; margin-left: 2px; }
        .status { font-size: 13px; margin: 12px 0; padding: 8px 10px; border-radius: 8px; background: #f5f5f3; color: #555; }
        .status.soon { background: #fdf1de; color: #8a5a1a; font-weight: 600; }
        .status.passed { background: #fbe6e4; color: #9c3a2e; font-weight: 700; }
        .facts { list-style: none; margin: 0 0 10px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 4px 16px; }
        .facts li { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; border-bottom: 1px dashed #eee; padding: 4px 0; }
        .facts span { color: #888; }
        .terms, .notes { font-size: 12.5px; color: #666; margin: 6px 0 0; line-height: 1.7; }
        .notes { background: #f7f7f5; padding: 8px 10px; border-radius: 8px; white-space: pre-wrap; }
        .acts { display: flex; gap: 8px; margin-top: 12px; }
        .ghost { background: #eee; color: #333; border: 0; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; cursor: pointer; }
        .ghost.danger { color: #c0392b; }
        .empty { color: #888; font-size: 13px; margin-top: 20px; }
        .viewer { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
        .viewer img { max-width: 100%; max-height: 100%; }
        .viewer iframe { width: 100%; height: 100%; border: 0; background: #fff; }
      `}</style>
    </main>
  );
}
