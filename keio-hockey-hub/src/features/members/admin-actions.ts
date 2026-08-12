'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isPermission, ROLE_LABELS, type Permission } from '@/lib/auth/permissions';
import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 役割と個別権限の変更（13章・63章）。
 *
 * 守ること:
 *   * 変えられるのは管理者だけ
 *   * 自分の役割は自分で変えない（昇格も、うっかりの降格も防ぐ）
 *   * 最後の管理者を締め出さない
 *
 * これらは 0018 のトリガでも守っている。ここで弾くのは、
 * 「なぜできないか」を利用者に伝えるため（75章）。
 */

export interface MemberAdminState {
  error?: string;
  success?: string;
}

const roleSchema = z.object({
  team_member_id: z.guid('対象が正しくありません。'),
  role_code: z.enum(['system_admin', 'coach', 'manager', 'player'], {
    message: '役割を選んでください。',
  }),
});

const permissionSchema = z.object({
  team_member_id: z.guid('対象が正しくありません。'),
  permission_code: z.string().refine(isPermission, '権限が正しくありません。'),
  /** 'grant' 付与 / 'revoke' 剥奪 / 'reset' 役割どおりに戻す */
  mode: z.enum(['grant', 'revoke', 'reset'], { message: '操作が正しくありません。' }),
});

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** 役割を変える。 */
export async function changeMemberRole(
  _prevState: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const session = await requireSession();

  if (session.role !== 'system_admin') {
    return { error: '役割を変えられるのは管理者だけです。' };
  }

  const parsed = roleSchema.safeParse({
    team_member_id: text(formData, 'team_member_id') ?? '',
    role_code: text(formData, 'role_code') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  if (input.team_member_id === session.teamMemberId) {
    return { error: '自分の役割は変えられません。他の管理者に頼んでください。' };
  }

  const supabase = await createClient();

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role_code, status')
    .eq('team_id', session.teamId)
    .eq('id', input.team_member_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!member) return { error: '対象の部員が見つかりません。' };
  if (member.role_code === input.role_code) {
    return { success: '変更はありませんでした。' };
  }

  // 最後の管理者を降ろそうとしていないか。
  // トリガでも止まるが、ここで数えたほうが理由を伝えられる。
  if (member.role_code === 'system_admin' && input.role_code !== 'system_admin') {
    const { count } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', session.teamId)
      .eq('role_code', 'system_admin')
      .eq('status', 'active')
      .is('deleted_at', null);

    if ((count ?? 0) <= 1) {
      return { error: '最後の管理者です。先に別の管理者を決めてください。' };
    }
  }

  const { error } = await supabase
    .from('team_members')
    .update({ role_code: input.role_code })
    .eq('id', input.team_member_id);

  if (error) return { error: `変更できませんでした: ${error.message}` };

  // 監査ログはトリガが残す（0018）
  revalidatePath('/members');
  revalidatePath(`/members/${input.team_member_id}`);

  return { success: `役割を「${ROLE_LABELS[input.role_code]}」にしました。` };
}

/**
 * 個別権限の付け外し（13章）。
 *
 * 役割の既定を、この人だけ変えたいときに使う。
 * 「戻す」を選ぶと行ごと消して、役割どおりの扱いに戻る。
 */
export async function changeMemberPermission(
  _prevState: MemberAdminState,
  formData: FormData,
): Promise<MemberAdminState> {
  const session = await requireSession();

  if (session.role !== 'system_admin') {
    return { error: '権限を変えられるのは管理者だけです。' };
  }

  const parsed = permissionSchema.safeParse({
    team_member_id: text(formData, 'team_member_id') ?? '',
    permission_code: text(formData, 'permission_code') ?? '',
    mode: text(formData, 'mode') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const permission = input.permission_code as Permission;

  const supabase = await createClient();

  // 別チームの部員を触らせない
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('team_id', session.teamId)
    .eq('id', input.team_member_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!member) return { error: '対象の部員が見つかりません。' };

  if (input.mode === 'reset') {
    const { error } = await supabase
      .from('member_permissions')
      .delete()
      .eq('team_member_id', input.team_member_id)
      .eq('permission_code', permission);

    if (error) return { error: `戻せませんでした: ${error.message}` };

    revalidatePath(`/members/${input.team_member_id}`);
    return { success: '役割どおりの扱いに戻しました。' };
  }

  const granted = input.mode === 'grant';

  const { data: existing } = await supabase
    .from('member_permissions')
    .select('id')
    .eq('team_member_id', input.team_member_id)
    .eq('permission_code', permission)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from('member_permissions').update({ granted }).eq('id', existing.id)
    : await supabase.from('member_permissions').insert({
        team_member_id: input.team_member_id,
        permission_code: permission,
        granted,
        granted_by: session.profileId,
      });

  if (error) return { error: `変更できませんでした: ${error.message}` };

  revalidatePath(`/members/${input.team_member_id}`);
  return { success: granted ? 'この人に付与しました。' : 'この人から外しました。' };
}
