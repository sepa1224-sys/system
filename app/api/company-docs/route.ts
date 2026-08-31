import { NextRequest, NextResponse } from "next/server";
import {
  getCompanyDocs, saveCompanyDoc, deleteCompanyDoc,
  saveCompanyFile, getCompanyFile, type CompanyDoc,
} from "@/lib/companyDocs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("file");
  if (id) {
    const file = await getCompanyFile(id);
    if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 404 });
    return NextResponse.json({ file });
  }
  return NextResponse.json({ docs: await getCompanyDocs() });
}

export async function POST(req: NextRequest) {
  let body: Partial<CompanyDoc> & { file?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.title || !body.date) {
    return NextResponse.json({ error: "書類名と日付が必要です" }, { status: 400 });
  }
  const id = body.id || `cd_${Date.now()}`;
  try {
    await saveCompanyDoc({
      id,
      kind: body.kind || "その他",
      title: body.title,
      date: body.date,
      issuer: body.issuer,
      validUntil: body.validUntil,
      summary: body.summary,
      current: body.current ?? true,
    });
    if (body.file) await saveCompanyFile(id, body.file);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  await deleteCompanyDoc(id);
  return NextResponse.json({ ok: true });
}
