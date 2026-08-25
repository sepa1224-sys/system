// イベント日の売上は通常営業と性質が違うので、傾向を見る分析からは外す。
// 貸切や大人数の前売りが入る日を平常日と混ぜると、曜日別や時間帯別の平均が歪む。
//
// 日付だけでなく開始時刻も持つ。夏祭りのように昼は通常営業で、
// 夕方からイベントに切り替わる日があるため。

export type EventWindow = {
  date: string; // YYYY-MM-DD（営業日。6時切替後の日付）
  /** この時刻以降をイベント扱いにする。終日なら 0 */
  fromHour: number;
  label: string;
};

export const EVENT_WINDOWS: EventWindow[] = [
  { date: "2026-08-22", fromHour: 17, label: "flat. 夏祭り2026" },
];

/**
 * その注文がイベント中のものか。
 * @param bizDay 営業日（6時前は前日に寄せたもの）
 * @param hour   実際の時刻（0-23）
 */
export function eventOf(bizDay: string, hour: number): EventWindow | null {
  for (const w of EVENT_WINDOWS) {
    if (w.date !== bizDay) continue;
    // 深夜（0-5時）は前営業日の続きなので、必ずイベント時間内とみなす
    if (hour < 6 || hour >= w.fromHour) return w;
  }
  return null;
}
