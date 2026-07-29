"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Nav from "@/components/Nav";

type Note = {
  id: string;
  text: string;
  createdAt: string;
};

type Contact = {
  id: string;
  name: string;
  nameKana?: string;
  company?: string;
  title?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  notes: Note[];
  createdAt: string;
  updatedAt: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

// 新規登録フォームの初期値
const emptyForm = () => ({
  name: "",
  nameKana: "",
  company: "",
  title: "",
  phone: "",
  email: "",
  address: "",
  website: "",
});

export default function MeishiPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  // カメラスキャン
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // 手入力 / AI抽出結果フォーム
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formImage, setFormImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // チャット
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // 削除確認
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 連絡先一覧取得
  const fetchContacts = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meishi${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      // エラーは静かに
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // 検索（デバウンスなし・シンプルに）
  function handleSearch(q: string) {
    setSearchQ(q);
    fetchContacts(q);
  }

  // カメラ起動
  async function startScan() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
    } catch {
      fileInputRef.current?.click();
    }
  }

  function stopScan() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  function captureAndProcess() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopScan();
    processImage(dataUrl);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function processImage(dataUrl: string) {
    setScanImage(dataUrl);
    setExtracting(true);
    setExtractError(null);
    setShowForm(false);
    try {
      const res = await fetch("/api/meishi/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setExtractError(data.error ?? "読み取りに失敗しました。");
      } else {
        setForm({
          name: data.contact.name ?? "",
          nameKana: data.contact.nameKana ?? "",
          company: data.contact.company ?? "",
          title: data.contact.title ?? "",
          phone: data.contact.phone ?? "",
          email: data.contact.email ?? "",
          address: data.contact.address ?? "",
          website: data.contact.website ?? "",
        });
        setFormImage(dataUrl);
        setShowForm(true);
      }
    } catch (err) {
      setExtractError("通信エラーが発生しました。");
    } finally {
      setExtracting(false);
    }
  }

  function openManualForm() {
    setForm(emptyForm());
    setFormImage(null);
    setScanImage(null);
    setExtractError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSaveError("名前は必須です。");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/meishi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageDataUrl: formImage ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSaveError(data.error ?? "保存に失敗しました。");
      } else {
        setShowForm(false);
        setScanImage(null);
        setFormImage(null);
        setForm(emptyForm());
        await fetchContacts(searchQ);
      }
    } catch {
      setSaveError("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNote(contactId: string) {
    const text = (noteInputs[contactId] ?? "").trim();
    if (!text) return;
    setSavingNote(contactId);
    try {
      const res = await fetch("/api/meishi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contactId, action: "add-note", data: { text } }),
      });
      const data = await res.json();
      if (res.ok && data.note) {
        setNoteInputs((prev) => ({ ...prev, [contactId]: "" }));
        setContacts((prev) =>
          prev.map((c) =>
            c.id === contactId ? { ...c, notes: [...c.notes, data.note] } : c,
          ),
        );
      }
    } catch {
      // スルー
    } finally {
      setSavingNote(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/meishi?id=${id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
      if (expandedId === id) setExpandedId(null);
    } catch {
      // スルー
    }
  }

  // チャット
  async function handleChat() {
    const q = chatInput.trim();
    if (!q || chatting) return;
    setChatMsgs((prev) => [...prev, { role: "user", content: q }]);
    setChatInput("");
    setChatting(true);
    const placeholder: ChatMsg = { role: "assistant", content: "" };
    setChatMsgs((prev) => [...prev, placeholder]);
    try {
      const res = await fetch("/api/meishi/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok || !res.body) throw new Error("エラー");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setChatMsgs((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: text };
          return copy;
        });
        chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
      }
    } catch {
      setChatMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "[エラーが発生しました]" };
        return copy;
      });
    } finally {
      setChatting(false);
    }
  }

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>🪪 名刺管理</h1>
        <p>名刺をスキャンして連絡先を登録・検索できます</p>
      </header>

      {/* スキャン・手入力ボタン */}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="primary" onClick={startScan}>
          📷 名刺をスキャン
        </button>
        <button
          style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--ink)" }}
          onClick={openManualForm}
        >
          ✏️ 手入力
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* カメラビュー */}
      {scanning && (
        <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          <video
            ref={videoRef}
            style={{ width: "100%", display: "block", borderRadius: 14 }}
            playsInline
            muted
          />
          <div style={{ display: "flex", gap: 8, padding: 12 }}>
            <button className="primary" style={{ flex: 1 }} onClick={captureAndProcess}>
              📸 撮影
            </button>
            <button
              style={{ background: "#eee", border: "none", borderRadius: 10, padding: "12px 16px" }}
              onClick={stopScan}
            >
              ✕ キャンセル
            </button>
          </div>
        </div>
      )}

      {/* AI抽出中 */}
      {extracting && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          <span className="spinner" style={{ borderColor: "var(--accent-weak)", borderTopColor: "var(--accent)" }} />
          名刺を読み取っています…
        </div>
      )}

      {extractError && (
        <div className="err" style={{ marginBottom: 12 }}>
          {extractError}
          <button
            className="ghost"
            style={{ display: "block", marginTop: 4 }}
            onClick={() => {
              setExtractError(null);
              setScanImage(null);
            }}
          >
            閉じる
          </button>
        </div>
      )}

      {/* 登録フォーム */}
      {showForm && (
        <div className="card">
          <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 15 }}>
            {formImage ? "AI読み取り結果を確認して登録" : "連絡先を手入力"}
          </p>
          {formImage && (
            <img
              src={formImage}
              alt="名刺"
              style={{ width: "100%", borderRadius: 8, marginBottom: 12, border: "1px solid var(--line)" }}
            />
          )}
          <label>氏名 *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="山田 太郎"
          />
          <label>フリガナ</label>
          <input
            value={form.nameKana}
            onChange={(e) => setForm((f) => ({ ...f, nameKana: e.target.value }))}
            placeholder="ヤマダ タロウ"
          />
          <label>会社名</label>
          <input
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            placeholder="株式会社〇〇"
          />
          <label>役職</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="営業部 部長"
          />
          <label>電話番号</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0120-000-000"
          />
          <label>メール</label>
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="taro@example.com"
            type="email"
          />
          <label>住所</label>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="滋賀県彦根市…"
          />
          <label>Webサイト</label>
          <input
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            placeholder="https://example.com"
            type="url"
          />
          {saveError && <p className="err">{saveError}</p>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" />保存中…</> : "💾 保存"}
            </button>
            <button
              style={{ background: "#eee", border: "none", borderRadius: 10, padding: "12px 16px" }}
              onClick={() => { setShowForm(false); setScanImage(null); setFormImage(null); }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 検索 */}
      <div style={{ marginBottom: 12 }}>
        <input
          value={searchQ}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="🔍 名前・会社名で検索"
        />
      </div>

      {/* 連絡先リスト */}
      {loading ? (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
          <span className="spinner" style={{ borderColor: "var(--accent-weak)", borderTopColor: "var(--accent)" }} />
          読み込み中…
        </div>
      ) : contacts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
          {searchQ ? "該当する連絡先がありません" : "名刺がまだ登録されていません"}
        </div>
      ) : (
        contacts.map((c) => {
          const isExpanded = expandedId === c.id;
          return (
            <div key={c.id} className="card" style={{ padding: 0 }}>
              {/* コンタクトヘッダ（タップで展開） */}
              <div
                style={{ padding: "14px 16px", cursor: "pointer" }}
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {c.name}
                      {c.nameKana && (
                        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}>
                          {c.nameKana}
                        </span>
                      )}
                    </div>
                    {c.company && (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        {c.company}
                        {c.title && <span style={{ marginLeft: 6 }}>/ {c.title}</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 13, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {c.phone && <span>📞 {c.phone}</span>}
                      {c.email && <span>✉️ {c.email}</span>}
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8, flexShrink: 0 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* 展開詳細 */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--line)", padding: "14px 16px" }}>
                  {c.address && (
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: "var(--muted)" }}>住所</span>
                      <div>{c.address}</div>
                    </div>
                  )}
                  {c.website && (
                    <div style={{ fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: "var(--muted)" }}>Web</span>
                      <div>
                        <a href={c.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                          {c.website}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* メモ一覧 */}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 700 }}>
                      メモ {c.notes.length > 0 && `(${c.notes.length})`}
                    </div>
                    {c.notes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          background: "#faf9f6",
                          border: "1px solid var(--line)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: 13,
                          marginBottom: 6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {n.text}
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleDateString("ja-JP")}
                        </div>
                      </div>
                    ))}

                    {/* メモ追加 */}
                    <div className="composer" style={{ marginTop: 6 }}>
                      <textarea
                        rows={2}
                        placeholder="メモを追加…"
                        value={noteInputs[c.id] ?? ""}
                        onChange={(e) =>
                          setNoteInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(c.id);
                        }}
                      />
                      <button
                        className="primary"
                        onClick={() => handleAddNote(c.id)}
                        disabled={savingNote === c.id || !(noteInputs[c.id] ?? "").trim()}
                      >
                        {savingNote === c.id ? <span className="spinner" /> : "追加"}
                      </button>
                    </div>
                  </div>

                  {/* 削除 */}
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    {deletingId === c.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 13, color: "var(--muted)", flex: 1, alignSelf: "center" }}>
                          本当に削除しますか？
                        </span>
                        <button
                          style={{ background: "#c0392b", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}
                          onClick={() => handleDelete(c.id)}
                        >
                          削除
                        </button>
                        <button className="ghost" onClick={() => setDeletingId(null)}>
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <button
                        className="ghost"
                        style={{ color: "#c0392b", fontSize: 13 }}
                        onClick={() => setDeletingId(c.id)}
                      >
                        🗑 削除
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* チャットセクション */}
      <div className="card" style={{ marginTop: 24 }}>
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15 }}>💬 連絡先に質問する</p>
        {chatMsgs.length > 0 && (
          <div className="chat" ref={chatRef}>
            {chatMsgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (m.role === "assistant" && chatting ? (
                  <span className="spinner" style={{ borderColor: "var(--accent-weak)", borderTopColor: "var(--accent)" }} />
                ) : "")}
              </div>
            ))}
          </div>
        )}
        <div className="composer">
          <textarea
            rows={2}
            placeholder="例: 〇〇さんの電話番号は？ / △△社の担当者は誰？"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleChat();
            }}
          />
          <button className="primary" onClick={handleChat} disabled={chatting || !chatInput.trim()}>
            {chatting ? <span className="spinner" /> : "送信"}
          </button>
        </div>
        <p className="hint">Cmd+Enter でも送信できます</p>
      </div>
    </div>
  );
}
