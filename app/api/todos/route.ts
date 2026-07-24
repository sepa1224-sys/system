import { NextRequest, NextResponse } from "next/server";
import { getTodos, saveTodo, updateTodo, deleteTodo } from "@/lib/todos";

export const runtime = "nodejs";

// GET /api/todos
export async function GET() {
  const todos = await getTodos();
  return NextResponse.json({ todos });
}

// POST /api/todos → 新規作成
export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    memo?: string;
    priority?: "high" | "medium" | "low";
    dueDate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "タイトルが必要です" }, { status: 400 });
  }
  const id = `todo_${Date.now()}`;
  try {
    await saveTodo({
      id,
      title: body.title.trim(),
      memo: body.memo?.trim() || "",
      done: false,
      priority: body.priority || "medium",
      dueDate: body.dueDate || undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/todos → 更新（完了切替、編集）
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    patch?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  }
  try {
    const ok = await updateTodo(body.id, (body.patch ?? {}) as never);
    if (!ok)
      return NextResponse.json(
        { error: "対象が見つかりません" },
        { status: 404 },
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/todos?id=xxx
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  }
  await deleteTodo(id);
  return NextResponse.json({ ok: true });
}
