import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// リッチメニューの確認と、リンク先の差し替え。
//
// Messaging APIで作ったリッチメニューは LINE Official Account Manager の
// 画面に出てこない。作った経路でしか触れないので、ここから見られるようにする。

const API = "https://api.line.me/v2/bot";

function hdrs() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// GET → いまあるリッチメニューと、既定で表示されているもの
export async function GET() {
  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: "LINE_CHANNEL_ACCESS_TOKEN が未設定" }, { status: 500 });
    }
    const [listRes, defRes] = await Promise.all([
      fetch(`${API}/richmenu/list`, { headers: hdrs() }),
      fetch(`${API}/user/all/richmenu`, { headers: hdrs() }),
    ]);
    const list = await listRes.json();
    if (!listRes.ok) {
      return NextResponse.json(
        { error: list.message || `取得に失敗(${listRes.status})`, details: list },
        { status: listRes.status },
      );
    }
    const def = defRes.ok ? await defRes.json() : null;
    return NextResponse.json({
      defaultRichMenuId: def?.richMenuId ?? null,
      menus: (list.richmenus || []).map((m: any) => ({
        id: m.richMenuId,
        name: m.name,
        chatBarText: m.chatBarText,
        selected: m.selected,
        size: m.size,
        areas: (m.areas || []).map((a: any) => ({
          bounds: a.bounds,
          action: a.action,
        })),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}

// POST { id, uri } → そのリッチメニューの全ボタンのリンク先を差し替える。
//
// Messaging APIはリッチメニューの部分更新ができないので、
// 今の定義を読んで、画像はそのまま、リンク先だけ書き換えた新しいメニューを作り、
// 既定として設定し直す。古いほうは消す。
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      id?: string;
      uri?: string;
      areaIndex?: number;
      name?: string;
      chatBarText?: string;
      /** 差し替える画像。無ければ今の画像をそのまま引き継ぐ */
      imageBase64?: string;
    };
    if (!b.id || !b.uri) {
      return NextResponse.json({ error: "id と uri が必要です" }, { status: 400 });
    }
    const cur = await fetch(`${API}/richmenu/${b.id}`, { headers: hdrs() });
    const menu = await cur.json();
    if (!cur.ok) {
      return NextResponse.json(
        { error: menu.message || `取得に失敗(${cur.status})` },
        { status: cur.status },
      );
    }
    const areas = (menu.areas || []).map((a: any, i: number) =>
      b.areaIndex === undefined || b.areaIndex === i
        ? { ...a, action: { type: "uri", uri: b.uri } }
        : a,
    );
    const created = await fetch(`${API}/richmenu`, {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        size: menu.size,
        selected: menu.selected,
        name: b.name || menu.name,
        chatBarText: b.chatBarText || menu.chatBarText,
        areas,
      }),
    });
    const cd = await created.json();
    if (!created.ok) {
      return NextResponse.json(
        { error: cd.message || `作成に失敗(${created.status})`, details: cd },
        { status: created.status },
      );
    }
    const newId = cd.richMenuId;

    // 画像。指定があれば差し替え、無ければ今のものを引き継ぐ
    let buf: Buffer | null = null;
    let type = "image/png";
    if (b.imageBase64) {
      buf = Buffer.from(b.imageBase64, "base64");
    } else {
      const img = await fetch(`https://api-data.line.me/v2/bot/richmenu/${b.id}/content`, {
        headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      });
      if (img.ok) {
        buf = Buffer.from(await img.arrayBuffer());
        type = img.headers.get("content-type") || "image/png";
      }
    }
    if (buf) {
      const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${newId}/content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          "Content-Type": type,
        },
        body: new Uint8Array(buf),
      });
      if (!up.ok) {
        return NextResponse.json(
          { error: `画像の引き継ぎに失敗(${up.status}): ${(await up.text()).slice(0, 200)}`, newId },
          { status: 500 },
        );
      }
    }

    await fetch(`${API}/user/all/richmenu/${newId}`, { method: "POST", headers: hdrs() });
    await fetch(`${API}/richmenu/${b.id}`, { method: "DELETE", headers: hdrs() });

    return NextResponse.json({ ok: true, id: newId, uri: b.uri });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "エラー" }, { status: 500 });
  }
}
