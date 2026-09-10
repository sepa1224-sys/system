import type { Member } from "@/lib/labor";

// レシートに載っているカード下4桁から、支出の区分と立替えた人を決める。
//
// これまでは「4137なら会社カード、それ以外は立替」という判定だけで、
// 立替えた人はいつも先頭の坂本になっていた。櫻井のカードで買っても
// 坂本の立替として保存されてしまうので、カードごとに持ち主を持たせる。
//
// カードが増えたらここに1行足す。

export type CardKind = "card" | "company";

export type KnownCard = {
  /** レシートに出る下4桁 */
  last4: string;
  /** card = 会社カード支出 / company = 立替 */
  kind: CardKind;
  /** 立替のときの立替えた人。会社カードでは持たない */
  payer?: Member;
  /** 画面に出す名前 */
  label: string;
};

export const KNOWN_CARDS: KnownCard[] = [
  { last4: "4137", kind: "card", label: "会社カード" },
  { last4: "1554", kind: "company", payer: "櫻井", label: "櫻井カード（立替）" },
];

/**
 * カード下4桁から区分と立替えた人を返す。
 * 表に無いカード・読み取れなかった場合は null（呼び出し側の既定にまかせる）。
 */
export function cardOf(last4: string | undefined | null): KnownCard | null {
  const s = String(last4 ?? "").trim();
  if (!/^\d{4}$/.test(s)) return null;
  return KNOWN_CARDS.find((c) => c.last4 === s) ?? null;
}
