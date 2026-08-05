import { toDateString } from '@/lib/date/timezone';

/**
 * 投稿日時の表示。
 *
 * 直近は「3分前」、それ以前は日付にする。
 * SNS のように秒単位で煽らないよう、1分未満はまとめて「たった今」とする。
 */
export function formatRelativeTime(
  isoString: string,
  { now = new Date(), timeZone = 'Asia/Tokyo' }: { now?: Date; timeZone?: string } = {},
): string {
  const target = new Date(isoString);
  const diffSeconds = Math.floor((now.getTime() - target.getTime()) / 1000);

  // 端末の時計が少し進んでいても「-1分前」とは出さない
  if (diffSeconds < 60) return 'たった今';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}日前`;

  const [year, month, day] = toDateString(target, timeZone).split('-');
  const nowYear = toDateString(now, timeZone).slice(0, 4);

  // 同じ年なら年を省く
  return year === nowYear
    ? `${Number(month)}月${Number(day)}日`
    : `${year}年${Number(month)}月${Number(day)}日`;
}
