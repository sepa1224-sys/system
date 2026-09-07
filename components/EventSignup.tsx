"use client";

import { useState, useEffect, useCallback } from "react";
import { LINE_ADD_URL } from "@/lib/lineFriend";

// イベントの参加申込フォーム。お客さんが開くページの中身。
// どのイベントかは slug で決まり、内容は lib/events.ts の登録簿から引く。
// 申し込んだあと、そのままSquareの事前決済リンクへ進める。
// 当日払いもできるので、決済は任意。

type Plan = { id: string; label: string; price: number; detail: string; payUrl?: string };
type EventInfo = {
  slug: string; title: string; dateLabel: string; lead: string;
  requestLabel?: string; requestPlaceholder?: string; notes?: string[];
  requireLine?: boolean;
};

// LIFF（LINE内ブラウザ）で開かれたときに、名前とユーザーIDを自動で取る。
// あとからLINEで個別に連絡できるようにするため。
// window.liff は他のページでも別の形で宣言しているので、ここでは都度取り出す。
type Liff = {
  init: (c: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (c?: { redirectUri?: string }) => void;
  getProfile: () => Promise<{ displayName: string; userId: string }>;
};
const getLiff = (): Liff | undefined =>
  (window as unknown as { liff?: Liff }).liff;

export default function EventSignup({ slug }: { slug: string }) {
  const [ev, setEv] = useState<EventInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [people, setPeople] = useState(0);
  const [closed, setClosed] = useState(false);

  const [name, setName] = useState("");
  const [lineName, setLineName] = useState("");
  const [planId, setPlanId] = useState("");
  const [djRequest, setDjRequest] = useState("");
  const [photoOk, setPhotoOk] = useState(true);
  const [note, setNote] = useState("");

  const [lineUserId, setLineUserId] = useState("");
  const [viaLine, setViaLine] = useState(false);
  // null = まだ判定していない
  const [isFriend, setIsFriend] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ payUrl?: string; plan: Plan } | null>(null);

  // 友だちかどうかはサーバー側（Messaging APIのプロフィール取得）で見る。
  // 判定できないとき（トークン未設定など）は通す。
  const checkFriend = useCallback(async (uid: string) => {
    setChecking(true);
    try {
      const r = await fetch(`/api/line/friendship?userId=${encodeURIComponent(uid)}`);
      const j = await r.json();
      setIsFriend(j.known ? !!j.isFriend : true);
    } catch {
      setIsFriend(true);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    fetch(`/api/event?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        setEv(d.event || null);
        setPlans(d.plans || []);
        setPeople(d.people || 0);
        setClosed(!!d.closed);
      })
      .catch(() => setErr("読み込みに失敗しました"));

    // LINEから開かれたときに、表示名とユーザーIDを受け取る。
    // requireLine のイベントでは、友だち追加が済むまで申込フォームを出さない。
    const liffId =
      process.env.NEXT_PUBLIC_LIFF_ID_EVENT ||
      process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT ||
      process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI;
    if (!liffId) return;
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        const liff = getLiff();
        if (!liff) return;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          // LINE内で開かれていればログイン画面へ。外部ブラウザでは何も起きない
          try { liff.login(); } catch { /* LINE外 */ }
          return;
        }
        const p = await liff.getProfile();
        setLineName((prev) => prev || p.displayName);
        setName((prev) => prev || p.displayName);
        setLineUserId(p.userId || "");
        setViaLine(true);
        if (p.userId) await checkFriend(p.userId);
      } catch {
        /* LINE外で開かれた場合はそのまま */
      }
    };
    document.head.appendChild(s);
  }, [slug, checkFriend]);

  const submit = async () => {
    if (!name.trim()) return setErr("名前を入れてください");
    if (!planId) return setErr("プランを選んでください");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, lineName, lineUserId, planId, djRequest, photoOk, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "送信に失敗しました");
      const plan = plans.find((p) => p.id === planId)!;
      setDone({ payUrl: d.payUrl, plan });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="wrap dj">
        <div className="hero">
          <div className="hero-sub">申込ありがとうございます</div>
          <h1>{name}さん</h1>
          <div className="hero-plan">{done.plan.label} ¥{done.plan.price.toLocaleString()}</div>
        </div>
        <div className="card">
          <h2>お支払いについて</h2>
          {done.payUrl ? (
            <>
              <p>
                事前にお支払いいただけると、当日の受付がスムーズです。
                <strong>当日のお支払いでも大丈夫です。</strong>
              </p>
              <a className="pay-btn" href={done.payUrl} target="_blank" rel="noreferrer">
                事前に支払う（カード）¥{done.plan.price.toLocaleString()} ↗
              </a>
              <p className="small">
                Squareの決済ページが開きます。支払い後の画面はスクリーンショットを撮っておいてください。
              </p>
            </>
          ) : (
            <p>
              当日、店内でお支払いください。<br />
              <strong>¥{done.plan.price.toLocaleString()} ＋ ワンドリンクのご注文</strong>
            </p>
          )}
        </div>
        <div className="card">
          <h2>当日のご案内</h2>
          <p>
            <strong>{ev?.dateLabel ?? ""}</strong><br />
            flat.（滋賀県彦根市）<br />
            {ev?.lead ?? ""}
          </p>
          {ev?.notes?.length ? (
            <ul className="notes">
              {ev.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          ) : null}
        </div>
        <Style />
      </div>
    );
  }

  // LINE必須のイベント。LINEから開いていない／友だちでない場合はここで止める
  if (ev?.requireLine && (!viaLine || isFriend === false)) {
    return (
      <div className="wrap dj">
        <div className="hero">
          <div className="hero-sub">{ev.dateLabel}</div>
          <h1>{ev.title}</h1>
          <div className="hero-note">{ev.lead}</div>
        </div>
        <div className="card">
          <h2>LINEの友だち追加が必要です</h2>
          {!viaLine ? (
            <p>
              このイベントは <strong>flat.のLINEから</strong>お申し込みいただけます。<br />
              下のボタンで友だち追加して、トークに届くメニューから開いてください。
            </p>
          ) : (
            <p>
              flat.のLINEを<strong>友だち追加</strong>すると申し込めます。<br />
              追加したあとに「追加できたか確認する」を押してください。
            </p>
          )}
          <a className="pay-btn" href={LINE_ADD_URL} target="_blank" rel="noreferrer">
            flat.のLINEを友だち追加 ↗
          </a>
          {viaLine && (
            <button
              className="submit"
              style={{ marginTop: 10 }}
              onClick={() => lineUserId && checkFriend(lineUserId)}
              disabled={checking}
            >
              {checking ? "確認中…" : "追加できたか確認する"}
            </button>
          )}
          <p className="small">
            当日の受付とご連絡にLINEを使うため、お申し込みは友だち追加をお願いしています。
          </p>
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="wrap dj">
      <div className="hero">
        <div className="hero-sub">{ev?.dateLabel ?? ""}</div>
        <h1>{ev?.title ?? "flat."}</h1>
        <div className="hero-note">
          {ev?.lead ?? ""}
          {people > 0 && <><br />いま{people}人が参加予定です</>}
        </div>
      </div>

      {closed && (
        <div className="card warn">
          事前申込の受付は終了しました。<strong>当日参加は歓迎です</strong>ので、そのままお越しください。
        </div>
      )}

      <div className="card">
        <h2>料金</h2>
        {plans.map((p) => (
          <div key={p.id} className="plan-info">
            <div className="plan-line">
              <span>{p.label}</span>
              <strong>¥{p.price.toLocaleString()}</strong>
            </div>
            <div className="plan-detail">{p.detail}</div>
          </div>
        ))}
        {ev?.notes?.length ? (
          <ul className="notes">
            {ev.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        ) : (
          <p className="small">テキーラショット ¥200 など、単品のご注文も承ります。</p>
        )}
      </div>

      {err && <div className="card err-box">{err}</div>}

      <div className="card">
        <h2>お申し込み</h2>

        <label>お名前 <span className="req">必須</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 坂本達郎" />

        {ev?.requireLine ? (
          <p className="small" style={{ marginTop: -4 }}>
            LINE: <strong>{lineName}</strong> として受け付けます
          </p>
        ) : (
          <>
            <label>
              LINEの表示名（分かれば）
              {viaLine && <span style={{ color: "#c9a227", marginLeft: 6 }}>LINEから自動で入りました</span>}
            </label>
            <input value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="当日の照合に使います" />
          </>
        )}

        <label>プラン <span className="req">必須</span></label>
        <div className="plans">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPlanId(p.id); setErr(""); }}
              className={`plan ${planId === p.id ? "on" : ""}`}
            >
              <div className="plan-label">{p.label}</div>
              <div className="plan-price">¥{p.price.toLocaleString()}</div>
              <div className="plan-detail">{p.detail}</div>
            </button>
          ))}
        </div>

        {ev?.requestLabel && (
          <>
            <label>{ev.requestLabel}</label>
            <input
              value={djRequest}
              onChange={(e) => setDjRequest(e.target.value)}
              placeholder={ev.requestPlaceholder || ""}
            />
          </>
        )}

        <label>その他（任意）</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="アレルギー・到着が遅れるなど" />

        <label className="check">
          <input type="checkbox" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} />
          <span>当日の写真をSNSに載せてもOK</span>
        </label>

        <button className="submit" onClick={submit} disabled={saving}>
          {saving ? "送信中…" : "この内容で申し込む"}
        </button>
        <p className="small">
          {plans.some((p) => p.payUrl)
            ? <>送信後にお支払いのリンクが出ます。<strong>当日払いでも大丈夫です。</strong></>
            : <>お支払いは<strong>当日、店内で</strong>お願いします。</>}
        </p>
      </div>
      <Style />
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      body { background: #14171c; color: #f2efe9; margin: 0; }
      .notes { margin: 10px 0 0; padding-left: 1.1em; font-size: 12.5px; color: #b7b2a8; line-height: 1.95; }
      .notes li { margin-bottom: 2px; }
      .dj { max-width: 560px; margin: 0 auto; padding: 0 16px 48px; font-family: system-ui, sans-serif; }
      .hero { padding: 40px 0 28px; text-align: center; }
      .hero h1 { font-size: 34px; margin: 6px 0; letter-spacing: .04em; }
      .hero-sub { font-size: 13px; letter-spacing: .2em; color: #c9a227; font-weight: 700; }
      .hero-note, .hero-plan { font-size: 13.5px; color: #b7b2a8; line-height: 1.9; margin-top: 8px; }
      .hero-plan { font-size: 16px; color: #f2efe9; font-weight: 700; }
      .card { background: #1d222a; border: 1px solid #2c333d; border-radius: 14px; padding: 18px; margin-bottom: 14px; }
      .card h2 { font-size: 15px; margin: 0 0 12px; color: #c9a227; }
      .card p { font-size: 13.5px; line-height: 1.9; margin: 0 0 10px; }
      .small { font-size: 11.5px; color: #8d8880; line-height: 1.8; }
      .warn { border-color: #c9a227; }
      .err-box { border-color: #c0392b; color: #ff9b8f; font-size: 13px; }
      label { display: block; font-size: 12px; color: #b7b2a8; margin: 14px 0 5px; font-weight: 700; }
      .req { color: #c0392b; font-size: 10px; margin-left: 4px; }
      input[type="text"], input:not([type]) { width: 100%; box-sizing: border-box; padding: 11px 12px;
        border-radius: 9px; border: 1px solid #2c333d; background: #14171c; color: #f2efe9; font-size: 15px; }
      .plans { display: grid; gap: 8px; }
      .plan { text-align: left; padding: 13px 14px; border-radius: 11px; cursor: pointer;
        border: 1px solid #2c333d; background: #14171c; color: #f2efe9; }
      .plan.on { border: 2px solid #c9a227; background: #241f16; }
      .plan-label { font-size: 15px; font-weight: 700; }
      .plan-price { font-size: 18px; font-weight: 800; color: #c9a227; margin: 2px 0; }
      .plan-detail { font-size: 11.5px; color: #8d8880; line-height: 1.7; }
      .plan-info { padding: 9px 0; border-top: 1px solid #2c333d; }
      .plan-info:first-of-type { border-top: 0; }
      .plan-line { display: flex; justify-content: space-between; font-size: 14.5px; }
      .plan-line strong { color: #c9a227; }
      .check { display: flex; align-items: center; gap: 8px; margin-top: 16px; color: #f2efe9; font-size: 13.5px; }
      .check input { width: 20px; height: 20px; }
      .submit, .pay-btn { display: block; width: 100%; box-sizing: border-box; margin-top: 18px;
        padding: 15px; border-radius: 11px; border: 0; cursor: pointer; text-align: center;
        background: #c9a227; color: #14171c; font-size: 16px; font-weight: 800; text-decoration: none; }
      .submit:disabled { opacity: .5; }
    `}</style>
  );
}
