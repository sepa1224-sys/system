"use client";

import { useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

// クラウドファンディングの支援者へのお礼メールと、コーヒーチケットの受け渡し。
// CSVを貼る → 文面を確認 → まだ送っていない人に送る → 来店したら「渡した」を押す。

type Supporter = {
  id: string; name: string; email: string; course?: string;
  tickets: number; sets: number;
  sentAt?: string; sendError?: string; redeemedAt?: string; note?: string;
  group?: string;
};

type Group = "ticket" | "thanks";
const groupOf = (s: Supporter): Group => (s.group === "thanks" ? "thanks" : "ticket");

const rewardLabel = (s: Supporter) =>
  [s.tickets > 0 ? `コーヒー${s.tickets}杯` : "", s.sets > 0 ? `セット${s.sets}食` : ""]
    .filter(Boolean)
    .join("・");

const DEFAULT_SUBJECT = "【flat.】ご支援ありがとうございました｜チケット引き換えのご案内";

const DEFAULT_BODY = `ご支援者様

この度は、flat.のクラウドファンディングにご支援いただき、本当にありがとうございました。
たくさんの方に応援していただき、目標金額を達成することができました。皆さんからいただいた支援や言葉のひとつひとつが、flat.をつくる大きな力になりました。

誰かがふらっと立ち寄って、誰かと出会って、気づけば少し長居している。そんな小さなきっかけが生まれる「彦根のまちのリビング」を、これから皆さんと一緒につくっていきたいと思っています。

ここから始まるflat.が、皆さんの日常にそっと残る場所になれたら嬉しいです。

flat.でお待ちしております。


────────────────
チケットの引き換えについて
────────────────

{rewards}

ご来店の際に、このメールをスタッフにお見せください。
その場で紙の回数券とお引き換えします。

・現金へのお引き換えはできません。おつりは出ません
{notes}
・スマートフォンの画面でも、印刷したものでも構いません

事前のご連絡は不要です。お好きなタイミングでお越しください。


────────────────
お店のご案内
────────────────

flat.
滋賀県彦根市京町二丁目3-1
0749-46-5355
https://www.google.com/maps/search/?api=1&query=滋賀県彦根市京町二丁目3-1

カフェ　10:00〜18:00
バー　　19:00〜24:00（ラストオーダー 23:30）
火曜定休


ご不明な点があれば、このメールにご返信ください。
お会いできるのを楽しみにしております。

合同会社flat.　坂本 達郎`;

const THANKS_SUBJECT = "【flat.】ご支援ありがとうございました｜お礼の動画をお届けします";

const THANKS_BODY = `{name}

この度は、flat.のクラウドファンディングにご支援いただき、本当にありがとうございました。
たくさんの方に応援していただき、目標金額を達成することができました。

リターンの「お礼のメッセージ」として、flat.の4人から動画をお送りします。
お届けが予定の10月1日より遅くなってしまい、申し訳ありません。

▶ 動画はこちら（約2分半）
https://youtu.be/ZIFWqe_R27M

誰かがふらっと立ち寄って、誰かと出会って、気づけば少し長居している。
そんな小さなきっかけが生まれる「彦根のまちのリビング」を、
これから皆さんと一緒につくっていきたいと思っています。

彦根にお越しの際は、ぜひflat.にもお立ち寄りください。

────────────────
flat.
滋賀県彦根市京町二丁目3-1
0749-46-5355
カフェ 10:00〜18:00 ／ バー 19:00〜24:00（ラストオーダー 23:30）
火曜定休
Instagram：@flat.hikone
────────────────

flat.　まちしょう・あん・たつろー・かんきち`;

const PRESET: Record<Group, { label: string; subject: string; body: string }> = {
  ticket: { label: "コーヒーチケット", subject: DEFAULT_SUBJECT, body: DEFAULT_BODY },
  thanks: { label: "お礼の動画", subject: THANKS_SUBJECT, body: THANKS_BODY },
};

export default function Supporters() {
  const [all, setAll] = useState<Supporter[]>([]);
  // いま扱っている送り先。取り込み・文面・送信・一覧がすべてこれで切り替わる
  const [group, setGroup] = useState<Group>("ticket");
  const [account, setAccount] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [csv, setCsv] = useState("");
  const [ticketsOnly, setTicketsOnly] = useState(true);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/supporters");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setAll(d.supporters || []);
      setAccount(d.account ?? null);
      setConnected(!!d.connected);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doImport = async () => {
    if (!csv.trim()) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/supporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, ticketsOnly, group }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取り込み失敗");
      setMsg(
        `${d.added}人を追加、${d.updated}人を更新しました。` +
          (d.skippedNoTicket ? `対象外の支援${d.skippedNoTicket}件は取り込んでいません。` : ""),
      );
      setCsv("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取り込み失敗");
    } finally { setBusy(false); }
  };

  const list = all.filter((s) => groupOf(s) === group);
  const unsent = list.filter((s) => !s.sentAt);

  const switchGroup = (g: Group) => {
    setGroup(g);
    setSubject(PRESET[g].subject);
    setBody(PRESET[g].body);
    setMsg(""); setErr(""); setQ("");
  };

  const send = async () => {
    if (unsent.length === 0) return;
    if (body.includes("【動画のリンク】")) {
      setErr("本文の【動画のリンク】を、YouTubeのリンクに差し替えてから送ってください。");
      return;
    }
    if (!confirm(`「${PRESET[group].label}」のまだ送っていない${unsent.length}人に、${account ?? "連携中のアカウント"} から送ります。取り消せません。`)) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/supporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ids: unsent.map((s) => s.id), subject, body }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "送信失敗");
      const failed = (d.results || []).filter((r: { ok: boolean }) => !r.ok);
      setMsg(`${d.sent}人に送りました。` + (failed.length ? `${failed.length}人は失敗しています。` : ""));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送信失敗");
    } finally { setBusy(false); }
  };

  const toggleRedeemed = async (s: Supporter) => {
    const next = !s.redeemedAt;
    if (next && !confirm(`${s.name}さんにコーヒーチケット${s.tickets}枚を渡しましたか？`)) return;
    setBusy(true);
    try {
      await fetch("/api/supporters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, redeemed: next }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const shown = q.trim()
    ? list.filter((s) => (s.name + s.email).toLowerCase().includes(q.trim().toLowerCase()))
    : list;

  return (
    <div className="wrap">
      <header>
        <h1>☕ 支援者とコーヒーチケット</h1>
        <p>お礼メールを送って、来店したら渡した記録を付ける</p>
      </header>
      <Nav />

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(Object.keys(PRESET) as Group[]).map((g) => {
          const n = all.filter((s) => groupOf(s) === g).length;
          return (
            <button
              key={g}
              onClick={() => switchGroup(g)}
              style={{
                padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                border: group === g ? "2px solid var(--accent)" : "1px solid var(--line)",
                background: group === g ? "var(--accent)" : "#fff",
                color: group === g ? "#fff" : "var(--ink)",
              }}
            >
              {PRESET[g].label}（{n}人）
            </button>
          );
        })}
      </div>

      {err && <p className="err">{err}</p>}
      {msg && <p className="hint">{msg}</p>}

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">送信に使うアカウント</div>
        {!connected ? (
          <p style={{ fontSize: 13, margin: 0, color: "#c0392b" }}>
            Googleに接続されていません。<a href="/api/google/authorize">flat.kaffee@gmail.com で接続する</a>
          </p>
        ) : account ? (
          <p style={{ fontSize: 13, margin: 0 }}>
            <b>{account}</b> から送ります。
            {account !== "flat.kaffee@gmail.com" && (
              <span style={{ color: "#c0392b" }}>
                {" "}flat.kaffee@gmail.com ではありません。
                <a href="/api/google/authorize">繋ぎ直す</a>
              </span>
            )}
          </p>
        ) : (
          <p style={{ fontSize: 13, margin: 0 }}>
            接続はできていますが、<b>アカウント名を読み取れませんでした</b>。
            送信はできます。心配なら
            <a href="/api/google/authorize">繋ぎ直して</a>ください。
          </p>
        )}
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">1. 「{PRESET[group].label}」の送り先を取り込む</div>
        <p className="hint" style={{ marginBottom: 6 }}>
          CAMPFIREのCSVをそのまま貼ってください。名前とメールアドレスの列を自動で探します。
          同じメールアドレスの人は二重に入りません。
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          placeholder="名前,メールアドレス,リターン&#10;坂本 達郎,example@example.com,コーヒーチケット2枚コース"
          style={{ width: "100%", fontSize: 12, padding: 8 }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          {group === "ticket" && (
            <label style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox" checked={ticketsOnly}
                onChange={(e) => setTicketsOnly(e.target.checked)}
                style={{ width: "auto", flex: "0 0 auto" }}
              />
              チケットのある人だけ取り込む
            </label>
          )}
          <button onClick={doImport} disabled={busy || !csv.trim()}>取り込む</button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>
          {group === "ticket"
            ? "リターン内容から杯数を読み取ります（5杯分・1杯分・ホットサンドセット5食分）。複数口で支援した人は合算されます。"
            : "CAMPFIREのCSVを貼ると「お礼のメッセージ」のリターンの人だけが入ります。名前は取り込んだあと一覧で直せます。"}
          取り込み直しても、送信済みの記録は消えません。
        </p>
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">2. 文面</div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ width: "100%", fontSize: 13, padding: "6px 8px", marginBottom: 6 }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          style={{ width: "100%", fontSize: 12.5, lineHeight: 1.8, padding: 8 }}
        />
        <p className="hint" style={{ marginTop: 6 }}>
          <code>{"{rewards}"}</code> は「コーヒーチケット 5杯分」などの行、
          <code>{"{notes}"}</code> はセットの人にだけ出る但し書きに置き換わります。
        </p>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={send}
            disabled={busy || unsent.length === 0 || !connected}
            style={{ background: "var(--accent)", color: "#fff", fontWeight: 700 }}
          >
            まだ送っていない{unsent.length}人に送る
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "12px 14px" }}>
        <div className="cat-title">
          {group === "ticket"
            ? `3. 来店したら渡す（${list.filter((s) => s.redeemedAt).length}/${list.length}人）`
            : `3. 送り先（${list.filter((s) => s.sentAt).length}/${list.length}人に送信済み）`}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前かメールで探す"
          style={{ width: "100%", fontSize: 13, padding: "6px 8px", marginBottom: 6 }}
        />
        {shown.length === 0 && <p className="hint">まだ誰も入っていません。</p>}
        {shown.map((s) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", gap: 8, fontSize: 12.5,
            padding: "7px 0", borderTop: "1px solid var(--line-soft, #eee)",
            opacity: s.redeemedAt ? 0.55 : 1,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                defaultValue={s.name}
                placeholder="（宛名なし）"
                onBlur={async (e) => {
                  const v = e.target.value.trim();
                  if (v === s.name) return;
                  await fetch("/api/supporters", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: s.id, name: v }),
                  });
                  await load();
                }}
                style={{ fontSize: 12.5, fontWeight: 700, padding: "2px 4px", width: 150 }}
              />
              <span style={{ color: "var(--muted)", marginLeft: 6 }}>{rewardLabel(s)}</span>
              <div style={{ color: "var(--muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.email}
              </div>
              {s.sendError && <div style={{ color: "#c0392b", fontSize: 11 }}>送信失敗: {s.sendError}</div>}
            </div>
            <span style={{ flex: "0 0 auto", fontSize: 11, color: s.sentAt ? "var(--ok)" : "#c0392b" }}>
              {s.sentAt ? "送信済" : "未送信"}
            </span>
            {group === "ticket" && (
              <button
                onClick={() => toggleRedeemed(s)}
                disabled={busy}
                style={{
                  fontSize: 11, padding: "3px 10px", flex: "0 0 auto",
                  background: s.redeemedAt ? "var(--card)" : "var(--accent)",
                  color: s.redeemedAt ? "var(--ink)" : "#fff",
                  fontWeight: 700,
                }}
              >
                {s.redeemedAt ? "渡し済み" : "渡した"}
              </button>
            )}
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          メールは転送もスクリーンショットもできます。渡したらここを押して、二重に渡さないようにしてください。
        </p>
      </div>
    </div>
  );
}
