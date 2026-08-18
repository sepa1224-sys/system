// freeeの「品目」を使って、仕入高の中身を銘柄レベルまで分ける。
// 勘定科目は「仕入高」のまま、品目で アペロール / ビール（ハイネケン） のように分類する。
// これで freee 側の「品目別レポート」で銘柄ごとの仕入額が出せる。
//
// 品名は領収書のOCR結果なので表記ゆれが大きい。ここでキーワードから品目に寄せる。
// 該当しないものは品目なし（＝仕入高だけ）で登録する。無理に品目を作ると
// 表記ゆれのぶんだけ品目が増えて、かえって集計できなくなるため。

import { FREEE_COMPANY_ID, freeeGet, freeePost } from "@/lib/freee";

export type ItemRule = { re: RegExp; item: string };

/** 上から順に見て、最初に当たったものを採用する */
export const ITEM_RULES: ItemRule[] = [
  // ── ビール（銘柄ごと）
  { re: /ハイネケン|HEINEKEN/i, item: "ビール（ハイネケン）" },
  { re: /コロナ.*(ビール|エキストラ)|CORONA/i, item: "ビール（コロナ）" },
  { re: /一番搾り|キリン.*ビール/, item: "ビール（キリン）" },
  { re: /アサヒ.*(スーパードライ|生ビール)/, item: "ビール（アサヒ）" },
  { re: /ギネス|GUINNESS/i, item: "ビール（ギネス）" },
  { re: /ビール|発泡酒|BEER/i, item: "ビール（その他）" },

  // ── リキュール・スピリッツ（銘柄ごと）
  { re: /アペロール|APEROL/i, item: "アペロール" },
  { re: /カンパリ|CAMPARI/i, item: "カンパリ" },
  { re: /チョーヤ|梅酒/, item: "梅酒" },
  { re: /アブソルート|ABSOLUT/i, item: "ウォッカ（アブソルート）" },
  { re: /ゴードン|GORDON/i, item: "ジン（ゴードン）" },
  { re: /クエルボ|テキーラ|TEQUILA/i, item: "テキーラ" },
  { re: /マリブ|MALIBU/i, item: "マリブ" },
  { re: /コアントロー|COINTREAU/i, item: "コアントロー" },
  { re: /ジムビーム|JIM BEAM|ウイスキー|ウィスキー/i, item: "ウイスキー" },
  { re: /チャミスル|眞露|ジンロ/, item: "韓国焼酎" },
  { re: /ワイン|WINE|シャルドネ|カベルネ|レイダ|クリネ/i, item: "ワイン" },
  { re: /スパークリング|プロセッコ|カヴァ|シャンパン/i, item: "スパークリング" },
  { re: /日本酒|純米|吟醸/, item: "日本酒" },
  { re: /焼酎/, item: "焼酎" },
  { re: /リキュール/, item: "リキュール（その他）" },

  // ── ソフトドリンク
  { re: /ジンジャーエール|カナダドライ/i, item: "ジンジャーエール" },
  { re: /トニックウォーター|トニック/i, item: "トニックウォーター" },
  { re: /コーラ|COKE|COCA/i, item: "コーラ" },
  { re: /三ツ矢|サイダー/, item: "サイダー" },
  { re: /オレンジジュース|パインジュース|グァバ|ジュース/, item: "ジュース" },
  { re: /牛乳|ミルク/, item: "牛乳" },

  // ── コーヒー・茶
  { re: /コーヒー豆|焙煎|ドリップ|エスプレッソ/, item: "コーヒー豆" },
  { re: /抹茶/, item: "抹茶" },
  { re: /紅茶|ティー|アールグレイ/, item: "紅茶" },

  // ── フード
  { re: /ワッフルミックス|ベルギーワッフル/, item: "ワッフルミックス" },
  { re: /ワッフルシュガー/, item: "ワッフルシュガー" },
  { re: /チョコレートシロップ|ハーシー/, item: "チョコレートシロップ" },
  { re: /ブルーベリー/, item: "ブルーベリー" },
  { re: /バター/, item: "バター" },
  { re: /チーズ/, item: "チーズ" },
  { re: /鶏卵|たまご|卵/, item: "卵" },
  // ── リキュール・スピリッツ（追加）
  { re: /アマレット|ディサローノ|DISARONNO/i, item: "アマレット" },
  { re: /バカルディ|BACARDI|ラム酒|ホワイトラム/i, item: "ラム" },
  { re: /カシス/, item: "カシス" },
  { re: /ベルモット|マティーニ/i, item: "ベルモット" },

  // ── シロップ（モナンは銘柄が多いので味ごとに分けず1品目にまとめる）
  { re: /モナン|MONIN/i, item: "シロップ（モナン）" },
  { re: /グレナディン|シュガーシロップ/, item: "シロップ（その他）" },

  // ── ソフトドリンク（追加）
  { re: /炭酸水|ソーダ|スプライト|ペリエ/i, item: "炭酸水" },
  { re: /クランベリー/, item: "ジュース" },
  { re: /氷|純氷/, item: "氷" },

  // ── フード材料（追加）
  { re: /生ハム|ハム|ベーコン|サラミ/, item: "ハム・ベーコン" },
  { re: /ツナ|シーチキン/, item: "ツナ" },
  { re: /パルミジャー|モッツァレラ|カマンベール/i, item: "チーズ" },
  { re: /オリーブオイル|サラダ油|ごま油|オイル/, item: "食用油" },
  { re: /アイスクリーム|ジェラート|バニラ.*2L/, item: "アイスクリーム" },
  { re: /ピクルス|オリーブ(?!オイル)/, item: "ピクルス・オリーブ" },
  { re: /鮒ずし|鮒寿司/, item: "鮒ずし" },
  { re: /パン|バゲット|食パン|クロワッサン|バンズ/, item: "パン" },
  { re: /砂糖|上白糖|中双糖|ザラメ|グラニュー/, item: "砂糖" },
  { re: /小麦粉|薄力粉|強力粉|ミックス粉/, item: "粉類" },
  { re: /ソース|ケチャップ|マヨネーズ|マスタード|わさび|みそ|味噌|醤油|しょうゆ|みりん|酢/, item: "調味料" },
  { re: /ほうれん草|ブロッコリー|レタス|トマト|玉ねぎ|じゃがいも|野菜/, item: "野菜" },
  { re: /ライム|レモン|バナナ|いちご|果実|フルーツ/, item: "果物" },
  { re: /ココナッツ/, item: "ココナッツミルク" },
  { re: /ココア|チョコチップ|チョコレート/, item: "チョコ・ココア" },
  { re: /生クリーム|ホイップ/, item: "生クリーム" },
];

/** 品名から品目名を判定する。該当なしは null（品目を付けない） */
export function resolveItemName(productName: string): string | null {
  const s = String(productName ?? "");
  if (!s) return null;
  for (const r of ITEM_RULES) if (r.re.test(s)) return r.item;
  return null;
}

type FreeeItem = { id: number; name: string };

/** freeeの品目一覧。1リクエスト内で使い回すためのキャッシュ */
export type ItemCache = { list: FreeeItem[] | null };

export const newItemCache = (): ItemCache => ({ list: null });

async function loadItems(cache: ItemCache): Promise<FreeeItem[]> {
  if (cache.list) return cache.list;
  const r = await freeeGet<{ items: FreeeItem[] }>("/api/1/items", {
    company_id: FREEE_COMPANY_ID,
    limit: "3000",
  });
  cache.list = r.items ?? [];
  return cache.list;
}

/**
 * 品目名からfreeeのitem_idを引く。無ければ作る。
 * ルールに載っている名前しか渡さないので、品目が無秩序に増えることはない。
 */
export async function getOrCreateItemId(
  name: string,
  cache: ItemCache,
): Promise<number | null> {
  try {
    const list = await loadItems(cache);
    const hit = list.find((i) => i.name === name);
    if (hit) return hit.id;
    const created = await freeePost<{ item: FreeeItem }>("/api/1/items", {
      company_id: Number(FREEE_COMPANY_ID),
      name,
    });
    const item = created.item;
    if (item?.id) {
      list.push(item);
      return item.id;
    }
    return null;
  } catch {
    // 品目が付けられなくても取引の登録自体は続ける
    return null;
  }
}

/** 品名から item_id を得る（該当ルールが無ければ null） */
export async function itemIdForProduct(
  productName: string,
  cache: ItemCache,
): Promise<number | null> {
  const name = resolveItemName(productName);
  return name ? getOrCreateItemId(name, cache) : null;
}
