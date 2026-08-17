// ノウハウDB（取引先→用途/科目）＋ 明細の決定内容。保存先は Vercel KV(Redis)。
// freeeの未処理明細を「会話で決める」ときに、過去の判断を蓄積・再利用する。

const KB_KEY = "kb:entries";
const DEC_KEY = "kb:decisions";
const REVIEW_KEY = "kb:reviews";
const RULES_KEY = "kb:rules";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type KbEntry = {
  keyword: string; // 明細の摘要に含まれるキーワード（例: エンジョウジ）
  category: string; // 標準の科目（例: 地代家賃）
  note: string; // 用途メモ（例: 普段は家賃。初期費用時は保証金/家賃/共益費に分解）
  updatedAt: string;
};

export type Decision = {
  txnId: number;
  partner: string;
  lines: {
    category: string;
    amount: number;
    taxType?: string;
    item?: string;
    memo?: string;
  }[];
  note: string;
  decidedAt: string;
  date?: string;
  description?: string;
  amount?: number;
  tags?: string[]; // 用途タグ
};

function norm(s: string): string {
  return (s || "").replace(/[\s　]/g, "").toLowerCase();
}

export async function getKbEntries(): Promise<KbEntry[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<KbEntry[]>(KB_KEY)) ?? [];
}

/**
 * 読み込み済みのエントリから引き当てる（最長キーワード優先）。
 * 明細を大量に判定するときは、KVの読み込みを1回で済ませるためこちらを使う。
 */
export function matchKbIn(entries: KbEntry[], description: string): KbEntry | null {
  const d = norm(description);
  const hits = entries
    .filter((e) => e.keyword && d.includes(norm(e.keyword)))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return hits[0] ?? null;
}

/** 摘要にマッチする過去ノウハウを返す（最長キーワード優先） */
export async function matchKb(description: string): Promise<KbEntry | null> {
  return matchKbIn(await getKbEntries(), description);
}

export async function saveKbEntry(e: Omit<KbEntry, "updatedAt">): Promise<void> {
  const store = await kv();
  if (!store) return;
  const entries = await getKbEntries();
  const i = entries.findIndex((x) => norm(x.keyword) === norm(e.keyword));
  const entry: KbEntry = { ...e, updatedAt: new Date(Date.now()).toISOString() };
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  await store.set(KB_KEY, entries);
}

export async function getDecisions(): Promise<Record<string, Decision>> {
  const store = await kv();
  if (!store) return {};
  return (await store.get<Record<string, Decision>>(DEC_KEY)) ?? {};
}

export async function saveDecision(d: Decision): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getDecisions();
  all[String(d.txnId)] = d;
  await store.set(DEC_KEY, all);
}

// --- 会計ルール／ノウハウ（社内AI育成用）。領収書・請求書の抽出プロンプトに注入して学習させる ---
export type KbRule = {
  id: string;
  text: string; // 自然文のルール（例: 1点30万円未満の備品は消耗品費にする）
  source: string; // 由来（例: 手動、○○の修正から学習）
  createdAt: string;
};

// 初期ルール（コードにも同じ判定があるが、AIにも明文で覚えさせる）
const SEED_RULES: Omit<KbRule, "createdAt">[] = [
  {
    id: "asset-300k",
    text: "1点30万円未満の備品・什器・機械は「設備（固定資産）」にせず「消耗品費」にする（青色・少額減価償却資産の特例で全額その期の経費）。固定資産は1点30万円以上のときだけ。",
    source: "初期ルール",
  },
];

export async function getRules(): Promise<KbRule[]> {
  const store = await kv();
  const saved = store ? (await store.get<KbRule[]>(RULES_KEY)) ?? [] : [];
  // シードのうち未登録のものを補完（消されたものは復活させない…のではなく常に土台として提示）
  const merged = [...saved];
  for (const s of SEED_RULES) {
    if (!merged.some((r) => r.id === s.id)) merged.push({ ...s, createdAt: "seed" });
  }
  return merged;
}

export async function addRule(text: string, source = "手動"): Promise<void> {
  const store = await kv();
  if (!store) return;
  const t = text.trim();
  if (!t) return;
  const saved = (await store.get<KbRule[]>(RULES_KEY)) ?? [];
  // 同一テキストの重複は避ける
  if (saved.some((r) => r.text.trim() === t)) return;
  saved.unshift({ id: `rule_${Date.now()}`, text: t, source, createdAt: new Date(Date.now()).toISOString() });
  await store.set(RULES_KEY, saved);
}

export async function deleteRule(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const saved = (await store.get<KbRule[]>(RULES_KEY)) ?? [];
  await store.set(RULES_KEY, saved.filter((r) => r.id !== id));
}

// 抽出プロンプトに差し込む用のテキスト（無ければ空文字）
export async function rulesPromptBlock(): Promise<string> {
  const rules = await getRules();
  if (rules.length === 0) return "";
  return "\n# これまでの会計ルール・ノウハウ（必ず守る）\n" + rules.map((r) => `- ${r.text}`).join("\n");
}

// --- 税理士相談リスト（いったん処理しつつ、後で税理士と確認したい論点） ---
export type Review = {
  id: string; // 明細idなど
  date: string; // 取引日
  summary: string; // 取引内容（取引先・摘要）
  amount: number;
  treatment: string; // いま採用した処理（例: 支払手数料 203,500）
  issue: string; // 論点（例: 開業費にまとめるか要検討）
  status: "pending" | "done";
  createdAt: string;
};

export async function getReviews(): Promise<Review[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<Review[]>(REVIEW_KEY)) ?? [];
}

export async function saveReview(r: Omit<Review, "status" | "createdAt">): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getReviews();
  const i = all.findIndex((x) => x.id === r.id);
  const review: Review = {
    ...r,
    status: i >= 0 ? all[i].status : "pending",
    createdAt: i >= 0 ? all[i].createdAt : new Date(Date.now()).toISOString(),
  };
  if (i >= 0) all[i] = review;
  else all.push(review);
  await store.set(REVIEW_KEY, all);
}

export async function setReviewStatus(id: string, status: "pending" | "done"): Promise<void> {
  const store = await kv();
  if (!store) return;
  const all = await getReviews();
  const i = all.findIndex((x) => x.id === id);
  if (i >= 0) {
    all[i].status = status;
    await store.set(REVIEW_KEY, all);
  }
}
