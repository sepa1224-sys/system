import { NextRequest, NextResponse } from "next/server";
import {
  getRecipes,
  newRecipeId,
  savePhoto,
  saveRecipe,
  type FoodRecipe,
} from "@/lib/foodRecipe";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/food-recipe → 全レシピ
export async function GET() {
  try {
    const recipes = await getRecipes();
    return NextResponse.json({ recipes, count: recipes.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/food-recipe
//   { recipe }                    … レシピの追加・更新
//   { photo: dataUrl, photoId? }  … 手順写真の保存（idを返す）
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      recipe?: Partial<FoodRecipe>;
      photo?: string;
      photoId?: string;
    };

    if (b.photo) {
      if (b.photo.length > 4_000_000) {
        return NextResponse.json({ error: "写真が大きすぎます（4MBまで）" }, { status: 400 });
      }
      const id = b.photoId || newRecipeId();
      await savePhoto(id, b.photo);
      return NextResponse.json({ ok: true, photoId: id });
    }

    const r = b.recipe;
    if (!r?.name) return NextResponse.json({ error: "nameが必要です" }, { status: 400 });
    const recipe: FoodRecipe = {
      id: r.id || newRecipeId(),
      name: String(r.name).trim(),
      category: (r.category as FoodRecipe["category"]) || "夜フード",
      minutes: r.minutes,
      ingredients: (r.ingredients ?? []).filter((x) => x && x.trim()),
      steps: (r.steps ?? []).filter((s) => s?.text && s.text.trim()),
      tips: (r.tips ?? []).filter((x) => x && x.trim()),
    };
    await saveRecipe(recipe);
    return NextResponse.json({ ok: true, recipe });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}
