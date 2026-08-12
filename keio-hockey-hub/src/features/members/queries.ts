import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { MemberStatus, Position, RoleCode } from '@/types/database.types';

export interface MemberListItem {
  teamMemberId: string;
  fullName: string;
  displayName: string | null;
  furigana: string | null;
  email: string | null;
  role: RoleCode;
  status: MemberStatus;
  position: Position | null;
  jerseyNumber: number | null;
  grade: number | null;
  admissionYear: number | null;
  /** まだログインしていない（招待前）か。 */
  hasLogin: boolean;
}

/** 名簿。学年 → 背番号の順に並べる。 */
export async function listMembers(teamId: string, includeInactive = false): Promise<MemberListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('team_members')
    .select(
      'id, role_code, status, position, jersey_number, grade, admission_year, profiles(full_name, display_name, furigana, email, user_id)',
    )
    .eq('team_id', teamId)
    .is('deleted_at', null);

  if (!includeInactive) {
    query = query.eq('status', 'active');
  }

  const { data } = await query;

  const members = (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      teamMemberId: row.id,
      fullName: read(profile, 'full_name') ?? '(氏名なし)',
      displayName: read(profile, 'display_name'),
      furigana: read(profile, 'furigana'),
      email: read(profile, 'email'),
      role: row.role_code,
      status: row.status,
      position: row.position,
      jerseyNumber: row.jersey_number,
      grade: row.grade,
      admissionYear: row.admission_year,
      hasLogin: read(profile, 'user_id') !== null,
    };
  });

  return members.sort((left, right) => {
    // 学年は大きいほど上（4年 → 1年）
    const gradeDiff = (right.grade ?? 0) - (left.grade ?? 0);
    if (gradeDiff !== 0) return gradeDiff;
    const jerseyDiff = (left.jerseyNumber ?? 999) - (right.jerseyNumber ?? 999);
    if (jerseyDiff !== 0) return jerseyDiff;
    return left.fullName.localeCompare(right.fullName, 'ja');
  });
}

function read(record: unknown, key: string): string | null {
  if (record && typeof record === 'object' && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return null;
}
