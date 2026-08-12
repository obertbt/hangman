import { z } from 'zod';

import { extractYouTubeVideoId } from '@/lib/video/youtube';
import { parseTimecodeToSeconds } from '@/lib/storage/validation';

/**
 * 動画登録・仮想クリップ・質問投稿の入力検証（18章・25章・26章）。
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

/**
 * YouTube の URL または動画ID。
 *
 * 利用者は URL を貼るだけでよい。どの形でも動画IDに直す。
 * 直せなければ、何を貼ればよいか分かる文言で断る。
 */
export const youtubeSourceSchema = z
  .string()
  .min(1, 'YouTube の URL を貼り付けてください。')
  .transform((value, ctx) => {
    const videoId = extractYouTubeVideoId(value);
    if (!videoId) {
      ctx.addIssue({
        code: 'custom',
        message:
          'YouTube の URL として読み取れません。動画ページの URL（https://www.youtube.com/watch?v=... など）を貼り付けてください。',
      });
      return z.NEVER;
    }
    return videoId;
  });

/**
 * 動画の長さ。
 *
 * MVP では YouTube API を呼ばないので人が入力する（24章）。
 * 「1:02:03」でも「3723」でも受け取れるようにして、負担を減らす。
 */
export const durationSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    const raw = value?.trim() ?? '';
    if (raw === '') return null;

    const seconds = parseTimecodeToSeconds(raw);
    if (seconds === null || seconds <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: '動画の長さは「1:02:03」または秒数で入力してください。',
      });
      return z.NEVER;
    }
    if (seconds > 12 * 60 * 60) {
      ctx.addIssue({ code: 'custom', message: '動画の長さが12時間を超えています。' });
      return z.NEVER;
    }
    return seconds;
  });

export const registerVideoSchema = z.object({
  source: youtubeSourceSchema,
  title: z.string().min(1, 'タイトルを入力してください。').max(200),
  description: optionalText(2000),
  duration: durationSchema,
  recorded_on: z
    .string()
    .optional()
    .transform((value) => {
      const raw = value?.trim() ?? '';
      return raw === '' ? null : raw;
    })
    .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: '撮影日の形式が正しくありません。',
    }),
  event_id: z
    .string()
    .optional()
    .transform((value) => {
      const raw = value?.trim() ?? '';
      return raw === '' ? null : raw;
    }),
  visibility: z.enum(['private_staff', 'selected_members', 'team']),
});

export type RegisterVideoInput = z.infer<typeof registerVideoSchema>;

/**
 * 仮想クリップの範囲。
 * 「12:34」のようなタイムコードで受け取る（18章の例に合わせる）。
 */
const timecode = (label: string) =>
  z.string().transform((value, ctx) => {
    const seconds = parseTimecodeToSeconds(value);
    if (seconds === null || seconds < 0) {
      ctx.addIssue({
        code: 'custom',
        message: `${label}は「12:34」の形か、秒数で入力してください。`,
      });
      return z.NEVER;
    }
    return seconds;
  });

export const createClipSchema = z
  .object({
    video_id: z.guid('動画が選ばれていません。'),
    start: timecode('開始位置'),
    end: timecode('終了位置'),
    title: optionalText(200),
    description: optionalText(1000),
  })
  .refine((value) => value.end > value.start, {
    message: '終了位置は開始位置より後にしてください。',
    path: ['end'],
  });

export type CreateClipInput = z.infer<typeof createClipSchema>;

/** 26章の質問テンプレート。 */
export const questionTypeSchema = z.enum([
  'judgement',
  'play_choice',
  'technique',
  'positioning',
  'defense_priority',
  'attack_positioning',
  'skill_application',
  'other',
]);

export const askQuestionSchema = z.object({
  video_id: z.guid(),
  video_clip_id: z.guid().nullable().optional(),
  question_type: questionTypeSchema,
  question: z.string().min(1, '質問の内容を入力してください。').max(2000, '長すぎます（2000文字まで）'),
  // 29章: 初期値は private_staff。コーチが勝手に team へ上げられない。
  visibility: z.enum(['private_staff', 'selected_members', 'team']),
  assigned_coach_id: z
    .string()
    .optional()
    .transform((value) => {
      const raw = value?.trim() ?? '';
      return raw === '' ? null : raw;
    }),
});

export type AskQuestionInput = z.infer<typeof askQuestionSchema>;
