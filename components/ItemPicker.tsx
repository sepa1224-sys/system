"use client";

import { useState } from "react";

// 仕入高の行に「品目」を付けるための小さなUI。
// ビール（ハイネケン）/ 梅酒 のような粒度で分けたいが、品名はレシートのOCR結果で
// 表記ゆれが大きいので、品名の一部をキーワードとして覚えさせる方式にしている。
// 一度覚えれば、次回から同じ商品には自動で品目が付く。

export default function ItemPicker({
  productName,
  current,
  items,
  onLearn,
}: {
  productName: string;
  current: string;
  items: string[];
  onLearn: (keyword: string, item: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // 覚えさせるキーワード。既定は品名の先頭（数量や単価を落としたもの）
  const [keyword, setKeyword] = useState(
    productName.replace(/[@＠].*$/, "").replace(/\s*\d+\s*(コ|個|点|本|袋|枚|kg|g|ml|L)\b.*$/i, "").trim(),
  );
  const [item, setItem] = useState(current);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12 }}>
        <span style={{ color: "var(--muted)" }}>品目</span>
        {current ? (
          <strong style={{ fontSize: 12.5 }}>{current}</strong>
        ) : (
          <span style={{ color: "#b5651d" }}>未設定</span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ fontSize: 11, padding: "2px 8px" }}
        >
          {current ? "変更" : "設定"}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 6,
        padding: 8,
        border: "1px solid var(--line, #ddd)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--muted)", marginBottom: 4 }}>
        この語を含む品名を、選んだ品目に分類します
      </div>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="キーワード（例: プレミアム）"
        style={{ width: "100%", marginBottom: 4 }}
      />
      <input
        list="item-options"
        value={item}
        onChange={(e) => setItem(e.target.value)}
        placeholder="品目（例: ビール（その他））。新しい名前も入力できます"
        style={{ width: "100%", marginBottom: 6 }}
      />
      <datalist id="item-options">
        {items.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="primary"
          disabled={busy || !keyword.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onLearn(keyword, item);
              setOpen(false);
            } finally {
              setBusy(false);
            }
          }}
          style={{ fontSize: 12 }}
        >
          {busy ? "保存中…" : "覚えさせる"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
          やめる
        </button>
      </div>
    </div>
  );
}
