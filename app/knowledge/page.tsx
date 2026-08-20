"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// 店のナレッジ。分からなくて誰かに聞いたことを、ここに書いて残す。
// 書いた文章はAIが整形してから保存するので、走り書きのままで構わない。
// 溜めたものはチャットボット(/help)が読んで答えるようになる。

type Entry = {
  id: string;
  title: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  source?: string;
  raw?: string;
  createdAt: string;
  updatedAt: string;
};

const CATEGORIES = [
  "ドリンク", "フード", "接客", "レジ・会計",
  "設備・機器", "掃除・衛生", "仕入れ", "その他",
];

export default function KnowledgePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState("");
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState<Partial<Entry> | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setEntries(d.entries || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const makeDraft = async () => {
    if (!raw.trim()) return;
    setBusy("draft"); setErr("");
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", raw, source }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "整形に失敗");
      setDraft(d.draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "整形に失敗");
    } finally { setBusy(""); }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save"); setErr("");
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", entry: draft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "保存に失敗");
      setDraft(null); setRaw(""); setSource("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗");
    } finally { setBusy(""); }
  };

  const del = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    await fetch(`/api/knowledge?id=${id}`, { method: "DELETE" });
    await load();
  };

  const list = entries.filter(
    (e) => !q || [e.title, e.question, e.answer, e.category, ...(e.tags ?? [])].join(" ").includes(q),
  );

  return (
    <div className="wrap">
      <header>
        <h1>📚 ナレッジ</h1>
        <p>分からなくて聞いたことを残す。チャットボットがここから答えます</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <div className="card total-card">
        <div className="total-label">たまっているナレッジ</div>
        <div className="total-amount">{entries.length}件</div>
      </div>

      {/* 入力 */}
      <div className="card" style={{ padding: 14 }}>
        <div className="cat-title">✍️ 新しく書く</div>
        <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
          走り書きで大丈夫です。AIが読みやすく整えてから保存します。
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder={"例)\nエスプレッソマシンのお湯が出ないとき、右側のバルブを一度閉めてから開け直すと直る。町田さんに聞いた。"}
          style={{ width: "100%", fontSize: 13.5, lineHeight: 1.7 }}
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="誰に聞いた？（任意・例: 町田さん）"
          style={{ marginTop: 6 }}
        />
        <button
          className="primary"
          onClick={makeDraft}
          disabled={busy === "draft" || !raw.trim()}
          style={{ width: "100%", marginTop: 8 }}
        >
          {busy === "draft" ? "整形中…" : "🤖 AIに整えてもらう"}
        </button>
      </div>

      {/* 整形結果の確認 */}
      {draft && (
        <div className="card" style={{ padding: 14, borderLeft: "3px solid var(--accent)" }}>
          <div className="cat-title">確認して保存</div>
          <label>見出し</label>
          <input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <label style={{ marginTop: 8 }}>どんなときに知りたいか</label>
          <input value={draft.question ?? ""} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
          <label style={{ marginTop: 8 }}>答え</label>
          <textarea
            value={draft.answer ?? ""}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            rows={6}
            style={{ width: "100%", fontSize: 13.5, lineHeight: 1.7 }}
          />
          <label style={{ marginTop: 8 }}>カテゴリ</label>
          <select value={draft.category ?? "その他"} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ marginTop: 8 }}>タグ（カンマ区切り）</label>
          <input
            value={(draft.tags ?? []).join(", ")}
            onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="primary" onClick={save} disabled={busy === "save"} style={{ flex: 1 }}>
              {busy === "save" ? "保存中…" : "この内容で保存"}
            </button>
            <button onClick={() => setDraft(null)} disabled={!!busy}>やめる</button>
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div className="card" style={{ padding: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ナレッジを探す（例: エスプレッソ）" />
      </div>

      {list.map((e) => {
        const isOpen = open === e.id;
        return (
          <div key={e.id} className="card" style={{ padding: "12px 14px" }}>
            <div
              onClick={() => setOpen(isOpen ? null : e.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", gap: 8 }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{e.category}</div>
                <strong style={{ fontSize: 14 }}>{e.title}</strong>
                {!isOpen && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.answer}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
            </div>

            {isOpen && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Q. {e.question}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>{e.answer}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                  {e.tags?.length ? e.tags.map((t) => `#${t}`).join(" ") : ""}
                  {e.source && `　／ ${e.source}に確認`}
                  　／ {e.updatedAt.slice(0, 10)}
                </div>
                <button onClick={() => del(e.id, e.title)} style={{ fontSize: 11, marginTop: 8 }}>削除</button>
              </div>
            )}
          </div>
        );
      })}

      {entries.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: 18 }}>
          まだナレッジがありません。<br />
          分からなくて誰かに聞いたことを、上から書いてみてください。
        </div>
      )}
    </div>
  );
}
