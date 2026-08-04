import { z } from 'zod';

/**
 * 各フェーズの入力スキーマが共通して使う部品。
 * サーバー側の入力検証は必ずここを通す（20章）。
 */

export const uuidSchema = z.string().uuid('不正な ID です');

export const visibilitySchema = z.enum(['private', 'group', 'selected'], {
  message: '公開範囲を選んでください',
});

export const sessionStatusSchema = z.enum(['running', 'paused', 'completed', 'cancelled']);

export const reactionTypeSchema = z.enum(['cheer', 'good_job', 'amazing', 'together', 'streak']);

export const groupRoleSchema = z.enum(['owner', 'admin', 'member']);

/** YYYY-MM-DD */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください');

/** IANA タイムゾーン名。実在するかどうかは Intl に判定させる。 */
export const timezoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'タイムゾーンの指定が正しくありません');

/** 1日を超える活動時間は入力ミスとして扱う。 */
export const durationSecondsSchema = z
  .number()
  .int('秒数は整数で指定してください')
  .min(0, '活動時間は0秒以上で指定してください')
  .max(86_400, '1回の活動時間は24時間までです');

/**
 * ユーザーが書いた文字列の前処理。
 * 前後の空白を落とし、空文字は null にそろえる（DB の nullable と噛み合わせるため）。
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();
