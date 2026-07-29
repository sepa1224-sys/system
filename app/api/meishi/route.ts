import { NextRequest, NextResponse } from "next/server";
import {
  getContacts,
  getContact,
  saveContact,
  addNote,
  updateContact,
  deleteContact,
  type Contact,
} from "@/lib/meishi";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET: 一覧取得（?q=で名前・会社名検索）
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  let contacts = await getContacts();
  if (q) {
    contacts = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q) ||
        (c.nameKana ?? "").toLowerCase().includes(q),
    );
  }
  // 画像dataURLは一覧では返さない（重量削減）
  const slim = contacts.map(({ imageDataUrl: _, ...c }) => c);
  return NextResponse.json({ contacts: slim });
}

// POST: 新規登録
export async function POST(req: NextRequest) {
  let body: Partial<Contact>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }
  if (!body.name) {
    return NextResponse.json({ error: "名前は必須です。" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const contact: Contact = {
    id: `c_${Date.now()}`,
    name: body.name,
    nameKana: body.nameKana,
    company: body.company,
    title: body.title,
    phone: body.phone,
    email: body.email,
    address: body.address,
    website: body.website,
    imageDataUrl: body.imageDataUrl,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveContact(contact);
  const { imageDataUrl: _, ...slim } = contact;
  return NextResponse.json({ contact: slim }, { status: 201 });
}

// PATCH: 更新・メモ追加
export async function PATCH(req: NextRequest) {
  let body: { id: string; action: "edit" | "add-note"; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです。" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id が必要です。" }, { status: 400 });
  }

  if (body.action === "add-note") {
    const text = typeof body.data?.text === "string" ? body.data.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "メモ本文が必要です。" }, { status: 400 });
    }
    const note = await addNote(body.id, text);
    if (!note) {
      return NextResponse.json({ error: "連絡先が見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ note });
  }

  if (body.action === "edit") {
    const ok = await updateContact(body.id, body.data as Partial<Contact>);
    if (!ok) {
      return NextResponse.json({ error: "連絡先が見つかりません。" }, { status: 404 });
    }
    const updated = await getContact(body.id);
    if (!updated) return NextResponse.json({ error: "取得エラー" }, { status: 500 });
    const { imageDataUrl: _, ...slim } = updated;
    return NextResponse.json({ contact: slim });
  }

  return NextResponse.json({ error: "action が無効です。" }, { status: 400 });
}

// DELETE: 削除
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id が必要です。" }, { status: 400 });
  }
  await deleteContact(id);
  return NextResponse.json({ ok: true });
}
