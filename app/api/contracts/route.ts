import { NextRequest, NextResponse } from "next/server";
import {
  getContracts, saveContract, deleteContract,
  saveContractFile, getContractFile, statusOf, type Contract,
} from "@/lib/contracts";

export const runtime = "nodejs";
export const maxDuration = 30;

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("file");
  if (id) {
    const file = await getContractFile(id);
    if (!file) return NextResponse.json({ error: "ファイルがありません" }, { status: 404 });
    return NextResponse.json({ file });
  }
  const today = jstToday();
  const contracts = await getContracts();
  return NextResponse.json({
    today,
    contracts: contracts.map((c) => ({ ...c, status: statusOf(c, today) })),
  });
}

export async function POST(req: NextRequest) {
  let body: Partial<Contract> & { file?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.title || !body.party || !body.startDate) {
    return NextResponse.json(
      { error: "契約名・相手先・開始日が必要です" },
      { status: 400 },
    );
  }
  const id = body.id || `c_${Date.now()}`;
  try {
    await saveContract({
      id,
      title: body.title,
      kind: body.kind || "その他",
      party: body.party,
      partyContact: body.partyContact,
      signedOn: body.signedOn,
      startDate: body.startDate,
      endDate: body.endDate,
      autoRenew: body.autoRenew ?? false,
      renewMonths: body.renewMonths,
      noticeMonths: body.noticeMonths,
      monthlyAmount: body.monthlyAmount,
      paymentTerms: body.paymentTerms,
      initialCost: body.initialCost,
      notes: body.notes,
      billId: body.billId,
      active: body.active ?? true,
    });
    if (body.file) await saveContractFile(id, body.file);
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
  await deleteContract(id);
  return NextResponse.json({ ok: true });
}
