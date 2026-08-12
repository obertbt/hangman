import { z } from 'zod';

/**
 * 練習前コンディション・個人目標・日報の入力検証（15章・16章）。
 *
 * 入力の負担を増やしすぎない（依頼書3章の7）ため、必須は最小限にする。
 * コンディションは「調子」だけ、日報は「できたこと」だけでも出せる。
 */

/**
 * 1〜5 の段階評価。
 * 未選択は空文字で届く（ラジオボタン）。項目ごと無い場合は undefined。
 * どちらも null に倒す。段階評価は必須にしない（依頼書3章の7）。
 */
const rating = z
  .union([z.literal(''), z.coerce.number().int().min(1).max(5)])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

/** 空文字を null にする文字列。 */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `長すぎます（${max}文字まで）`)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    });

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付を選んでください。');

// -------------------------------------------------------------
// 練習前コンディション（15章）
// -------------------------------------------------------------
export const conditionSchema = z.object({
  recorded_on: dateOnly,
  event_id: z.string().nullable().optional(),
  condition_level: rating,
  fatigue_level: rating,
  sleep_hours: z
    .union([
      z.literal(''),
      z.coerce.number().min(0, '0以上で入力してください。').max(24, '24以下で入力してください。'),
    ])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  has_pain: z.boolean(),
  pain_note: optionalText(500),
  note: optionalText(1000),
});

export type ConditionInput = z.infer<typeof conditionSchema>;

// -------------------------------------------------------------
// 今日の個人目標（15章）
// -------------------------------------------------------------
export const practiceGoalSchema = z.object({
  target_date: dateOnly,
  event_id: z.string().nullable().optional(),
  goal: z.string().min(1, '今日の目標を入力してください。').max(500, '長すぎます（500文字まで）'),
  achieved: z.boolean().nullable().optional(),
  reflection: optionalText(1000),
});

export type PracticeGoalInput = z.infer<typeof practiceGoalSchema>;

// -------------------------------------------------------------
// 日報（16章）
// -------------------------------------------------------------
export const dailyReportSchema = z.object({
  report_date: dateOnly,
  event_id: z.string().nullable().optional(),

  personal_goal: optionalText(500),
  what_happened: optionalText(2000),
  what_went_well: optionalText(2000),
  what_went_wrong: optionalText(2000),
  cause: optionalText(2000),
  improvement: optionalText(2000),
  prevention: optionalText(2000),
  response_taken: optionalText(2000),
  next_action: optionalText(2000),

  self_rating: rating,
  intensity: rating,
  fatigue_level: rating,
  mood: rating,
  condition_level: rating,

  free_note: optionalText(4000),

  // 16章: 初期値は staff
  visibility: z.enum(['private', 'staff', 'team']),
  status: z.enum(['draft', 'submitted']),
});

export type DailyReportInput = z.infer<typeof dailyReportSchema>;

// -------------------------------------------------------------
// 日報へのコーチのコメント（16章）
// -------------------------------------------------------------
/**
 * コメントは短くてもいい。ひとことでも返ってくることに意味がある。
 * ただし空では出せない。空のコメントは選手には「無言の既読」に見える。
 */
export const reportCommentSchema = z.object({
  daily_report_id: z.guid('対象の日報が分かりません。'),
  body: z
    .string()
    .trim()
    .min(1, 'ひとことでいいので書いてください。')
    .max(2000, '長すぎます（2000文字まで）'),
});

export type ReportCommentInput = z.infer<typeof reportCommentSchema>;

/**
 * 提出するには最低限の中身が要る。
 * 空の日報を「提出済み」にしても、コーチにも本人にも意味がない。
 * 下書きなら空でも保存できる。
 */
export function hasEnoughToSubmit(input: DailyReportInput): boolean {
  const written = [
    input.what_happened,
    input.what_went_well,
    input.what_went_wrong,
    input.next_action,
    input.free_note,
  ];
  return written.some((value) => value !== null && value.length > 0);
}
