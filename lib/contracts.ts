// 契約書。書類庫（/shorui）が「届いた紙を溜める場所」なのに対し、
// こちらは「いま生きている約束」を管理する。
//
// 大事なのは中身より期限で、更新日・解約予告の期限を過ぎると
// 勝手に1年延びたり、辞めたいのに辞められなかったりする。
// なので満了日と予告期限から「いつまでに動くか」を出す。

const KEY = "contracts:index";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type ContractKind =
  | "店舗賃貸借"
  | "駐車場"
  | "業務委託"
  | "リース・レンタル"
  | "保険"
  | "サブスク・利用契約"
  | "借入"
  | "その他";

export const CONTRACT_KINDS: ContractKind[] = [
  "店舗賃貸借", "駐車場", "業務委託", "リース・レンタル",
  "保険", "サブスク・利用契約", "借入", "その他",
];

export type Contract = {
  id: string;
  /** 契約の名前（例: 京町パーキング 駐車場使用契約） */
  title: string;
  kind: ContractKind;
  /** 相手先 */
  party: string;
  partyContact?: string;
  /** 契約締結日 */
  signedOn?: string;
  /** 契約期間 */
  startDate: string;
  endDate?: string;
  /** 自動更新するか */
  autoRenew: boolean;
  /** 更新の単位（月数）。1年更新なら12 */
  renewMonths?: number;
  /** 解約予告が必要な月数（1ヶ月前予告なら1） */
  noticeMonths?: number;
  /** 毎月の金額（税込）。都度払いなら未設定 */
  monthlyAmount?: number;
  /** 支払条件のメモ（例: 毎月月末までに翌月分を振込） */
  paymentTerms?: string;
  /** 契約時に払った一時金（礼金・保証金など） */
  initialCost?: number;
  /** 覚えておくこと（特約など） */
  notes?: string;
  /** 定期請求(/bills)のID。紐づけておくと支払い管理とつながる */
  billId?: string;
  active: boolean;
  createdAt: string;
};

export async function getContracts(): Promise<Contract[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<Contract[]>(KEY)) ?? [];
}

export async function saveContract(c: Omit<Contract, "createdAt">): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getContracts();
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = { ...list[i], ...c };
  else list.unshift({ ...c, createdAt: new Date(Date.now()).toISOString() });
  await store.set(KEY, list);
}

export async function deleteContract(id: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(KEY, (await getContracts()).filter((c) => c.id !== id));
}

/** 契約書のPDF・画像 */
export async function saveContractFile(id: string, dataUrl: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (dataUrl.length > 6_000_000) throw new Error("ファイルが大きすぎます（6MBまで）");
  await store.set(`contract:file:${id}`, dataUrl);
}

export async function getContractFile(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(`contract:file:${id}`)) ?? null;
}

const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, d));
  return t.toISOString().slice(0, 10);
};
const daysUntil = (iso: string, today: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

export type ContractStatus = {
  /** 解約を申し出るなら、この日までに言う必要がある */
  noticeBy?: string;
  daysToNotice?: number;
  daysToEnd?: number;
  /** 予告期限が近い／過ぎた */
  alert: "" | "soon" | "passed";
  message: string;
};

/** 満了日と予告期間から、いつまでに動くかを出す */
export function statusOf(c: Contract, today: string): ContractStatus {
  if (!c.active) return { alert: "", message: "終了した契約" };
  if (!c.endDate) return { alert: "", message: "期限の定めなし" };
  const daysToEnd = daysUntil(c.endDate, today);
  if (!c.noticeMonths) {
    return {
      daysToEnd,
      alert: daysToEnd < 0 ? "passed" : daysToEnd <= 60 ? "soon" : "",
      message: daysToEnd < 0 ? "満了日を過ぎています" : `満了まで ${daysToEnd}日`,
    };
  }
  const noticeBy = addMonths(c.endDate, c.noticeMonths);
  const daysToNotice = daysUntil(noticeBy, today);
  if (daysToNotice < 0) {
    return {
      noticeBy, daysToNotice, daysToEnd,
      alert: "passed",
      message: c.autoRenew
        ? `解約予告の期限（${noticeBy}）は過ぎています。このままだと自動更新されます`
        : `解約予告の期限（${noticeBy}）は過ぎています`,
    };
  }
  return {
    noticeBy, daysToNotice, daysToEnd,
    alert: daysToNotice <= 60 ? "soon" : "",
    message: `やめるなら ${noticeBy} までに申し出（あと${daysToNotice}日）`,
  };
}
