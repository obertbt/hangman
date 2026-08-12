'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission, requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { reportCommentSchema } from './schemas';

/**
 * 日報へのコーチのコメント（16章）。
 *
 * 依頼書3章の5「フィードバックが次の練習の課題につながる」の、いちばん短い経路。
 * 動画を撮って質問するほどではない日の、ひとことの往復をここで担う。
 *
 * 守ること:
 *   * **「自分だけ」にした日報にはコメントしない。**
 *     選手が公開範囲を private にするのは「コーチにも見せたくない」という意思表示。
 *     0022 の RLS で塞いであるが、ここでも先に断って理由を伝える。
 *   * 差出人は偽らせない（author_id はサーバで決める）。
 *   * 上書きしない。追記だけ（55章と同じ）。消せるのは書いた本人だけ。
 */

export interface ReportCommentState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/**
 * コメントを書く。
 *
 * 書けるのは「全員の日報を見る権限がある人」だけ。
 * 選手どうしが日報にコメントし合う形は 16章に無いので、ここでは開けない。
 */
export async function postReportComment(
  _prevState: ReportCommentState,
  formData: FormData,
): Promise<ReportCommentState> {
  const session = await requirePermission('report.view_all');

  const parsed = reportCommentSchema.safeParse({
    daily_report_id: text(formData, 'daily_report_id'),
    body: text(formData, 'body'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 見えない日報は、そもそも返ってこない（RLS）。
  // ここで弾いておくと「なぜ書けないのか」を伝えられる。
  const { data: report } = await supabase
    .from('daily_reports')
    .select('id, team_id, team_member_id, report_date, visibility, status')
    .eq('team_id', session.teamId)
    .eq('id', input.daily_report_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!report) {
    return { error: 'その日報は見つかりません。公開範囲が「自分だけ」になっている可能性があります。' };
  }

  if (report.visibility === 'private') {
    return { error: 'この日報は「自分だけ」に設定されています。コメントはできません。' };
  }

  const { error } = await supabase.from('report_feedbacks').insert({
    team_id: session.teamId,
    daily_report_id: report.id,
    // 差出人はサーバが決める。画面から受け取らない。
    author_id: session.profileId,
    body: input.body,
  });

  if (error) return { error: `コメントを書けませんでした: ${error.message}` };

  await notifyReportAuthor(session, {
    reportId: report.id,
    targetMemberId: report.team_member_id,
    reportDate: report.report_date,
    body: input.body,
  });

  revalidatePath(`/report/${report.id}`);
  revalidatePath('/report');
  revalidatePath('/admin/submissions');
  revalidatePath('/today');

  return { success: 'コメントを書きました。選手に通知が届きます。' };
}

/**
 * 自分の書いたコメントを取り消す。
 *
 * 0019 で閲覧の条件に deleted_at is null が入ったため、
 * 素朴な update では消せない。関数を通す（判定は DB 側にある）。
 */
export async function deleteReportComment(
  _prevState: ReportCommentState,
  formData: FormData,
): Promise<ReportCommentState> {
  await requireSession();

  const feedbackId = text(formData, 'feedback_id');
  const reportId = text(formData, 'daily_report_id');

  if (feedbackId === '') return { error: '対象のコメントが分かりません。' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('soft_delete_report_feedback', { p_feedback_id: feedbackId });

  if (error) return { error: `取り消せませんでした: ${error.message}` };

  if (reportId !== '') revalidatePath(`/report/${reportId}`);
  revalidatePath('/report');
  revalidatePath('/admin/submissions');

  return { success: 'コメントを取り消しました。' };
}

/**
 * 選手に知らせる（57章）。
 *
 * 通知が作れなくてもコメント自体は成立させる。
 * ただし**黙って捨てない**（0015 の教訓）。
 */
async function notifyReportAuthor(
  session: AppSession,
  input: { reportId: string; targetMemberId: string; reportDate: string; body: string },
): Promise<void> {
  // 自分の日報に自分で書いたときは知らせない（コーチも日報を書く）
  if (input.targetMemberId === session.teamMemberId) return;

  try {
    const supabase = await createClient();

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        team_id: session.teamId,
        notification_type: 'report_commented',
        title: '日報にコメントが付きました',
        body: `${input.reportDate}の日報: ${input.body.slice(0, 100)}`,
        link_path: `/report/${input.reportId}`,
        related_table: 'daily_reports',
        related_id: input.reportId,
        created_by: session.profileId,
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`[daily] コメントの通知を作れませんでした: ${error.message}`);
      return;
    }

    const { error: targetError } = await supabase.from('notification_targets').insert({
      notification_id: notification.id,
      team_member_id: input.targetMemberId,
    });

    if (targetError) {
      console.warn(`[daily] コメントの通知の宛先を作れませんでした: ${targetError.message}`);
    }
  } catch (unexpected) {
    console.warn('[daily] コメントの通知で予期しない失敗', unexpected);
  }
}
