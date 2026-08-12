import { z } from 'zod';

/**
 * コーチの回答（28章）と、その後のやり取りの入力検証。
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

const optionalId = z
  .string()
  .optional()
  .transform((value) => {
    const raw = value?.trim() ?? '';
    return raw === '' ? null : raw;
  });

/**
 * 28章の構造化された回答。
 *
 * 必須は「結論」だけにしている。
 * 全部埋めないと出せないようにすると、忙しいコーチは回答そのものを後回しにする。
 * 結論ひとことでも返ってくるほうが、選手にとっては価値がある。
 */
export const feedbackResponseSchema = z.object({
  feedback_request_id: z.guid(),
  conclusion: z
    .string()
    .min(1, '結論を入力してください。ひとことで構いません。')
    .max(2000, '長すぎます（2000文字まで）'),
  positive_points: optionalText(2000),
  improvement_points: optionalText(2000),
  recommended_action: optionalText(2000),
  technical_correction: optionalText(2000),
  next_task: optionalText(1000),
  related_skill_id: optionalId,
  reference_video_id: optionalId,
  requires_in_person_review: z.boolean(),
  suggests_team_share: z.boolean(),
});

export type FeedbackResponseInput = z.infer<typeof feedbackResponseSchema>;

/** 再質問（56章）。 */
export const feedbackMessageSchema = z.object({
  feedback_request_id: z.guid(),
  body: z.string().min(1, '内容を入力してください。').max(2000, '長すぎます（2000文字まで）'),
  message_type: z.enum(['comment', 'follow_up_question']),
});

export type FeedbackMessageInput = z.infer<typeof feedbackMessageSchema>;

/** 状態を進める操作。 */
export const feedbackActionSchema = z.object({
  feedback_request_id: z.guid(),
  action: z.enum(['assign', 'start_review', 'answer', 'acknowledge', 'follow_up', 'close', 'withdraw']),
});

/** チーム共有の提案（29章）。 */
export const shareRequestSchema = z.object({
  feedback_request_id: z.guid(),
  target_visibility: z.enum(['selected_members', 'team']),
  reason: optionalText(1000),
});

/** 共有提案への返事。承認できるのは質問した本人だけ。 */
export const shareDecisionSchema = z.object({
  share_request_id: z.guid(),
  decision: z.enum(['approved', 'rejected']),
});
