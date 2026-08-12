import { z } from 'zod';

/**
 * トレーニング記録の入力検証（17章）。
 * 共通項目 + 種別ごとの項目。
 */

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `長すぎます（${max}文字まで）`)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    });

/** 未選択（空文字）も未指定（undefined）も null に倒す。 */
const rating = z
  .union([z.literal(''), z.coerce.number().int().min(1).max(5)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

/** 空文字を null にする数値。上限つき。 */
const optionalNumber = (max: number, message: string) =>
  z
    .union([z.literal(''), z.coerce.number().min(0, '0以上で入力してください。').max(max, message)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const optionalTime = z
  .union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません。')])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

export const trainingRecordSchema = z.object({
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付を選んでください。'),
  event_id: z.string().nullable().optional(),

  training_type: z.enum(['running', 'weight', 'self_practice', 'recovery', 'stretch', 'agility', 'other']),

  menu: optionalText(1000),
  started_at: optionalTime,
  ended_at: optionalTime,
  duration_minutes: optionalNumber(1440, '24時間以内で入力してください。').transform((value) =>
    value === null ? null : Math.round(value),
  ),
  intensity: rating,
  fatigue_level: rating,
  comment: optionalText(2000),

  // ランニング
  distance_km: optionalNumber(500, '500km以内で入力してください。'),
  heart_rate_avg: optionalNumber(300, '300以内で入力してください。').transform((value) =>
    value === null ? null : Math.round(value),
  ),
  rep_count: optionalNumber(1000, '1000以内で入力してください。').transform((value) =>
    value === null ? null : Math.round(value),
  ),

  // 自主練
  skill_theme: optionalText(200),
  outcome: optionalText(2000),

  visibility: z.enum(['private', 'staff', 'team']),
});

export type TrainingRecordInput = z.infer<typeof trainingRecordSchema>;

/** ウェイトの1種目ぶん。 */
export const weightExerciseSchema = z.object({
  name: z.string().min(1).max(100),
  weight_kg: optionalNumber(999, '999kg以内で入力してください。'),
  reps: optionalNumber(999, '999回以内で入力してください。').transform((value) =>
    value === null ? null : Math.round(value),
  ),
  set_count: optionalNumber(20, '20セット以内で入力してください。').transform((value) =>
    value === null ? null : Math.round(value),
  ),
});

export type WeightExerciseSchemaInput = z.infer<typeof weightExerciseSchema>;
