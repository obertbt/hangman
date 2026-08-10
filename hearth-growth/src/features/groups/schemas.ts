import { z } from 'zod';

import { groupRoleSchema, uuidSchema } from '@/lib/validations/common';

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'グループ名を入力してください')
  .max(50, 'グループ名は50文字以内にしてください');

export const groupDescriptionSchema = z.string().trim().max(500, '説明は500文字以内にしてください');

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

/**
 * URL から受け取った招待トークンをそろえる。
 *
 * 2つの事情を吸収する。
 *
 *   * Next.js は経路の `=` を復号せず `%3D` のまま渡す。
 *     `%2D` は `-` に復号されるのに `=` はされない、という非対称がある。
 *   * 0011 より前に発行したトークンは base64 の詰め物（末尾の `=`）を持つ。
 *     DB 側も詰め物を落としてそろえたので、受け取り側でも同じように落とす。
 *
 * これで、すでに配ってしまった `=` 付きのリンクもそのまま使える。
 */
export function normalizeInvitationToken(raw: string): string {
  let value = raw.trim();

  // 二重に符号化されて届くこともあるため、変化しなくなるまで戻す
  for (let i = 0; i < 3 && value.includes('%'); i += 1) {
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) break;
      value = decoded;
    } catch {
      // 壊れた符号化はここで諦める。あとの形式検査が弾く。
      break;
    }
  }

  return value.trim().replace(/=+$/, '');
}

/** 招待トークン。詰め物を落としたあとの base64url の文字だけを受け付ける。 */
export const invitationTokenSchema = z
  .string()
  .transform(normalizeInvitationToken)
  .pipe(
    z
      .string()
      .min(20, '招待リンクが正しくありません')
      .max(128, '招待リンクが正しくありません')
      .regex(/^[A-Za-z0-9_-]+$/, '招待リンクが正しくありません'),
  );

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type MemberTargetInput = z.infer<typeof memberTargetSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const INVITATION_DEFAULTS = { expiresInDays: 7, maxUses: 10 } as const;
