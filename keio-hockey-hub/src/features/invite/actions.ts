'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { translateAuthError } from '@/features/auth/errors';
import { isStaff, requireSession } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';

import { createInvitationToken, expiresAtFrom, hashToken, invitationUrl, looksLikeToken } from './lib/token';

/**
 * 招待の発行と受け取り（Phase 1 の積み残し）。
 *
 * 守ること:
 *   * 生のトークンを DB に残さない。返すのは1回だけ
 *   * 選手以外を招待できるのは管理者だけ（0021 のトリガでも守る）
 *   * 受け取り側はまだ部員でないので、RLS では守れない。関数を通す
 */

export interface InviteState {
  error?: string;
  success?: string;
  /** 発行できたときだけ入る。**この1回しか表示できない。** */
  link?: string;
}

const createSchema = z.object({
  email: z.email('メールアドレスの形を確認してください。'),
  role_code: z.enum(['system_admin', 'coach', 'manager', 'player'], {
    message: '役割を選んでください。',
  }),
  /** 移行で登録済みの部員に結び付けるなら、その id。 */
  team_member_id: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .refine((value) => value === null || z.guid().safeParse(value).success, {
      message: '対象が正しくありません。',
    }),
});

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/**
 * 招待を作る。
 *
 * リンクはここで一度だけ返す。DB にはハッシュしか残らないので、
 * 閉じたら二度と見られない。無くしたら作り直す。
 */
export async function createInvitation(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireSession();

  if (!isStaff(session)) {
    return { error: '招待を作れるのはスタッフだけです。' };
  }

  const parsed = createSchema.safeParse({
    email: text(formData, 'email') ?? '',
    role_code: text(formData, 'role_code') ?? 'player',
    team_member_id: text(formData, 'team_member_id') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  // 0021 のトリガでも守っているが、ここで弾いたほうが理由を伝えられる
  if (input.role_code !== 'player' && session.role !== 'system_admin') {
    return { error: '選手以外を招待できるのは管理者だけです。' };
  }

  const supabase = await createClient();

  if (input.team_member_id) {
    const { data: member } = await supabase
      .from('team_members')
      .select('id, profile_id, profiles(user_id)')
      .eq('team_id', session.teamId)
      .eq('id', input.team_member_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!member) return { error: 'その部員は見つかりません。' };

    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    if (profile?.user_id) {
      return { error: 'この部員はすでにログインできます。招待は要りません。' };
    }
  }

  const { token, tokenHash } = createInvitationToken();

  const { error } = await supabase.from('team_invitations').insert({
    team_id: session.teamId,
    team_member_id: input.team_member_id,
    email: input.email,
    role_code: input.role_code,
    token_hash: tokenHash,
    invited_by: session.profileId,
    expires_at: expiresAtFrom(),
  });

  if (error) return { error: `招待を作れませんでした: ${error.message}` };

  revalidatePath('/admin/invitations');

  return {
    success: 'リンクを作りました。この画面を閉じると二度と表示できません。',
    link: invitationUrl(env.NEXT_PUBLIC_APP_URL, token),
  };
}

/** 招待を取り消す。渡したリンクを無効にしたいとき。 */
export async function revokeInvitation(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireSession();

  if (!isStaff(session)) {
    return { error: '招待を取り消せるのはスタッフだけです。' };
  }

  const id = text(formData, 'invitation_id') ?? '';
  if (!z.guid().safeParse(id).success) return { error: '対象が正しくありません。' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('team_invitations')
    .delete()
    .eq('id', id)
    .eq('team_id', session.teamId);

  if (error) return { error: `取り消せませんでした: ${error.message}` };

  revalidatePath('/admin/invitations');
  return { success: '招待を取り消しました。リンクは使えなくなります。' };
}

const acceptSchema = z.object({
  token: z.string().refine(looksLikeToken, 'リンクが正しくありません。'),
  full_name: z.string().trim().max(100).optional(),
  password: z.string().min(8, 'パスワードは8文字以上にしてください。').max(200),
});

/**
 * 招待を受ける。
 *
 * 認証利用者を作るのは、ここでしかできない（Supabase Auth の管理APIが要る）。
 * ADR-0003 と同じ考え方で、使う場所を1か所に閉じ、前後を固める。
 *
 *   1. 招待が使えるかを先に確かめる（無駄な利用者を作らない）
 *   2. 利用者を作る
 *   3. 部員に結び付ける（0021 の関数。ここでも期限と使用済みを見る）
 *   4. 3 が失敗したら、作った利用者を消して元に戻す
 */
export async function acceptInvitation(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  const parsed = acceptSchema.safeParse({
    token: text(formData, 'token') ?? '',
    full_name: text(formData, 'full_name'),
    password: text(formData, 'password') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const tokenHash = hashToken(input.token);

  const supabase = await createClient();

  const { data: found } = await supabase.rpc('find_invitation', { p_token_hash: tokenHash });
  const invitation = found?.[0];

  if (!invitation) return { error: 'この招待リンクは使えません。' };
  if (invitation.accepted_at) return { error: 'この招待リンクはすでに使われています。' };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { error: 'この招待リンクは期限が切れています。' };
  }

  // 2. 認証利用者を作る。ここだけ service role を使う。
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: input.password,
    // 招待リンクを開けている時点でメールは届いている
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: translateAuthError(createError?.message ?? '登録できませんでした。') };
  }

  // 3. 部員に結び付ける
  const { error: linkError } = await supabase.rpc('accept_invitation', {
    p_token_hash: tokenHash,
    p_user_id: created.user.id,
    p_full_name: input.full_name ?? '',
  });

  if (linkError) {
    // 4. 中途半端な利用者を残さない
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: linkError.message };
  }

  // そのままログインさせる。もう一度パスワードを入れさせない。
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: input.password,
  });

  if (signInError) {
    // 登録は済んでいるので、ログイン画面へ送れば入れる
    redirect('/login?registered=1');
  }

  redirect('/today');
}
