"use client";

import { useEffect, useRef, useState } from "react";
import CopyField from "@/components/CopyField";
import TagInput from "@/components/TagInput";

type Line = {
  category: string;
  taxType?: string;
  item?: string;
  amount: number;
  memo?: string;
};
type Advice = {
  reply: string;
  needs_document: boolean;
  ready: boolean;
  partner: string;
  lines: Line[];
  kb_keyword: string;
  kb_note: string;
  tax_review: boolean;
  tax_review_reason: string;
  tags: string[];
};
type Doc = {
  id: string;
  title: string;
  type: string;
  summary: string;
  payNote: string;
  suggestedLines: Line[];
  taxReview: boolean;
  taxReviewReason: string;
};
export type Txn = {
  id: number;
  date: string;
  amount: number;
  side: "income" | "expense";
  description: string;
  walletName: string;
  hint: { category: string; note: string } | null;
  doc: Doc | null;
  decision: { lines: Line[]; partner: string } | null;
};
type Msg = { role: "user" | "assistant"; content: string };

export default function MeisaiItem({ txn }: { txn: Txn }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [decided, setDecided] = useState<{ lines: Line[]; partner: string; dealId?: number } | null>(
    txn.decision,
  );
  const [tags, setTags] = useState<string[]>([]);
  // 行ごとの品目。AIの提案を初期値に、決定前に直せるようにする。
  // freeeの品目別レポートと品目台帳の両方がこの値で集計される。
  const [lineItems, setLineItems] = useState<Record<number, string>>({});
  const [itemNames, setItemNames] = useState<string[]>([]);

  useEffect(() => {
    if (!advice?.ready) return;
    const init: Record<number, string> = {};
    advice.lines.forEach((l, i) => { init[i] = l.item ?? ""; });
    setLineItems(init);
    // 選択肢は開いたときに一度だけ取る
    if (itemNames.length === 0) {
      fetch("/api/items-map")
        .then((r) => r.json())
        .then((j) => setItemNames(j.items ?? []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advice]);
  const fileRef = useRef<HTMLInputElement>(null);

  const sideOut = txn.side === "expense";

  const docContext = txn.doc
    ? `種類:${txn.doc.type} / 名前:${txn.doc.title}\n要点:${txn.doc.summary}\nこの金額(¥${txn.amount.toLocaleString()})の内容:${txn.doc.payNote}\n書類の想定仕訳:${txn.doc.suggestedLines
        .map((l) => `${l.category} ¥${l.amount.toLocaleString()}(${l.memo})`)
        .join(" / ")}${
        txn.doc.taxReview ? `\n税理士論点:${txn.doc.taxReviewReason}` : ""
      }`
    : undefined;

  async function send(text: string, document?: string, emailCtx?: string) {
    if (loading) return;
    const userText = text || (document ? "この書類を読んで科目を判定して" : "");
    if (!userText && !document) return;
    const next: Msg[] = [...messages, { role: "user", content: userText }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/meisai-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txn: {
            date: txn.date,
            amount: txn.amount,
            side: txn.side,
            description: txn.description,
          },
          messages: next,
          document,
          docContext,
          emailContext: emailCtx,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "判定に失敗");
      const a = json.advice as Advice;
      setAdvice(a);
      setTags((cur) => (cur.length ? cur : a.tags ?? [])); // AI提案タグを反映（未設定時のみ）
      setMessages((m) => [...m, { role: "assistant", content: a.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラー";
      setMessages((m) => [...m, { role: "assistant", content: `エラー: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function onFile(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    send(input, dataUrl);
  }

  async function searchEmail() {
    if (loading) return;
    const kw = input.trim();
    setMessages((m) => [...m, { role: "user", content: kw ? `「${kw}」でGmailを検索` : "Gmailから関連メールを探す" }]);
    setInput("");
    setLoading(true);
    let ctx = "";
    try {
      const res = await fetch("/api/gmail-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: txn.amount, description: txn.description, keyword: kw || undefined }),
      });
      const j = await res.json();
      if (!j.connected) {
        setMessages((m) => [...m, { role: "assistant", content: "Gmailが未接続です。上の「✉️ Gmailと接続」から接続してください。" }]);
        setLoading(false);
        return;
      }
      if (!j.mails || j.mails.length === 0) {
        const dbg = `検索した語: ${(j.queries ?? []).join(" / ") || "（なし）"}${j.error ? `\n⚠️エラー: ${j.error}` : ""}`;
        setMessages((m) => [...m, { role: "assistant", content: `メールが見つかりませんでした。\n${dbg}\n→ 上の入力に「花火」など具体的な語を入れて、もう一度「✉️Gmailから探す」を押すとその語で再検索します。` }]);
        setLoading(false);
        return;
      }
      ctx = j.mails
        .map(
          (mm: { subject: string; from: string; date: string; body: string; snippet: string }, i: number) =>
            `【メール${i + 1}】件名:${mm.subject}\n差出人:${mm.from}\n日付:${mm.date}\n本文:${(mm.body || mm.snippet).slice(0, 800)}`,
        )
        .join("\n\n");
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "メール検索でエラーが出ました。" }]);
      setLoading(false);
      return;
    }
    setLoading(false);
    await send("Gmailで見つかった関連メールに基づいて、この明細の仕訳を判定してください。", undefined, ctx);
  }

  async function decide() {
    if (!advice || !advice.ready) return;
    setLoading(true);
    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txnId: txn.id,
          date: txn.date,
          description: txn.description,
          amount: txn.amount,
          partner: advice.partner,
          lines: advice.lines.map((l, i) => ({
            ...l,
            item: (lineItems[i] ?? l.item ?? "").trim() || undefined,
          })),
          kbKeyword: advice.kb_keyword,
          kbNote: advice.kb_note,
          taxReview: advice.tax_review,
          taxReviewReason: advice.tax_review_reason,
          tags,
          side: txn.side,
        }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error ?? "保存失敗");
      setDecided({
        lines: advice.lines.map((l, i) => ({
          ...l,
          item: (lineItems[i] ?? l.item ?? "").trim() || undefined,
        })),
        partner: advice.partner,
        dealId: resJson.dealId,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`card meisai ${decided ? "done" : ""}`}>
      <div className="meisai-head" onClick={() => setOpen(!open)}>
        <div>
          <div className="meisai-desc">{txn.description}</div>
          <div className="meisai-sub">
            {txn.date}・{txn.walletName.split(" ")[0]}
            {txn.doc && !decided && (
              <span className="doc-chip">📄 {txn.doc.title}</span>
            )}
            {txn.hint && !txn.doc && !decided && (
              <span className="hint-chip">候補: {txn.hint.category}</span>
            )}
          </div>
        </div>
        <div className="meisai-right">
          <div className={`meisai-amt ${sideOut ? "out" : "in"}`}>
            {sideOut ? "-" : "+"}¥{txn.amount.toLocaleString()}
          </div>
          <div className="meisai-status">
            {decided ? "✓ 決定済" : open ? "閉じる" : "決める"}
          </div>
        </div>
      </div>

      {decided && (
        <div className="decided-box">
          {decided.dealId && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 10,
              background: "#eaf6ec", border: "1px solid #b7dfc0", fontSize: 13, lineHeight: 1.7,
            }}>
              ✅ <strong>freeeに未決済取引を作成しました（#{decided.dealId}）。手入力は不要です。</strong><br />
              freeeの明細画面で「<strong>未決済取引の消込</strong>」タブ → この取引を選んで「登録」を押すだけで完了します。
            </div>
          )}
          <div className="freee-panel">
            <div className="freee-panel-title">
              {decided.dealId
                ? "📋 参考（作成済みの内容。コピペは不要です）"
                : "📋 freee入力用（各項目の「コピー」→ freeeの「明細の詳細」に貼り付け）"}
            </div>
            <CopyField label="発生日" value={txn.date} />
            <CopyField label="取引先" value={decided.partner} />
            {decided.lines.map((l, i) => (
              <div key={i} className="freee-line-block">
                <div className="freee-line-no">
                  行{i + 1}
                  {decided.lines.length > 1 ? "（freeeで「＋行を追加」）" : ""}
                </div>
                <CopyField label="勘定科目" value={l.category} />
                <CopyField label="税区分" value={l.taxType || "課対仕入10%"} />
                <CopyField label="金額" value={String(l.amount)} />
                {l.item ? <CopyField label="品目" value={l.item} /> : null}
                {l.memo ? <CopyField label="備考" value={l.memo} /> : null}
              </div>
            ))}
            <div className="freee-note">
              ※ 勘定科目を選ぶと税区分はfreeeが自動で入りますが、違っていたら上の値に合わせてください。品目が無い行は空欄でOK。
            </div>
          </div>
          <a
            className="connect-btn"
            href="https://secure.freee.co.jp/wallet_txns/stream?registration_status=unreconciled"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", marginTop: 8 }}
          >
            → freeeで登録する（自動で経理を開く）
          </a>
          <p className="hint">
            上の値をコピーして freee に貼り付け →「登録」。銀行明細の登録は freee 側で行います（APIだと二重計上になるため）。
          </p>
        </div>
      )}

      {open && !decided && (
        <div className="meisai-body">
          {txn.doc && messages.length === 0 && (
            <div className="doc-match">
              📄 保管庫に関連書類が見つかりました：<strong>{txn.doc.title}</strong>
              <button
                className="pay-btn"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => send(`保管庫の「${txn.doc!.title}」に基づいて、この明細の仕訳を判定してください。`)}
                disabled={loading}
              >
                この書類の支払いとして判定する
              </button>
            </div>
          )}
          <div className="rc-msgs">
            {messages.length === 0 && !txn.doc && (
              <p className="hint" style={{ marginTop: 0 }}>
                「AIに相談」で科目を一緒に決めます。書類（契約書・請求書・明細書）があればアップすると正確になります。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (loading && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>

          {advice?.ready && advice.lines.length > 0 && (
            <div className="propose">
              <div className="propose-title">提案された仕訳</div>
              <div className="propose-partner">取引先: {advice.partner || "—"}</div>
              <datalist id={`items-${txn.id}`}>
                {itemNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              {advice.lines.map((l, i) => (
                <div key={i}>
                  <div className="propose-line">
                    <span>{l.category}{l.memo ? `（${l.memo}）` : ""}</span>
                    <span>¥{l.amount.toLocaleString()}</span>
                  </div>
                  {/* どの科目でも品目は付けられる（工具器具備品→机・テーブル など）。
                      家賃のように要らない行は空のままでいい */}
                  {(
                    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 6px" }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>品目</span>
                      <input
                        list={`items-${txn.id}`}
                        value={lineItems[i] ?? ""}
                        placeholder="選ぶか入力（例: グラス・食器）"
                        onChange={(e) => setLineItems((p) => ({ ...p, [i]: e.target.value }))}
                        style={{ flex: 1, fontSize: 12.5, padding: "5px 8px" }}
                      />
                    </div>
                  )}
                </div>
              ))}
              {advice.kb_note && (
                <div className="propose-note">📝 覚える: {advice.kb_note}</div>
              )}
              {advice.tax_review && advice.tax_review_reason && (
                <div className="tax-note">
                  🧑‍💼 税理士に相談リストへ保存されます<br />
                  <span>論点: {advice.tax_review_reason}</span>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <div className="propose-title" style={{ marginBottom: 4 }}>用途タグ（目的別集計用）</div>
                <TagInput tags={tags} onChange={setTags} />
              </div>
              <button className="pay-btn" onClick={decide} disabled={loading} style={{ width: "100%", marginTop: 8 }}>
                この内容で決定（freee登録用に確定＆ノウハウ保存）
              </button>
            </div>
          )}

          <div className="composer" style={{ marginTop: 8 }}>
            <textarea
              rows={2}
              value={input}
              placeholder="例：これは家賃。／何の支払いか分からない 等"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="primary" onClick={() => send(input)} disabled={loading} style={{ width: "auto", padding: "0 16px" }}>
              {loading ? <span className="spinner" /> : "相談"}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <button className="rc-toggle" style={{ marginTop: 6 }} onClick={() => fileRef.current?.click()}>
            📎 書類をアップ（契約書・請求書・明細書／PDF・画像）
          </button>
          <button className="rc-toggle" style={{ marginTop: 6 }} onClick={searchEmail} disabled={loading}>
            ✉️ Gmailから関連メールを探す（この金額で検索）
          </button>
        </div>
      )}
    </div>
  );
}
