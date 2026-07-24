"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";

type Todo = {
  id: string;
  title: string;
  memo: string;
  done: boolean;
  priority: "high" | "medium" | "low";
  assignee?: string;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
};

const MEMBERS = ["坂本", "町田", "櫻井", "國仲"] as const;

type Filter = "all" | "active" | "done";

const PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  // 新規作成フォーム
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // 編集中
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editPriority, setEditPriority] = useState<"high" | "medium" | "low">("medium");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  // メモ展開
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      const data = await res.json();
      setTodos(data.todos || []);
    } catch {
      setErr("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          memo: memo.trim(),
          priority,
          assignee: assignee || undefined,
          dueDate: dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setErr(d.error || "保存に失敗");
        return;
      }
      setTitle("");
      setMemo("");
      setPriority("medium");
      setAssignee("");
      setDueDate("");
      await load();
    } catch {
      setErr("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (todo: Todo) => {
    const newDone = !todo.done;
    // optimistic update
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id
          ? {
              ...t,
              done: newDone,
              completedAt: newDone ? new Date().toISOString() : undefined,
            }
          : t,
      ),
    );
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: todo.id,
        patch: {
          done: newDone,
          completedAt: newDone ? new Date().toISOString() : undefined,
        },
      }),
    });
  };

  const handleDelete = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
  };

  const startEdit = (todo: Todo) => {
    setEditId(todo.id);
    setEditTitle(todo.title);
    setEditMemo(todo.memo);
    setEditPriority(todo.priority);
    setEditAssignee(todo.assignee || "");
    setEditDueDate(todo.dueDate || "");
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const saveEdit = async () => {
    if (!editId || !editTitle.trim()) return;
    setTodos((prev) =>
      prev.map((t) =>
        t.id === editId
          ? {
              ...t,
              title: editTitle.trim(),
              memo: editMemo.trim(),
              priority: editPriority,
              assignee: editAssignee || undefined,
              dueDate: editDueDate || undefined,
            }
          : t,
      ),
    );
    setEditId(null);
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        patch: {
          title: editTitle.trim(),
          memo: editMemo.trim(),
          priority: editPriority,
          assignee: editAssignee || undefined,
          dueDate: editDueDate || undefined,
        },
      }),
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  const activeCnt = todos.filter((t) => !t.done).length;
  const doneCnt = todos.filter((t) => t.done).length;

  const isOverdue = (d?: string) => {
    if (!d) return false;
    const today = new Date().toISOString().slice(0, 10);
    return d < today;
  };

  return (
    <div className="wrap">
      <Nav />
      <header>
        <h1>✅ ToDo</h1>
        <p>タスク管理・メモ</p>
      </header>

      {/* フィルター */}
      <div className="sub-tabs">
        <button
          className={`sub-tab ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          すべて ({todos.length})
        </button>
        <button
          className={`sub-tab ${filter === "active" ? "active" : ""}`}
          onClick={() => setFilter("active")}
        >
          未完了 ({activeCnt})
        </button>
        <button
          className={`sub-tab ${filter === "done" ? "active" : ""}`}
          onClick={() => setFilter("done")}
        >
          完了 ({doneCnt})
        </button>
      </div>

      {/* 新規追加 */}
      <div className="card">
        <label style={{ margin: "0 0 4px" }}>タスクを追加</label>
        <input
          placeholder="タイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd();
          }}
        />
        <label>メモ</label>
        <textarea
          placeholder="詳細やメモをここに..."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
            background: "#fff",
            color: "var(--ink)",
          }}
        />
        <div className="row">
          <div>
            <label>担当者</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">未定</option>
              {MEMBERS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label>優先度</label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as "high" | "medium" | "low")
              }
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>
          <div>
            <label>期限</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="primary" disabled={saving || !title.trim()} onClick={handleAdd}>
            {saving && <span className="spinner" />}
            追加
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>

      {/* リスト */}
      {loading ? (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          読み込み中...
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
          {filter === "done"
            ? "完了したタスクはありません"
            : filter === "active"
              ? "すべて完了しています 🎉"
              : "タスクがありません"}
        </p>
      ) : (
        filtered.map((todo) => (
          <div
            key={todo.id}
            className="card"
            style={{
              padding: 0,
              overflow: "hidden",
              opacity: todo.done ? 0.6 : 1,
            }}
          >
            {editId === todo.id ? (
              /* 編集モード */
              <div style={{ padding: 16 }}>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  rows={4}
                  placeholder="メモ"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: "inherit",
                    resize: "vertical",
                    background: "#fff",
                  }}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <div>
                    <label>担当者</label>
                    <select value={editAssignee} onChange={(e) => setEditAssignee(e.target.value)}>
                      <option value="">未定</option>
                      {MEMBERS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>優先度</label>
                    <select
                      value={editPriority}
                      onChange={(e) =>
                        setEditPriority(
                          e.target.value as "high" | "medium" | "low",
                        )
                      }
                    >
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </div>
                  <div>
                    <label>期限</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                    />
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <button
                    className="primary"
                    onClick={saveEdit}
                    style={{ flex: 1 }}
                  >
                    保存
                  </button>
                  <button
                    className="ghost"
                    onClick={cancelEdit}
                    style={{ flex: 1 }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              /* 表示モード */
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "14px 16px",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpand(todo.id)}
                >
                  {/* チェックボックス */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDone(todo);
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      border: `2px solid ${todo.done ? "var(--ok)" : "var(--line)"}`,
                      background: todo.done ? "var(--ok)" : "#fff",
                      color: "#fff",
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      padding: 0,
                      marginTop: 1,
                    }}
                  >
                    {todo.done ? "✓" : ""}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        textDecoration: todo.done ? "line-through" : "none",
                      }}
                    >
                      {todo.title}
                      <span className={`badge ${todo.priority}`}>
                        {PRIORITY_LABELS[todo.priority]}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 3,
                      }}
                    >
                      {todo.assignee && (
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          👤 {todo.assignee}
                        </span>
                      )}
                      {todo.dueDate && (
                        <span
                          style={{
                            marginLeft: todo.assignee ? 8 : 0,
                            color: isOverdue(todo.dueDate) && !todo.done
                              ? "#b22"
                              : "var(--muted)",
                            fontWeight: isOverdue(todo.dueDate) && !todo.done
                              ? 700
                              : 400,
                          }}
                        >
                          📅 {todo.dueDate}
                          {isOverdue(todo.dueDate) && !todo.done && " (期限切れ)"}
                        </span>
                      )}
                      {todo.memo && (
                        <span style={{ marginLeft: (todo.assignee || todo.dueDate) ? 8 : 0 }}>
                          📝 メモあり
                        </span>
                      )}
                    </div>
                  </div>

                  <span
                    className={`arrow ${expandedIds.has(todo.id) ? "open" : ""}`}
                  >
                    ▶
                  </span>
                </div>

                {/* 展開: メモ・操作 */}
                {expandedIds.has(todo.id) && (
                  <div
                    style={{
                      padding: "0 16px 14px",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    {todo.memo && (
                      <div
                        style={{
                          background: "var(--bg)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          marginTop: 12,
                          fontSize: 14,
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.7,
                        }}
                      >
                        {todo.memo}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--muted)",
                        marginTop: 10,
                      }}
                    >
                      作成: {new Date(todo.createdAt).toLocaleDateString("ja-JP")}
                      {todo.completedAt &&
                        ` ／ 完了: ${new Date(todo.completedAt).toLocaleDateString("ja-JP")}`}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <button
                        style={{
                          flex: 1,
                          background: "var(--accent-weak)",
                          color: "var(--accent)",
                          fontSize: 13,
                          padding: "8px 0",
                          borderRadius: 8,
                        }}
                        onClick={() => startEdit(todo)}
                      >
                        編集
                      </button>
                      <button
                        style={{
                          flex: 1,
                          background: "#fde8e8",
                          color: "#b22",
                          fontSize: 13,
                          padding: "8px 0",
                          borderRadius: 8,
                        }}
                        onClick={() => handleDelete(todo.id)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
