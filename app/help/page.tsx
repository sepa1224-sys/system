"use client";

import { useRef, useState, useEffect } from "react";
import Nav from "@/components/Nav";

// このシステムの使い方を聞ける窓口。
// 会計の判断そのものは /soudan（相談）が担当なので、そちらへ案内する。

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "レシートを撮ったあと、どうすればいい？",
  "レジ締めのやり方を教えて",
  "freeeで差額が出ている明細はどうする？",
  "品目って何？科目と何が違うの？",
  "今日やる仕込みはどこで見られる？",
  "シフトはどこで作る？",
];

export default function Help() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.body) throw new Error("応答がありません");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: e instanceof Error ? e.message : "エラーが起きました" },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="wrap">
      <header>
        <h1>❓ 使い方を聞く</h1>
        <p>このシステムの操作でわからないことに答えます</p>
      </header>
      <Nav />

      {messages.length === 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div className="cat-title">よくある質問</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{ textAlign: "left", fontSize: 13, padding: "9px 11px" }}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            仕訳や科目の判断は <b>💬 相談</b> のほうが詳しく答えられます。
          </p>
        </div>
      )}

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="card"
          style={{ padding: 14, maxHeight: "62vh", overflowY: "auto" }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                marginBottom: 14,
                paddingBottom: 12,
                borderBottom: i < messages.length - 1 ? "1px solid var(--line-soft, #eee)" : "none",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: m.role === "user" ? "var(--accent)" : "var(--muted)",
                  marginBottom: 4,
                }}
              >
                {m.role === "user" ? "あなた" : "アシスタント"}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>
                {m.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input);
            }}
            placeholder="例: 領収書を登録したあとは何をする？"
            disabled={streaming}
            style={{ flex: 1 }}
          />
          <button
            className="primary"
            onClick={() => send(input)}
            disabled={streaming || !input.trim()}
            style={{ flex: "0 0 auto" }}
          >
            {streaming ? "…" : "送信"}
          </button>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{ fontSize: 11.5, marginTop: 8 }}
            disabled={streaming}
          >
            会話をリセット
          </button>
        )}
      </div>
    </div>
  );
}
