import { NextRequest, NextResponse } from "next/server";
import {
  getEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  counts,
  CAPS,
  ALL_PLANS,
  HANABI_PLANS,
  SHUTTLE_OPTION,
  hanabiDeadlinePassed,
  partyDeadlinePassed,
  type NatsumatsuriEntry,
} from "@/lib/natsumatsuri";
import { gmailSend } from "@/lib/google";

const LINE_ADD_URL = "https://line.me/R/ti/p/@391wpozk";

function confirmMail(e: NatsumatsuriEntry): { subject: string; body: string } {
  return {
    subject: "【flat. 夏祭り2026】お申し込みを受け付けました🎆",
    body: `${e.name} さん

flat. 夏祭り2026へのお申し込みありがとうございます！
以下の内容で受け付けました。

■ プラン：${e.plan}
■ 集合場所：${e.meetPoint}
■ 移動：${e.transport}
■ ホットサンド：${e.hotsand}

【当日 8/22（土）の流れ】
🌅 サンセットchillから → 17:45 flat. 集合／18:20 松原水泳場 集合
🎆 花火大会から → 19:40 彦根市立図書館前 集合
🪩 パーティから → 21:00 flat. 集合（21:15 乾杯）

⚠️ 雨天時など当日の連絡は公式LINEで行います。
📷 撮影した写真データの共有もLINEで行うので、写真がほしい方は友だち追加をお願いします👇
${LINE_ADD_URL}

変更・キャンセルはこのメールへの返信、またはLINEでご連絡ください。
当日お会いできるのを楽しみにしています🏮

flat.`,
  };
}

export const runtime = "nodejs";

// GET /api/natsumatsuri            → 残り枠の状況（公開）
// GET /api/natsumatsuri?list=1     → 申込一覧（管理用）
export async function GET(req: NextRequest) {
  try {
    const entries = await getEntries();
    const c = counts(entries);
    const deadlines = {
      hanabiClosed: hanabiDeadlinePassed(),
      allClosed: partyDeadlinePassed(),
    };
    if (req.nextUrl.searchParams.get("list") === "1") {
      return NextResponse.json({ counts: c, caps: CAPS, deadlines, entries });
    }
    return NextResponse.json({ counts: c, caps: CAPS, deadlines });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST: 申込
export async function POST(req: NextRequest) {
  let b: Partial<NatsumatsuriEntry>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  if (!b.name?.trim()) return NextResponse.json({ error: "お名前を入力してください" }, { status: 400 });
  const email = (b.email || "").trim();
  const lineName = (b.lineName || "").trim();
  if (!email && !lineName) {
    return NextResponse.json(
      { error: "連絡が取れるように、メールアドレスかLINEの名前のどちらかを入力してください" },
      { status: 400 },
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }
  if (!b.plan || !ALL_PLANS.includes(b.plan)) return NextResponse.json({ error: "参加プランを選んでください" }, { status: 400 });
  if (!b.meetPoint) return NextResponse.json({ error: "集合場所を選んでください" }, { status: 400 });
  if (!b.transport) return NextResponse.json({ error: "移動方法を選んでください" }, { status: 400 });
  if (!b.hotsand) return NextResponse.json({ error: "ホットサンドの項目を選んでください" }, { status: 400 });
  if (!b.photoOk) return NextResponse.json({ error: "写真掲載の確認にチェックしてください" }, { status: 400 });

  try {
    // 期限チェック
    if (partyDeadlinePassed()) {
      return NextResponse.json(
        { error: "申込は締め切りました🙏 参加のご相談はflat.のLINEへどうぞ" },
        { status: 409 },
      );
    }
    const joinsEvening =
      (b.events && b.events.length
        ? b.events.includes("hanabi") || b.events.includes("chill")
        : HANABI_PLANS.includes(b.plan));
    if (joinsEvening && hanabiDeadlinePassed()) {
      return NextResponse.json(
        { error: "花火から参加の申込は8/18（火）で締め切りました🙏 パーティのみのプランは8/20（木）まで受付中です" },
        { status: 409 },
      );
    }
    // 枠チェック（保存直前にサーバー側で数える）
    const c = counts(await getEntries());
    const joinsHanabiEvent =
      b.events && b.events.length ? b.events.includes("hanabi") : HANABI_PLANS.includes(b.plan);
    if (joinsHanabiEvent && !c.hanabiOpen) {
      return NextResponse.json(
        { error: "ごめんなさい、花火大会が定員に達しました🙏 パーティのみのプランでのご参加をご検討ください" },
        { status: 409 },
      );
    }
    if (b.transport === SHUTTLE_OPTION && !c.shuttleOpen) {
      return NextResponse.json(
        { error: "ごめんなさい、送迎が定員（16名）に達しました🙏 お車・現地集合でのご参加をお願いします" },
        { status: 409 },
      );
    }

    const entry: NatsumatsuriEntry = {
      id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: b.name.trim(),
      lineName,
      email,
      lineUserId: (b.lineUserId || "").trim(),
      events: b.events || [],
      plan: b.plan,
      meetPoint: b.meetPoint,
      transport: b.transport,
      hotsand: b.hotsand,
      takeoutDrink: (b.takeoutDrink || "").trim(),
      djRequest: (b.djRequest || "").trim(),
      photoOk: true,
      note: (b.note || "").trim(),
      createdAt: new Date().toISOString(),
    };
    await addEntry(entry);

    // メール申込には確認メールを送る（送信失敗しても申込自体は成立）
    let mailSent = false;
    if (email) {
      try {
        const m = confirmMail(entry);
        await gmailSend(email, m.subject, m.body);
        mailSent = true;
      } catch (err) {
        console.error("確認メール送信失敗:", err);
      }
    }
    return NextResponse.json({ ok: true, entry, mailSent });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "申込に失敗しました" },
      { status: 500 },
    );
  }
}

// PATCH { id, patch }: 申込内容の一部を後から直す（味の後追い確認など・管理用）
export async function PATCH(req: NextRequest) {
  try {
    const { id, patch } = (await req.json()) as {
      id?: string;
      patch?: Partial<NatsumatsuriEntry>;
    };
    if (!id || !patch) {
      return NextResponse.json({ error: "id と patch が必要" }, { status: 400 });
    }
    const updated = await updateEntry(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "該当の申込がありません" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, entry: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新に失敗" },
      { status: 500 },
    );
  }
}

// DELETE { id }: 申込取消（管理用）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "id が必要" }, { status: 400 });
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
