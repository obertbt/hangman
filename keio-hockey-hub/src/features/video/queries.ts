import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { FeedbackRequestRow, VideoClipRow, VideoRow } from '@/types/database.types';

/**
 * 動画とクリップの読み取り。
 *
 * どれが見えるかは RLS が決める（自分のもの / team 公開 / video.view_team を持つ人）。
 * ここでも team_id で明示的に絞り、事故を二重に防ぐ。
 */

export async function listVideos(session: AppSession, limit = 50): Promise<VideoRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('videos')
    .select('*')
    .eq('team_id', session.teamId)
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getVideo(session: AppSession, videoId: string): Promise<VideoRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('videos')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', videoId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

export async function listClips(session: AppSession, videoId: string): Promise<VideoClipRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('video_clips')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('video_id', videoId)
    .is('deleted_at', null)
    .order('start_seconds', { ascending: true });
  return data ?? [];
}

export async function getClip(session: AppSession, clipId: string): Promise<VideoClipRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('video_clips')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', clipId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

/** この動画に紐づく質問。自分のものと、見てよいものだけが返る（RLS）。 */
export async function listQuestionsForVideo(
  session: AppSession,
  videoId: string,
): Promise<FeedbackRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('video_id', videoId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/** 自分が出した質問の一覧。 */
export async function listMyQuestions(session: AppSession, limit = 30): Promise<FeedbackRequestRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('requester_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

export interface CoachOption {
  teamMemberId: string;
  name: string;
}

/** 回答してほしいコーチを選ぶための一覧。 */
export async function listCoaches(session: AppSession): Promise<CoachOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('team_members')
    .select('id, role_code, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .in('role_code', ['coach', 'system_admin'])
    .eq('status', 'active')
    .is('deleted_at', null);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { teamMemberId: row.id, name: pickName(profile) };
  });
}

function pickName(record: unknown): string {
  if (record && typeof record === 'object') {
    const display = 'display_name' in record ? (record as { display_name: unknown }).display_name : null;
    const full = 'full_name' in record ? (record as { full_name: unknown }).full_name : null;
    if (typeof display === 'string' && display !== '') return display;
    if (typeof full === 'string') return full;
  }
  return '不明';
}
