import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';
import type { DailyConditionRow, DailyReportRow, EventRow, PracticeGoalRow } from '@/types/database.types';

/**
 * 練習前・練習後の記録の読み取り。
 *
 * どの画面も「今日の分が既にあるか」を最初に見る。
 * あれば編集、無ければ新規。利用者に区別を意識させない。
 */

/**
 * 今日の記録を結び付けるイベントを1つ選ぶ。
 *
 * 練習・試合・トレーニングのうち、最初のものを対象にする。
 * 無ければ null（イベントに紐づかない記録として残す）。
 */
export async function findRecordableEvent(teamId: string, dateOnly: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('team_id', teamId)
    .eq('event_date', dateOnly)
    .in('event_type', ['practice', 'match', 'training'])
    .is('deleted_at', null)
    .order('start_time', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getConditionFor(
  session: AppSession,
  dateOnly: string,
): Promise<DailyConditionRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_conditions')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .eq('recorded_on', dateOnly)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getPracticeGoalFor(
  session: AppSession,
  dateOnly: string,
): Promise<PracticeGoalRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('practice_goals')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .eq('target_date', dateOnly)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function getReportFor(session: AppSession, dateOnly: string): Promise<DailyReportRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .eq('report_date', dateOnly)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** 自分の過去の日報。成長を振り返るために使う（依頼書3章の6）。 */
export async function listMyReports(session: AppSession, limit = 30): Promise<DailyReportRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_member_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('report_date', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * 直近の日報の「次回取り組むこと」を引き継ぐ。
 * 前回の振り返りが、そのまま今日の目標の候補になるようにする。
 *
 * Phase 6 以降は、動画フィードバックの next_task も候補に加える。
 */
export async function findCarriedOverTask(session: AppSession, beforeDate: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('daily_reports')
    .select('next_action')
    .eq('team_member_id', session.teamMemberId)
    .lt('report_date', beforeDate)
    .not('next_action', 'is', null)
    .is('deleted_at', null)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.next_action ?? null;
}

export interface SubmissionStatusRow {
  teamMemberId: string;
  name: string;
  hasCondition: boolean;
  hasReport: boolean;
  hasTraining: boolean;
  /** 中身を読める日報。「自分だけ」のものは null。 */
  reportId: string | null;
  /** 出してはいるが、中身は本人だけのもの。 */
  reportIsPrivate: boolean;
  trainingIsPrivate: boolean;
}

/**
 * コーチ向けの提出状況（12章）。
 *
 * **「出したこと」と「中身」は別に扱う**（0023）。
 *
 * 素の SELECT だと、公開範囲が「自分だけ」の日報は行ごと消える。
 * RLS は行が見えるか見えないかしか決められないため、
 * ちゃんと書いて出した選手が「未提出」として並んでいた。
 * 見落としを減らすための画面が、出した人を責める形になっていた。
 *
 * 出したという事実だけを返す関数を通す。
 * 中身は1文字も返らず、読める日報にだけ id が付く。
 */
export async function getSubmissionStatus(
  teamId: string,
  dateOnly = todayInTokyo(),
): Promise<SubmissionStatusRow[]> {
  const supabase = await createClient();

  const [{ data: members }, { data: status }] = await Promise.all([
    supabase
      .from('team_members')
      .select('id, jersey_number, grade, profiles(full_name, display_name)')
      .eq('team_id', teamId)
      .eq('role_code', 'player')
      .eq('status', 'active')
      .is('deleted_at', null),
    supabase.rpc('list_submission_status', { p_team_id: teamId, p_date: dateOnly }),
  ]);

  const nameById = new Map(
    (members ?? []).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return [row.id, pickName(profile)];
    }),
  );

  return (status ?? [])
    .map((row) => ({
      teamMemberId: row.team_member_id,
      name: nameById.get(row.team_member_id) ?? '不明',
      hasCondition: row.submitted_condition,
      hasReport: row.submitted_report,
      hasTraining: row.submitted_training,
      reportId: row.readable_report_id,
      reportIsPrivate: row.report_is_private,
      trainingIsPrivate: row.training_is_private,
    }))
    .sort((left, right) => {
      // 出していない人を上に出す。見落としを減らすため（依頼書3章の4）。
      const leftMissing = countMissing(left);
      const rightMissing = countMissing(right);
      if (leftMissing !== rightMissing) return rightMissing - leftMissing;
      return left.name.localeCompare(right.name, 'ja');
    });
}

function countMissing(row: SubmissionStatusRow): number {
  return [row.hasCondition, row.hasReport, row.hasTraining].filter((value) => !value).length;
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
