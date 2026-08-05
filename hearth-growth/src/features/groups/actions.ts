'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { GENERIC_ERROR_MESSAGE } from '@/features/auth/errors';
import { toGroupErrorMessage, toInvitationErrorMessage } from '@/features/groups/errors';
import {
  createGroupSchema,
  createInvitationSchema,
  invitationTokenSchema,
  memberTargetSchema,
  updateGroupSchema,
  updateMemberRoleSchema,
  type CreateGroupInput,
  type CreateInvitationInput,
  type MemberTargetInput,
  type UpdateGroupInput,
  type UpdateMemberRoleInput,
} from '@/features/groups/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';

/**
 * グループ操作。
 *
 * 権限（owner / admin / member）の判定は RLS と RPC が行う。
 * ここでの分岐は、失敗したときに分かりやすい文言を返すためのもの。
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createGroupAction(input: CreateGroupInput): Promise<ActionResult<string>> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  // グループ作成と owner 登録を1トランザクションで行う
  const { data: groupId, error } = await supabase.rpc('create_group', {
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
  });

  if (error || !groupId) {
    console.error('createGroupAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath('/groups');
  return ok(groupId);
}

export async function updateGroupAction(input: UpdateGroupInput): Promise<ActionResult> {
  const parsed = updateGroupSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('groups')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq('id', parsed.data.groupId);

  if (error) {
    console.error('updateGroupAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  revalidatePath('/groups');
  return ok();
}

/** 招待リンクを発行する。トークンは DB 側で 32byte の乱数から作る。 */
export async function createInvitationAction(
  input: CreateInvitationInput,
): Promise<ActionResult<{ token: string }>> {
  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('group_invitations')
    .insert({
      group_id: parsed.data.groupId,
      invited_by: user.id,
      expires_at: expiresAt,
      max_uses: parsed.data.maxUses,
    })
    .select('token')
    .single();

  if (error || !data) {
    console.error('createInvitationAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  return ok({ token: data.token });
}

/** 招待リンクを無効化する。行は消さず revoked_at を立てる。 */
export async function revokeInvitationAction(groupId: string, invitationId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('group_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('group_id', groupId);

  if (error) {
    console.error('revokeInvitationAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath(`/groups/${groupId}`);
  return ok();
}

/** 招待リンクからグループへ参加する。 */
export async function acceptInvitationAction(token: string): Promise<ActionResult<string>> {
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message);
  }

  const { supabase, user } = await requireUser();
  if (!user) return fail('参加するにはログインが必要です。');

  // 期限・失効・利用上限の検証と used_count の加算は関数内で原子的に行う
  const { data: groupId, error } = await supabase.rpc('accept_invitation', { p_token: parsed.data });

  if (error || !groupId) {
    return fail(toInvitationErrorMessage(error));
  }

  revalidatePath('/groups');
  return ok(groupId);
}

export async function removeMemberAction(input: MemberTargetInput): Promise<ActionResult> {
  const parsed = memberTargetSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', parsed.data.userId);

  if (error) {
    console.error('removeMemberAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  return ok();
}

export async function updateMemberRoleAction(input: UpdateMemberRoleInput): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { error } = await supabase
    .from('group_members')
    .update({ role: parsed.data.role })
    .eq('group_id', parsed.data.groupId)
    .eq('user_id', parsed.data.userId);

  if (error) {
    console.error('updateMemberRoleAction failed', error);
    return fail(toGroupErrorMessage(error));
  }

  revalidatePath(`/groups/${parsed.data.groupId}`);
  return ok();
}

/**
 * グループから退会する。
 * owner は退会できない（RLS が拒否する）。先に所有者を移すか、グループを削除する。
 */
export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return fail('ログインの有効期限が切れました。もう一度ログインしてください。');

  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membership?.role === 'owner') {
    return fail('作成者はこのグループから退会できません。');
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id);

  if (error) {
    console.error('leaveGroupAction failed', error);
    return fail(GENERIC_ERROR_MESSAGE);
  }

  revalidatePath('/groups');
  redirect('/groups');
}
