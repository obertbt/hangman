import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { todayInTokyo, TIME_ZONE } from '@/lib/datetime';
import type { AppSession } from '@/lib/auth/session';
import {
  getCurrentWeek,
  listEventsOnDate,
  listUpcomingEvents,
  getActiveSeason,
} from '@/features/timeline/queries';
import { countUnreadAnswers, countWaitingQuestions, listAwaitingCoach } from '@/features/feedback/queries';
import { isOverdue } from '@/features/feedback/lib/state';
import type { EventRow, SeasonRow, WeekRow } from '@/types/database.types';

import type { TodayState } from './lib/pending-actions';

/** Asia/Tokyo の現在時刻を 'HH:MM' で返す。 */
export function nowTimeInTokyo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

export interface PlayerDashboardData {
  date: string;
  season: SeasonRow | null;
  week: WeekRow | null;
  events: EventRow[];
  upcoming: EventRow[];
  todayState: TodayState;
  personalGoal: string | null;
}

/** 選手向け「今日」（11章）。 */
export async function getPlayerDashboard(session: AppSession): Promise<PlayerDashboardData> {
  const supabase = await createClient();
  const date = todayInTokyo();

  const [season, week, events, upcoming] = await Promise.all([
    getActiveSeason(session.teamId),
    getCurrentWeek(session.teamId, date),
    listEventsOnDate(session.teamId, date),
    listUpcomingEvents(session.teamId, date, 3),
  ]);

  // 今日ぶんの入力状況をまとめて確認する。
  const [conditionResult, goalResult, reportResult, trainingResult] = await Promise.all([
    supabase
      .from('daily_conditions')
      .select('id')
      .eq('team_member_id', session.teamMemberId)
      .eq('recorded_on', date)
      .is('deleted_at', null)
      .limit(1),
    supabase
      .from('practice_goals')
      .select('id, goal')
      .eq('team_member_id', session.teamMemberId)
      .eq('target_date', date)
      .is('deleted_at', null)
      .limit(1),
    supabase
      .from('daily_reports')
      .select('id')
      .eq('team_member_id', session.teamMemberId)
      .eq('report_date', date)
      .eq('status', 'submitted')
      .is('deleted_at', null)
      .limit(1),
    supabase
      .from('training_records')
      .select('id')
      .eq('team_member_id', session.teamMemberId)
      .eq('performed_on', date)
      .is('deleted_at', null)
      .limit(1),
  ]);

  const goalRow = goalResult.data?.[0];

  // Phase 6: 未確認の回答と、回答待ちの質問の数
  const [unreadFeedbackCount, waitingFeedbackCount] = await Promise.all([
    countUnreadAnswers(session),
    countWaitingQuestions(session),
  ]);

  const todayState: TodayState = {
    events: events.map((event) => ({
      id: event.id,
      event_type: event.event_type,
      start_time: event.start_time,
      end_time: event.end_time,
    })),
    nowTime: nowTimeInTokyo(),
    hasCondition: (conditionResult.data?.length ?? 0) > 0,
    hasGoal: Boolean(goalRow),
    hasReport: (reportResult.data?.length ?? 0) > 0,
    hasTraining: (trainingResult.data?.length ?? 0) > 0,
    unreadFeedbackCount,
    waitingFeedbackCount,
  };

  return {
    date,
    season,
    week,
    events,
    upcoming,
    todayState,
    personalGoal: goalRow?.goal ?? null,
  };
}

export interface CoachDashboardData {
  date: string;
  season: SeasonRow | null;
  week: WeekRow | null;
  events: EventRow[];
  activeMemberCount: number;
  /** 今日の日報をまだ出していない選手。 */
  missingReportNames: string[];
  /** 体調に注意が要る選手。 */
  concerningConditions: { name: string; note: string }[];
  /** 未回答の動画質問（12章）。 */
  awaitingFeedbackCount: number;
  /** そのうち3日以上待たせているもの。 */
  overdueFeedbackCount: number;
}

/** コーチ向け「今日」（12章）。 */
export async function getCoachDashboard(session: AppSession): Promise<CoachDashboardData> {
  const supabase = await createClient();
  const date = todayInTokyo();

  const [season, week, events] = await Promise.all([
    getActiveSeason(session.teamId),
    getCurrentWeek(session.teamId, date),
    listEventsOnDate(session.teamId, date),
  ]);

  // 在籍中の選手一覧
  const { data: members } = await supabase
    .from('team_members')
    .select('id, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .eq('role_code', 'player')
    .eq('status', 'active')
    .is('deleted_at', null);

  const memberList = (members ?? []).map((member) => ({
    id: member.id,
    name: extractName(member.profiles),
  }));

  const hasRecordEvent = events.some((event) => ['practice', 'match', 'training'].includes(event.event_type));

  let missingReportNames: string[] = [];
  if (hasRecordEvent && memberList.length > 0) {
    const { data: submitted } = await supabase
      .from('daily_reports')
      .select('team_member_id')
      .eq('team_id', session.teamId)
      .eq('report_date', date)
      .eq('status', 'submitted')
      .is('deleted_at', null);

    const submittedIds = new Set((submitted ?? []).map((row) => row.team_member_id));
    missingReportNames = memberList.filter((member) => !submittedIds.has(member.id)).map((m) => m.name);
  }

  // 痛みがある、またはコンディションが低い選手を拾う
  const { data: conditions } = await supabase
    .from('daily_conditions')
    .select('team_member_id, condition_level, fatigue_level, has_pain, pain_note, note')
    .eq('team_id', session.teamId)
    .eq('recorded_on', date)
    .is('deleted_at', null);

  const nameById = new Map(memberList.map((member) => [member.id, member.name]));
  const concerningConditions = (conditions ?? [])
    .filter((row) => row.has_pain || (row.condition_level ?? 5) <= 2 || (row.fatigue_level ?? 1) >= 4)
    .map((row) => ({
      name: nameById.get(row.team_member_id) ?? '不明',
      note: describeCondition(row),
    }));

  // 12章: 未対応の質問を見落とさないようにする
  const awaiting = await listAwaitingCoach(session);
  const overdueFeedbackCount = awaiting.filter((item) =>
    isOverdue(item.request.status, item.request.submitted_at),
  ).length;

  return {
    date,
    season,
    week,
    events,
    activeMemberCount: memberList.length,
    missingReportNames,
    concerningConditions,
    awaitingFeedbackCount: awaiting.length,
    overdueFeedbackCount,
  };
}

function describeCondition(row: {
  condition_level: number | null;
  fatigue_level: number | null;
  has_pain: boolean;
  pain_note: string | null;
}): string {
  const parts: string[] = [];
  if (row.has_pain) parts.push(`痛み・違和感${row.pain_note ? `（${row.pain_note}）` : ''}`);
  if (row.condition_level !== null && row.condition_level <= 2) parts.push(`調子 ${row.condition_level}/5`);
  if (row.fatigue_level !== null && row.fatigue_level >= 4) parts.push(`疲労 ${row.fatigue_level}/5`);
  return parts.join(' / ');
}

/** profiles の埋め込みは配列にも単体にもなり得るため、両方を受ける。 */
function extractName(relation: unknown): string {
  const record = Array.isArray(relation) ? relation[0] : relation;
  if (record && typeof record === 'object') {
    const display = 'display_name' in record ? (record as { display_name: unknown }).display_name : null;
    const full = 'full_name' in record ? (record as { full_name: unknown }).full_name : null;
    if (typeof display === 'string' && display !== '') return display;
    if (typeof full === 'string') return full;
  }
  return '不明';
}
