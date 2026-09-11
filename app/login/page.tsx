"use client";

import { useState } from "react";

// 合言葉の入力画面。端末ごとに一度入れれば90日は聞かれない。
export default function Login() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setErr("合言葉が違います");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next && next.startsWith("/") ? next : "/");
    } catch {
      setErr("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "#14171c", color: "#f2efe9",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 34, color: "#e8a05c" }}>
          flat.
        </div>
        <p style={{ fontSize: 13, color: "#b7b2a8", margin: "10px 0 22px", lineHeight: 1.8 }}>
          業務システムです。<br />合言葉を入れてください。
        </p>
        <input
          type="password"
          inputMode="numeric"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
          autoFocus
          style={{
            width: "100%", padding: "14px 12px", fontSize: 20, textAlign: "center",
            letterSpacing: 8, borderRadius: 10, border: "1px solid #3a3f47",
            background: "#1c2026", color: "#f2efe9", boxSizing: "border-box",
          }}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{
            width: "100%", marginTop: 12, padding: "14px 0", fontSize: 16, fontWeight: 700,
            borderRadius: 10, border: "none", background: "#e8a05c", color: "#14171c",
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "確認中…" : "入る"}
        </button>
        {err && <p style={{ color: "#e88", fontSize: 13, marginTop: 12 }}>{err}</p>}
        <p style={{ fontSize: 11.5, color: "#7d7a74", marginTop: 22, lineHeight: 1.8 }}>
          一度入れると、この端末では90日間聞かれません。<br />
          お客さま向けのイベント申込ページは、合言葉なしで開けます。
        </p>
      </div>
    </main>
  );
}
