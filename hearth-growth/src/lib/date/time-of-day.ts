import { addDays, DEFAULT_TIMEZONE, getZonedParts, startOfDayUtc, toDateString } from '@/lib/date/timezone';

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

/**
 * 「7:00」から、次にその時刻になる瞬間を求める。
 *
 * 就寝は夜が多いので、23:30 に「7:00」と入れたら**翌朝**を指す。
 * ここを取り違えると、押した直後に通知が飛ぶか、丸一日遅れる。
 *
 * 夏時間の切り替え日は、その日の 00:00 からの単純な加算になる（最大1時間ずれる）。
 * 既定の Asia/Tokyo には夏時間が無く、通知の用途では実害が無いため許容する。
 */
export function nextOccurrenceOf(
  timeHHMM: string,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): Date {
  const [hour, minute] = timeHHMM.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`時刻の形式が正しくありません: ${timeHHMM}`);
  }

  const offsetMs = (hour * 60 + minute) * 60_000;
  const today = toDateString(now, timeZone);

  const candidate = new Date(startOfDayUtc(today, timeZone).getTime() + offsetMs);
  if (candidate.getTime() > now.getTime()) return candidate;

  return new Date(startOfDayUtc(addDays(today, 1), timeZone).getTime() + offsetMs);
}
