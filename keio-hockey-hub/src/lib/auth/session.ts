import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient, getCurrentUser } from '@/lib/supabase/server';
import type { Permission, PermissionOverrides } from '@/lib/auth/permissions';
import { hasPermission, isPermission, isStaffRole } from '@/lib/auth/permissions';
import type { RoleCode } from '@/types/database.types';

/**
 * ログイン中の利用者と、その所属チームでの立場。
 *
 * 画面と Server Action はここを起点にする。
 * 「権限を確認する場所」を1か所にまとめるための層（75章）。
 */
export interface AppSession {
  userId: string;
  profileId: string;
  fullName: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  teamId: string;
  teamName: string;
  teamMemberId: string;
  role: RoleCode;
  overrides: PermissionOverrides;
}

/**
 * 現在のセッションを組み立てる。まだチームに属していなければ null。
 *
 * React の cache でリクエスト内は1回だけ引く。
 * 1画面で何度も呼んでも DB アクセスは増えない。
 */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, display_name, email, avatar_url')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile) return null;

  // 在籍中の所属を1件取る。将来チームを複数持つ場合はここで選択させる。
  const { data: membership } = await supabase
    .from('team_members')
    .select('id, team_id, role_code, teams(display_name)')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: overrideRows } = await supabase
    .from('member_permissions')
    .select('permission_code, granted')
    .eq('team_member_id', membership.id);

  const overrides: PermissionOverrides = {};
  for (const row of overrideRows ?? []) {
    if (isPermission(row.permission_code)) {
      overrides[row.permission_code] = row.granted;
    }
  }

  // teams は 1対1 の埋め込みだが、型の上では配列にもなり得るため両方を受ける。
  const teamRelation = membership.teams as unknown;
  const teamName = extractTeamName(teamRelation);

  return {
    userId: user.id,
    profileId: profile.id,
    fullName: profile.full_name,
    displayName: profile.display_name ?? profile.full_name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    teamId: membership.team_id,
    teamName,
    teamMemberId: membership.id,
    role: membership.role_code,
    overrides,
  };
});

function extractTeamName(relation: unknown): string {
  if (Array.isArray(relation)) {
    const first: unknown = relation[0];
    if (first && typeof first === 'object' && 'display_name' in first) {
      const value = (first as { display_name: unknown }).display_name;
      if (typeof value === 'string') return value;
    }
    return '';
  }
  if (relation && typeof relation === 'object' && 'display_name' in relation) {
    const value = (relation as { display_name: unknown }).display_name;
    if (typeof value === 'string') return value;
  }
  return '';
}

/**
 * ログイン必須のページで使う。未ログインならログイン画面へ送る。
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

/**
 * 権限必須のページ・Server Action で使う。
 *
 * RLS でも守られているが、アプリ側でも必ず確認する（75章）。
 * RLS だけに頼ると「0件が返るだけ」で、利用者には理由が分からない。
 */
export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await requireSession();
  if (!hasPermission({ role: session.role, overrides: session.overrides }, permission)) {
    redirect('/today?denied=' + encodeURIComponent(permission));
  }
  return session;
}

/** 画面の出し分け用。リダイレクトはしない。 */
export function can(session: AppSession, permission: Permission): boolean {
  return hasPermission({ role: session.role, overrides: session.overrides }, permission);
}

export function isStaff(session: AppSession): boolean {
  return isStaffRole(session.role);
}
