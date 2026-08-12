import { z } from 'zod';

/**
 * スキル申請の入力検証（32章）。
 *
 * UUID は z.guid() を使う。z.uuid() は RFC 9562 の版とバリアントまで見るため、
 * seed で使っている読みやすい UUID（1111...）を弾いてしまう。
 */

const uuid = z.guid('選択内容が正しくありません。');

/** 空文字は「選ばなかった」と同じ扱いにする。 */
const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .refine((value) => value === null || z.guid().safeParse(value).success, {
    message: '選択内容が正しくありません。',
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください。`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

export const skillApplicationSchema = z.object({
  skill_id: uuid,
  comment: optionalText(2000),
  /** 根拠として選んだもの。0件でも出せる（言葉だけの申請も認める）。 */
  video_ids: z.array(uuid).max(10, '動画は10件までにしてください。').default([]),
  video_clip_ids: z.array(uuid).max(10, '場面は10件までにしてください。').default([]),
  feedback_request_ids: z.array(uuid).max(10, '質問は10件までにしてください。').default([]),
  evidence_note: optionalText(1000),
});

export type SkillApplicationInput = z.infer<typeof skillApplicationSchema>;

export const skillApplicationActionSchema = z.object({
  application_id: uuid,
  action: z.enum(['submit', 'start_review', 'withdraw'], {
    message: 'その操作はできません。',
  }),
});

export const skillReviewSchema = z.object({
  application_id: uuid,
  decision: z.enum(['approve', 'need_more', 'reject'], { message: 'その判断はできません。' }),
  comment: optionalText(2000),
});

/** 回答から申請へ渡すときの下ごしらえ（32章の導線）。 */
export const applyFromFeedbackSchema = z.object({
  feedback_request_id: uuid,
  skill_id: optionalUuid,
});
