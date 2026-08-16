"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import MeisaiItem, { type Txn } from "@/components/MeisaiItem";

type CardCandidate = {
  walletTxnId: number;
  date: string;
  amount: number;
  description: string;
  walletName: string;
  diffDays: number;
};
type CardMatch = {
  receiptId: string;
  date: string;
  vendor: string;
  total: number;
  summary: string;
  lines: { name: string; amount: number; category: string }[];
  candidates: CardCandidate[];
};

export default function Meisai() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [gmail, setGmail] = useState(false);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [cardMatches, setCardMatches] = useState<CardMatch[]>([]);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  const [cardErr, setCardErr] = useState<string | null>(null);

  const loadCardMatches = () => {
    fetch("/api/freee/match-card-receipts")
      .then((r) => r.json())
      .then((j) => setCardMatches(j.matches ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    fetch("/api/freee/unprocessed")
      .then((r) => r.json())
      .then((j) => {
        setConnected(j.connected);
        setGmail(!!j.gmail);
        setTxns(j.txns ?? []);
        if (j.error) setError(j.error);
      })
      .catch(() => setError("読み込みに失敗しました。"));
    loadCardMatches();
  }, []);

  const confirmCardMatch = async (receiptId: string, walletTxnId: number) => {
    setCardErr(null);
    setCardBusy(receiptId);
    try {
      const res = await fetch("/api/freee/match-card-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId, walletTxnId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "登録に失敗しました");
      setCardMatches((prev) => prev.filter((m) => m.receiptId !== receiptId));
    } catch (e) {
      setCardErr(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setCardBusy(null);
    }
  };

  const undecided = txns.filter((t) => !t.decision).length;

  return (
    <div className="wrap">
      <header>
        <h1>🧾 未処理の明細</h1>
        <p>freeeでまだ仕訳していない明細を、AIと相談して決めます</p>
      </header>
      <Nav />

      {error && <p className="err">{error}</p>}

      {connected === false && (
        <div className="card connect-card">
          <div>
            <strong>freee未接続</strong>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              接続すると未処理明細を読み込めます。
            </p>
          </div>
          <a className="connect-btn" href="/api/freee/authorize">freeeと接続する</a>
        </div>
      )}

      {connected === null && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "#e4e1da", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      )}

      {/* カード払い領収書 × 銀行明細 マッチング */}
      {connected && cardMatches.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="cat-title">
            💳 カード払い領収書のマッチング（{cardMatches.length}件）
          </div>
          <p className="hint" style={{ margin: "0 0 10px" }}>
            会社カードで払った領収書の内訳を、銀行明細に直接紐づけて登録します（二重計上防止）。
          </p>
          {cardErr && <p className="err">{cardErr}</p>}
          {cardMatches.map((m) => (
            <div key={m.receiptId} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {m.date} {m.vendor} <span className="mono">¥{m.total.toLocaleString()}</span>
              </div>
              <div className="hint" style={{ margin: "2px 0 8px" }}>
                {m.lines.map((l) => `${l.category} ¥${l.amount.toLocaleString()}`).join(" / ")}
              </div>
              {m.candidates.length === 0 && (
                <p className="hint" style={{ color: "#c0392b" }}>
                  一致する未処理明細が見つかりません（まだfreeeに反映されていないか、金額違いの可能性）
                </p>
              )}
              {m.candidates.map((c) => (
                <div
                  key={c.walletTxnId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 13,
                    padding: "6px 0",
                    gap: 8,
                  }}
                >
                  <span>
                    {c.date} {c.walletName} <span className="mono">¥{c.amount.toLocaleString()}</span>
                    {c.diffDays > 0 && <span className="hint"> （{c.diffDays}日差）</span>}
                  </span>
                  <button
                    disabled={cardBusy === m.receiptId}
                    onClick={() => confirmCardMatch(m.receiptId, c.walletTxnId)}
                  >
                    {cardBusy === m.receiptId ? "登録中…" : "この明細で確定"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {connected && txns.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          🎉 未処理の明細はありません。
        </div>
      )}

      {connected && !gmail && (
        <div className="card connect-card">
          <div>
            <strong>✉️ Gmail未接続</strong>
            <p className="hint" style={{ margin: "4px 0 10px" }}>
              接続すると、書類が無い明細もメールから根拠を探せます。
            </p>
          </div>
          <a className="connect-btn" href="/api/google/authorize">Gmailと接続</a>
        </div>
      )}

      {connected && txns.length > 0 && (
        <>
          <div className="connected-note">
            未処理 {undecided} 件 ／ freee連携中{gmail ? "・Gmail連携中" : ""}
          </div>
          {txns.map((t) => (
            <MeisaiItem key={t.id} txn={t} />
          ))}
          <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
            ※ 決定した内容は freee の「自動で経理」で登録してください（銀行明細の登録は freee 側）。判断したノウハウ（取引先→用途）は自動で蓄積され、次回から提案されます。
          </p>
        </>
      )}
    </div>
  );
}
