import { z } from 'zod';

import {
  dateStringSchema,
  durationSecondsSchema,
  uuidSchema,
  visibilitySchema,
} from '@/lib/validations/common';

/**
 * 公開範囲の指定。
 * group なら公開先グループ、selected なら宛先ユーザーが必須。
 * 同じ条件を DB の assert_visibility_target() でも検証している。
 */
export const visibilityTargetSchema = z
  .object({
    visibility: visibilitySchema,
    /** group 公開の宛先。1つの記録を複数のグループへ出せる。 */
    groupIds: z.array(uuidSchema).max(20).optional(),
    allowedUserIds: z.array(uuidSchema).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    const groupIds = value.groupIds ?? [];
    if (value.visibility === 'group' && groupIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['groupIds'],
        message: '公開するグループを選んでください',
      });
    }
    if (value.visibility !== 'group' && groupIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['groupIds'],
        message: 'この公開範囲ではグループを指定できません',
      });
    }
    if (value.visibility === 'selected' && (value.allowedUserIds ?? []).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['allowedUserIds'],
        message: '見せる相手を1人以上選んでください',
      });
    }
  });

const contentFields = {
  title: z.string().trim().max(100, '活動タイトルは100文字以内にしてください'),
  body: z.string().trim().max(5000, '振り返りは5000文字以内にしてください'),
};

/** タイマー由来の記録。活動時間はセッションから取るので受け取らない。 */
export const createFromSessionSchema = z
  .object({ sessionId: uuidSchema, ...contentFields })
  .and(visibilityTargetSchema);

/** 手動記録。 */
export const createManualSchema = z
  .object({
    categoryId: uuidSchema,
    durationSeconds: durationSecondsSchema.refine((value) => value > 0, '活動時間を入力してください'),
    activityDate: dateStringSchema,
    ...contentFields,
  })
  .and(visibilityTargetSchema);

export const updateActivitySchema = z
  .object({
    postId: uuidSchema,
    /** タイマー由来の記録では無視される（DB 側が据え置く）。 */
    durationSeconds: durationSecondsSchema.optional(),
    activityDate: dateStringSchema.optional(),
    ...contentFields,
  })
  .and(visibilityTargetSchema);

/**
 * 「自分だけ」の記録をまとめてグループへ公開する。
 *
 * 公開範囲を広げる操作なので、対象は明示的に絞る。
 * 動かすのは `private` のものだけで、`selected` には触れない
 * （宛先を選んである記録を、本人の意図を越えて広げないため）。
 */
export const sharePrivateActivitiesSchema = z.object({
  groupIds: z.array(uuidSchema).min(1, '公開するグループを選んでください').max(20),
  /** 画面に出した件数。こことずれていたら実行しない。 */
  expectedCount: z.number().int().min(1).max(1000),
});

export type SharePrivateActivitiesInput = z.infer<typeof sharePrivateActivitiesSchema>;

export type CreateFromSessionInput = z.infer<typeof createFromSessionSchema>;
export type CreateManualInput = z.infer<typeof createManualSchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

/** 時間 + 分の入力を秒に直す。手動記録の入力欄で使う。 */
export function toDurationSeconds(hours: number, minutes: number): number {
  const safeHours = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return safeHours * 3600 + safeMinutes * 60;
}

/** 秒を時間 + 分に戻す。編集画面の初期値に使う。 */
export function fromDurationSeconds(seconds: number): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
