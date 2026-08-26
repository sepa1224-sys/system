"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Nav from "@/components/Nav";

// フードのレシピ。厨房で見ながら作る前提なので、
// 手順は大きな文字で1ステップずつ。押すと済みになって、どこまでやったか分かる。

type Step = { text: string; timing?: string; photoId?: string };
type Recipe = {
  id: string;
  name: string;
  category: string;
  minutes?: number;
  ingredients: string[];
  steps: Step[];
  tips?: string[];
};

export default function FoodPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, Set<number>>>({});
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<{ recipeId: string; stepIndex: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/food-recipe");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "取得失敗");
      setRecipes(d.recipes || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStep = (rid: string, i: number) => {
    setDone((p) => {
      const s = new Set(p[rid] ?? []);
      if (s.has(i)) s.delete(i); else s.add(i);
      return { ...p, [rid]: s };
    });
  };

  // 手順写真の追加。言葉だけだと盛り付けが伝わらないので後から足せるようにする
  const pickPhoto = (recipeId: string, stepIndex: number) => {
    pendingRef.current = { recipeId, stepIndex };
    fileRef.current?.click();
  };

  const onPhoto = async (file: File) => {
    const target = pendingRef.current;
    if (!target) return;
    setUploading(`${target.recipeId}_${target.stepIndex}`);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const up = await fetch("/api/food-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: dataUrl }),
      });
      const ud = await up.json();
      if (!up.ok) throw new Error(ud.error || "写真の保存に失敗");

      const rec = recipes.find((r) => r.id === target.recipeId);
      if (!rec) return;
      const steps = rec.steps.map((s, i) =>
        i === target.stepIndex ? { ...s, photoId: ud.photoId } : s,
      );
      const save = await fetch("/api/food-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: { ...rec, steps } }),
      });
      if (!save.ok) throw new Error((await save.json()).error || "保存に失敗");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真の保存に失敗");
    } finally {
      setUploading(null);
      pendingRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>🍽️ フードレシピ</h1>
        <p>厨房で見ながら作れるように、手順を1つずつ並べています</p>
      </header>
      <Nav />

      {err && <p className="err">{err}</p>}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); }}
      />

      {recipes.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          読み込み中…
        </div>
      )}

      {recipes.map((r) => {
        const isOpen = openId === r.id;
        const doneCount = (done[r.id] ?? new Set()).size;
        return (
          <div key={r.id} className="card" style={{ padding: "14px" }}>
            <div
              onClick={() => setOpenId(isOpen ? null : r.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div>
                <strong style={{ fontSize: 17 }}>{r.name}</strong>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {r.category}
                  {r.minutes ? ` ・ 目安${r.minutes}分` : ""}
                  {` ・ ${r.steps.length}手順`}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
                {isOpen && doneCount > 0 ? `${doneCount}/${r.steps.length} ` : ""}
                {isOpen ? "▲" : "▼"}
              </span>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12 }}>
                {r.ingredients.length > 0 && (
                  <div style={{
                    background: "var(--accent-weak, #fdf3e8)", borderRadius: 8,
                    padding: "10px 12px", marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 5 }}>材料</div>
                    <div style={{ fontSize: 13, lineHeight: 1.9 }}>
                      {r.ingredients.map((x, i) => (
                        <div key={i}>・{x}</div>
                      ))}
                    </div>
                  </div>
                )}

                {r.steps.map((s, i) => {
                  const isDone = (done[r.id] ?? new Set()).has(i);
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex", gap: 12, alignItems: "flex-start",
                        padding: "12px 0", borderTop: "1px solid var(--line-soft, #eee)",
                        opacity: isDone ? 0.45 : 1,
                      }}
                    >
                      <div
                        onClick={() => toggleStep(r.id, i)}
                        style={{
                          width: 32, height: 32, flexShrink: 0, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 15, fontWeight: 800, cursor: "pointer",
                          background: isDone ? "var(--ok)" : "var(--accent)", color: "#fff",
                        }}
                      >
                        {isDone ? "✓" : i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 15.5, lineHeight: 1.65,
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {s.text}
                        </div>
                        {s.timing && (
                          <div style={{
                            display: "inline-block", marginTop: 5, padding: "3px 9px",
                            borderRadius: 5, background: "#fde8e8", color: "#c0392b",
                            fontSize: 12.5, fontWeight: 800,
                          }}>
                            ⏱ {s.timing}
                          </div>
                        )}
                        {s.photoId ? (
                          <img
                            src={`/api/food-recipe/photo?id=${s.photoId}`}
                            alt=""
                            style={{ display: "block", marginTop: 8, maxWidth: "100%", borderRadius: 8 }}
                          />
                        ) : (
                          <button
                            onClick={() => pickPhoto(r.id, i)}
                            disabled={uploading === `${r.id}_${i}`}
                            style={{
                              marginTop: 6, fontSize: 11.5, padding: "4px 10px", borderRadius: 6,
                              border: "1px dashed var(--line)", background: "transparent",
                              color: "var(--muted)", cursor: "pointer",
                            }}
                          >
                            {uploading === `${r.id}_${i}` ? "保存中…" : "＋ 写真を足す"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {r.tips && r.tips.length > 0 && (
                  <div style={{
                    marginTop: 12, padding: "10px 12px", borderRadius: 8,
                    background: "#fdf6ec", border: "1px solid #e8d5b0",
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>⚠️ 気をつけること</div>
                    {r.tips.map((t, i) => (
                      <div key={i} style={{ fontSize: 13, lineHeight: 1.8 }}>・{t}</div>
                    ))}
                  </div>
                )}

                {doneCount > 0 && (
                  <button
                    onClick={() => setDone((p) => ({ ...p, [r.id]: new Set() }))}
                    style={{
                      width: "100%", marginTop: 12, padding: "9px 0", borderRadius: 8,
                      border: "1px solid var(--line)", background: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    チェックをリセット（次の1皿へ）
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="hint" style={{ textAlign: "center", marginTop: 12 }}>
        ※ 手順の番号を押すと済みになります。チェックはこの端末だけのもので、開き直せば消えます。<br />
        写真は「＋写真を足す」から追加できます（盛り付けは写真があると早いです）。
      </p>
    </div>
  );
}
