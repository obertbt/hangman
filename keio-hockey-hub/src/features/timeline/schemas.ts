import { z } from 'zod';

/**
 * シーズン・週・イベントの入力検証（7〜9章）。
 * 日付は 'YYYY-MM-DD' の文字列として扱う（date 型はタイムゾーンを持たない）。
 */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付を選んでください。')
  .refine((value) => !Number.isNaN(Date.parse(value)), '日付として正しくありません。');

const timeOnly = z
  .string()
  .regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません。')
  .optional()
  .or(z.literal(''));

export const seasonSchema = z
  .object({
    name: z.string().min(1, 'シーズン名を入力してください。').max(100),
    fiscal_year: z.coerce.number().int().min(1900).max(2200),
    start_date: dateOnly,
    end_date: dateOnly,
    goal: z.string().max(2000).optional(),
    theme: z.string().max(200).optional(),
    status: z.enum(['planning', 'active', 'completed', 'archived']),
    is_published: z.boolean(),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: '終了日は開始日より後にしてください。',
    path: ['end_date'],
  });

export type SeasonInput = z.infer<typeof seasonSchema>;

export const weekSchema = z
  .object({
    // z.uuid() は RFC 9562 のバージョン・バリアントのビットまで見るため、
    // 手で作った読みやすい ID（seed の 1111...-1111 など）を弾いてしまう。
    // ここで見たいのは「UUID の形をした自分のDBの識別子か」だけなので guid を使う。
    season_id: z.guid('シーズンを選んでください。'),
    start_date: dateOnly,
    end_date: dateOnly,
    theme: z.string().max(200).optional(),
    focus_task: z.string().max(1000).optional(),
    key_skill: z.string().max(200).optional(),
    tactical_theme: z.string().max(200).optional(),
    weekly_message: z.string().max(2000).optional(),
    carried_over_task: z.string().max(1000).optional(),
    is_published: z.boolean(),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: '終了日は開始日より後にしてください。',
    path: ['end_date'],
  });

export type WeekInput = z.infer<typeof weekSchema>;

export const eventSchema = z
  .object({
    title: z.string().min(1, 'タイトルを入力してください。').max(200),
    event_date: dateOnly,
    start_time: timeOnly,
    end_time: timeOnly,
    location: z.string().max(200).optional(),
    event_type: z.enum(['practice', 'match', 'meeting', 'measurement', 'training', 'rest', 'other']),
    purpose: z.string().max(1000).optional(),
    theme: z.string().max(200).optional(),
    menu: z.string().max(4000).optional(),
    items_to_bring: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
    is_published: z.boolean(),
  })
  .refine(
    (value) => {
      if (!value.start_time || !value.end_time) return true;
      return value.end_time > value.start_time;
    },
    { message: '終了時刻は開始時刻より後にしてください。', path: ['end_time'] },
  );

export type EventInput = z.infer<typeof eventSchema>;

/** 空文字を null にする。フォームからは空文字で届くため。 */
export function emptyToNull(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
