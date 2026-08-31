"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import { COMPANY_DOC_KINDS } from "@/lib/companyDocs";

// 会社書類。定款・登記・印鑑証明など、会社そのものを証明する書類。
// 役所に出すときに探すので、種類ごとにまとめて置く。

type Doc = {
  id: string; kind: string; title: string; date: string;
  issuer?: string; validUntil?: string; summary?: string; current: boolean;
};

const blank = { kind: "定款", title: "", date: "", issuer: "", validUntil: "", summary: "", current: true };
const todayJST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function Company() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [file, setFile] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company-docs");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "取得に失敗");
      setDocs(j.docs);
    } catch (e) { setErr(e instanceof Error ? e.message : "取得に失敗"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/company-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, file: file || undefined }),
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

  const show = async (id: string) => {
    const res = await fetch(`/api/company-docs?file=${id}`);
    const j = await res.json();
    if (!res.ok) { setErr(j.error || "ファイルがありません"); return; }
    setViewing(j.file);
  };

  const today = todayJST();
  const byKind = COMPANY_DOC_KINDS
    .map((k) => ({ kind: k, items: (docs ?? []).filter((d) => d.kind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <main>
      <Nav />
      <h1>🏢 会社書類</h1>
      <p className="lead">
        定款・登記・印鑑証明など、会社そのものを証明する書類の置き場です。
        役所や銀行に出すときにここから探します。
      </p>

      {err && <p className="err">{err}</p>}

      <button className="add" onClick={() => setOpen(!open)}>
        {open ? "閉じる" : "＋ 書類を登録"}
      </button>

      {open && (
        <section className="card form">
          <label>種類
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {COMPANY_DOC_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label>書類名<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="定款（設立時）" /></label>
          <div className="row">
            <label>作成・発行日<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>有効期限<input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></label>
          </div>
          <label>発行元<input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} placeholder="法務局・税務署など" /></label>
          <label>要点<textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="あとで探すときの手がかり" /></label>
          <label className="ck">
            <input type="checkbox" checked={form.current} onChange={(e) => setForm({ ...form, current: e.target.checked })} />
            これが最新版
          </label>
          <label>ファイル<input type="file" accept="application/pdf,image/*" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} /></label>
          {file && <p className="ok">ファイルを読み込みました</p>}
          <button onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
        </section>
      )}

      {byKind.map((g) => (
        <section key={g.kind}>
          <h2>{g.kind}</h2>
          {g.items.map((d) => {
            const expired = d.validUntil && d.validUntil < today;
            return (
              <div className={`card doc ${!d.current ? "old" : ""} ${expired ? "expired" : ""}`} key={d.id}>
                <div className="head">
                  <div>
                    <h3>{d.title}{!d.current && <span className="tag">旧版</span>}</h3>
                    <p className="meta">
                      {d.date}{d.issuer ? ` ／ ${d.issuer}` : ""}
                      {d.validUntil ? ` ／ 有効期限 ${d.validUntil}${expired ? "（切れています）" : ""}` : ""}
                    </p>
                  </div>
                </div>
                {d.summary && <p className="summary">{d.summary}</p>}
                <div className="acts">
                  <button className="ghost" onClick={() => show(d.id)}>開く</button>
                  <button className="ghost danger" onClick={async () => {
                    if (!confirm(`${d.title} を削除しますか？`)) return;
                    await fetch(`/api/company-docs?id=${d.id}`, { method: "DELETE" });
                    await load();
                  }}>削除</button>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {docs && docs.length === 0 && <p className="empty">まだ書類が登録されていません。</p>}

      {viewing && (
        <div className="viewer" onClick={() => setViewing("")}>
          {viewing.startsWith("data:application/pdf")
            ? <iframe src={viewing} title="書類" />
            : <img src={viewing} alt="書類" />}
        </div>
      )}

      <style jsx>{`
        main { max-width: 820px; margin: 0 auto; padding: 16px 14px 60px; }
        h1 { font-size: 20px; margin: 12px 0 4px; }
        h2 { font-size: 14px; margin: 22px 0 0; color: #5b6b7b; letter-spacing: .04em; }
        .lead { color: #666; font-size: 13px; margin: 0 0 14px; max-width: 58ch; line-height: 1.7; }
        .err { color: #c53030; font-size: 13px; }
        .ok { color: #2f855a; font-size: 12px; margin: 0; }
        .add { border: 0; background: #2b6cb0; color: #fff; padding: 9px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .card { background: #fff; border: 1px solid #eee; border-radius: 12px; padding: 14px 16px; margin-top: 10px; }
        .form { display: grid; gap: 10px; }
        .form label { display: grid; gap: 4px; font-size: 12.5px; color: #555; }
        .form .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        .form .ck { display: flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; }
        input, select, textarea { padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; }
        .form > button { border: 0; background: #2b6cb0; color: #fff; padding: 10px; border-radius: 8px; font-size: 14px; cursor: pointer; }
        .doc.old { opacity: .62; }
        .doc.expired { border-color: #d99; background: #fff7f6; }
        .doc h3 { font-size: 15px; margin: 0 0 3px; }
        .tag { font-size: 10.5px; background: #eee; color: #777; padding: 2px 7px; border-radius: 99px; margin-left: 8px; vertical-align: middle; }
        .meta { font-size: 12px; color: #888; margin: 0; }
        .summary { font-size: 12.5px; color: #555; margin: 8px 0 0; white-space: pre-wrap; line-height: 1.75; background: #f8f8f6; padding: 9px 11px; border-radius: 8px; }
        .acts { display: flex; gap: 8px; margin-top: 10px; }
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
