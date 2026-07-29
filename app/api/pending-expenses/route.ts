import { NextRequest, NextResponse } from "next/server";
import {
  getPendingExpenses,
  savePendingExpense,
  updatePendingExpense,
  bulkSavePendingExpenses,
  type PendingExpense,
} from "@/lib/pending-expenses";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET: 一覧取得 (?status=pending|registered|skipped)
export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status");
  const all = await getPendingExpenses();
  const items = status ? all.filter((e) => e.status === status) : all;
  return NextResponse.json({ items });
}

// POST: 新規登録（単体 or bulk）
// 単体: { ...PendingExpense フィールド }
// bulk: { bulk: true, items: PendingExpense[] }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }

  try {
    if (body.bulk && Array.isArray(body.items)) {
      const expenses: PendingExpense[] = body.items.map((item: Record<string, unknown>) => ({
        id: `pe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: String(item.date ?? ""),
        amount: Number(item.amount) || 0,
        vendor: String(item.vendor ?? ""),
        source: String(item.source ?? ""),
        description: String(item.description ?? ""),
        payer: String(item.payer ?? ""),
        status: "pending" as const,
        category: item.category ? String(item.category) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : undefined,
        note: item.note ? String(item.note) : undefined,
      }));
      await bulkSavePendingExpenses(expenses);
      return NextResponse.json({ ok: true, count: expenses.length });
    }

    // 単体登録
    if (!body.date || !body.amount || !body.vendor) {
      return NextResponse.json(
        { error: "date, amount, vendor は必須です" },
        { status: 400 },
      );
    }
    const expense: PendingExpense = {
      id: `pe_${Date.now()}`,
      date: String(body.date),
      amount: Number(body.amount),
      vendor: String(body.vendor),
      source: String(body.source ?? ""),
      description: String(body.description ?? ""),
      payer: String(body.payer ?? ""),
      status: "pending",
      category: body.category ? String(body.category) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
      note: body.note ? String(body.note) : undefined,
    };
    await savePendingExpense(expense);
    return NextResponse.json({ ok: true, id: expense.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: ステータス更新（registered/skipped）または任意フィールド更新
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    status?: "pending" | "registered" | "skipped";
    category?: string;
    note?: string;
    receiptId?: string;
    registeredAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  }

  const patch: Partial<Omit<PendingExpense, "id">> = {};
  if (body.status) patch.status = body.status;
  if (body.category !== undefined) patch.category = body.category;
  if (body.note !== undefined) patch.note = body.note;
  if (body.receiptId !== undefined) patch.receiptId = body.receiptId;
  if (body.status === "registered" && !body.registeredAt) {
    patch.registeredAt = new Date().toISOString();
  } else if (body.registeredAt) {
    patch.registeredAt = body.registeredAt;
  }

  try {
    const ok = await updatePendingExpense(body.id, patch);
    if (!ok) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
