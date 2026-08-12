import type { TrainingType } from '@/types/database.types';

/**
 * トレーニング記録の種別ごとの扱い（17章）。
 *
 * 種別によって入力する項目が変わる。
 * どの種別で何を出すかを1か所にまとめ、画面と検証で同じ定義を使う。
 */

/** 種別ごとの追加項目。 */
export type TrainingSection = 'running' | 'weight' | 'self_practice';

export function sectionFor(trainingType: TrainingType): TrainingSection | null {
  switch (trainingType) {
    case 'running':
      return 'running';
    case 'weight':
      return 'weight';
    case 'self_practice':
      return 'self_practice';
    default:
      // リカバリー・ストレッチ・アジリティ・その他は共通項目だけ
      return null;
  }
}

/**
 * 開始・終了時刻から実施時間（分）を出す。
 *
 * 日付をまたぐ入力（23:00〜00:30）も扱えるようにする。
 * どちらかが空なら null（利用者が直接分を入れる）。
 */
export function durationFromTimes(startTime: string | null, endTime: string | null): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;

  const diff = end - start;
  // 終了が開始より前なら日付をまたいだとみなす
  return diff >= 0 ? diff : diff + 24 * 60;
}

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * 距離と時間からペース（1kmあたりの秒数）を出す。
 * 依頼書17章の「ペース」は、毎回手で計算させると入力の負担になる。
 */
export function paceSecondsPerKm(distanceKm: number | null, durationMinutes: number | null): number | null {
  if (distanceKm === null || durationMinutes === null) return null;
  if (distanceKm <= 0 || durationMinutes <= 0) return null;
  return Math.round((durationMinutes * 60) / distanceKm);
}

/** ペースを「5'30"/km」の形にする。 */
export function formatPace(secondsPerKm: number | null): string | null {
  if (secondsPerKm === null || secondsPerKm <= 0) return null;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = secondsPerKm % 60;
  return `${minutes}'${String(seconds).padStart(2, '0')}"/km`;
}

/** 実施時間を「1時間20分」の形にする。 */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes < 0) return null;
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

export interface WeightExerciseInput {
  name: string;
  weightKg: number | null;
  reps: number | null;
  setCount: number | null;
}

/**
 * ウェイトの入力（種目・重量・回数・セット数）を、
 * training_exercises と training_sets の形へ広げる。
 *
 * 画面では「セット数」をまとめて1つ入れてもらい、
 * 保存時に同じ内容のセットを必要な数だけ作る。
 * 後からセットごとに重さを変えられるよう、テーブルは分けたまま持つ。
 */
export function expandWeightSets(
  input: WeightExerciseInput,
): { setNumber: number; weightKg: number | null; reps: number | null }[] {
  const count = input.setCount ?? 0;
  if (count <= 0) return [];

  // 常識外れの数を弾く（入力ミスで大量の行を作らない）
  const safeCount = Math.min(count, 20);

  return Array.from({ length: safeCount }, (_, index) => ({
    setNumber: index + 1,
    weightKg: input.weightKg,
    reps: input.reps,
  }));
}

/** 総挙上量（重量 × 回数 × セット数）。振り返りの目安に使う。 */
export function totalVolume(input: WeightExerciseInput): number | null {
  if (input.weightKg === null || input.reps === null || input.setCount === null) return null;
  if (input.weightKg <= 0 || input.reps <= 0 || input.setCount <= 0) return null;
  return input.weightKg * input.reps * input.setCount;
}
