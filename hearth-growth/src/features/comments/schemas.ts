import { z } from 'zod';

import { uuidSchema } from '@/lib/validations/common';

export const createCommentSchema = z.object({
  postId: uuidSchema,
  body: z
    .string()
    .trim()
    .min(1, 'コメントを入力してください')
    .max(2000, 'コメントは2000文字以内にしてください'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export interface CommentView {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  isHidden: boolean;
  isMine: boolean;
  /** 自分が投稿者かどうか。非表示・削除の操作を出すかの判断に使う。 */
  canModerate: boolean;
}
