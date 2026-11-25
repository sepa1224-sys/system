"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { threadsLength, MAX_LENGTH } from "@/lib/threadsPlan";

// Threadsの自動投稿。前日の22時にAIが下書きを作り、何もしなければ決まった時刻に出る。

type Mark = { on: boolean; title: string; line: string; date: string };
type Ev = { id: string; title: string; date: string; isRun: boolean; live: boolean; mark: Mark | null };
type Settings = {
  on: boolean; time: string; memo: string; nightLine: string; runMemo: string;
  runAlways: { on: boolean; line: string }; aiLabel: boolean;
};
type Draft = { date: string; text: string; createdAt: string; status: "ready" | "hold"; note?: string; edited?: boolean };
type Run = {
  date: string; time: string; at: string; status: "posted" | "skipped" | "error" | "check";
  themeLabel: string; text?: string; url?: string; detail?: string;
};
type View = {
  configured: boolean;
  conn: { username: string; daysLeft: number; lastError?: string } | null;
  settings: Settings;
  skips: string[];
  next: { date: string; stopped: boolean; draft: Draft | null; themeLabel: string | null; check: { errors: string[]; warnings: string[] } | null } | null;
  events: Ev[];
  runs: Run[];
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}（${WD[new Date(`${d}T00:00:00`).getDay()]}）`;
const STATUS: Record<Run["status"], { label: string; color: string }> = {
  posted: { label: "出した", color: "#2e7d32" },
  skipped: { label: "出さなかった", color: "#7a7a7a" },
  error: { label: "失敗", color: "#c0392b" },
  check: { label: "確認してください", color: "#c0392b" },
};
const small = { fontSize: 12, color: "var(--muted)" } as const;
const row = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } as const;

export default function ThreadsPage() {
  const [v, setV] = useState<View | null>(null);
  const [text, setText] = useState("");
  const [form, setForm] = useState<Settings | null>(null);
  const [edit, setEdit] = useState<{ id: string; title: string; line: string } | null>(null);
  const [skip, setSkip] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/threads", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setV(d);
      setText(d.next?.draft?.text ?? "");
      setForm(d.settings);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "読み込みに失敗");
    }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")) setErr(`つなげませんでした：${p.get("error")}`);
    if (p.get("connected")) setMsg("Threadsにつながりました");
    if (p.size) window.history.replaceState(null, "", "/threads");
    load();
  }, [load]);

  /** 送った内容だけを画面に反映する。書きかけの本文や設定は消さない */
  async function send(body: Record<string, unknown>, done: string, take: "draft" | "settings" | "none" = "none") {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/threads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      // 下書きの中身が変わったら、書きかけより新しい方を出す（日付がずれたまま保存しないように）
      const before = v?.next?.draft, after = d.next?.draft;
      if (before?.date !== after?.date || before?.text !== after?.text) setText(after?.text ?? "");
      setV(d);
      if (take === "draft") setText(d.next?.draft?.text ?? "");
      if (take === "settings") setForm(d.settings);
      setMsg(done);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const draft = v?.next?.draft ?? null;
  const len = threadsLength(text);
  const dirty = !!draft && text !== draft.text;

  return (
    <div className="wrap">
      <header>
        <h1>🧵 Threads</h1>
        <p>前の日にAIが下書きを作り、何もしなければ決まった時刻に出る</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}
      {msg && <p className="hint" style={{ color: "#2e7d32", fontWeight: 700 }}>{msg}</p>}
      {!v && !err && <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>読み込み中…</div>}

      {v && form && (
        <>
          <div className="card" style={{ padding: 14 }}>
            <div className="cat-title">接続と自動投稿</div>
            {v.conn ? (
              <>
                <div style={{ fontSize: 14 }}><strong>@{v.conn.username}</strong> に接続しています</div>
                <div style={{ ...small, color: v.conn.daysLeft < 10 ? "#c0392b" : "var(--muted)", fontWeight: v.conn.daysLeft < 10 ? 700 : 400 }}>
                  {v.conn.daysLeft < 0 ? "期限が切れました。つなぎ直してください" : `期限まで ${v.conn.daysLeft}日（週に1回、自動で延ばします）`}
                </div>
                {v.conn.lastError && <p className="err">最後のエラー: {v.conn.lastError}</p>}
              </>
            ) : (
              <p style={{ fontSize: 13, margin: 0 }}>
                {v.configured ? "まだ接続していません。" : "まだ準備ができていません（Metaのアプリの設定が要ります）。下書きは作れます。"}
              </p>
            )}
            <div style={{ ...row, marginTop: 10 }}>
              {v.configured && (
                <button className={v.conn ? "" : "primary"} onClick={() => { window.location.href = "/api/threads/authorize"; }}>
                  {v.conn ? "つなぎ直す" : "Threadsにつなぐ"}
                </button>
              )}
              {v.conn && (
                <button disabled={busy} onClick={() => confirm("接続を外しますか？自動の投稿も止まります") && send({ action: "disconnect" }, "接続を外しました")}>接続を外す</button>
              )}
            </div>
            <label style={{ ...row, marginTop: 12, fontSize: 14, fontWeight: 700 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={v.settings.on} disabled={busy}
                onChange={(e) => {
                  const on = e.target.checked;
                  if (!on || confirm("自動投稿を始めますか？下書きが決まった時刻に公開されます")) send({ action: "settings", settings: { on } }, on ? "自動投稿をオンにしました" : "自動投稿をオフにしました");
                }} />
              自動投稿 {v.settings.on ? "オン" : "オフ"}
            </label>
            {!v.settings.on && <div style={small}>オフの間も下書きは作られます。投稿はされません。</div>}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="cat-title">次の下書き</div>
            {!v.next && <p style={{ fontSize: 13 }}>この先30日に出す日がありません。</p>}
            {v.next && (
              <>
                <div style={{ fontSize: 14 }}>
                  <strong>{md(v.next.date)} {v.settings.time}</strong>
                  {v.next.themeLabel && <span style={{ ...small, marginLeft: 8 }}>{v.next.themeLabel}</span>}
                </div>
                {!draft && (
                  <>
                    <p style={{ fontSize: 13 }}>まだありません。前の日の22時ごろに自動で作ります。</p>
                    <button className="primary" disabled={busy} onClick={() => send({ action: "make" }, "下書きを作りました", "draft")}>
                      {busy ? "お待ちください…" : "今すぐ作る"}
                    </button>
                  </>
                )}
                {draft && (
                  <>
                    {v.next.stopped && <p className="err">この日は出しません</p>}
                    {draft.note && <p className="hint">{draft.note}</p>}
                    <textarea rows={8} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} style={{ width: "100%", marginTop: 6, fontSize: 15, lineHeight: 1.6 }} />
                    <div style={{ ...small, color: len > MAX_LENGTH ? "#c0392b" : "var(--muted)" }}>
                      {len} / {MAX_LENGTH}字{dirty && "　まだ保存していません"}
                    </div>
                    {!dirty && v.next.check && [...v.next.check.errors, ...v.next.check.warnings].map((w) => <p key={w} className="err">{w}</p>)}
                    <div style={{ ...row, marginTop: 8 }}>
                      <button className="primary" disabled={busy || (!dirty && draft.status === "ready")} onClick={() => send({ action: "saveDraft", date: draft.date, createdAt: draft.createdAt, text }, "保存しました", "draft")}>{draft.status === "hold" ? "確かめて保存" : "保存"}</button>
                      {!v.next.stopped
                        ? <button disabled={busy} onClick={() => send({ action: "stop", date: draft.date }, "この日は出しません")}>この日は出さない</button>
                        : <button disabled={busy} onClick={() => send({ action: "resume", date: draft.date }, "出すように戻しました")}>出すように戻す</button>}
                      <button disabled={busy} onClick={() => (!(dirty || draft.edited) || confirm("直した本文は消えます。作り直しますか？")) && send({ action: "make" }, "作り直しました", "draft")}>
                        {busy ? "お待ちください…" : "作り直す"}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="cat-title">告知するイベント</div>
            <p style={{ ...small, marginTop: 0 }}>
              「告知する」にしたものだけ、前日と3日前に出します。AIに渡すのは日付と、ここで入れた題と一文だけです（予定表の場所・メモは渡しません）。
            </p>
            <div style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <label style={{ ...row, fontSize: 14, fontWeight: 700 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={form.runAlways.on} disabled={busy}
                  onChange={(e) => send({ action: "settings", settings: { runAlways: { ...form.runAlways, on: e.target.checked } } }, e.target.checked ? "木曜のランを毎週告知します" : "やめました", "none")
                    .then((ok) => ok && setForm((f) => f && { ...f, runAlways: { ...f.runAlways, on: !f.runAlways.on } }))} />
                木曜のランを毎週告知する（前日の水曜だけ）
              </label>
              <textarea rows={2} value={form.runAlways.line} onChange={(e) => setForm({ ...form, runAlways: { ...form.runAlways, line: e.target.value } })} style={{ width: "100%", marginTop: 6 }} />
              {form.runAlways.line !== v.settings.runAlways.line && (
                <button disabled={busy} onClick={() => send({ action: "settings", settings: { runAlways: form.runAlways } }, "保存しました")}>この文を保存</button>
              )}
            </div>
            {v.events.length === 0 && <p style={{ fontSize: 13 }}>この先の予定がありません。</p>}
            {v.events.map((e) => (
              <div key={e.id} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ ...row, justifyContent: "space-between" }}>
                  <div style={{ fontSize: 14, minWidth: 0 }}>
                    <strong>{md(e.date)}</strong> {e.title}
                    {e.live && <span style={{ color: "#2e7d32", fontWeight: 700, fontSize: 12, marginLeft: 6 }}>告知する</span>}
                  </div>
                  {e.mark?.on ? (
                    <div style={row}>
                      <button disabled={busy} onClick={() => setEdit({ id: e.id, title: e.mark!.title, line: e.mark!.line })}>直す</button>
                      <button disabled={busy} onClick={() => send({ action: "mark", id: e.id, on: false, title: e.mark!.title, line: e.mark!.line }, "告知をやめました")}>やめる</button>
                    </div>
                  ) : e.live ? (
                    <button disabled={busy} onClick={() => send({ action: "mark", id: e.id, on: false, title: "", line: "" }, "この回は告知しません")}>この回はやめる</button>
                  ) : (
                    <button disabled={busy} onClick={() => setEdit({ id: e.id, title: e.mark?.title ?? "", line: e.mark?.line ?? "" })}>告知する</button>
                  )}
                </div>
                {e.mark?.on && <div style={small}>{e.mark.title}：{e.mark.line}</div>}
                {edit?.id === e.id && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    <input placeholder="公開する題（例：ムービーナイト）" value={edit.title} maxLength={60} onChange={(x) => setEdit({ ...edit, title: x.target.value })} />
                    <textarea rows={2} placeholder="公開用の一文（例：19時から。参加費500円、予約なしで来られます）" value={edit.line} maxLength={300} onChange={(x) => setEdit({ ...edit, line: x.target.value })} />
                    <div style={row}>
                      <button className="primary" disabled={busy || !edit.title.trim() || !edit.line.trim()}
                        onClick={async () => { if (await send({ action: "mark", on: true, ...edit }, "告知するようにしました")) setEdit(null); }}>告知する</button>
                      <button onClick={() => setEdit(null)}>やめる</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="cat-title">設定</div>
            <label style={{ fontSize: 13 }}>投稿の時刻（7:00〜22:30）
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
            <label style={{ fontSize: 13 }}>夜の営業の言い方
              <input value={form.nightLine} maxLength={100} onChange={(e) => setForm({ ...form, nightLine: e.target.value })} />
            </label>
            <label style={{ fontSize: 13 }}>店の紹介メモ（AIはここに書いてあることだけで書きます）
              <textarea rows={7} value={form.memo} maxLength={2000} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 13 }}>ランの説明（ランを書く日だけAIに渡します）
              <textarea rows={4} value={form.runMemo} maxLength={600} onChange={(e) => setForm({ ...form, runMemo: e.target.value })} style={{ width: "100%" }} />
            </label>
            <label style={{ ...row, fontSize: 13 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={form.aiLabel} onChange={(e) => setForm({ ...form, aiLabel: e.target.checked })} />
              「AIで作成」の印を付ける
            </label>
            <button className="primary" disabled={busy}
              onClick={() => send({ action: "settings", settings: { ...(form.time !== v.settings.time ? { time: form.time } : {}), nightLine: form.nightLine, memo: form.memo, runMemo: form.runMemo, aiLabel: form.aiLabel } }, "保存しました")}>設定を保存</button>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>出さない日（貸切など）</div>
              <div style={small}>火曜と、インスタの画面で入れた臨時休業の日は、入れなくても出ません。</div>
              <div style={{ ...row, marginTop: 6 }}>
                <input type="date" value={skip} onChange={(e) => setSkip(e.target.value)} style={{ flex: 1 }} />
                <button disabled={!skip || busy}
                  onClick={async () => { if (await send({ action: "skip", date: skip }, "足しました", "none")) { setSkip(""); } }}>足す</button>
              </div>
              <div style={{ ...row, marginTop: 8 }}>
                {v.skips.map((d) => (
                  <span key={d} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 12, background: "#f3f3f3" }}>
                    {md(d)} <button aria-label={`${md(d)}を外す`} disabled={busy} style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
                      onClick={() => send({ action: "unskip", date: d }, "外しました")}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="cat-title">これまでの動き</div>
            {v.runs.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>まだありません。</p>}
            {v.runs.map((r) => (
              <div key={r.at} style={{ fontSize: 12.5, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <strong>{md(r.date)} {r.time}</strong> {r.themeLabel}{" "}
                <span style={{ color: STATUS[r.status].color, fontWeight: 700 }}>{STATUS[r.status].label}</span>
                {r.url && <> <a href={r.url} target="_blank" rel="noreferrer">開く</a></>}
                {r.detail && <div style={small}>{r.detail}</div>}
                {r.text && <div style={{ ...small, whiteSpace: "pre-wrap" }}>{r.text}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
