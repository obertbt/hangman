import { z } from 'zod';

import { uuidSchema } from '@/lib/validations/common';

export const startSessionSchema = z.object({
  categoryId: uuidSchema,
  title: z.string().trim().max(100, '活動タイトルは100文字以内にしてください'),
  note: z.string().trim().max(1000, 'メモは1000文字以内にしてください'),
});

export const sessionIdSchema = z.object({ sessionId: uuidSchema });

export const completeSessionSchema = z.object({
  sessionId: uuidSchema,
  /**
   * 終了時刻の修正（13.4）。
   * 長時間放置されたタイマーを、実際に終えた時刻へ直すために使う。
   * 省略した場合はサーバーの現在時刻で確定する。
   */
  endedAt: z
    .string()
    .datetime({ offset: true, message: '終了時刻の形式が正しくありません' })
    .nullable()
    .optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
