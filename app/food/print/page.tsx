"use client";

import { useState, useEffect } from "react";

// フードレシピの印刷用ページ。厨房に貼る・ファイルに綴じる想定。
// 1品1ページで改ページし、写真も出す（動画は紙では見られないので出さない）。

type Step = { text: string; timing?: string; photoId?: string; videoId?: string };
type Recipe = {
  id: string;
  name: string;
  category: string;
  minutes?: number;
  ingredients: string[];
  steps: Step[];
  tips?: string[];
};

export default function FoodPrintPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    fetch("/api/food-recipe")
      .then((r) => r.json())
      .then((d) => setRecipes(d.recipes || []))
      .catch(() => {});
  }, []);

  return (
    <div className="print-wrap">
      <style>{`
        .print-wrap { max-width: 760px; margin: 0 auto; padding: 24px 20px 60px; color: #000; background: #fff; }
        .no-print { margin-bottom: 20px; }
        .rc { page-break-after: always; break-after: page; padding-bottom: 20px; }
        .rc:last-child { page-break-after: auto; break-after: auto; }
        .rc h2 { font-size: 24px; margin: 0 0 4px; border-bottom: 3px solid #000; padding-bottom: 6px; }
        .meta { font-size: 12px; color: #444; margin-bottom: 14px; }
        .sec { font-size: 13px; font-weight: 800; margin: 14px 0 6px; }
        .ing { border: 1px solid #999; border-radius: 6px; padding: 10px 14px; font-size: 13px; line-height: 1.9; }
        .ing div { break-inside: avoid; }
        .step { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px dotted #bbb; break-inside: avoid; page-break-inside: avoid; }
        .no { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%; background: #000; color: #fff;
              font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
        .txt { font-size: 14px; line-height: 1.7; flex: 1; }
        .tm { display: inline-block; margin-top: 4px; padding: 2px 8px; border: 1.5px solid #000;
              border-radius: 4px; font-size: 12px; font-weight: 800; }
        .ph { display: block; margin-top: 7px; max-width: 280px; border-radius: 6px; }
        .tips { margin-top: 14px; border: 2px solid #000; border-radius: 6px; padding: 10px 14px; font-size: 13px; line-height: 1.8; }
        .vid { font-size: 11.5px; color: #555; margin-top: 5px; }
        @media print {
          .no-print { display: none; }
          .print-wrap { padding: 0; max-width: none; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="no-print">
        <button
          onClick={() => window.print()}
          style={{
            padding: "12px 22px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "#b5651d", color: "#fff", fontSize: 15, fontWeight: 700,
          }}
        >
          🖨 印刷する（PDFで保存もできます）
        </button>
        <p style={{ fontSize: 12.5, color: "#666", marginTop: 8, lineHeight: 1.8 }}>
          印刷ダイアログで「PDFとして保存」を選ぶとPDFになります。1品ずつ改ページされます。<br />
          動画は紙では見られないので、その手順には「動画あり」とだけ書いてあります。
        </p>
      </div>

      {recipes.map((r) => (
        <div className="rc" key={r.id}>
          <h2>{r.name}</h2>
          <div className="meta">
            {r.category}
            {r.minutes ? ` ・ 提供まで目安 ${r.minutes}分` : ""}
            {` ・ 全${r.steps.length}手順`}
          </div>

          {r.ingredients.length > 0 && (
            <>
              <div className="sec">材料</div>
              <div className="ing">
                {r.ingredients.map((x, i) => <div key={i}>・{x}</div>)}
              </div>
            </>
          )}

          <div className="sec">作り方</div>
          {r.steps.map((s, i) => (
            <div className="step" key={i}>
              <div className="no">{i + 1}</div>
              <div className="txt">
                {s.text}
                {s.timing && <div><span className="tm">⏱ {s.timing}</span></div>}
                {s.photoId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ph" src={`/api/food-recipe/photo?id=${s.photoId}`} alt="" />
                )}
                {s.videoId && <div className="vid">▶ この手順は動画あり（システムで確認してください）</div>}
              </div>
            </div>
          ))}

          {r.tips && r.tips.length > 0 && (
            <div className="tips">
              <strong>気をつけること</strong>
              {r.tips.map((t, i) => <div key={i}>・{t}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
