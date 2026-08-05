import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { GroupInvitationRow, GroupRole, GroupRow, InvitationPreview } from '@/types/database.types';

export interface GroupSummary {
  group: Pick<GroupRow, 'id' | 'name' | 'description' | 'avatar_url'>;
  role: GroupRole;
  memberCount: number;
}

export interface GroupMemberView {
  userId: string;
  role: GroupRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface GroupDetail {
  group: GroupRow;
  myRole: GroupRole;
  members: GroupMemberView[];
  /** 管理者のときだけ中身が入る。RLS が非管理者には返さない。 */
  invitations: GroupInvitationRow[];
}

const ROLE_ORDER: Record<GroupRole, number> = { owner: 0, admin: 1, member: 2 };

/** 自分が参加しているグループの一覧。 */
export async function listMyGroups(): Promise<GroupSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: myMemberships, error } = await supabase
    .from('group_members')
    .select('role, group:groups(id, name, description, avatar_url)')
    .eq('user_id', user.id);

  if (error) {
    console.error('listMyGroups failed', error);
    return [];
  }

  const groupIds = (myMemberships ?? [])
    .map((row) => row.group?.id)
    .filter((id): id is string => Boolean(id));
  if (groupIds.length === 0) return [];

  // メンバー数はまとめて1回で取る（N+1 を避ける）
  const { data: allMembers } = await supabase
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds);

  const counts = new Map<string, number>();
  for (const row of allMembers ?? []) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return (myMemberships ?? [])
    .filter((row): row is typeof row & { group: NonNullable<typeof row.group> } => Boolean(row.group))
    .map((row) => ({
      group: row.group,
      role: row.role,
      memberCount: counts.get(row.group.id) ?? 1,
    }))
    .sort((a, b) => a.group.name.localeCompare(b.group.name, 'ja'));
}

/**
 * グループ詳細。
 * 参加していないグループは RLS が行を返さないため、null になる。
 */
export async function getGroupDetail(groupId: string): Promise<GroupDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: group } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  if (!group) return null;

  const { data: memberRows } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at, profile:profiles(display_name, avatar_url)')
    .eq('group_id', groupId);

  const members: GroupMemberView[] = (memberRows ?? [])
    .map((row) => ({
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      displayName: row.profile?.display_name ?? 'メンバー',
      avatarUrl: row.profile?.avatar_url ?? null,
    }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.localeCompare(b.joinedAt));

  const myRole = members.find((member) => member.userId === user.id)?.role;
  if (!myRole) return null;

  // 管理者以外には RLS が空配列を返す
  const { data: invitations } = await supabase
    .from('group_invitations')
    .select('*')
    .eq('group_id', groupId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  return { group, myRole, members, invitations: invitations ?? [] };
}

/** 招待リンクの内容。ログイン前でも呼べる。 */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_invitation_preview', { p_token: token });

  if (error) {
    console.error('getInvitationPreview failed', error);
    return null;
  }
  return data?.[0] ?? null;
}

export function isGroupAdmin(role: GroupRole): boolean {
  return role === 'owner' || role === 'admin';
}
