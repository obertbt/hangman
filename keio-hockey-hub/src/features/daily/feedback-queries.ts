import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { DailyReportRow, ReportFeedbackRow } from '@/types/database.types';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 見えるかどうかは RLS が決める。
 * **日報が見える人にだけ、そのコメントが見える**（0022）。
 * 「自分だけ」にした日報には、コーチもコメントできない。
 */

export interface ReportComment {
  comment: ReportFeedbackRow;
  authorName: string;
}

export async function listReportComments(reportId: string): Promise<ReportComment[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('report_feedbacks')
    .select('*')
    .eq('daily_report_id', reportId)
    .is('deleted_at', null)
    // 55章と同じ。上書きせず、やり取りの流れをそのまま残す。
    .order('created_at', { ascending: true });

  const comments = data ?? [];
  if (comments.length === 0) return [];

  const authorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', authorIds);

  const nameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.display_name ?? profile.full_name]),
  );

  return comments.map((comment) => ({
    comment,
    authorName: nameById.get(comment.author_id) ?? '不明',
  }));
}

export interface ReportDetail {
  report: DailyReportRow;
  authorName: string;
  comments: ReportComment[];
}

/** 日報1件。見えなければ null（RLS が決める）。 */
export async function getReportDetail(session: AppSession, reportId: string): Promise<ReportDetail | null> {
  const supabase = await createClient();

  const { data: report } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', reportId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!report) return null;

  const [{ data: member }, comments] = await Promise.all([
    supabase
      .from('team_members')
      .select('profiles(full_name, display_name)')
      .eq('id', report.team_member_id)
      .maybeSingle(),
    listReportComments(reportId),
  ]);

  const profile = Array.isArray(member?.profiles) ? member?.profiles[0] : member?.profiles;
  const display = profile?.display_name;

  return {
    report,
    authorName: display && display !== '' ? display : (profile?.full_name ?? '不明'),
    comments,
  };
}

/**
 * 日報ごとのコメント数。
 *
 * 一覧に「返事が来ている」を出すためだけのもの。
 * 見えないコメントは数にも入らない（RLS がそのまま効く）。
 */
export async function countCommentsByReport(reportIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (reportIds.length === 0) return counts;

  const supabase = await createClient();
  const { data } = await supabase
    .from('report_feedbacks')
    .select('daily_report_id')
    .in('daily_report_id', reportIds)
    .is('deleted_at', null);

  for (const row of data ?? []) {
    counts.set(row.daily_report_id, (counts.get(row.daily_report_id) ?? 0) + 1);
  }
  return counts;
}

/** コーチ向け: まだコメントしていない、今日の日報。 */
export async function listReportsAwaitingComment(
  session: AppSession,
  dateOnly: string,
): Promise<{ report: DailyReportRow; authorName: string; commentCount: number }[]> {
  const supabase = await createClient();

  // 見えるものだけが返る（private は入ってこない）
  const { data: reports } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('report_date', dateOnly)
    .eq('status', 'submitted')
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true, nullsFirst: false });

  const rows = reports ?? [];
  if (rows.length === 0) return [];

  const [{ data: comments }, { data: members }] = await Promise.all([
    supabase
      .from('report_feedbacks')
      .select('daily_report_id')
      .in(
        'daily_report_id',
        rows.map((row) => row.id),
      )
      .is('deleted_at', null),
    supabase
      .from('team_members')
      .select('id, profiles(full_name, display_name)')
      .eq('team_id', session.teamId),
  ]);

  const countByReport = new Map<string, number>();
  for (const comment of comments ?? []) {
    countByReport.set(comment.daily_report_id, (countByReport.get(comment.daily_report_id) ?? 0) + 1);
  }

  const nameByMember = new Map(
    (members ?? []).map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      const display = profile?.display_name;
      return [member.id, display && display !== '' ? display : (profile?.full_name ?? '不明')];
    }),
  );

  return rows.map((report) => ({
    report,
    authorName: nameByMember.get(report.team_member_id) ?? '不明',
    commentCount: countByReport.get(report.id) ?? 0,
  }));
}
