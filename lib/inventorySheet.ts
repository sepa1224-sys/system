// 仕入れ表のスプレッドシートを読むためのロジック。
// 列は 仕入れ物 / 仕入れ先 / URL / 価格 / 容量 / メモ / 1回の発注量。
// 「ドリンク」「ドリンク（酒）」のような見出し行は A列だけが埋まっていて残りが空なので、
// それでセクションの区切りを判定する。

export const SHEET_ID = "1VJc6EWTerOSL_-IeuL053gGG3hh3LcIxmVOXod02JN8";
export const SHEET_RANGE = "シート1!A1:G500";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

export type SheetRow = {
  name: string;
  supplier: string;
  url: string;
  price: string;
  capacity: string;
  note: string;
  /** 1回の買い物で仕入れる量。発注のときに迷わないための目安 */
  orderQty: string;
};

export type Section = { title: string; rows: SheetRow[] };

const cell = (r: (string | number)[], i: number) =>
  r[i] === undefined || r[i] === null ? "" : String(r[i]).trim();

export function parseSheet(values: (string | number)[][]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;

  // 1行目はヘッダー（仕入れ物 / 仕入れ先 / …）なので飛ばす
  for (const row of values.slice(1)) {
    const [name, supplier, url, price, capacity, note, orderQty] = [0, 1, 2, 3, 4, 5, 6].map(
      (i) => cell(row, i),
    );
    const empty = !supplier && !url && !price && !capacity && !note && !orderQty;
    if (!name && empty) continue;

    // A列だけの行は見出し
    if (name && empty) {
      cur = { title: name, rows: [] };
      out.push(cur);
      continue;
    }
    if (!name) continue;
    if (!cur) {
      cur = { title: "その他", rows: [] };
      out.push(cur);
    }
    cur.rows.push({ name, supplier, url, price, capacity, note, orderQty });
  }
  return out.filter((s) => s.rows.length > 0);
}
