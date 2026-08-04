/**
 * ユーザーのタイムゾーンを基準にした日付計算（15章）。
 *
 * 集計の「今日」「今週」はサーバーのタイムゾーンでもブラウザのタイムゾーンでもなく、
 * 必ず profiles.timezone を基準にする。
 * 外部ライブラリを増やさず、Intl の実装だけで完結させている。
 */

export const DEFAULT_TIMEZONE = 'Asia/Tokyo';

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** 指定タイムゾーンでの年月日時分秒に分解する。 */
export function getZonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? '0';
    return Number.parseInt(value, 10);
  };

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    // 24時制では 24:00 が返る実装があるため 0 に丸める
    hour: pick('hour') % 24,
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** そのタイムゾーンにおける UTC からのオフセット（ミリ秒）。 */
function getOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // ミリ秒は formatToParts に含まれないため、元の値から補う
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** 指定タイムゾーンでの日付を YYYY-MM-DD で返す（activity_date に使う）。 */
export function toDateString(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const { year, month, day } = getZonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 「そのタイムゾーンの YYYY-MM-DD 00:00」に対応する UTC の Date を返す。
 *
 * 夏時間の切り替え日でもずれないよう、推定 → オフセット再計算の2段階で求める。
 */
export function startOfDayUtc(dateString: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10));
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);

  let candidate = new Date(naiveUtc - getOffsetMs(new Date(naiveUtc), timeZone));
  // 1回目の推定に使ったオフセットが切り替わりを跨いでいた場合の補正
  candidate = new Date(naiveUtc - getOffsetMs(candidate, timeZone));
  return candidate;
}

/** 指定日の「翌日 00:00」に対応する UTC の Date（範囲指定の上端に使う）。 */
export function endOfDayUtc(dateString: string, timeZone: string = DEFAULT_TIMEZONE): Date {
  return startOfDayUtc(addDays(dateString, 1), timeZone);
}

/** YYYY-MM-DD に日数を足す（タイムゾーンに依存しない純粋な日付演算）。 */
export function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10));
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(
    result.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** 2つの YYYY-MM-DD の日数差（a - b）。 */
export function diffInDays(a: string, b: string): number {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(a) - toUtc(b)) / 86_400_000);
}

/**
 * 週の開始日（月曜日）を YYYY-MM-DD で返す（15.2）。
 */
export function getWeekStartDate(dateString: string): string {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay(): 0=日曜 ... 6=土曜。月曜を週初めにするため 0 を 7 として扱う。
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return addDays(dateString, -(isoDay - 1));
}

/** 今日の日付（ユーザーのタイムゾーン基準）。 */
export function getToday(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return toDateString(now, timeZone);
}

/**
 * 連続記録日数（15.4）。
 * 活動があった日付（YYYY-MM-DD）の集合を受け取り、今日または昨日から遡って数える。
 *
 * 今日まだ記録が無くても、昨日まで続いていれば途切れたことにしない。
 */
export function calculateStreak(activityDates: Iterable<string>, today: string): number {
  const dates = new Set(activityDates);
  if (dates.size === 0) return 0;

  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 表示用: 2026-08-04 → 8月4日(火) */
export function formatDateLabel(dateString: string): string {
  const [year, month, day] = dateString.split('-').map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${month}月${day}日(${weekdays[date.getUTCDay()]})`;
}
