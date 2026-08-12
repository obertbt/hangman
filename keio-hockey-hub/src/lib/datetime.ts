import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';

/**
 * 日時の扱い（75章）。
 *
 *   保存: UTC（timestamptz）
 *   表示: Asia/Tokyo
 *
 * 「日付だけ」の列（date 型）はタイムゾーンを持たないため、
 * 文字列 'YYYY-MM-DD' としてそのまま扱う。ここを Date に通すと
 * 実行環境のタイムゾーン次第で1日ずれるので注意。
 */

export const TIME_ZONE = 'Asia/Tokyo';

/** Asia/Tokyo における「今日」を YYYY-MM-DD で返す。 */
export function todayInTokyo(now: Date = new Date()): string {
  // en-CA ロケールは YYYY-MM-DD 形式を返す。
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** UTC の timestamptz を Asia/Tokyo の表示文字列にする。 */
export function formatDateTimeInTokyo(iso: string | Date): string {
  const date = typeof iso === 'string' ? parseISO(iso) : iso;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** 'YYYY-MM-DD' を「2026年8月12日（水）」の形にする。 */
export function formatDateLabel(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return dateOnly;
  // date 型はタイムゾーンを持たないので、ローカル時刻の正午として組み立てる。
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return format(date, 'yyyy年M月d日（E）', { locale: ja });
}

/** 'HH:MM:SS' / 'HH:MM' を 'HH:MM' に揃える。null はそのまま返す。 */
export function formatTimeLabel(time: string | null): string | null {
  if (!time) return null;
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parts[0]}:${parts[1]}`;
}

/** dateOnly が range に含まれるか（両端を含む）。 */
export function isWithinDateRange(dateOnly: string, startDate: string, endDate: string): boolean {
  return dateOnly >= startDate && dateOnly <= endDate;
}

/** dateOnly に日数を足した 'YYYY-MM-DD' を返す。 */
export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number);
  if (!year || !month || !day) return dateOnly;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
