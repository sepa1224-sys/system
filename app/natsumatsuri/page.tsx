"use client";

import { useState, useEffect } from "react";

// 夏祭り2026の案内＋申込ページ（お客さん向け・LIFF対応）。
// 内部ツールのNavは付けない。LINEで開くとLINE名が自動で入る。

const HANABI_PLANS = [
  "🎆 花火＋パーティ（飲み放題）¥4,000",
  "🎆 花火＋パーティ（3杯）¥3,000",
  "🎆 花火のみ ¥1,500",
];
const PARTY_PLANS = [
  "🪩 パーティのみ（飲み放題）¥3,500",
  "🪩 パーティのみ（ほろ酔い3杯）¥2,500",
  "🪩 パーティのみ（ノンアル飲み放題）¥2,000",
  "🪩 パーティのみ（入場のみ）¥500",
];
const SHUTTLE = "🚌 送迎を希望する（先着16名・flat. 17:45集合）";
const TRANSPORTS = [
  SHUTTLE,
  "🚗 自分の車で移動する（パーティではお酒を飲まない）",
  "🚗 自分の車で移動する（飲むので車は翌日まで置いて帰る）",
  "🚗 自分の車で移動する＋お友達を乗せられます！",
  "🚶 自転車・徒歩・現地集合（送迎不要）",
];
const MEET_POINTS = [
  "🌅 flat. に 17:45（サンセットchillから・送迎の方）",
  "🌅 松原水泳場に 18:20（サンセットchillから・現地集合）",
  "🎆 彦根市立図書館前に 19:40（花火大会から）",
  "🪩 flat. に 21:00（パーティから）",
];
const HOTSAND = [
  "予約する：1つ（¥800・当日flat.でお渡し）",
  "予約する：2つ（¥1,600・当日flat.でお渡し）",
  "いらない（食べてくる・持ってくる）",
  "パーティのみ参加なので不要",
];

declare global {
  interface Window {
    liff?: {
      init: (c: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ displayName: string }>;
    };
  }
}

function Radio({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: (o: string) => boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((o) => {
        const off = disabled?.(o) ?? false;
        return (
          <label
            key={o}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: "10px 12px",
              border: `1.5px solid ${value === o ? "var(--accent)" : "var(--line)"}`,
              background: value === o ? "var(--accent-weak)" : "var(--card)",
              borderRadius: 10,
              fontSize: 14,
              opacity: off ? 0.45 : 1,
              cursor: off ? "not-allowed" : "pointer",
            }}
          >
            <input
              type="radio"
              checked={value === o}
              disabled={off}
              onChange={() => onChange(o)}
              style={{ marginTop: 3 }}
            />
            <span>{o}{off ? "（満員御礼🙏）" : ""}</span>
          </label>
        );
      })}
    </div>
  );
}

const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card">
    <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

export default function Natsumatsuri() {
  const [name, setName] = useState("");
  const [lineName, setLineName] = useState("");
  const [plan, setPlan] = useState("");
  const [meetPoint, setMeetPoint] = useState("");
  const [transport, setTransport] = useState("");
  const [hotsand, setHotsand] = useState("");
  const [djRequest, setDjRequest] = useState("");
  const [photoOk, setPhotoOk] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<{
    shuttleOpen: boolean;
    hanabiOpen: boolean;
    shuttle: number;
    hanabi: number;
  } | null>(null);
  const [deadlines, setDeadlines] = useState<{ hanabiClosed: boolean; allClosed: boolean }>({
    hanabiClosed: false,
    allClosed: false,
  });

  useEffect(() => {
    fetch("/api/natsumatsuri")
      .then((r) => r.json())
      .then((d) => {
        if (d.counts) setStatus(d.counts);
        if (d.deadlines) setDeadlines(d.deadlines);
      })
      .catch(() => {});

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID_NATSUMATSURI;
    if (!liffId) return;
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        await window.liff!.init({ liffId });
        if (!window.liff!.isLoggedIn()) return;
        const p = await window.liff!.getProfile();
        setLineName((prev) => prev || p.displayName);
      } catch {
        /* LIFF外はスキップ */
      }
    };
    document.head.appendChild(s);
  }, []);

  const submit = async () => {
    setErr("");
    if (!name.trim()) return setErr("お名前を入力してください");
    if (!lineName.trim()) return setErr("LINEの名前を入力してください");
    if (!plan) return setErr("参加プランを選んでください");
    if (!meetPoint) return setErr("集合場所を選んでください");
    if (!transport) return setErr("移動方法を選んでください");
    if (!hotsand) return setErr("ホットサンドの項目を選んでください");
    if (!photoOk) return setErr("写真掲載の確認にチェックをお願いします");
    setBusy(true);
    try {
      const res = await fetch("/api/natsumatsuri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lineName, plan, meetPoint, transport, hotsand, djRequest, photoOk, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "申込に失敗しました");
      setDone(true);
      window.scrollTo(0, 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "申込に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="wrap" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 56 }}>🎆</div>
        <h1>申込完了！</h1>
        <p style={{ color: "var(--muted)" }}>
          {name} さん、お申し込みありがとうございます！<br />
          当日お会いできるのを楽しみにしています🏮<br />
          変更・キャンセルはflat.のLINEまでご連絡ください。
        </p>
        <div className="card" style={{ textAlign: "left", marginTop: 24 }}>
          <div className="result-row"><span>プラン</span><span>{plan}</span></div>
          <div className="result-row"><span>集合</span><span style={{ textAlign: "right" }}>{meetPoint}</span></div>
          <div className="result-row"><span>移動</span><span style={{ textAlign: "right" }}>{transport}</span></div>
          <div className="result-row"><span>ホットサンド</span><span style={{ textAlign: "right" }}>{hotsand}</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {/* ヘッダー */}
      <div style={{ textAlign: "center", padding: "18px 0 6px" }}>
        <div style={{ fontSize: 44 }}>🎆🏮</div>
        <h1 style={{ fontSize: 26, margin: "4px 0" }}>flat. 夏祭り2026</h1>
        <p style={{ margin: 0, fontWeight: 700 }}>8/22（土）</p>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>
          琵琶湖の夕日を眺めてチルして、彦根城のふもとで手持ち花火。<br />
          この地域ならではの夏企画です🏯
        </p>
        <p style={{ fontSize: 13 }}>
          せっかくの夏を満喫したい！友達と思い出を作りたい、浴衣着て映えたい…、
          それ全部叶えましょ？（笑）<br />
          事前の準備は不要です。ぜひ、ふらっとな気持ちでご参加ください😉
        </p>
      </div>

      {/* 当日の流れ */}
      <S title="【当日の流れ】✨ どのタイミングからでも参加できます！">
        <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
          <p style={{ margin: "4px 0", fontWeight: 700 }}>🌅 サンセットchillから参加する人はここで集合！</p>
          17:45　flat. 集合（送迎の方はこちら）<br />
          18:20　松原水泳場 集合（現地集合の方はこちら）<br />
          18:30　サンセットchill／写真撮影タイム<br />
          19:20　金亀公園へ移動
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>🎆 手持ち花火大会から参加する人はここで集合！</p>
          19:40　彦根市立図書館前 集合<br />
          19:50　手持ち花火大会（〜20:40）<br />
          20:40　flat.へ移動
          <p style={{ margin: "10px 0 4px", fontWeight: 700 }}>🪩 パーティから参加する人はここで集合！</p>
          21:00　flat. にて盆踊りパーティー（〜24:00）<br />
          21:15　乾杯🍻<br />
          <span style={{ color: "var(--muted)" }}>
            DJも入ります🎧 リクエスト曲はこのフォームで募集中！何曲でもOK！出入り自由！
          </span>
        </div>
      </S>

      {/* 移動・送迎 */}
      <S title="【🚗 移動・送迎について】">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          <li>送迎は事前申込制です（先着16名・このフォームから）</li>
          <li>送迎の対象は「サンセットchill＋花火大会」に参加する方です</li>
          <li>お車の方はご自身の車での移動をお願いします。お友達と一緒に参加される場合は、乗り合わせにご協力いただけると助かります🙏</li>
          <li>サンセットchillのみ参加（花火に来ない）の方は送迎ができません。車・自転車・徒歩でのご移動をお願いします</li>
          <li>駐車場はflat.にあります</li>
        </ul>
      </S>

      {/* ごはん */}
      <S title="【🍞 ごはんについて】">
        <p style={{ margin: "0 0 6px", fontSize: 13.5 }}>
          サンセットchillから参加する場合、夜ごはんの時間が取れません！以下のどれかでお願いします🙏
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          <li>集合前に食べてくる</li>
          <li>flat. のホットサンドをテイクアウト（1つ¥800・このフォームで予約）</li>
          <li>サンセットchill中に食べられるものを持ってくる</li>
        </ul>
      </S>

      {/* 詳細 */}
      <S title="【詳細】">
        <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
          <b>定員</b>：Sunset chill 定員なし（送迎は先着16名）／花火大会 30人（先着順）／パーティ 定員なし ※混み合ってきたら締め切ります<br />
          <b>雨天時</b>：大雨の場合、サンセットchill・花火大会は中止です。その場合はそのままflat.で別企画をやります、お楽しみに🎉<br />
          <b>参加条件</b>：flat. のSNSに顔が映った写真を掲載してもOKな方<br />
          <b>ドレスコード</b>：浴衣／甚平（必須ではありません！私服でもOK）👘<br />
          <b>持ち物</b>：やる気、元気、日本の夏を楽しむ気持ち！🍉🎐☀️<br />
          <b>参加メリット</b>：📷 撮影データをイベント後日共有／新しいお友達ができるかも／盛り上げるので楽しませます<br />
          <b>お願い</b>：🚗 お車の方は、サンセットchill・花火の時間はノンアルで。パーティでお酒を飲まれる方は、お車をflat.の駐車場に翌日まで置いてOKです
        </div>
      </S>

      {/* ==== 申込フォーム ==== */}
      {deadlines.allClosed ? (
        <div className="card" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40 }}>🙏</div>
          <h2 style={{ margin: "4px 0" }}>申込は締め切りました</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            参加のご相談はflat.のLINEへメッセージをどうぞ。
          </p>
        </div>
      ) : (
      <>
      <div style={{ textAlign: "center", margin: "28px 0 12px" }}>
        <h2 style={{ margin: 0 }}>📝 参加申込</h2>
        <p className="hint" style={{ marginTop: 4 }}>
          申込期限：花火から参加は 8/18（火）／パーティのみは 8/20（木）まで
        </p>
        {status && (
          <p className="hint" style={{ marginTop: 2 }}>
            花火大会 残り{Math.max(0, 30 - status.hanabi)}名 ／ 送迎 残り{Math.max(0, 16 - status.shuttle)}席
          </p>
        )}
        {deadlines.hanabiClosed && (
          <p className="hint" style={{ marginTop: 2, color: "#c0392b" }}>
            花火から参加の申込は締め切りました。パーティのみのプランは受付中です！
          </p>
        )}
      </div>

      <S title="お名前 *">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" style={{ width: "100%" }} />
      </S>

      <S title="LINEの名前 *">
        <input value={lineName} onChange={(e) => setLineName(e.target.value)} placeholder="LINEで表示される名前" style={{ width: "100%" }} />
        <p className="hint" style={{ margin: "6px 0 0" }}>当日の連絡・写真データの共有に使います</p>
      </S>

      <S title="参加プラン *">
        <Radio
          options={[...HANABI_PLANS, ...PARTY_PLANS]}
          value={plan}
          onChange={setPlan}
          disabled={(o) =>
            HANABI_PLANS.includes(o) &&
            (deadlines.hanabiClosed || (status ? !status.hanabiOpen : false))
          }
        />
      </S>

      <S title="集合場所 *">
        <Radio options={MEET_POINTS} value={meetPoint} onChange={setMeetPoint} />
      </S>

      <S title="🚗 移動について *">
        <Radio
          options={TRANSPORTS}
          value={transport}
          onChange={setTransport}
          disabled={(o) => (status ? o === SHUTTLE && !status.shuttleOpen : false)}
        />
        <p className="hint" style={{ margin: "6px 0 0" }}>
          お友達と一緒に参加される場合は、乗り合わせにご協力いただけると助かります🙏
        </p>
      </S>

      <S title="🍞 ホットサンドのテイクアウト予約 *">
        <Radio options={HOTSAND} value={hotsand} onChange={setHotsand} />
      </S>

      <S title="🎧 DJへのリクエスト曲（任意）">
        <textarea
          value={djRequest}
          onChange={(e) => setDjRequest(e.target.value)}
          rows={3}
          placeholder="聞きたい夏の曲、DJに渡します！曲名とアーティスト名をどうぞ（何曲でもOK）"
          style={{ width: "100%" }}
        />
      </S>

      <S title="写真掲載の確認 *">
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} style={{ marginTop: 3 }} />
          <span>イベント中の顔が映った写真をflat.のSNSに掲載してOKです（参加条件です）</span>
        </label>
      </S>

      <S title="その他・質問（任意）">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: "100%" }} />
      </S>

      {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}

      <div style={{ textAlign: "center", margin: "16px 0 40px" }}>
        <button className="primary" onClick={submit} disabled={busy} style={{ fontSize: 17, padding: "14px 42px" }}>
          {busy ? "送信中..." : "🎆 申し込む"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
