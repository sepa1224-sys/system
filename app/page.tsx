"use client";

import { useRef, useState } from "react";
import { CATEGORIES, type Receipt } from "@/lib/receipt";
import Nav from "@/components/Nav";
import CopyField from "@/components/CopyField";
import TagInput from "@/components/TagInput";

const MEMBERS = ["坂本", "町田", "櫻井", "國仲"] as const;

type Line = { name: string; amount: number; category: string; tags: string[] };
type Status = "idle" | "extracting" | "review" | "saved";

type Form = {
  date: string;
  vendor: string;
  confidence: "high" | "medium" | "low";
  payer: string;
  memo: string;
  expenseKind: "company" | "card" | "labor";
  laborMember: string;
  lines: Line[];
};

const emptyLine = (): Line => ({ name: "", amount: 0, category: "不明", tags: [] });

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    date: "",
    vendor: "",
    confidence: "medium",
    payer: MEMBERS[0],
    memo: "",
    expenseKind: "company",
    laborMember: MEMBERS[0],
    lines: [emptyLine()],
  });
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState<
    { vendor: string; date: string; total: number; registered: boolean } | null
  >(null);
  // サーバーが重複でブロックしたとき（承知で登録するか確認する）
  const [dupBlock, setDupBlock] = useState<
    { vendor: string; date: string; total: number; registered: boolean } | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // この領収書についてのAI相談（確認画面内）
  type Msg = { role: "user" | "assistant"; content: string };
  const [consultOpen, setConsultOpen] = useState(false);
  const [consult, setConsult] = useState<Msg[]>([]);
  const [consultInput, setConsultInput] = useState("");
  const [consulting, setConsulting] = useState(false);

  const total = form.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // いま確認中の領収書を、AIに渡す文脈テキストにする
  function receiptContext(): string {
    const linesText = form.lines
      .map((l) => `- ${l.name || "（品目なし）"} ¥${(Number(l.amount) || 0).toLocaleString()}（${l.category}）${l.tags.length ? ` [用途: ${l.tags.join(", ")}]` : ""}`)
      .join("\n");
    const kind =
      form.expenseKind === "labor"
        ? `労働枠から使う（${form.laborMember}の枠）`
        : form.expenseKind === "card"
          ? "会社カード支出（デビットカード）"
          : "立替経費";
    return [
      `日付：${form.date || "未入力"}`,
      `店名・支払先：${form.vendor || "未入力"}`,
      `内訳：\n${linesText}`,
      `合計：¥${total.toLocaleString()}`,
      `立替えた人：${form.payer}`,
      `区分：${kind}`,
      form.memo ? `メモ：${form.memo}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function askAi(text: string) {
    const q = text.trim();
    if (!q || consulting) return;
    const next: Msg[] = [...consult, { role: "user", content: q }];
    setConsult([...next, { role: "assistant", content: "" }]);
    setConsultInput("");
    setConsulting(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, receiptContext: receiptContext() }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setConsult((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラー";
      setConsult((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `すみません、エラーが出ました（${msg}）。` };
        return copy;
      });
    } finally {
      setConsulting(false);
    }
  }

  function setLine(i: number, patch: Partial<Line>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }
  function addLine() {
    setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  }
  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines }));
  }

  async function save(force = false) {
    setSaving(true);
    setDupBlock(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          vendor: form.vendor,
          total,
          payer: form.payer,
          memo: form.memo,
          expenseKind: form.expenseKind,
          laborMember: form.expenseKind === "labor" ? form.laborMember : undefined,
          lines: form.lines,
          image,
          force,
        }),
      });
      // サーバーが重複でブロック（409）。承知で登録するか確認してもらう。
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        if (j.duplicate) {
          setDupBlock(j.duplicate);
          setSaving(false);
          return;
        }
      }
    } catch {
      // 保存に失敗しても確認内容は表示する
    }
    setSaving(false);
    setStatus("saved");
  }

  async function handleFile(file: File) {
    setError(null);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    setImage(dataUrl);
    setStatus("extracting");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "抽出に失敗しました。");
      const r = json.receipt as Receipt;
      const lines: Line[] =
        r.lines && r.lines.length > 0
          ? r.lines.map((l) => ({ name: l.name, amount: l.amount, category: l.category, tags: l.tags ?? [] }))
          : [emptyLine()];
      setForm((f) => ({ ...f, date: r.date, vendor: r.vendor, confidence: r.confidence, lines }));

      // 重複チェック：同じ日付・合計金額の領収書が既に保存済みなら警告
      setDup(null);
      const t = lines.reduce((s, l) => s + (l.amount || 0), 0);
      try {
        const saved = await fetch("/api/receipts").then((x) => x.json());
        const hit = (saved.receipts ?? []).find(
          (x: { date: string; total: number }) => x.date === r.date && x.total === t,
        );
        if (hit) setDup({ vendor: hit.vendor, date: hit.date, total: hit.total, registered: !!hit.registered });
      } catch {
        /* 重複チェック失敗は無視 */
      }
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "抽出に失敗しました。");
      setStatus("idle");
    }
  }

  function reset() {
    setStatus("idle");
    setImage(null);
    setError(null);
    setDup(null);
    setDupBlock(null);
    setConsultOpen(false);
    setConsult([]);
    setConsultInput("");
    setForm((f) => ({ ...f, lines: [emptyLine()], memo: "", expenseKind: "company" }));
  }

  const isPdf = image?.startsWith("data:application/pdf") ?? false;
  const multi = form.lines.length > 1;

  return (
    <div className="wrap">
      <header>
        <h1>☕ flat. 経費管理</h1>
        <p>領収書を撮ってアップ → AIが日付・金額・科目・用途を自動判定（立替・会社カード支出に対応）</p>
      </header>
      <Nav />

      {status === "idle" && (
        <>
          <div
            className={`drop ${over ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <strong>領収書をアップロード</strong>
            <small>タップして選択 / ドラッグ＆ドロップ（png・jpeg・webp・PDF）</small>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {error && <p className="err">{error}</p>}
          <a
            href="/receipts"
            className="rc-toggle"
            style={{ display: "block", textAlign: "center", marginTop: 12, textDecoration: "none" }}
          >
            📥 保存済み領収書を見る・freeeに登録する →
          </a>
        </>
      )}

      {status === "extracting" && (
        <div className="card" style={{ textAlign: "center" }}>
          {image &&
            (isPdf ? (
              <div className="preview pdf-preview">📄 PDF を読み取ります</div>
            ) : (
              <img src={image} alt="領収書" className="preview" />
            ))}
          <p style={{ marginTop: 16, color: "var(--muted)" }}>
            <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
            AIが読み取り中…
          </p>
        </div>
      )}

      {status === "review" && (
        <div className="card">
          {image &&
            (isPdf ? (
              <div className="preview pdf-preview">📄 PDF を読み取ります</div>
            ) : (
              <img src={image} alt="領収書" className="preview" />
            ))}
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            AIの読み取り結果
            <span className={`badge ${form.confidence}`}>自信度 {form.confidence}</span>
            {multi && <span className="hint-chip">用途が違うので{form.lines.length}行に分割</span>}
          </p>
          <p className="hint">内容を確認・修正してから登録してください。</p>

          {dup && (
            <div className="dup-warn">
              ⚠️ <strong>同じ日付・金額の領収書が既にあります</strong>
              <div>
                （{dup.date}／{dup.vendor || "店名なし"}／¥{dup.total.toLocaleString()}／
                {dup.registered ? "freee登録済" : "保存済・未登録"}）
              </div>
              <div style={{ marginTop: 4 }}>二重計上に注意。別物なら確認してから登録してください。</div>
            </div>
          )}

          <label>日付</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />

          <label>店名・支払先</label>
          <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />

          <label>内訳（用途・科目が違うものは行を分ける）</label>
          {form.lines.map((l, i) => (
            <div key={i} className="rline">
              <div className="rline-top">
                <input
                  className="rline-name"
                  value={l.name}
                  placeholder="品目（例: 木材）"
                  onChange={(e) => setLine(i, { name: e.target.value })}
                />
                <input
                  className="rline-amt"
                  type="number"
                  value={l.amount || ""}
                  placeholder="金額"
                  onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                />
                {form.lines.length > 1 && (
                  <button type="button" className="rline-del" onClick={() => removeLine(i)}>
                    ×
                  </button>
                )}
              </div>
              <select value={l.category} onChange={(e) => setLine(i, { category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <TagInput tags={l.tags} onChange={(t) => setLine(i, { tags: t })} />
            </div>
          ))}
          <button type="button" className="rc-toggle" onClick={addLine} style={{ marginTop: 4 }}>
            ＋ 行を追加（別の用途）
          </button>
          <div className="rline-total">合計 ¥{total.toLocaleString()}</div>

          {form.expenseKind !== "card" && (
            <div className="row" style={{ marginTop: 8 }}>
              <div>
                <label>立替えた人</label>
                <select value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })}>
                  {MEMBERS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <label>メモ（なぜ払ったか・freeeの備考になります）</label>
          <textarea
            rows={2}
            value={form.memo}
            placeholder="例：オープン準備 など"
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />

          <label>この経費の区分</label>
          <div className="kind-toggle">
            <button
              type="button"
              className={`kind-btn ${form.expenseKind === "company" ? "active" : ""}`}
              onClick={() => setForm({ ...form, expenseKind: "company" })}
            >
              立替
            </button>
            <button
              type="button"
              className={`kind-btn ${form.expenseKind === "card" ? "active" : ""}`}
              onClick={() => setForm({ ...form, expenseKind: "card" })}
            >
              会社カード
            </button>
            <button
              type="button"
              className={`kind-btn ${form.expenseKind === "labor" ? "active" : ""}`}
              onClick={() => setForm({ ...form, expenseKind: "labor" })}
            >
              労働枠
            </button>
          </div>
          {form.expenseKind === "card" && (
            <p className="hint">
              💳 会社デビットカードで支払った経費。銀行口座の出金と自動マッチングされます。
            </p>
          )}
          {form.expenseKind === "labor" && (
            <>
              <label>誰の労働枠から引く？</label>
              <select value={form.laborMember} onChange={(e) => setForm({ ...form, laborMember: e.target.value })}>
                {MEMBERS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="hint">
                ※ この ¥{total.toLocaleString()} が {form.laborMember} の労働枠から差し引かれます。
              </p>
            </>
          )}

          <button
            type="button"
            className="rc-toggle"
            onClick={() => setConsultOpen((v) => !v)}
            style={{ marginTop: 14 }}
          >
            🤖 {consultOpen ? "AI相談を閉じる" : "この領収書についてAIに相談する（科目・立替の扱いなど）"}
          </button>

          {consultOpen && (
            <div className="card" style={{ marginTop: 8, background: "var(--bg, #faf9f7)" }}>
              {consult.length === 0 && (
                <div>
                  <p className="hint" style={{ marginTop: 0 }}>
                    いま入力中の内容を踏まえて答えます。例えば👇
                  </p>
                  {[
                    "この科目で合ってる？",
                    "これは経費？それとも固定資産？",
                    "立替だとfreeeにどう登録する？",
                    "用途が違う品目、分けるべき？",
                  ].map((s) => (
                    <button key={s} type="button" className="suggestion" onClick={() => askAi(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {consult.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  {m.content || (consulting && i === consult.length - 1 ? "…" : "")}
                </div>
              ))}
              <form
                className="composer"
                style={{ marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  askAi(consultInput);
                }}
              >
                <textarea
                  value={consultInput}
                  placeholder="この領収書について質問する"
                  rows={2}
                  onChange={(e) => setConsultInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      askAi(consultInput);
                    }
                  }}
                />
                <button className="primary" type="submit" disabled={consulting || !consultInput.trim()}>
                  {consulting ? <span className="spinner" /> : "送信"}
                </button>
              </form>
            </div>
          )}

          {dupBlock && (
            <div className="dup-warn" style={{ borderColor: "#c0392b", background: "#fdecea" }}>
              🚫 <strong>二重登録の可能性があるため止めました</strong>
              <div>
                （{dupBlock.date}／{dupBlock.vendor || "店名なし"}／¥{dupBlock.total.toLocaleString()}／
                {dupBlock.registered ? "freee登録済" : "保存済・未登録"}）
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="ghost" onClick={reset} disabled={saving}>
                  やめる（登録しない）
                </button>
                <button className="pay-btn" onClick={() => save(true)} disabled={saving}>
                  {saving ? <span className="spinner" /> : "別物なので承知で登録する"}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <button className="primary" onClick={() => save()} disabled={!form.date || total <= 0 || saving}>
              {saving ? <span className="spinner" /> : "この内容で登録（保存＋freee貼付用を表示）"}
            </button>
            <button className="ghost" onClick={reset}>
              ← やり直す
            </button>
          </div>
        </div>
      )}

      {status === "saved" && (
        <div className="card">
          <div className="saved">
            {form.expenseKind === "card"
              ? "✅ 読み取り＆確認 OK（会社カード支出）"
              : "✅ 読み取り＆確認 OK（立替）"}
          </div>
          <div className="freee-panel" style={{ marginTop: 12 }}>
            {form.expenseKind === "card" ? (
              <>
                <div className="freee-panel-title">📋 freee登録用（会社カード支出＝借)科目／貸)普通預金）</div>
                <CopyField label="発生日" value={form.date} />
                <CopyField label="取引先" value={form.vendor} hint="支払先" />
                {form.lines.map((l, i) => (
                  <div key={i} className="freee-line-block">
                    <div className="freee-line-no">
                      借方 {i + 1}
                      {multi ? "（freeeで「＋行を追加」）" : ""}
                    </div>
                    <CopyField label="勘定科目" value={l.category} />
                    <CopyField label="金額" value={String(l.amount)} />
                    {l.name ? <CopyField label="備考" value={l.name} /> : null}
                  </div>
                ))}
                <div className="freee-note">
                  貸方は「普通預金 ¥{total.toLocaleString()}」。デビットカードで直接支払い → 銀行明細と金額が一致するはず。
                </div>
              </>
            ) : (
              <>
                <div className="freee-panel-title">📋 freee登録用（立替＝借)科目／貸)役員借入金）</div>
                <CopyField label="発生日" value={form.date} />
                <CopyField label="取引先" value={form.payer} hint="立替えた人" />
                {form.lines.map((l, i) => (
                  <div key={i} className="freee-line-block">
                    <div className="freee-line-no">
                      借方 {i + 1}
                      {multi ? "（freeeで「＋行を追加」）" : ""}
                    </div>
                    <CopyField label="勘定科目" value={l.category} />
                    <CopyField label="金額" value={String(l.amount)} />
                    {l.name ? <CopyField label="備考" value={l.name} /> : null}
                  </div>
                ))}
                <div className="freee-note">
                  貸方は「役員借入金 ¥{total.toLocaleString()}（取引先＝{form.payer}）」。／ 📥保存済みタブの「freeeに登録」ボタンなら自動で書き込めます。
                </div>
              </>
            )}
          </div>
          <button className="primary" onClick={reset} style={{ marginTop: 12 }}>
            次の領収書を登録
          </button>
        </div>
      )}
    </div>
  );
}
