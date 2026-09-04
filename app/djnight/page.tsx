"use client";

import { useState, useEffect } from "react";

// 9/22 DJ NIGHT の参加申込フォーム。お客さんが直接開くページ。
// 申し込んだあと、そのままSquareの事前決済リンクへ進めるようにしてある。
// 当日払いもできるので、決済は任意。

type Plan = { id: string; label: string; price: number; detail: string; payUrl: string };

// LIFF（LINE内ブラウザ）で開かれたときに、名前とユーザーIDを自動で取る。
// あとからLINEで個別に連絡できるようにするため。
// window.liff は他のページでも別の形で宣言しているので、ここでは都度取り出す。
type Liff = {
  init: (c: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  getProfile: () => Promise<{ displayName: string; userId: string }>;
};
const getLiff = (): Liff | undefined =>
  (window as unknown as { liff?: Liff }).liff;

export default function DjNightPage() {
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ payUrl: string; plan: Plan } | null>(null);

  useEffect(() => {
    fetch("/api/djnight")
      .then((r) => r.json())
      .then((d) => {
        setPlans(d.plans || []);
        setPeople(d.people || 0);
        setClosed(!!d.closed);
      })
      .catch(() => setErr("読み込みに失敗しました"));

    // LINEから開かれた場合だけ動く。ブラウザで直接開いても普通に使える
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID_DJNIGHT;
    if (!liffId) return;
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        const liff = getLiff();
        if (!liff) return;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) return;
        const p = await liff.getProfile();
        setLineName((prev) => prev || p.displayName);
        setName((prev) => prev || p.displayName);
        setLineUserId(p.userId || "");
        setViaLine(true);
      } catch {
        /* LINE外で開かれた場合はそのまま通常のフォームとして使う */
      }
    };
    document.head.appendChild(s);
  }, []);

  const submit = async () => {
    if (!name.trim()) return setErr("名前を入れてください");
    if (!planId) return setErr("プランを選んでください");
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/djnight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lineName, lineUserId, planId, djRequest, photoOk, note }),
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
        </div>
        <div className="card">
          <h2>当日のご案内</h2>
          <p>
            <strong>9月22日（火）</strong><br />
            flat.（滋賀県彦根市）<br />
            お店は通常お休みの日ですが、この日はDJ NIGHTのために開けます。
          </p>
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="wrap dj">
      <div className="hero">
        <div className="hero-sub">9月22日（火）</div>
        <h1>flat. DJ NIGHT</h1>
        <div className="hero-note">
          定休日のflat.を、この日だけ開けます🎧
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
        <p className="small">
          テキーラショット ¥200 など、単品のご注文も承ります。
        </p>
      </div>

      {err && <div className="card err-box">{err}</div>}

      <div className="card">
        <h2>お申し込み</h2>

        <label>お名前 <span className="req">必須</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 坂本達郎" />

        <label>
          LINEの表示名（分かれば）
          {viaLine && <span style={{ color: "#c9a227", marginLeft: 6 }}>LINEから自動で入りました</span>}
        </label>
        <input value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="当日の照合に使います" />

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

        <label>DJへのリクエスト（任意）</label>
        <input value={djRequest} onChange={(e) => setDjRequest(e.target.value)} placeholder="聴きたい曲・ジャンルなど" />

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
          送信後にお支払いのリンクが出ます。<strong>当日払いでも大丈夫です。</strong>
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
