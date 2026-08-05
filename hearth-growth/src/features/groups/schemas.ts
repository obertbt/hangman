import { z } from 'zod';

import { groupRoleSchema, uuidSchema } from '@/lib/validations/common';

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'グループ名を入力してください')
  .max(50, 'グループ名は50文字以内にしてください');

export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(500, '説明は500文字以内にしてください');

export const createGroupSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema,
});

export const updateGroupSchema = z.object({
  groupId: uuidSchema,
  name: groupNameSchema,
  description: groupDescriptionSchema,
});

/**
 * 招待リンクの条件。
 * 期限と利用上限を必ず持たせる（20章）。既定は7日・10回。
 */
export const createInvitationSchema = z.object({
  groupId: uuidSchema,
  expiresInDays: z
    .number()
    .int()
    .min(1, '有効期限は1日以上にしてください')
    .max(30, '有効期限は30日以内にしてください'),
  maxUses: z
    .number()
    .int()
    .min(1, '利用回数は1回以上にしてください')
    .max(50, '利用回数は50回以内にしてください'),
});

export const memberTargetSchema = z.object({
  groupId: uuidSchema,
  userId: uuidSchema,
});

export const updateMemberRoleSchema = memberTargetSchema.extend({
  // owner への変更はこの操作では扱わない（所有者の移譲は将来対応）
  role: groupRoleSchema.exclude(['owner']),
});

/** 招待トークン。URL-safe base64 の文字だけを受け付ける。 */
export const invitationTokenSchema = z
  .string()
  .min(20, '招待リンクが正しくありません')
  .max(128, '招待リンクが正しくありません')
  .regex(/^[A-Za-z0-9_-]+=*$/, '招待リンクが正しくありません');

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type MemberTargetInput = z.infer<typeof memberTargetSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const INVITATION_DEFAULTS = { expiresInDays: 7, maxUses: 10 } as const;
