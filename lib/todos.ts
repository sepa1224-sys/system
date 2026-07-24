// ToDo管理。メモ付きタスクの作成・更新・削除。
// KV: todos:index（配列）

const TODOS_KEY = "todos:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Todo = {
  id: string;
  title: string;
  memo: string;
  done: boolean;
  priority: "high" | "medium" | "low";
  assignee?: string; // 担当者
  dueDate?: string; // YYYY-MM-DD
  createdAt: string;
  completedAt?: string;
};

export async function getTodos(): Promise<Todo[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<Todo[]>(TODOS_KEY)) ?? [];
}

export async function saveTodo(
  todo: Omit<Todo, "createdAt" | "completedAt">,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getTodos();
  list.unshift({ ...todo, createdAt: new Date().toISOString() });
  await store.set(TODOS_KEY, list);
}

export async function updateTodo(
  id: string,
  patch: Partial<Omit<Todo, "id" | "createdAt">>,
): Promise<boolean> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getTodos();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  await store.set(TODOS_KEY, list);
  return true;
}

export async function deleteTodo(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const list = await getTodos();
  await store.set(
    TODOS_KEY,
    list.filter((t) => t.id !== id),
  );
}
