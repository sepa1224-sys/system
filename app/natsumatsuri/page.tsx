"use client";

import { useState, useEffect } from "react";

// 夏祭り2026の案内＋申込ページ（お客さん向け・LIFF対応）。
// 最初にイベント詳細と料金を見せて「申し込みへ進む」→ 1問ずつ進むウィザード形式。

const LINE_ADD_URL = "https://line.me/R/ti/p/@391wpozk";

// プラン文字列はサーバー(ALL_PLANS)と一致させること
const PLAN_HANABI_NOMIHODAI = "🎆 花火＋パーティ（飲み放題）¥4,000";
const PLAN_HANABI_3 = "🎆 花火＋パーティ（3杯）¥3,000";
const PLAN_HANABI_NONAL = "🎆 花火＋パーティ（ノンアル飲み放題）¥2,500";
const PLAN_HANABI_ENTRY = "🎆 花火＋パーティ（入場のみ）¥1,500";
const HANABI_PARTY_PLANS = [
  PLAN_HANABI_NOMIHODAI,
  PLAN_HANABI_3,
  PLAN_HANABI_NONAL,
  PLAN_HANABI_ENTRY,
];
const PLAN_HANABI_ONLY = "🎆 花火のみ ¥1,000";
const PLAN_CHILL_ONLY = "🌅 サンセットchillのみ（無料）";
const PARTY_PLANS = [
  "🪩 パーティのみ（飲み放題）¥3,500",
  "🪩 パーティのみ（ほろ酔い3杯）¥2,500",
  "🪩 パーティのみ（ノンアル飲み放題）¥2,000",
  "🪩 パーティのみ（入場のみ）¥500",
];

const SHUTTLE = "🚌 送迎を希望する（先着16名・flat. 17:45集合）";
const MEET_FLAT_1745 = "🌅 flat. に 17:45（サンセットchillから・送迎の方）";
const MEET_MATSUBARA = "🌅 松原水泳場に 18:20（サンセットchillから・現地集合）";
const MEET_LIBRARY = "🎆 彦根市立図書館前に 19:40（花火大会から）";
const MEET_FLAT_2100 = "🪩 flat. に 21:00（パーティから）";

const HOTSAND_QTY = [
  "予約する：1つ（¥800・当日flat.でお渡し）",
  "予約する：2つ（¥1,600・当日flat.でお渡し）",
  "いらない（食べてくる・持ってくる）",
];
const HOTSAND_NONE = "いらない（食べてくる・持ってくる）";
const HOTSAND_FLAVORS = ["ガーデンメルト", "クラシックメルト"];

const DRINKS_NONE = "いらない";
const DRINK_OPTIONS = [
  { name: "アイスティー", price: 500 },
  { name: "コーラ", price: 500 },
  { name: "ジンジャーエール", price: 500 },
];

type StepId =
  | "contact"
  | "events"
  | "transport"
  | "car"
  | "plan"
  | "meet"
  | "hotsand"
  | "drink"
  | "dj"
  | "confirm";
type TransportMode = "" | "shuttle" | "own_car" | "friend_car" | "walk";

declare global {
  interface Window {
    liff?: {
      init: (c: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getProfile: () => Promise<{ displayName: string; userId: string }>;
    };
  }
}

function Radio({
  options,
  value,
  onChange,
  disabled,
  disabledNote,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: (o: string) => boolean;
  disabledNote?: (o: string) => string;
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
              padding: "12px",
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
            <span>
              {o}
              {off ? `（${disabledNote?.(o) || "受付終了"}）` : ""}
            </span>
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

const Info = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: "12px",
      background: "var(--accent-weak)",
      borderRadius: 10,
      fontSize: 14,
    }}
  >
    {children}
  </div>
);

const LineButton = ({ label }: { label: string }) => (
  <a
    href={LINE_ADD_URL}
    style={{
      display: "inline-block",
      background: "#06C755",
      color: "#fff",
      fontWeight: 700,
      padding: "10px 22px",
      borderRadius: 999,
      textDecoration: "none",
      fontSize: 14,
    }}
  >
    {label}
  </a>
);

export default function Natsumatsuri() {
  const [phase, setPhase] = useState<"info" | "form" | "done">("info");
  const [step, setStep] = useState<StepId>("contact");

  const [name, setName] = useState("");
  const [lineName, setLineName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState<"" | "line" | "email">("");
  const [mailSent, setMailSent] = useState(false);
  const [viaLiff, setViaLiff] = useState(false);
  const [inLine, setInLine] = useState(false);
  const [lineUserId, setLineUserId] = useState("");

  const [chill, setChill] = useState(false);
  const [hanabi, setHanabi] = useState(false);
  const [party, setParty] = useState(false);

  const [drink, setDrink] = useState("");
  const [chillMeet, setChillMeet] = useState("");
  const [mode, setMode] = useState<TransportMode>("");
  const [carDrink, setCarDrink] = useState(""); // 車の人：お酒を飲むか
  const [hotsandQty, setHotsandQty] = useState("");
  const [hotsandFlavor1, setHotsandFlavor1] = useState("");
  const [hotsandFlavor2, setHotsandFlavor2] = useState("");
  const [takeoutDrink, setTakeoutDrink] = useState("");
  const [djRequest, setDjRequest] = useState("");
  const [photoOk, setPhotoOk] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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
    if (navigator.userAgent.includes("Line/")) {
      setInLine(true);
      setContact("line");
    }
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
        setLineUserId(p.userId || "");
        setContact("line");
        setViaLiff(true);
      } catch {
        /* LIFF外はスキップ */
      }
    };
    document.head.appendChild(s);
  }, []);

  const evening = chill || hanabi;
  const anySelected = chill || hanabi || party;
  const eveningClosed = deadlines.hanabiClosed || (status ? !status.hanabiOpen : false);

  // 参加費（プラン）
  // サンセットchillのみ（花火に行かない）は場所代がかからないので無料。
  const chillOnly = chill && !hanabi && !party;
  let plan = "";
  let needDrink = false;
  if (chillOnly) {
    plan = PLAN_CHILL_ONLY;
  } else if (hanabi && party) {
    needDrink = true;
    plan = HANABI_PARTY_PLANS.includes(drink) ? drink : "";
  } else if (hanabi && !party) {
    plan = PLAN_HANABI_ONLY;
  } else if (!hanabi && party) {
    needDrink = true;
    plan = PARTY_PLANS.includes(drink) ? drink : "";
  }

  // 集合場所
  let meetPoint = "";
  if (mode === "shuttle") meetPoint = MEET_FLAT_1745;
  else if (chill) meetPoint = chillMeet;
  else if (hanabi) meetPoint = MEET_LIBRARY;
  else if (party) meetPoint = MEET_FLAT_2100;

  const hotsandCount = hotsandQty.includes("2つ") ? 2 : hotsandQty.includes("1つ") ? 1 : 0;
  const effectiveHotsand =
    chill && hotsandCount > 0
      ? `${hotsandQty} ／ 味: ${[hotsandFlavor1, hotsandCount === 2 ? hotsandFlavor2 : ""].filter(Boolean).join("・")}`
      : chill
        ? hotsandQty || HOTSAND_NONE
        : HOTSAND_NONE;
  const effectiveDrink = chill ? takeoutDrink || DRINKS_NONE : DRINKS_NONE;

  // 移動手段の選択肢。パーティのみの人には送迎は出さない（移動が発生しないため）
  const modeOptions: { key: TransportMode; label: string; off?: boolean; note?: string }[] = [
    ...(evening
      ? [
          {
            key: "shuttle" as TransportMode,
            label: "🚌 送迎してほしい（flat. 17:45集合・先着16名）",
            // 送迎は flat.→松原水泳場→金亀公園→flat. と一緒に動くので、chill＋花火の両方参加が条件
            off: !(chill && hanabi) || (status ? !status.shuttleOpen : false),
            note: !hanabi
              ? "🎆手持ち花火大会にも参加する方のみ（前の画面でチェック）"
              : !chill
                ? "🌅サンセットchillにも参加する方のみ（前の画面でチェック）"
                : "満員御礼🙏",
          },
        ]
      : []),
    { key: "own_car", label: "🚗 自分の車で行く" },
    { key: "friend_car", label: "🚘 友達の車に乗せてもらう" },
    { key: "walk", label: "🚶 自転車・徒歩・電車など" },
  ];

  // 保存用の移動手段テキスト
  const transport =
    mode === "shuttle"
      ? SHUTTLE
      : mode === "own_car"
        ? `🚗 自分の車${carDrink ? `（${carDrink}）` : ""}`
        : mode === "friend_car"
          ? "🚘 友達の車に乗せてもらう"
          : mode === "walk"
            ? "🚶 自転車・徒歩・電車など"
            : "";

  // ウィザードの順番（選択内容でスキップが変わる）
  // 名前 → 参加するもの → 移動手段 →（車なら詳細）→ 参加費 → …
  const stepList = (): StepId[] => {
    const l: StepId[] = ["contact", "events"];
    if (anySelected) {
      l.push("transport");
      if (mode === "own_car" && party) l.push("car");
      l.push("plan");
      if (chill && mode !== "shuttle") l.push("meet");
      if (chill) l.push("hotsand", "drink");
      if (party) l.push("dj");
    }
    l.push("confirm");
    return l;
  };

  const validateStep = (id: StepId): string => {
    if (id === "events" && !anySelected) return "1つ以上選んでください";
    if (id === "plan" && needDrink && !plan) return "プランを選んでください";
    if (id === "transport" && !mode) return "移動方法を選んでください";
    if (id === "car" && !carDrink) return "お酒を飲むかどうかを選んでください";
    if (id === "meet" && !chillMeet) return "集合場所を選んでください";
    if (id === "hotsand") {
      if (!hotsandQty) return "どれか選んでください";
      if (hotsandCount >= 1 && !hotsandFlavor1) return "1つ目の味を選んでください";
      if (hotsandCount >= 2 && !hotsandFlavor2) return "2つ目の味を選んでください";
    }
    if (id === "drink" && !takeoutDrink) return "どれか選んでください（不要な場合は「いらない」）";
    if (id === "contact") {
      if (!name.trim()) return "お名前を入力してください";
      if (!contact) return "連絡方法（LINE か メール）を選んでください";
      if (contact === "email" && !email.trim()) return "メールアドレスを入力してください";
      if (contact === "line" && !lineName.trim()) return "LINEの名前を入力してください";
    }
    return "";
  };

  const list = stepList();
  const idx = list.indexOf(step);

  const next = () => {
    const v = validateStep(step);
    if (v) { setErr(v); return; }
    setErr("");
    const l = stepList();
    const i = l.indexOf(step);
    if (i < l.length - 1) {
      setStep(l[i + 1]);
      window.scrollTo(0, 0);
    }
  };

  const back = () => {
    setErr("");
    const l = stepList();
    const i = l.indexOf(step);
    if (i <= 0) setPhase("info");
    else setStep(l[i - 1]);
    window.scrollTo(0, 0);
  };

  const submit = async () => {
    if (!photoOk) { setErr("写真掲載の確認にチェックをお願いします"); return; }
    setErr("");
    setBusy(true);
    try {
      const events = [
        ...(chill ? ["chill"] : []),
        ...(hanabi ? ["hanabi"] : []),
        ...(party ? ["party"] : []),
      ];
      const res = await fetch("/api/natsumatsuri", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lineName: contact === "line" ? lineName : "",
          email: contact === "email" ? email : "",
          lineUserId: contact === "line" ? lineUserId : "",
          plan,
          meetPoint,
          transport,
          hotsand: effectiveHotsand,
          takeoutDrink: effectiveDrink,
          djRequest: party ? djRequest : "",
          photoOk,
          note,
          events,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "申込に失敗しました");
      setMailSent(!!d.mailSent);
      setPhase("done");
      window.scrollTo(0, 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "申込に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  /* ============ 完了画面 ============ */
  if (phase === "done") {
    return (
      <div className="wrap" style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 56 }}>🎆</div>
        <h1>申込完了！</h1>
        <p style={{ color: "var(--muted)" }}>
          {name} さん、お申し込みありがとうございます！<br />
          当日お会いできるのを楽しみにしています🏮
        </p>
        {contact === "email" && (
          <p style={{ fontSize: 13, color: mailSent ? "var(--ok)" : "#c0392b" }}>
            {mailSent
              ? "✉️ 申込完了メールをお送りしました（届かない場合は迷惑メールフォルダをご確認ください）"
              : "⚠️ 確認メールの送信に失敗しましたが、申込は完了しています"}
          </p>
        )}
        <div className="card" style={{ textAlign: "left", marginTop: 24 }}>
          <div className="result-row"><span>参加費</span><span>{plan}</span></div>
          <div className="result-row"><span>集合</span><span style={{ textAlign: "right" }}>{meetPoint}</span></div>
          <div className="result-row"><span>移動</span><span style={{ textAlign: "right" }}>{transport}</span></div>
          <div className="result-row"><span>ホットサンド</span><span style={{ textAlign: "right" }}>{effectiveHotsand}</span></div>
          <div className="result-row"><span>ドリンク</span><span style={{ textAlign: "right" }}>{effectiveDrink}</span></div>
        </div>
        {!inLine && (
          <div className="card" style={{ textAlign: "center", background: "#eafbf0", borderColor: "#06C755" }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>
              📷 写真データの共有・当日の連絡は公式LINEで行います<br />
              写真がほしい方はLINE登録をお忘れなく！
            </p>
            <LineButton label="flat. を友だち追加する" />
            <p className="hint" style={{ margin: "8px 0 0" }}>変更・キャンセルもLINEでご連絡ください</p>
          </div>
        )}
      </div>
    );
  }

  /* ============ 申込ウィザード ============ */
  if (phase === "form") {
    const titles: Record<StepId, string> = {
      events: "どれに参加する？（あてはまるもの全部）",
      plan: "参加費",
      transport: "🚗 当日の移動はどうしますか？",
      car: "🚗 お車について",
      meet: "集合場所",
      hotsand: "🍞 ホットサンドのテイクアウト予約",
      drink: "🥤 ドリンクのテイクアウト予約",
      dj: "🎧 DJへのリクエスト曲（任意）",
      contact: "お名前と連絡方法",
      confirm: "最終確認",
    };
    return (
      <div className="wrap">
        <div style={{ textAlign: "center", padding: "14px 0 4px" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>🎆 夏祭り2026 参加申込</h1>
          <p className="hint" style={{ margin: 0 }}>
            {idx + 1} / {list.length}
          </p>
          <div style={{ background: "var(--line)", borderRadius: 4, height: 6, margin: "8px 24px 16px", overflow: "hidden" }}>
            <div style={{ width: `${((idx + 1) / list.length) * 100}%`, height: "100%", background: "var(--accent)", transition: "width .25s" }} />
          </div>
        </div>

        <S title={titles[step]}>
          {step === "events" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([
                  [chill, setChill, "🌅 サンセットchill", "18:30〜 @松原水泳場"],
                  [hanabi, setHanabi, "🎆 手持ち花火大会", "19:50〜 @金亀公園"],
                  [party, setParty, "🪩 盆踊りパーティー", "21:00〜24:00 @flat.（踊らない人も大歓迎🍻）"],
                ] as const).map(([val, set, label, time], i) => {
                  const locked = false;
                  const off = i < 2 && eveningClosed;
                  return (
                    <label
                      key={label}
                      style={{
                        display: "flex", gap: 10, alignItems: "center", padding: "14px 12px",
                        border: `1.5px solid ${val ? "var(--accent)" : "var(--line)"}`,
                        background: val ? "var(--accent-weak)" : "var(--card)",
                        borderRadius: 10, fontSize: 15,
                        opacity: off ? 0.45 : 1, cursor: off ? "not-allowed" : "pointer",
                      }}
                    >
                      <input type="checkbox" checked={val} disabled={off} onChange={(e) => set(e.target.checked)} />
                      <span style={{ fontWeight: 700 }}>
                        {label}
                        <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>
                          {time}
                          {locked ? "（送迎のため参加）" : i < 2 && eveningClosed ? "（受付終了）" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="hint" style={{ margin: "8px 0 0" }}>
                🌅 サンセットchillのみのご参加は無料です。パーティだけ、花火だけの参加もOK！<br />
                🚌 送迎をご希望の方は「サンセットchill」と「手持ち花火大会」の<b>両方</b>にチェックをお願いします
                （送迎は両方の会場をまわるため）
              </p>
            </>
          )}

          {step === "plan" && (
            <>
              {chillOnly && (
                <Info>
                  サンセットchillのみのご参加は <b>無料</b> です🌅<br />
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    ※送迎をご希望の場合は、花火大会にもご参加いただきます（次のページで選べます）
                  </span>
                </Info>
              )}
              {hanabi && party && (
                <Radio options={HANABI_PARTY_PLANS} value={drink} onChange={setDrink} />
              )}
              {hanabi && !party && (
                <Info>
                  参加費は <b>¥1,000</b>（手持ち花火大会{chill ? "・サンセットchill" : ""}）です
                </Info>
              )}
              {!hanabi && party && <Radio options={PARTY_PLANS} value={drink} onChange={setDrink} />}
            </>
          )}

          {step === "transport" && (
            <>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                会場は flat.（パーティ）・松原水泳場（chill）・金亀公園（花火）に分かれています。
                <b>flat. から花火の会場までは徒歩で15分ほど</b>かかります🚶
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {modeOptions.map((m) => (
                  <label
                    key={m.key}
                    style={{
                      display: "flex", gap: 8, alignItems: "flex-start", padding: "12px",
                      border: `1.5px solid ${mode === m.key ? "var(--accent)" : "var(--line)"}`,
                      background: mode === m.key ? "var(--accent-weak)" : "var(--card)",
                      borderRadius: 10, fontSize: 14,
                      opacity: m.off ? 0.45 : 1, cursor: m.off ? "not-allowed" : "pointer",
                    }}
                  >
                    <input
                      type="radio" checked={mode === m.key} disabled={m.off}
                      onChange={() => setMode(m.key)} style={{ marginTop: 3 }}
                    />
                    <span>
                      {m.label}
                      {m.off && <span style={{ fontSize: 12 }}>（{m.note}）</span>}
                    </span>
                  </label>
                ))}
              </div>
              {mode === "shuttle" && (
                <div style={{ marginTop: 10 }}>
                  <Info>
                    🚌 送迎は flat. 17:45集合 → 松原水泳場 → 金亀公園 → flat. と一緒に動きます🚗
                  </Info>
                </div>
              )}
              {evening && !(chill && hanabi) && (
                <p className="hint" style={{ margin: "10px 0 0", color: "#c0392b" }}>
                  🚌 送迎をご希望の場合は、前の画面で<b>サンセットchillと手持ち花火大会の両方</b>にチェックしてください
                  （送迎は両方の会場をまわるため）
                </p>
              )}
              {!evening && (
                <p className="hint" style={{ margin: "8px 0 0" }}>
                  パーティのみのご参加なので、送迎はありません（flat. に直接お越しください）
                </p>
              )}
            </>
          )}

          {step === "car" && (
            <>
              <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 6px" }}>
                パーティでお酒を飲みますか？🍻
              </p>
              <Radio
                options={[
                  "飲むので、車はflat.の駐車場に翌日まで置いて帰る",
                  "飲まないので、運転して帰る",
                ]}
                value={carDrink}
                onChange={setCarDrink}
              />
              <p className="hint" style={{ margin: "6px 0 0" }}>
                flat. の駐車場は翌日まで置いていってOKです🚗
                {evening && " ※サンセットchill・花火の時間に運転される方はノンアルでお願いします"}
              </p>
            </>
          )}

          {step === "meet" && (
            <Radio options={[MEET_FLAT_1745, MEET_MATSUBARA]} value={chillMeet} onChange={setChillMeet} />
          )}

          {step === "hotsand" && (
            <>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                chillから参加すると夜ごはんの時間が取れません。食べてくるか、持ってくるか、ホットサンドをどうぞ！
              </p>
              <Radio
                options={HOTSAND_QTY}
                value={hotsandQty}
                onChange={(v) => {
                  setHotsandQty(v);
                  if (v === HOTSAND_NONE) {
                    setHotsandFlavor1("");
                    setHotsandFlavor2("");
                  }
                }}
              />
              {hotsandCount >= 1 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 6px" }}>
                    1つ目の味
                  </p>
                  <Radio options={HOTSAND_FLAVORS} value={hotsandFlavor1} onChange={setHotsandFlavor1} />
                </div>
              )}
              {hotsandCount >= 2 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 6px" }}>
                    2つ目の味
                  </p>
                  <Radio options={HOTSAND_FLAVORS} value={hotsandFlavor2} onChange={setHotsandFlavor2} />
                </div>
              )}
            </>
          )}

          {step === "drink" && (
            <>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                ソフトドリンクのテイクアウトもできます（各¥500・当日flat.でお渡し）
              </p>
              <Radio
                options={[...DRINK_OPTIONS.map((d) => `${d.name} ¥${d.price}`), DRINKS_NONE]}
                value={takeoutDrink}
                onChange={setTakeoutDrink}
              />
            </>
          )}

          {step === "dj" && (
            <textarea
              value={djRequest}
              onChange={(e) => setDjRequest(e.target.value)}
              rows={4}
              placeholder="聞きたい夏の曲、DJに渡します！曲名とアーティスト名をどうぞ（何曲でもOK・空欄でもOK）"
              style={{ width: "100%" }}
            />
          )}

          {step === "contact" && (
            <>
              <p style={{ fontWeight: 600, fontSize: 14, margin: "0 0 4px" }}>お名前</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" style={{ width: "100%" }} />

              <p style={{ fontWeight: 600, fontSize: 14, margin: "14px 0 4px" }}>連絡方法</p>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                📷 撮影した写真データの共有は<b>LINEのみ</b>。写真がほしい方はLINEがおすすめ！
              </p>
              {!viaLiff && !inLine && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {([
                    ["line", "📱 LINEで申し込む（写真の共有もこちら！）"],
                    ["email", "✉️ メールアドレスで申し込む"],
                  ] as const).map(([k, label]) => (
                    <label
                      key={k}
                      style={{
                        display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
                        border: `1.5px solid ${contact === k ? "var(--accent)" : "var(--line)"}`,
                        background: contact === k ? "var(--accent-weak)" : "var(--card)",
                        borderRadius: 10, fontSize: 14, cursor: "pointer",
                      }}
                    >
                      <input type="radio" checked={contact === k} onChange={() => setContact(k)} style={{ marginTop: 3 }} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
              {contact === "line" && (
                <div style={{ marginTop: 10 }}>
                  {!viaLiff && !inLine && (
                    <div style={{ textAlign: "center", marginBottom: 10 }}>
                      <LineButton label="① flat. を友だち追加する" />
                      <p className="hint" style={{ margin: "6px 0 0" }}>
                        追加するとLINEに申込ページが届きます。このままここで続けてもOK👇
                      </p>
                    </div>
                  )}
                  <input
                    value={lineName}
                    onChange={(e) => setLineName(e.target.value)}
                    placeholder="LINEで表示される名前"
                    style={{ width: "100%" }}
                  />
                  <p className="hint" style={{ margin: "6px 0 0" }}>
                    {viaLiff ? "LINEから取得しました。違う場合は直してください" : "あなたのLINEの表示名を入力"}
                  </p>
                </div>
              )}
              {contact === "email" && (
                <div style={{ marginTop: 10 }}>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com" style={{ width: "100%" }}
                  />
                  <p className="hint" style={{ margin: "6px 0 0" }}>申込完了メールをお送りします</p>
                </div>
              )}
            </>
          )}

          {step === "confirm" && (
            <>
              <div style={{ fontSize: 14 }}>
                <div className="result-row"><span>お名前</span><span>{name}</span></div>
                <div className="result-row">
                  <span>連絡</span>
                  <span>{contact === "line" ? `📱 ${lineName}` : `✉️ ${email}`}</span>
                </div>
                <div className="result-row">
                  <span>参加</span>
                  <span>{[chill && "🌅chill", hanabi && "🎆花火", party && "🪩パーティ"].filter(Boolean).join(" / ")}</span>
                </div>
                <div className="result-row"><span>参加費</span><span>{plan}</span></div>
                <div className="result-row"><span>移動</span><span style={{ textAlign: "right" }}>{transport}</span></div>
                <div className="result-row"><span>集合</span><span style={{ textAlign: "right" }}>{meetPoint}</span></div>
                {chill && <div className="result-row"><span>🍞</span><span style={{ textAlign: "right" }}>{effectiveHotsand}</span></div>}
                {chill && <div className="result-row"><span>🥤</span><span style={{ textAlign: "right" }}>{effectiveDrink}</span></div>}
                {party && djRequest && <div className="result-row"><span>🎧</span><span style={{ textAlign: "right" }}>{djRequest}</span></div>}
              </div>

              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: "pointer", marginTop: 14 }}>
                <input type="checkbox" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} style={{ marginTop: 3 }} />
                <span>イベント中の顔が映った写真をflat.のSNSに掲載してOKです（参加条件です）</span>
              </label>

              <p style={{ fontWeight: 600, fontSize: 13, margin: "12px 0 4px" }}>その他・質問（任意）</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: "100%" }} />
            </>
          )}
        </S>

        {err && <p className="err" style={{ textAlign: "center" }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "16px 0 40px" }}>
          <button className="ghost" onClick={back} disabled={busy}>← 戻る</button>
          {step === "confirm" ? (
            <button className="primary" onClick={submit} disabled={busy} style={{ fontSize: 16, padding: "12px 36px" }}>
              {busy ? "送信中..." : "🎆 申し込む"}
            </button>
          ) : (
            <button className="primary" onClick={next} style={{ fontSize: 16, padding: "12px 36px" }}>
              次へ →
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ============ イベント詳細（最初の画面） ============ */
  return (
    <div className="wrap">
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

      {/* やること3本立て */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, textAlign: "center", marginBottom: 10, fontSize: 16 }}>
          やること🎇
        </div>
        {[
          ["🌅", "サンセットchill", "琵琶湖の夕日を眺めてチル＆写真撮影", "@松原水泳場"],
          ["🎆", "手持ち花火大会", "彦根城のふもとで夏の思い出づくり", "@金亀公園"],
          ["🪩", "盆踊りパーティー", "DJ入り！踊らない人も大歓迎、みんなでワイワイ🍻", "@flat."],
        ].map(([emoji, title, desc, place]) => (
          <div
            key={title}
            style={{
              display: "flex", gap: 12, alignItems: "center",
              padding: "10px 4px", borderBottom: "1px solid var(--line)",
            }}
          >
            <span style={{ fontSize: 30 }}>{emoji}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {title}{" "}
                <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}>{place}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5 }}>{desc}</div>
            </div>
          </div>
        ))}
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
            DJも入ります🎧 リクエスト曲は申込フォームで募集中！何曲でもOK！出入り自由！<br />
            踊らない人も大歓迎です！みんなでワイワイしましょう🍻
          </span>
        </div>
      </S>

      {/* 料金 */}
      <S title="【参加費】">
        <div style={{ fontSize: 14 }}>
          <p style={{ margin: "2px 0", fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>◆ サンセットchillのみ</p>
          <div className="result-row"><span>サンセットchillのみ</span><span className="mono">無料</span></div>
          <p style={{ margin: "10px 0 2px", fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>◆ 花火大会から参加（chillからでも同額）</p>
          <div className="result-row"><span>花火＋パーティ（飲み放題）</span><span className="mono">¥4,000</span></div>
          <div className="result-row"><span>花火＋パーティ（3杯）</span><span className="mono">¥3,000</span></div>
          <div className="result-row"><span>花火＋パーティ（ノンアル飲み放題）</span><span className="mono">¥2,500</span></div>
          <div className="result-row"><span>花火＋パーティ（入場のみ）</span><span className="mono">¥1,500</span></div>
          <div className="result-row"><span>花火のみ</span><span className="mono">¥1,000</span></div>
          <p style={{ margin: "10px 0 2px", fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>◆ パーティのみ参加（21:00〜）</p>
          <div className="result-row"><span>飲み放題</span><span className="mono">¥3,500</span></div>
          <div className="result-row"><span>ほろ酔いプラン（3杯）</span><span className="mono">¥2,500</span></div>
          <div className="result-row"><span>ノンアル飲み放題</span><span className="mono">¥2,000</span></div>
          <div className="result-row"><span>入場のみ</span><span className="mono">¥500</span></div>
        </div>
      </S>

      {/* 移動・送迎 */}
      <S title="【🚗 移動・送迎について】">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          <li>送迎は事前申込制です（先着16名・このフォームから）</li>
          <li>送迎は flat.→松原水泳場→金亀公園→flat. と一緒にまわるので、<b>サンセットchillと手持ち花火大会の両方に参加する方</b>が対象です🌅🎆</li>
          <li>お車の方はご自身の車での移動をお願いします🚗</li>
          <li>車・友達の車・自転車・徒歩の方は、chillか花火の片方だけの参加もOKです（サンセットchillのみなら無料🌅）</li>
          <li>flat. から花火の会場（金亀公園）までは徒歩で15分ほどかかります🚶</li>
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
          <li>flat. のホットサンドをテイクアウト（1つ¥800・申込フォームで予約）</li>
          <li>サンセットchill中に食べられるものを持ってくる</li>
        </ul>
      </S>

      {/* 詳細 */}
      <S title="【詳細】">
        <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
          <b>定員</b>：Sunset chill 定員なし（送迎は先着16名）／花火大会 30人（先着順）／パーティ 定員なし ※混み合ってきたら締め切ります<br />
          <b>申込期限</b>：花火・chillから参加は 8/18（火）／パーティのみは 8/20（木）まで<br />
          <b>雨天時</b>：大雨の場合、サンセットchill・花火大会は中止です。その場合はそのままflat.で別企画をやります、お楽しみに🎉<br />
          <b>参加条件</b>：flat. のSNSに顔が映った写真を掲載してもOKな方<br />
          <b>ドレスコード</b>：浴衣／甚平（必須ではありません！私服でもOK）👘<br />
          <b>持ち物</b>：やる気、元気、日本の夏を楽しむ気持ち！🍉🎐☀️<br />
          <b>参加メリット</b>：📷 撮影データをイベント後日共有／新しいお友達ができるかも／盛り上げるので楽しませます<br />
          <b>お願い</b>：🚗 お車の方は、サンセットchill・花火の時間はノンアルで。パーティでお酒を飲まれる方は、お車をflat.の駐車場に翌日まで置いてOKです
        </div>
      </S>

      {/* 申込へ */}
      {deadlines.allClosed ? (
        <div className="card" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40 }}>🙏</div>
          <h2 style={{ margin: "4px 0" }}>申込は締め切りました</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>参加のご相談はflat.のLINEへどうぞ。</p>
        </div>
      ) : (
        <div style={{ textAlign: "center", margin: "24px 0 40px" }}>
          {status && (
            <p className="hint" style={{ marginBottom: 8 }}>
              花火大会 残り{Math.max(0, 30 - status.hanabi)}名 ／ 送迎 残り{Math.max(0, 16 - status.shuttle)}席<br />
              申込期限：花火・chillから参加は 8/18（火）／パーティのみは 8/20（木）
            </p>
          )}
          <button
            className="primary"
            onClick={() => { setPhase("form"); setStep("contact"); window.scrollTo(0, 0); }}
            style={{ fontSize: 18, padding: "16px 48px" }}
          >
            📝 申し込みへ進む
          </button>
        </div>
      )}
    </div>
  );
}
