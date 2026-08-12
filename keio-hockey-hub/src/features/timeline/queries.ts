import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { todayInTokyo } from '@/lib/datetime';
import type { EventRow, SeasonRow, WeekRow } from '@/types/database.types';

/**
 * 時間軸（シーズン → 週 → イベント）の取得。
 *
 * UI から Supabase を直接触らせない。読み取りはここに集める（75章）。
 * RLS が効いているので、ここで team_id を足し忘れても他チームは見えない。
 * ただし「見えないこと」に頼らず、明示的に team_id で絞る。
 */

export async function getActiveSeason(teamId: string): Promise<SeasonRow | null> {
  const supabase = await createClient();
  const today = todayInTokyo();

  // 今日を含むシーズンを優先し、無ければ status=active の最新を使う。
  const { data: current } = await supabase
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .lte('start_date', today)
    .gte('end_date', today)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (current) return current;

  const { data: fallback } = await supabase
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback ?? null;
}

export async function listSeasons(teamId: string): Promise<SeasonRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  return data ?? [];
}

/** 今日を含む週。無ければ null（週がまだ作られていない）。 */
export async function getCurrentWeek(teamId: string, dateOnly = todayInTokyo()): Promise<WeekRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .lte('start_date', dateOnly)
    .gte('end_date', dateOnly)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function listWeeks(teamId: string, seasonId: string): Promise<WeekRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .eq('season_id', seasonId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  return data ?? [];
}

export async function listEventsOnDate(teamId: string, dateOnly: string): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId)
    .eq('event_date', dateOnly)
    .is('deleted_at', null)
    .order('start_time', { ascending: true, nullsFirst: false });
  return data ?? [];
}

/** 指定日より後の予定を、近い順に。 */
export async function listUpcomingEvents(teamId: string, afterDate: string, limit = 5): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId)
    .gt('event_date', afterDate)
    .is('deleted_at', null)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function listEventsInRange(
  teamId: string,
  startDate: string,
  endDate: string,
): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .is('deleted_at', null)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: false });
  return data ?? [];
}

export async function getEvent(teamId: string, eventId: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId)
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}

export async function getWeek(teamId: string, weekId: string): Promise<WeekRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('weeks')
    .select('*')
    .eq('team_id', teamId)
    .eq('id', weekId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}
