// freeeの「品目」を使って、仕入高の中身を銘柄レベルまで分ける。
// 勘定科目は「仕入高」のまま、品目で アペロール / ビール（ハイネケン） のように分類する。
// これで freee 側の「品目別レポート」で銘柄ごとの仕入額が出せる。
//
// 品名は領収書のOCR結果なので表記ゆれが大きい。ここでキーワードから品目に寄せる。
// 該当しないものは品目なし（＝仕入高だけ）で登録する。無理に品目を作ると
// 表記ゆれのぶんだけ品目が増えて、かえって集計できなくなるため。

import { FREEE_COMPANY_ID, freeeGet, freeePost } from "@/lib/freee";

const OVERRIDE_KEY = "items:overrides";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

/**
 * 手で覚えさせた「キーワード → 品目」。ルール表に無い商品を、
 * 領収書を登録するその場で分類できるようにするためのもの。
 * ルール表より優先し、長いキーワードから先に当てる。
 */
export async function getOverrides(): Promise<Record<string, string>> {
  const store = await kv();
  return store ? ((await store.get<Record<string, string>>(OVERRIDE_KEY)) ?? {}) : {};
}

export async function saveOverride(keyword: string, item: string): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const k = keyword.trim();
  if (!k) throw new Error("キーワードが空です");
  const cur = (await store.get<Record<string, string>>(OVERRIDE_KEY)) ?? {};
  if (item.trim()) cur[k] = item.trim();
  else delete cur[k]; // 品目を空で送ると解除
  await store.set(OVERRIDE_KEY, cur);
}

/** 覚えさせた分を含めて品目名を決める。ルール表より覚えさせた方を優先する */
export function resolveWithOverrides(
  productName: string,
  overrides: Record<string, string>,
): string | null {
  const s = String(productName ?? "");
  if (!s) return null;
  const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
  for (const k of keys) if (s.includes(k)) return overrides[k];
  return resolveItemName(s);
}

export type ItemRule = { re: RegExp; item: string };

/** 上から順に見て、最初に当たったものを採用する */
export const ITEM_RULES: ItemRule[] = [
  // 送料は商品名を含むことがある（例:「配送料（コアントロー…）」）ので、
  // 他のどのルールよりも先に判定する。
  { re: /送料|配送料|運賃|宅急便|宅配便/, item: "送料" },

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
  { re: /オレンジジュース|パインジュース|グァバ|グアバ|グロリア|ジュース/, item: "ジュース" },
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
  // ── 酒（追加）
  { re: /ジム・?ビーム|JIM ?BEAM/i, item: "ウイスキー" },
  { re: /ボルス|BOLS|ブルーキュラソー|キュラソウ/i, item: "リキュール（その他）" },

  // ── 基礎調味料（塩・こしょう・スパイス）
  { re: /ほんじお|お塩|食塩|岩塩|^塩|塩$/, item: "塩" },
  { re: /こしょう|コショウ|ペッパー|PEPPER/i, item: "こしょう" },
  { re: /ローリエ|パセリ|ミント|唐辛子|バジル|オレガノ|GABAN|S&B|スパイス/i, item: "スパイス・ハーブ" },
  { re: /はちみつ|蜂蜜/, item: "はちみつ" },
  { re: /ごま|胡麻/, item: "ごま" },
  { re: /ラー油/, item: "調味料" },
  { re: /ジェノベーゼ|ペスト/i, item: "ソース類" },
  { re: /ガムシロップ|グレナデンシロップ/, item: "シロップ（その他）" },
  { re: /マーガリン/, item: "バター" },
  { re: /豆乳/, item: "牛乳" },
  { re: /カルピス|ポッカ|ゆず茶|ジャスミン|緑茶|お～いお茶|お〜いお茶|麦茶|ほうじ茶/, item: "紅茶" },

  // ── 食材（追加）
  { re: /サーモン|えび|エビ|はんぺん|佃煮|あみえび|こんにゃく|コンミート/, item: "魚介・練物" },
  { re: /キャベツ|ベビーリーフ|マッシュルーム|大葉|にんにく|アボカド/, item: "野菜" },
  { re: /マンゴー|オレンジ100/, item: "果物" },
  { re: /朝の輝き|朝の耀き|フジ本仕込|石窯|カマ$|ミニカマ|くらしモア/, item: "パン" },
  { re: /チップチョコ|パルメ/, item: "チョコ・ココア" },
  { re: /パウダーシュガー|シュガーパウダー/, item: "砂糖" },
  { re: /麹|味料/, item: "調味料" },
  { re: /R-1|ヨーグルト/, item: "乳製品（その他）" },
  // ── 消耗品・資材（仕入高以外もここで分類する）
  { re: /ペーパータオル|ハンドタオル|ハンドペーパー/, item: "ペーパータオル" },
  { re: /キッチンペーパー/, item: "キッチンペーパー" },
  { re: /トイレットペーパー/, item: "トイレットペーパー" },
  { re: /レジ袋|手堤袋|手提げ袋|紙袋|カミブクロ/, item: "レジ袋・紙袋" },
  { re: /バーガー袋|ラップ|アルミホイル|クッキングシート/, item: "包装資材" },
  { re: /洗剤|ブリーチ|ジョイ|ウタマロ|食器用/, item: "洗剤" },
  { re: /スポンジ|たわし|スコッチブライト/, item: "スポンジ・たわし" },
  { re: /ゴミ袋|ごみ袋|ペール/, item: "ゴミ袋・ペール" },
  { re: /手袋|グローブ|ニトリル|テブクロ/, item: "手袋" },
  { re: /ストロー|マドラー|カップ|コースター|おしぼり|ツマヨウジ|楊枝/, item: "使い捨て用品" },
  { re: /カセットガス|ガスボンベ/, item: "カセットガス" },
  { re: /電池|乾電池/, item: "電池" },
  { re: /木材|カフェ板|ベニヤ|SPF|杉KD|リノベ柱/, item: "木材" },
  { re: /ネジ|ビス|ボルト|ナット|ワッシャー|コーススレッド/, item: "ネジ・金具" },
  { re: /塗料|ペンキ|ニス|ウッディガード|刷毛|ハケ/, item: "塗装材料" },
  { re: /養生|マスキングテープ|クラフトテープ|ガムテープ/, item: "テープ・養生" },
  // ── ドリンク（追加）
  { re: /フォンタナ|パイナップル|パイン/, item: "ジュース" },

  // ── 厨房機器・設備（開業時にまとめて入れたもの）
  { re: /冷蔵庫|冷凍庫|ホシザキ|製氷機/, item: "厨房機器（冷蔵・冷凍）" },
  { re: /グラインダー|マールクーニック|エスプレッソマシン|コーヒーメーカー/, item: "コーヒー機器" },
  { re: /ホットサンドメーカー|オーブン|レンジ|コンロ|カセットフー/, item: "調理機器" },
  { re: /エアコン|空調/, item: "空調機器" },
  { re: /クリーナー|掃除機/, item: "清掃機器" },
  { re: /金庫/, item: "レジ・金庫" },
  { re: /iPad|タブレット|パソコン|PC|プリンタ/i, item: "IT機器" },

  // ── 什器・内装
  { re: /ソファ|センターBF|椅子|チェア|スツール/, item: "椅子・ソファ" },
  { re: /合皮|生地|張り替え/, item: "内装材料" },
  { re: /手洗|洗面|ボウル|TOTO/i, item: "水回り設備" },
  { re: /棚|ラック|ショッキダナ|ポスト/, item: "棚・収納" },
  { re: /パキラ|ブラキカム|モンステラ|ストレリチア|ユーフォルビア|観葉|クレイポット|ガラスベース/, item: "植物・鉢" },

  // ── 費用（品目として分けておくと集計しやすい）
  { re: /営業許可|申請手数料|養成講習|講習/, item: "許認可・講習" },
  { re: /昼食|飲食代|飲食（|お好み焼き|寿司|蕎麦/, item: "飲食（会議・打合せ）" },
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

/** 品名から item_id を得る（覚えさせた分も見る。該当なしは null） */
export async function itemIdForProduct(
  productName: string,
  cache: ItemCache,
  overrides?: Record<string, string>,
): Promise<number | null> {
  const ov = overrides ?? (await getOverrides());
  const name = resolveWithOverrides(productName, ov);
  return name ? getOrCreateItemId(name, cache) : null;
}
