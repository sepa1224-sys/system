// 通常営業ではない日の売上は、傾向を見る分析から外す。
// イベント日も、店を閉めてテイクアウトだけ受けた日も、
// 平常日と混ぜると曜日別や時間帯別の平均が歪むため。
//
// 日付だけでなく開始時刻も持つ。夏祭りのように昼は通常営業で、
// 夕方からイベントに切り替わる日があるため。終日なら fromHour は 0。

export type ExcludeWindow = {
  date: string; // YYYY-MM-DD（営業日。6時切替後の日付）
  /** この時刻以降を対象にする。終日なら 0 */
  fromHour: number;
  label: string;
  /** イベント＝人が集まる催し ／ 特殊営業＝通常の営業形態でなかった日 */
  reason: "イベント" | "特殊営業";
};

export const EXCLUDE_WINDOWS: ExcludeWindow[] = [
  {
    date: "2026-08-22",
    fromHour: 17,
    label: "flat. 夏祭り2026",
    reason: "イベント",
  },
  {
    date: "2026-08-23",
    fromHour: 0,
    label: "店内休業・テイクアウトのみ",
    reason: "特殊営業",
  },
];

/**
 * その注文が除外対象か。
 * @param bizDay 営業日（6時前は前日に寄せたもの）
 * @param hour   実際の時刻（0-23）
 */
export function excludeOf(bizDay: string, hour: number): ExcludeWindow | null {
  for (const w of EXCLUDE_WINDOWS) {
    if (w.date !== bizDay) continue;
    // 深夜（0-5時）は前営業日の続きなので、必ず対象内とみなす
    if (hour < 6 || hour >= w.fromHour) return w;
  }
  return null;
}
