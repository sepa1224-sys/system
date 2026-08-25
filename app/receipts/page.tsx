"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/receipt";
import Nav from "@/components/Nav";

type RLine = { name: string; amount: number; category: string; tags?: string[]; item?: string };

type Receipt = {
  id: string;
  date: string;
  vendor: string;
  total: number;
  category: string;
  summary: string;
  payer: string;
  memo: string;
  savedAt: string;
  registered?: { journalId: number; at: string };
  expenseKind?: "company" | "card" | "labor" | "cash";
  laborMember?: string;
  lines?: RLine[];
  tags?: string[];
};

const MEMBERS = ["坂本", "町田", "櫻井", "國仲"] as const;
const KIND_LABELS: Record<string, string> = {
  company: "立替",
  card: "会社カード",
  labor: "労働枠",
  cash: "現金",
};

type BulkIssue = { level: "error" | "warn"; message: string };
type BulkRow = {
  id: string; date: string; vendor: string; total: number;
  expenseKind: string; payer: string; issues: BulkIssue[]; blocked: boolean;
};
type BulkResult = {
  dryRun: boolean;
  summary: { target: number; ready: number; blocked: number; warned: number; readyAmount: number; registered?: number; failed?: number };
  checked?: BulkRow[];
  results?: { id: string; ok: boolean; error?: string }[];
  blocked?: BulkRow[];
};

export default function Receipts() {
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState<"" | "check" | "run">("");
  const [bulkErr, setBulkErr] = useState("");

  const runBulk = async (dryRun: boolean) => {
    setBulkBusy(dryRun ? "check" : "run");
    setBulkErr("");
    try {
      const res = await fetch("/api/receipts/register-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "失敗");
      setBulk(d);
      if (!dryRun) location.reload();
    } catch (e) {
      setBulkErr(e instanceof Error ? e.message : "失敗");
    } finally {
      setBulkBusy("");
    }
  };

  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 原本画像：id -> dataURL（"none"=保存なし, "loading"=取得中）
  const [images, setImages] = useState<Record<string, string>>({});
  // AI品目推測：id -> 推測結果（未確定）。"loading"=推測中
  const [guesses, setGuesses] = useState<
    Record<string, "loading" | { lines: RLine[]; confidence: string; source: string }>
  >({});
  // 編集中の領収書
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    date: string;
    vendor: string;
    payer: string;
    memo: string;
    expenseKind: "company" | "card" | "labor" | "cash";
    laborMember: string;
    lines: RLine[];
  } | null>(null);

  // カード払いの領収書と、金額が一致する銀行明細の組み合わせ。
  // これがあれば明細タブに移らなくてもここから登録できる。
  const [cardMatches, setCardMatches] = useState<
    Record<string, { walletTxnId: number; label: string }>
  >({});

  function loadMatches() {
    fetch("/api/freee/match-card-receipts")
      .then((r) => r.json())
      .then((j) => {
        const m: Record<string, { walletTxnId: number; label: string }> = {};
        for (const x of j.matches ?? []) {
          // 候補は日付が近い順。いちばん近いものを既定にする
          const t = x.candidates?.[0];
          if (x.receiptId && t?.walletTxnId) {
            m[x.receiptId] = {
              walletTxnId: t.walletTxnId,
              label: `${t.date} ${t.description ?? ""} ¥${(t.amount ?? 0).toLocaleString()}`.trim(),
            };
          }
        }
        setCardMatches(m);
      })
      .catch(() => setCardMatches({}));
  }

  function load() {
    fetch("/api/receipts")
      .then((r) => r.json())
      .then((j) => setReceipts(j.receipts ?? []))
      .catch(() => setReceipts([]));
    loadMatches();
  }
  useEffect(load, []);

  // 領収書1件を、対応する銀行明細に紐づけてfreeeに登録する
  async function registerCard(id: string) {
    const m = cardMatches[id];
    if (!m) return;
    if (!confirm(`この明細で登録します。\n${m.label}`)) return;
    setBusy(id);
    try {
      const res = await fetch("/api/freee/match-card-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: id, walletTxnId: m.walletTxnId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "登録に失敗");
      setMsg("freeeに登録しました");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗");
    } finally {
      setBusy(null);
    }
  }

  async function register(id: string) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/receipts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "登録に失敗");
      setReceipts((rs) =>
        rs
          ? rs.map((r) =>
              r.id === id
                ? { ...r, registered: { journalId: j.journalId, at: new Date().toISOString() } }
                : r,
            )
          : rs,
      );
      setMsg(
        j.already
          ? "すでに登録済みでした"
          : j.dateAdjusted
            ? `freeeに登録しました ✓（設立前支出のため発生日を期首 ${j.issueDate} で記帳。原本 ${j.originalDate}／創立費・開業費の扱いは税理士に確認を）`
            : "freeeに登録しました ✓",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  // AIに品目を推測させる（原本画像があればVision、無ければ店名/金額から推測）
  async function guessItems(id: string) {
    setGuesses((g) => ({ ...g, [id]: "loading" }));
    setMsg(null);
    try {
      const res = await fetch("/api/receipts/guess-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "推測に失敗");
      setGuesses((g) => ({ ...g, [id]: { lines: j.lines ?? [], confidence: j.confidence, source: j.source } }));
    } catch (e) {
      setGuesses((g) => {
        const { [id]: _drop, ...rest } = g;
        return rest;
      });
      setMsg(e instanceof Error ? e.message : "推測に失敗しました");
    }
  }

  // 推測を承認してKVに確定保存
  async function confirmItems(id: string) {
    const g = guesses[id];
    if (!g || g === "loading") return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, lines: g.lines }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "確定に失敗");
      // カードに反映（品目表示が出るようになる）
      setReceipts((rs) => (rs ? rs.map((r) => (r.id === id ? { ...r, lines: g.lines } : r)) : rs));
      setGuesses((gg) => {
        const { [id]: _drop, ...rest } = gg;
        return rest;
      });
      setMsg("品目を確定しました ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "確定に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  function dismissGuess(id: string) {
    setGuesses((g) => {
      const { [id]: _drop, ...rest } = g;
      return rest;
    });
  }

  function startEdit(r: Receipt) {
    setEditId(r.id);
    setEditForm({
      date: r.date,
      vendor: r.vendor,
      payer: r.payer,
      memo: r.memo || "",
      expenseKind: r.expenseKind || "company",
      laborMember: r.laborMember || MEMBERS[0],
      lines: r.lines && r.lines.length > 0
        ? r.lines.map((l) => ({ ...l, tags: l.tags ?? [] }))
        : [{ name: r.summary || "", amount: r.total, category: r.category || "不明", tags: r.tags ?? [] }],
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEditForm(null);
  }

  function setEditLine(i: number, patch: Partial<RLine>) {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      lines: editForm.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    });
  }

  function addEditLine() {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      lines: [...editForm.lines, { name: "", amount: 0, category: "不明", tags: [] }],
    });
  }

  function removeEditLine(i: number) {
    if (!editForm || editForm.lines.length <= 1) return;
    setEditForm({
      ...editForm,
      lines: editForm.lines.filter((_, idx) => idx !== i),
    });
  }

  async function saveEdit() {
    if (!editId || !editForm) return;
    setBusy(editId);
    setMsg(null);
    try {
      const res = await fetch("/api/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          action: "edit",
          patch: {
            date: editForm.date,
            vendor: editForm.vendor,
            payer: editForm.payer,
            memo: editForm.memo,
            expenseKind: editForm.expenseKind,
            laborMember: editForm.expenseKind === "labor" ? editForm.laborMember : undefined,
            lines: editForm.lines,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "更新に失敗");
      setMsg("更新しました ✓");
      setEditId(null);
      setEditForm(null);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("この領収書を削除しますか？")) return;
    setBusy(id);
    try {
      await fetch(`/api/receipts?id=${id}`, { method: "DELETE" });
      setReceipts((rs) => rs ? rs.filter((r) => r.id !== id) : rs);
      setMsg("削除しました");
    } catch {
      setMsg("削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function toggleImage(id: string) {
    // すでに開いている / 取得済みなら閉じる（stateから消す）
    setImages((m) => {
      if (m[id]) {
        const { [id]: _drop, ...rest } = m;
        return rest;
      }
      return { ...m, [id]: "loading" };
    });
    if (images[id]) return; // 閉じただけ
    try {
      const res = await fetch(`/api/receipts/image?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const j = await res.json();
        setImages((m) => ({ ...m, [id]: j.image ?? "none" }));
      } else {
        setImages((m) => ({ ...m, [id]: "none" }));
      }
    } catch {
      setImages((m) => ({ ...m, [id]: "none" }));
    }
  }

  const unreg = receipts?.filter((r) => !r.registered).length ?? 0;

  return (
    <div className="wrap">
      <header>
        <h1>📥 保存済み領収書</h1>
        <p>アップした立替領収書。freeeに登録（借)科目／貸)役員借入金）できます</p>
      </header>
      <Nav />

      {/* 一括登録（先に検証、問題なければ実行） */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="rc-toggle" disabled={!!bulkBusy} onClick={() => runBulk(true)}>
            {bulkBusy === "check" ? "点検中..." : "🔍 未登録をまとめて点検"}
          </button>
          {bulk?.dryRun && bulk.summary.ready > 0 && (
            <button
              className="pay-btn"
              disabled={!!bulkBusy}
              onClick={() => {
                if (!confirm(`${bulk.summary.ready}件・¥${bulk.summary.readyAmount.toLocaleString()} をfreeeに登録します。よろしいですか？`)) return;
                runBulk(false);
              }}
            >
              {bulkBusy === "run" ? "登録中..." : `${bulk.summary.ready}件をfreeeに一括登録`}
            </button>
          )}
        </div>
        {bulkErr && <p className="err">{bulkErr}</p>}
        {bulk && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              対象{bulk.summary.target}件 ／ 登録可 {bulk.summary.ready}件（¥{bulk.summary.readyAmount.toLocaleString()}）
              ／ 要注意 {bulk.summary.warned}件 ／ 登録不可 {bulk.summary.blocked}件
              {bulk.summary.registered !== undefined && ` ／ 登録済 ${bulk.summary.registered}件・失敗 ${bulk.summary.failed}件`}
            </div>
            {(bulk.checked || []).filter((c) => c.issues.length > 0).map((c) => (
              <div key={c.id} style={{
                borderLeft: `3px solid ${c.blocked ? "#c0392b" : "#e0a63c"}`,
                paddingLeft: 8, marginBottom: 6,
              }}>
                <div style={{ fontWeight: 600 }}>
                  {c.blocked ? "❌" : "⚠️"} {c.date} {c.vendor} ¥{(c.total || 0).toLocaleString()}
                </div>
                {c.issues.map((i, n) => (
                  <div key={n} style={{ color: "var(--muted)", fontSize: 12 }}>・{i.message}</div>
                ))}
              </div>
            ))}
            {(bulk.results || []).filter((r) => !r.ok).map((r) => (
              <div key={r.id} style={{ color: "#c0392b", fontSize: 12 }}>❌ {r.id}: {r.error}</div>
            ))}
          </div>
        )}
      </div>

      {msg && <p className="hint" style={{ textAlign: "center" }}>{msg}</p>}

      {receipts === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {receipts && receipts.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          まだ保存された領収書はありません。「🧾領収書」タブからアップしてください。
        </div>
      )}

      {receipts && receipts.length > 0 && (
        <div className="connected-note">
          未登録 {unreg} 件 ／ 全 {receipts.length} 件
        </div>
      )}

      {receipts?.map((r) => {
        const g = guesses[r.id];
        const noItems = !(r.lines && r.lines.length > 0) && !r.summary;
        const isEditing = editId === r.id && editForm;
        const kindLabel = KIND_LABELS[r.expenseKind || "company"] || "立替";
        return (
        <div key={r.id} className={`card meisai ${r.registered ? "done" : ""}`}>
          {isEditing ? (
            /* ──── 編集モード ──── */
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✏️ 編集</div>

              <label>日付</label>
              <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />

              <label>店名・支払先</label>
              <input value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })} />

              <label>内訳</label>
              {editForm.lines.map((l, i) => (
                <div key={i} className="rline">
                  <div className="rline-top">
                    <input
                      className="rline-name"
                      value={l.name}
                      placeholder="品目"
                      onChange={(e) => setEditLine(i, { name: e.target.value })}
                    />
                    <input
                      className="rline-amt"
                      type="number"
                      value={l.amount || ""}
                      placeholder="金額"
                      onChange={(e) => setEditLine(i, { amount: Number(e.target.value) })}
                    />
                    {editForm.lines.length > 1 && (
                      <button type="button" className="rline-del" onClick={() => removeEditLine(i)}>×</button>
                    )}
                  </div>
                  <select value={l.category} onChange={(e) => setEditLine(i, { category: e.target.value })}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
              <button type="button" className="rc-toggle" onClick={addEditLine} style={{ marginTop: 4 }}>
                ＋ 行を追加
              </button>
              <div className="rline-total">
                合計 ¥{editForm.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toLocaleString()}
              </div>

              <label>経費区分</label>
              <div className="kind-toggle">
                <button type="button" className={`kind-btn ${editForm.expenseKind === "company" ? "active" : ""}`}
                  onClick={() => setEditForm({ ...editForm, expenseKind: "company" })}>
                  立替
                </button>
                <button type="button" className={`kind-btn ${editForm.expenseKind === "card" ? "active" : ""}`}
                  onClick={() => setEditForm({ ...editForm, expenseKind: "card" })}>
                  会社カード
                </button>
                <button type="button" className={`kind-btn ${editForm.expenseKind === "labor" ? "active" : ""}`}
                  onClick={() => setEditForm({ ...editForm, expenseKind: "labor" })}>
                  労働枠
                </button>
                <button type="button" className={`kind-btn ${editForm.expenseKind === "cash" ? "active" : ""}`}
                  onClick={() => setEditForm({ ...editForm, expenseKind: "cash" })}>
                  現金
                </button>
              </div>
              {editForm.expenseKind === "cash" && (
                <p className="hint">
                  💴 店の現金（レジ・小口）から払った経費。貸方は「現金」になり、誰かに返す必要はありません。
                </p>
              )}

              {editForm.expenseKind !== "card" && editForm.expenseKind !== "cash" && (
                <>
                  <label>立替えた人</label>
                  <select value={editForm.payer} onChange={(e) => setEditForm({ ...editForm, payer: e.target.value })}>
                    {MEMBERS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </>
              )}

              {editForm.expenseKind === "labor" && (
                <>
                  <label>誰の労働枠？</label>
                  <select value={editForm.laborMember} onChange={(e) => setEditForm({ ...editForm, laborMember: e.target.value })}>
                    {MEMBERS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </>
              )}

              <label>メモ</label>
              <textarea rows={2} value={editForm.memo} placeholder="メモ"
                onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="primary" onClick={saveEdit} disabled={busy === r.id} style={{ flex: 1 }}>
                  {busy === r.id ? <span className="spinner" /> : "保存"}
                </button>
                <button className="ghost" onClick={cancelEdit} style={{ flex: 1 }}>キャンセル</button>
              </div>
            </div>
          ) : (
            /* ──── 表示モード ──── */
            <>
              <div className="meisai-head" style={{ cursor: "default" }}>
                <div>
                  <div className="meisai-desc">{r.vendor || "（店名なし）"}</div>
                  <div className="meisai-sub">
                    {r.date}・{r.category}
                    {r.expenseKind === "card"
                      ? <span className="hint-chip">💳 会社カード</span>
                      : r.expenseKind === "cash"
                        ? <span className="hint-chip">💴 現金</span>
                        : <>・{kindLabel}: {r.payer}</>}
                  </div>
                  {r.lines && r.lines.length > 0
                    ? r.lines.map((l, i) => (
                        <div key={i} className="meisai-sub">
                          🛒 {l.name || "（品目なし）"}
                          {r.lines!.length > 1 && ` ¥${l.amount.toLocaleString()}`}
                          <span style={{ color: "var(--muted)" }}>（{l.category}）</span>
                          {l.item && (
                            <span style={{
                              marginLeft: 5, fontSize: 10.5, fontWeight: 700, padding: "1px 6px",
                              borderRadius: 4, background: "#e8f1fb", color: "#1f5f8b",
                            }}>品目: {l.item}</span>
                          )}
                          {l.tags && l.tags.length > 0 && (
                            <span style={{ color: "var(--muted)" }}> [{l.tags.join("・")}]</span>
                          )}
                        </div>
                      ))
                    : r.summary && <div className="meisai-sub">🛒 {r.summary}</div>}
                  {r.memo && <div className="meisai-sub">📝 {r.memo}</div>}
                </div>
                <div className="meisai-right">
                  <div className="meisai-amt out">¥{r.total.toLocaleString()}</div>
                </div>
              </div>

              {noItems && (
                <div style={{ marginTop: 8 }}>
                  {!g && (
                    <button className="rc-toggle" style={{ width: "100%" }} onClick={() => guessItems(r.id)}>
                      🔮 品目が未入力 — AIで推測する
                    </button>
                  )}
                  {g === "loading" && (
                    <div style={{ textAlign: "center", color: "var(--muted)" }}>
                      <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />{" "}
                      AIが品目を推測中…
                    </div>
                  )}
                  {g && g !== "loading" && (
                    <div className="dup-warn" style={{ borderColor: "#b7791f", background: "#fffbea" }}>
                      🔮 <strong>AIの推測</strong>（
                      {g.source === "image" ? "原本画像から" : "店名・金額から推測"}・自信度 {g.confidence}）
                      <div style={{ marginTop: 4 }}>
                        {g.lines.map((l, i) => (
                          <div key={i} className="meisai-sub" style={{ color: "#5b4a1a" }}>
                            🛒 {l.name || "（品名なし）"} ¥{(Number(l.amount) || 0).toLocaleString()}（{l.category}）
                            {l.item && (
                              <span style={{
                                marginLeft: 5, fontSize: 10.5, fontWeight: 700, padding: "1px 6px",
                                borderRadius: 4, background: "#e8f1fb", color: "#1f5f8b",
                              }}>品目: {l.item}</span>
                            )}
                            {l.tags && l.tags.length > 0 && ` [${l.tags.join("・")}]`}
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        確定すると品目として保存されます。内容が違うときは破棄して、🧾タブで登録し直してください。
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="ghost" onClick={() => dismissGuess(r.id)} disabled={busy === r.id}>
                          破棄
                        </button>
                        <button className="pay-btn" onClick={() => confirmItems(r.id)} disabled={busy === r.id}>
                          {busy === r.id ? <span className="spinner" /> : "この内容で確定（保存）"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                {r.registered ? (
                  <div className="decided-box" style={{ margin: 0 }}>
                    {r.expenseKind === "card"
                      ? `✓ freee登録済（取引 #${r.registered.journalId}／銀行明細と消込済）`
                      : `✓ freee登録済（振替伝票 #${r.registered.journalId}）／ 借)${r.category}・貸)${
                          r.expenseKind === "cash" ? "現金" : `役員借入金（${r.payer}）`
                        }`}
                  </div>
                ) : r.expenseKind === "card" ? (
                  cardMatches[r.id] ? (
                    <>
                      <button
                        className="pay-btn"
                        style={{ width: "100%" }}
                        disabled={busy === r.id}
                        onClick={() => registerCard(r.id)}
                      >
                        {busy === r.id
                          ? "登録中…"
                          : `🏦 この明細で登録（借) ${r.category}）`}
                      </button>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4, textAlign: "center" }}>
                        {cardMatches[r.id].label}
                      </div>
                    </>
                  ) : (
                    <a
                      href="/meisai"
                      className="pay-btn"
                      style={{ width: "100%", display: "block", textAlign: "center", textDecoration: "none", opacity: 0.7 }}
                    >
                      🏦 一致する明細なし・明細タブで探す（借) {r.category}）
                    </a>
                  )
                ) : (
                  <button
                    className="pay-btn"
                    style={{ width: "100%" }}
                    onClick={() => register(r.id)}
                    disabled={busy === r.id}
                  >
                    {busy === r.id
                      ? <span className="spinner" />
                      : r.expenseKind === "cash"
                          ? "freeeに登録（借)" + r.category + "／貸)現金）"
                          : "freeeに登録（借)" + r.category + "／貸)役員借入金）"}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="rc-toggle"
                  style={{ flex: 1 }}
                  onClick={() => toggleImage(r.id)}
                >
                  {images[r.id] ? "🖼 原本を閉じる" : "🖼 原本を見る"}
                </button>
                <button
                  className="rc-toggle"
                  style={{ flex: 1 }}
                  onClick={() => startEdit(r)}
                >
                  ✏️ 編集
                </button>
                <button
                  style={{
                    flex: 0,
                    background: "#fde8e8",
                    color: "#b22",
                    fontSize: 13,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                  }}
                  onClick={() => handleDelete(r.id)}
                  disabled={busy === r.id}
                >
                  🗑
                </button>
              </div>

              {images[r.id] === "loading" && (
                <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 8 }}>
                  <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
                </div>
              )}
              {images[r.id] === "none" && (
                <p className="hint" style={{ marginTop: 8 }}>
                  この領収書は原本画像が保存されていません（サイズ超過や旧データの可能性）。
                </p>
              )}
              {images[r.id] && images[r.id] !== "loading" && images[r.id] !== "none" && (
                images[r.id].startsWith("data:application/pdf") ? (
                  <a href={images[r.id]} target="_blank" rel="noreferrer" className="hint" style={{ display: "block", marginTop: 8 }}>
                    📄 PDFを別タブで開く
                  </a>
                ) : (
                  <img src={images[r.id]} alt="領収書原本" className="preview" style={{ marginTop: 8 }} />
                )
              )}
            </>
          )}
        </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        ※ 立替の登録は 借)科目／貸)役員借入金（取引先＝立替えた人）。銀行明細と違い二重計上になりません。返金したら「払うもの」タブで消し込み。
      </p>
    </div>
  );
}
