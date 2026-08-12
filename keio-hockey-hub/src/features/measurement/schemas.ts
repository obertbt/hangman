import { z } from 'zod';

/**
 * 測定の入力検証。
 *
 * UUID は z.guid() を使う（z.uuid() は seed の読みやすい UUID を弾く）。
 */

const uuid = z.guid('選択内容が正しくありません。');

/** 空欄は「測っていない」。0 と区別する。 */
const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .nullable()
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
    message: '0以上の数字を入れてください。',
  })
  .refine((value) => value === null || value < 1_000_000, {
    message: '数字が大きすぎます。単位を確かめてください。',
  });

export const measurementEventSchema = z.object({
  name: z.string().trim().min(1, '測定会の名前を入れてください。').max(100),
  measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付を選んでください。'),
  note: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

export const measurementResultSchema = z.object({
  measurement_event_id: uuid,
  measurement_item_id: uuid,
  team_member_id: uuid,
  value: optionalNumber,
  note: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
});

export const measurementItemSchema = z.object({
  name: z.string().trim().min(1, '項目の名前を入れてください。').max(50),
  unit: z
    .string()
    .trim()
    .max(20)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional(),
  better: z.enum(['higher', 'lower'], { message: '良い方向を選んでください。' }),
});
