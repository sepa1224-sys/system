import { NextRequest, NextResponse } from "next/server";
import { saveReceipt, getReceipts, deleteReceipt, findDuplicate, updateReceiptItems, updateReceipt, type RLine } from "@/lib/receipts";
import { applyAssetThreshold } from "@/lib/receipt";
import { updateCostsFromReceipt } from "@/lib/menu";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const receipts = await getReceipts();
  return NextResponse.json({ receipts });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
  await deleteReceipt(id);
  return NextResponse.json({ ok: true });
}

// 既存領収書の更新。
// action="items" → 品目だけ確定（AI推測の承認）。
// action="edit" → 全フィールド編集。
// action 省略 + lines → 旧互換（品目確定）。
export async function PATCH(req: NextRequest) {
  let body: {
    id?: string;
    action?: "items" | "edit";
    lines?: RLine[];
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
    if (body.action === "edit" && body.patch) {
      const ok = await updateReceipt(body.id, body.patch as never);
      if (!ok) return NextResponse.json({ error: "更新対象がありません" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    // 旧互換: lines確定
    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: "lines が必要です" }, { status: 400 });
    }
    const ok = await updateReceiptItems(body.id, body.lines);
    if (!ok) return NextResponse.json({ error: "更新対象がありません" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: {
    date?: string;
    vendor?: string;
    total?: number;
    category?: string;
    summary?: string;
    payer?: string;
    memo?: string;
    image?: string;
    expenseKind?: "company" | "card" | "labor" | "cash";
    laborMember?: string;
    tags?: string[];
    lines?: RLine[];
    force?: boolean; // 重複でも承知で登録する
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const id = `r_${Date.now()}`;
  const lines = applyAssetThreshold(
    (body.lines ?? [])
      .filter((l) => l && l.amount)
      .map((l) => ({
        name: l.name ?? "",
        amount: Number(l.amount) || 0,
        category: l.category || "不明",
        tags: (l.tags ?? []).filter((t) => t && t.trim()).map((t) => t.trim()),
      })),
  );
  // 互換：旧単一フィールドは内訳から導出
  const total = body.total ?? lines.reduce((s, l) => s + l.amount, 0);
  const compatTags = [...new Set(lines.flatMap((l) => l.tags))];

  // サーバー側の重複ガード：同じ日付・金額が既にあれば force なしでは止める（二重計上防止）。
  if (!body.force) {
    const hit = await findDuplicate(body.date ?? "", total);
    if (hit) {
      return NextResponse.json(
        {
          error: "同じ日付・金額の領収書が既に保存されています",
          duplicate: {
            id: hit.id,
            date: hit.date,
            vendor: hit.vendor,
            total: hit.total,
            registered: !!hit.registered,
          },
        },
        { status: 409 },
      );
    }
  }

  try {
    await saveReceipt(
      {
        id,
        date: body.date ?? "",
        vendor: body.vendor ?? "",
        total,
        category: lines[0]?.category ?? body.category ?? "不明",
        summary: body.summary ?? lines.map((l) => l.name).join("、"),
        payer: body.payer ?? "",
        memo: body.memo ?? "",
        expenseKind: body.expenseKind ?? "company",
        laborMember: body.laborMember,
        tags: compatTags.length ? compatTags : body.tags,
        lines: lines.length ? lines : undefined,
      },
      body.image,
    );
    // 原価系の領収書ならメニューの仕入値を自動更新
    try {
      await updateCostsFromReceipt({
        summary: body.summary ?? "",
        total,
        category: lines[0]?.category ?? body.category ?? "不明",
        lines: lines.length ? lines : undefined,
      });
    } catch {
      // メニュー原価更新の失敗は領収書保存に影響させない
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
