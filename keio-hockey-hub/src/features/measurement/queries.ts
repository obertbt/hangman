import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { MeasurementEventRow, MeasurementItemRow, MeasurementResultRow } from '@/types/database.types';

import { bestValue, buildSeries, totalChange, type SeriesPoint } from './lib/progress';

/**
 * 測定の読み取り（3章の6）。
 *
 * 見えるかどうかは RLS が決める。
 *   測定会・項目 … チームの全員
 *   結果         … 本人とスタッフ
 */

export async function listMeasurementItems(session: AppSession): Promise<MeasurementItemRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('measurement_items')
    .select('*')
    .eq('team_id', session.teamId)
    .order('sort_order', { ascending: true });
  return data ?? [];
}

export async function listMeasurementEvents(session: AppSession, limit = 50): Promise<MeasurementEventRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('measurement_events')
    .select('*')
    .eq('team_id', session.teamId)
    .is('deleted_at', null)
    .order('measured_on', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** 項目ごとの、その人の伸び。 */
export interface ItemProgress {
  item: MeasurementItemRow;
  series: SeriesPoint[];
  best: number | null;
  /** 最初から最後までの差。1件しかなければ null。 */
  change: number | null;
}

/**
 * 自分（または指定した部員）の記録を、項目ごとにまとめる。
 *
 * 記録が1件も無い項目は出さない。
 * 「まだ測っていないもの」を並べても、いま見たいものが埋もれるだけ。
 */
export async function getProgress(
  session: AppSession,
  memberId: string = session.teamMemberId,
): Promise<ItemProgress[]> {
  const supabase = await createClient();

  const [items, resultQuery, eventQuery] = await Promise.all([
    listMeasurementItems(session),
    supabase.from('measurement_results').select('*').eq('team_member_id', memberId),
    supabase
      .from('measurement_events')
      .select('id, measured_on')
      .eq('team_id', session.teamId)
      .is('deleted_at', null),
  ]);

  const results = resultQuery.data ?? [];
  const dateByEvent = new Map((eventQuery.data ?? []).map((event) => [event.id, event.measured_on]));

  return items.flatMap((item) => {
    const points = results
      .filter((result) => result.measurement_item_id === item.id && result.value !== null)
      .flatMap((result) => {
        const measuredOn = dateByEvent.get(result.measurement_event_id);
        // 測定会が消えていたら日付が分からない。並べられないので出さない。
        return measuredOn ? [{ measuredOn, value: Number(result.value) }] : [];
      });

    if (points.length === 0) return [];

    return [
      {
        item,
        series: buildSeries(points, item.better),
        best: bestValue(points, item.better),
        change: totalChange(points),
      },
    ];
  });
}

/** 測定会1件ぶんの入力状況（コーチ向け）。 */
export interface EventSheet {
  event: MeasurementEventRow;
  items: MeasurementItemRow[];
  members: { id: string; name: string }[];
  /** `${memberId}:${itemId}` → 記録。 */
  resultByCell: Map<string, MeasurementResultRow>;
}

export async function getEventSheet(session: AppSession, eventId: string): Promise<EventSheet | null> {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('measurement_events')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', eventId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!event) return null;

  const [items, memberQuery, resultQuery] = await Promise.all([
    listMeasurementItems(session),
    supabase
      .from('team_members')
      .select('id, jersey_number, profiles(full_name, display_name)')
      .eq('team_id', session.teamId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('jersey_number', { ascending: true, nullsFirst: false }),
    supabase.from('measurement_results').select('*').eq('measurement_event_id', eventId),
  ]);

  const members = (memberQuery.data ?? []).map((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    const display = profile?.display_name;
    return {
      id: member.id,
      name: display && display !== '' ? display : (profile?.full_name ?? '不明'),
    };
  });

  const resultByCell = new Map(
    (resultQuery.data ?? []).map((result) => [
      `${result.team_member_id}:${result.measurement_item_id}`,
      result,
    ]),
  );

  return { event, items, members, resultByCell };
}

/** 今日の画面で使う。直近の測定会と、自己ベストを更新した項目の数。 */
export async function countRecentBests(session: AppSession): Promise<number> {
  const progress = await getProgress(session);
  return progress.filter((entry) => entry.series[entry.series.length - 1]?.isBest === true).length;
}
