import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { ImportSessionRow } from '@/types/database.types';

import type { ExistingMember } from './lib/matching';

/**
 * 照合に使う既存の名簿を取る（42章）。
 *
 * 卒業・退部した選手も含める。
 * 過去データを移行する時、対象は「今いる選手」だけではないため。
 */
export async function listExistingMembers(teamId: string): Promise<ExistingMember[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('team_members')
    .select(
      'id, profile_id, grade, admission_year, position, external_source, external_id, profiles(full_name, email)',
    )
    .eq('team_id', teamId)
    .is('deleted_at', null);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      teamMemberId: row.id,
      profileId: row.profile_id,
      fullName: readString(profile, 'full_name') ?? '',
      email: readString(profile, 'email'),
      externalSource: row.external_source,
      externalId: row.external_id,
      grade: row.grade,
      admissionYear: row.admission_year,
      position: row.position,
    };
  });
}

function readString(record: unknown, key: string): string | null {
  if (record && typeof record === 'object' && key in record) {
    const value = (record as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

export async function listImportSessions(teamId: string, limit = 20): Promise<ImportSessionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('import_sessions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getImportSession(teamId: string, id: string): Promise<ImportSessionRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('import_sessions')
    .select('*')
    .eq('team_id', teamId)
    .eq('id', id)
    .maybeSingle();
  return data ?? null;
}
