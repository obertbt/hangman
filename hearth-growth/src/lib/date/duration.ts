/**
 * 活動時間の表示（16.3）。
 *
 *   1時間未満        → 「45分」
 *   1時間以上        → 「1時間25分」（分が0なら「2時間」）
 *   秒単位を出すのはタイマー画面だけ（formatClock を使う）。
 */
export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}分`;
  }
  if (minutes === 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${minutes}分`;
}

/**
 * タイマー画面用の時計表示。
 *   1時間未満 → mm:ss
 *   1時間以上 → h:mm:ss
 */
export function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  if (hours === 0) {
    return `${pad(minutes)}:${pad(secs)}`;
  }
  return `${hours}:${pad(minutes)}:${pad(secs)}`;
}

interface ElapsedInput {
  startedAt: Date | string;
  /** 一時停止中ならその時刻。running なら null。 */
  pausedAt?: Date | string | null;
  totalPausedSeconds?: number;
  /** 現在時刻。テストしやすいように差し込めるようにしている。 */
  now?: Date;
}

/**
 * 経過秒数を「開始時刻」から計算する（13.1）。
 *
 * フロントエンドで秒をカウントアップして保持しない。
 * ブラウザを閉じても、再読み込みしても、この計算だけで復元できる。
 *
 *   経過 = (現在 or 停止時刻) - 開始 - 累計停止時間
 */
export function calculateElapsedSeconds({
  startedAt,
  pausedAt = null,
  totalPausedSeconds = 0,
  now = new Date(),
}: ElapsedInput): number {
  const start = toDate(startedAt).getTime();
  // 一時停止中は、停止した瞬間で時間を止める
  const reference = pausedAt ? toDate(pausedAt).getTime() : now.getTime();
  const elapsed = Math.floor((reference - start) / 1000) - Math.max(0, Math.floor(totalPausedSeconds));
  return Math.max(0, elapsed);
}

/** 完了時の duration を確定する（13.2）。 */
export function calculateDurationSeconds(
  startedAt: Date | string,
  endedAt: Date | string,
  totalPausedSeconds: number,
): number {
  const duration =
    Math.floor((toDate(endedAt).getTime() - toDate(startedAt).getTime()) / 1000) -
    Math.max(0, Math.floor(totalPausedSeconds));
  return Math.max(0, duration);
}

/**
 * 異常終了の検出（13.4）。
 * 長時間続いているセッションは、勝手に終了させず確認画面を出すための判定に使う。
 */
export const STALE_SESSION_THRESHOLD_SECONDS = 12 * 60 * 60;

export function isStaleSession(elapsedSeconds: number): boolean {
  return elapsedSeconds >= STALE_SESSION_THRESHOLD_SECONDS;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
