/**
 * 保存容量の見かた（58章・59章）。
 *
 * ここは DB もネットワークも触らない。
 * 「どこから警告するか」「このままだといつ埋まるか」を1か所にまとめ、
 * テストで固める。
 */

/** 59章のしきい値。 */
export type UsageLevel = 'ok' | 'notice' | 'warning' | 'critical';

export const USAGE_THRESHOLDS = {
  notice: 70,
  warning: 85,
  critical: 95,
} as const;

export interface UsageSummary {
  usedBytes: number;
  limitBytes: number;
  /** 0〜100 の小数1桁。上限が0以下なら0。 */
  percent: number;
  level: UsageLevel;
  /** 上限までの残り。超えていたら0。 */
  remainingBytes: number;
}

export function summarizeUsage(usedBytes: number, limitBytes: number): UsageSummary {
  const used = Math.max(0, usedBytes);

  // 上限が入っていない環境では、割合を出さずに「使用量だけ」を見せる
  if (limitBytes <= 0) {
    return { usedBytes: used, limitBytes: 0, percent: 0, level: 'ok', remainingBytes: 0 };
  }

  const percent = Math.round((used / limitBytes) * 1000) / 10;

  return {
    usedBytes: used,
    limitBytes,
    percent,
    level: levelFor(percent),
    remainingBytes: Math.max(0, limitBytes - used),
  };
}

export function levelFor(percent: number): UsageLevel {
  if (percent >= USAGE_THRESHOLDS.critical) return 'critical';
  if (percent >= USAGE_THRESHOLDS.warning) return 'warning';
  if (percent >= USAGE_THRESHOLDS.notice) return 'notice';
  return 'ok';
}

/** 画面に出す言葉。数字だけ見せても、何をすればいいか分からない。 */
export const USAGE_MESSAGES: Record<UsageLevel, string> = {
  ok: 'まだ余裕があります。',
  notice: '半分を大きく超えました。古い動画の整理を考え始める時期です。',
  warning: '残りが少なくなっています。使っていない動画を消すか、上限を見直してください。',
  critical: 'ほとんど埋まっています。新しい投稿が止まる前に、整理か上限の引き上げを行ってください。',
};

/**
 * 増え方から、上限に届くまでの日数を見積もる（59章）。
 *
 * 直近の記録を使った、ごく単純な一次の見積もり。
 * 「あと何日」を正確に当てるためではなく、
 * 「このままだとまずい」と気付くために出す。
 *
 * 増えていない（または減っている）ときは null。
 */
export interface UsagePoint {
  capturedOn: string;
  totalBytes: number;
}

export function daysUntilFull(history: UsagePoint[], limitBytes: number): number | null {
  if (limitBytes <= 0 || history.length < 2) return null;

  const sorted = [...history].sort((left, right) => left.capturedOn.localeCompare(right.capturedOn));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  const days = daysBetween(first.capturedOn, last.capturedOn);
  if (days <= 0) return null;

  const perDay = (last.totalBytes - first.totalBytes) / days;
  if (perDay <= 0) return null;

  const remaining = limitBytes - last.totalBytes;
  if (remaining <= 0) return 0;

  return Math.floor(remaining / perDay);
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/**
 * 消せば空く容量（60章）。
 *
 * 論理削除しただけのファイルは、まだ R2 の容量を使っている。
 * 「削除待ちを片付ければこれだけ空く」と分かると、行動につながる。
 */
export function reclaimableBytes(deletedBytes: number, tempBytes: number): number {
  return Math.max(0, deletedBytes) + Math.max(0, tempBytes);
}

/**
 * 掃除の対象になる時刻（60章）。
 *
 * 期限そのものは env が持つ。ここは「いつより前か」を出すだけ。
 */
export function deletionCutoff(retentionDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export function tempUploadCutoff(retentionHours: number, now: Date = new Date()): string {
  return new Date(now.getTime() - retentionHours * 60 * 60 * 1000).toISOString();
}
