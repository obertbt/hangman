import { DEFAULT_TIMEZONE, getZonedParts, toDateString } from '@/lib/date/timezone';

/**
 * 時刻の表示（24章「就寝・起床」）。
 *
 * 睡眠は日付をまたぐのが普通なので、`23:30 → 7:05` とだけ書くと
 * 「7時間半」なのか「16時間半」なのか読み取れない。
 * 日が変わっていれば「翌」を添える。
 *
 * 基準は必ず profiles.timezone。端末やサーバーの時計ではない（15.1）。
 */

/** 2026-08-11T14:30:00Z → 「23:30」（Asia/Tokyo） */
export function formatTimeOfDay(isoString: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const { hour, minute } = getZonedParts(new Date(isoString), timeZone);
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/**
 * 開始と終了を1行にする。
 *
 *   同じ日:   「21:00 → 22:30」
 *   日をまたぐ: 「23:30 → 翌7:05」
 *   2日以上:   「23:30 → 8月13日 7:05」
 */
export function formatTimeRange(
  startIso: string,
  endIso: string,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const start = formatTimeOfDay(startIso, timeZone);
  const end = formatTimeOfDay(endIso, timeZone);

  const startDate = toDateString(new Date(startIso), timeZone);
  const endDate = toDateString(new Date(endIso), timeZone);

  if (startDate === endDate) return `${start} → ${end}`;

  const diffDays = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );

  if (diffDays === 1) return `${start} → 翌${end}`;

  const { month, day } = getZonedParts(new Date(endIso), timeZone);
  return `${start} → ${month}月${day}日 ${end}`;
}
