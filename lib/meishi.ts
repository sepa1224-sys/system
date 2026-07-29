// 名刺・連絡先の保存。KVに一覧を保持する。

const IDX = "contacts:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Note = {
  id: string;
  text: string;
  createdAt: string;
};

export type Contact = {
  id: string;          // "c_" + timestamp
  name: string;        // 名前
  nameKana?: string;   // フリガナ
  company?: string;    // 会社名
  title?: string;      // 役職
  phone?: string;      // 電話番号
  email?: string;      // メール
  address?: string;    // 住所
  website?: string;    // URL
  imageDataUrl?: string; // 名刺画像
  notes: Note[];       // メモ一覧
  createdAt: string;
  updatedAt: string;
};

export async function getContacts(): Promise<Contact[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<Contact[]>(IDX)) ?? [];
}

export async function getContact(id: string): Promise<Contact | null> {
  const all = await getContacts();
  return all.find((c) => c.id === id) ?? null;
}

export async function saveContact(contact: Contact): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getContacts();
  // 既存IDがあれば更新、無ければ先頭に追加
  const i = all.findIndex((c) => c.id === contact.id);
  if (i >= 0) {
    all[i] = contact;
  } else {
    all.unshift(contact);
  }
  await store.set(IDX, all);
  // 名刺画像は別キーに保存（大きすぎればスキップ）
  if (contact.imageDataUrl && contact.imageDataUrl.length < 6_000_000) {
    try {
      await store.set(`contact:image:${contact.id}`, contact.imageDataUrl);
    } catch {
      // 画像保存失敗はスルー
    }
  }
}

export async function addNote(id: string, text: string): Promise<Note | null> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getContacts();
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const note: Note = {
    id: `n_${Date.now()}`,
    text,
    createdAt: new Date().toISOString(),
  };
  all[i].notes.push(note);
  all[i].updatedAt = new Date().toISOString();
  await store.set(IDX, all);
  return note;
}

export async function updateContact(
  id: string,
  patch: Partial<Omit<Contact, "id" | "createdAt" | "notes">>,
): Promise<boolean> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const all = await getContacts();
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return false;
  all[i] = { ...all[i], ...patch, updatedAt: new Date().toISOString() };
  await store.set(IDX, all);
  // 画像が更新されたら別キーも更新
  if (patch.imageDataUrl && patch.imageDataUrl.length < 6_000_000) {
    try {
      await store.set(`contact:image:${id}`, patch.imageDataUrl);
    } catch {
      // スルー
    }
  }
  return true;
}

export async function deleteContact(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getContacts();
  await store.set(IDX, all.filter((c) => c.id !== id));
  try {
    await store.del(`contact:image:${id}`);
  } catch {
    // 画像削除失敗はスルー
  }
}
