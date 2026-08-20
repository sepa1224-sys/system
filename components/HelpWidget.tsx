"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

// 画面の隅に常駐する使い方チャット。どの画面からでも開ける。
// いまどの画面にいるかを一緒に送るので、「これは何？」のように主語がなくても答えられる。

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "この画面は何をするところ？",
  "レジ締めのやり方は？",
  "レシートを撮ったあとは何をする？",
  "freeeで差額が出た明細はどうする？",
];

export default function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

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
        body: JSON.stringify({ messages: next, path }),
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="使い方を聞く"
        className="hw-fab"
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>💬</span>
        <style jsx>{`
          .hw-fab {
            position: fixed;
            right: 16px;
            bottom: calc(16px + env(safe-area-inset-bottom, 0px));
            width: 54px;
            height: 54px;
            border-radius: 27px;
            border: none;
            background: var(--accent, #b5651d);
            color: #fff;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
            cursor: pointer;
            z-index: 900;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
          }
          .hw-fab:active {
            transform: scale(0.94);
          }
        `}</style>
      </button>
    );
  }

  return (
    <div className="hw-panel">
      <div className="hw-head">
        <div>
          <strong style={{ fontSize: 14 }}>💬 使い方を聞く</strong>
          <div style={{ fontSize: 10.5, opacity: 0.75 }}>{path}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} disabled={streaming} className="hw-mini">
              リセット
            </button>
          )}
          <button onClick={() => setOpen(false)} className="hw-mini" aria-label="閉じる">
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="hw-body">
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>
              なんでも聞いてください
            </div>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="hw-sug">
                {s}
              </button>
            ))}
            <a href="/knowledge" className="hw-link">
              📚 分かったことをナレッジに残す →
            </a>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: m.role === "user" ? "var(--accent)" : "var(--muted)",
                  marginBottom: 3,
                }}
              >
                {m.role === "user" ? "あなた" : "アシスタント"}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {m.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hw-foot">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input);
          }}
          placeholder="質問を入力"
          disabled={streaming}
        />
        <button
          onClick={() => send(input)}
          disabled={streaming || !input.trim()}
          className="hw-send"
        >
          {streaming ? "…" : "送信"}
        </button>
      </div>

      <style jsx>{`
        .hw-panel {
          position: fixed;
          right: 12px;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          width: min(380px, calc(100vw - 24px));
          max-height: min(70vh, 560px);
          background: var(--card, #fff);
          border: 1px solid var(--line, #ddd);
          border-radius: 14px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.22);
          z-index: 900;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .hw-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: var(--accent, #b5651d);
          color: #fff;
        }
        .hw-mini {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.45);
          background: transparent;
          color: #fff;
          cursor: pointer;
        }
        .hw-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          -webkit-overflow-scrolling: touch;
        }
        .hw-sug {
          text-align: left;
          font-size: 12.5px;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid var(--line, #ddd);
          background: var(--card, #fff);
          cursor: pointer;
        }
        .hw-link {
          font-size: 12px;
          color: var(--accent, #b5651d);
          text-decoration: none;
          padding: 6px 2px;
          font-weight: 700;
        }
        .hw-foot {
          display: flex;
          gap: 6px;
          padding: 10px;
          border-top: 1px solid var(--line-soft, #eee);
        }
        .hw-foot input {
          flex: 1;
          min-width: 0;
        }
        .hw-send {
          flex: 0 0 auto;
          padding: 8px 12px;
          border-radius: 8px;
          border: none;
          background: var(--accent, #b5651d);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .hw-send:disabled {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
