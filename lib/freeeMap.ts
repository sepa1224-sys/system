// 領収書の科目(CATEGORIES) → freeeの勘定科目ID/税区分/品目ID のマッピング。
// company_id=12575763 の実IDを埋め込み。tax_code 34=課対仕入10%、2=対象外。

export const YAKUIN_KARIIRE_ID = 1035440156; // 役員借入金（貸方）
export const YAKUIN_KARIIRE_TAX = 2; // 対象外

// 会計年度の期首日（flat. 第1期 2026-06-01〜2027-05-31）。
// freeeは期首より前の日付の仕訳を受け付けないため、設立前支出はこの日付で記帳する。
// ※年度が変わったら更新すること。
export const FISCAL_START = "2026-06-01";

// 発生日がFISCAL_STARTより前なら期首日に丸める（設立前支出対応）。
// 戻り値 adjusted=true のとき、original に元の日付が入る。
export function clampIssueDate(date: string): { issueDate: string; adjusted: boolean; original: string } {
  if (date && date < FISCAL_START) {
    return { issueDate: FISCAL_START, adjusted: true, original: date };
  }
  return { issueDate: date, adjusted: false, original: date };
}

export type FreeeLine = {
  accountItemId: number;
  taxCode: number;
  itemId?: number;
};

// 領収書のカテゴリ名 → 借方の科目
export const CATEGORY_MAP: Record<string, FreeeLine> = {
  // 仕入高（飲食材料すべて）
  "仕入高": { accountItemId: 1035440079, taxCode: 34 },
  // 経費
  "消耗品費": { accountItemId: 1035440104, taxCode: 34 },
  "家賃": { accountItemId: 1035440112, taxCode: 34 }, // 地代家賃
  "水道光熱費": { accountItemId: 1035440107, taxCode: 34 },
  "通信費": { accountItemId: 1035440101, taxCode: 34 },
  "保険料": { accountItemId: 1035440115, taxCode: 2 }, // 非課税
  "広告宣伝費": { accountItemId: 1035440097, taxCode: 34 },
  "修繕費": { accountItemId: 1035440106, taxCode: 34 },
  "荷造運賃": { accountItemId: 1035440098, taxCode: 34 },
  "旅費交通費": { accountItemId: 1035440096, taxCode: 34 },
  "交際費": { accountItemId: 1035440100, taxCode: 34 },
  "雑費": { accountItemId: 1035440125, taxCode: 34 },
  // 設備
  "設備（固定資産）": { accountItemId: 1035440008, taxCode: 34 }, // 工具器具備品
  // 不明 → 仮払金（後で振替）
  "不明": { accountItemId: 1035439999, taxCode: 2 },
  // ── 後方互換: 旧カテゴリ名が残っているデータ用 ──
  "コーヒー豆・茶葉": { accountItemId: 1035440079, taxCode: 34 },
  "牛乳・シロップ等": { accountItemId: 1035440079, taxCode: 34 },
  "酒類": { accountItemId: 1035440079, taxCode: 34 },
  "ソフトドリンク・炭酸": { accountItemId: 1035440079, taxCode: 34 },
  "フード材料費": { accountItemId: 1035440079, taxCode: 34 },
  "包装資材・消耗品": { accountItemId: 1035440104, taxCode: 34 },
  "その他原価": { accountItemId: 1035440079, taxCode: 34 },
  "その他経費": { accountItemId: 1035440125, taxCode: 34 },
};

export function mapCategory(category: string): FreeeLine {
  return CATEGORY_MAP[category] ?? CATEGORY_MAP["不明"];
}
