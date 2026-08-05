import { z } from 'zod';

import { dateStringSchema } from '@/lib/validations/common';

/** 目標時間は分で入力し、秒で保存する。 */
export const targetMinutesSchema = z
  .number()
  .int('目標時間は整数で指定してください')
  .min(5, '目標は5分以上にしてください')
  .max(1440, '目標は24時間までです');

export const setDailyGoalSchema = z.object({
  goalDate: dateStringSchema,
  targetMinutes: targetMinutesSchema,
  message: z.string().trim().max(200, '今日の目標は200文字以内にしてください'),
});

export const setWeeklyGoalSchema = z.object({
  weekStartDate: dateStringSchema,
  /** 週の目標は時間単位で入力する。 */
  targetHours: z
    .number()
    .int('目標時間は整数で指定してください')
    .min(1, '週の目標は1時間以上にしてください')
    .max(100, '週の目標は100時間までです'),
  message: z.string().trim().max(200, '週間テーマは200文字以内にしてください'),
});

export type SetDailyGoalInput = z.infer<typeof setDailyGoalSchema>;
export type SetWeeklyGoalInput = z.infer<typeof setWeeklyGoalSchema>;

/**
 * 進捗率（0〜100 に丸める）。目標が無いときは null。
 *
 * 100% を超えても 100 で止める。超過分を強調して、
 * もっとやらなければという気持ちにさせないため（16.1）。
 */
export function progressPercent(actualSeconds: number, targetSeconds: number | null): number | null {
  if (!targetSeconds || targetSeconds <= 0) return null;
  if (actualSeconds <= 0) return 0;
  return Math.min(100, Math.round((actualSeconds / targetSeconds) * 100));
}
