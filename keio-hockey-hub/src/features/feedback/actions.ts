'use server';

import { revalidatePath } from 'next/cache';

import { can, requirePermission, requireSession, type AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { isActionAllowed, transitionFor, type Actor, type FeedbackAction } from './lib/state';
import {
  feedbackActionSchema,
  feedbackMessageSchema,
  feedbackResponseSchema,
  shareDecisionSchema,
  shareRequestSchema,
} from './schemas';

/**
 * 動画フィードバックの書き込み（27〜29章・55〜57章）。
 *
 * 守ること:
 *   * 状態遷移はアプリ側でも確かめる。DB のトリガでも守られているが、
 *     ここで弾いたほうが「なぜできないか」を伝えられる。
 *   * 回答は上書きしない。追記だけ（55章）。
 *   * コーチが一方的に team 公開へ変えられない（29章）。
 */

export interface FeedbackActionState {
  error?: string;
  success?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** その質問に対して、いま自分がどの立場か。 */
function actorFor(session: AppSession, requesterId: string): Actor {
  if (requesterId === session.teamMemberId) return 'requester';
  if (can(session, 'video.feedback_answer')) return 'coach';
  return 'observer';
}

/** 状態を進める。遷移の可否と、その人が行えるかの両方を見る。 */
async function applyTransition(
  session: AppSession,
  requestId: string,
  action: FeedbackAction,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, status, requester_id, assigned_coach_id')
    .eq('team_id', session.teamId)
    .eq('id', requestId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!request) return { error: '対象の質問が見つかりません。' };

  const actor = actorFor(session, request.requester_id);
  if (!isActionAllowed(request.status, actor, action)) {
    return { error: 'いまその操作はできません。画面を読み込み直してください。' };
  }

  const to = transitionFor(action);
  const now = new Date().toISOString();

  // 状態ごとに、記録しておく時刻が違う
  const timestamps: Record<string, string | null> = {};
  if (to === 'assigned') timestamps.assigned_at = now;
  if (to === 'answered') timestamps.answered_at = now;
  if (to === 'acknowledged') timestamps.acknowledged_at = now;
  if (to === 'closed') timestamps.closed_at = now;

  const { error } = await supabase
    .from('feedback_requests')
    .update({
      status: to,
      // 担当を引き受けたら、自分を担当にする
      ...(action === 'assign' ? { assigned_coach_id: session.teamMemberId } : {}),
      ...timestamps,
    })
    .eq('id', requestId);

  if (error) return { error: `更新できませんでした: ${error.message}` };

  // 状態の履歴は DB のトリガが自動で残す（0006）
  return {};
}

/** 担当する・確認中にする・確認した・完了する・取り下げる。 */
export async function transitionFeedback(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const session = await requireSession();

  const parsed = feedbackActionSchema.safeParse({
    feedback_request_id: text(formData, 'feedback_request_id') ?? '',
    action: text(formData, 'action') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // 'answer' は回答フォームから行う。ここでは状態だけ動かさない。
  if (parsed.data.action === 'answer') {
    return { error: '回答は回答フォームから行ってください。' };
  }

  const result = await applyTransition(session, parsed.data.feedback_request_id, parsed.data.action);
  if (result.error) return { error: result.error };

  const labels: Record<string, string> = {
    assign: 'この質問を担当しました。',
    start_review: '確認中にしました。',
    acknowledge: '回答を確認しました。次回の目標に取り入れましょう。',
    follow_up: 'もう一度聞く状態にしました。下の欄から質問を書いてください。',
    close: '完了にしました。',
    withdraw: '取り下げました。',
  };

  revalidatePath('/feedback');
  revalidatePath(`/feedback/${parsed.data.feedback_request_id}`);
  revalidatePath('/today');

  return { success: labels[parsed.data.action] ?? '更新しました。' };
}

/**
 * コーチの回答（28章）。
 * 回答は追記する。過去の回答は消さない（55章）。
 */
export async function answerFeedback(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const session = await requirePermission('video.feedback_answer');

  const parsed = feedbackResponseSchema.safeParse({
    feedback_request_id: text(formData, 'feedback_request_id') ?? '',
    conclusion: text(formData, 'conclusion') ?? '',
    positive_points: text(formData, 'positive_points'),
    improvement_points: text(formData, 'improvement_points'),
    recommended_action: text(formData, 'recommended_action'),
    technical_correction: text(formData, 'technical_correction'),
    next_task: text(formData, 'next_task'),
    related_skill_id: text(formData, 'related_skill_id'),
    reference_video_id: text(formData, 'reference_video_id'),
    requires_in_person_review: formData.get('requires_in_person_review') === 'on',
    suggests_team_share: formData.get('suggests_team_share') === 'on',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, status, requester_id')
    .eq('team_id', session.teamId)
    .eq('id', input.feedback_request_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!request) return { error: '対象の質問が見つかりません。' };

  const actor = actorFor(session, request.requester_id);
  if (!isActionAllowed(request.status, actor, 'answer')) {
    return { error: 'いまこの質問には回答できません。画面を読み込み直してください。' };
  }

  const { error: responseError } = await supabase.from('feedback_responses').insert({
    team_id: session.teamId,
    feedback_request_id: input.feedback_request_id,
    responder_id: session.teamMemberId,
    conclusion: input.conclusion,
    positive_points: input.positive_points,
    improvement_points: input.improvement_points,
    recommended_action: input.recommended_action,
    technical_correction: input.technical_correction,
    next_task: input.next_task,
    related_skill_id: input.related_skill_id,
    reference_video_id: input.reference_video_id,
    requires_in_person_review: input.requires_in_person_review,
    suggests_team_share: input.suggests_team_share,
  });

  if (responseError) return { error: `保存できませんでした: ${responseError.message}` };

  const now = new Date().toISOString();
  const { error: statusError } = await supabase
    .from('feedback_requests')
    .update({ status: 'answered', answered_at: now })
    .eq('id', input.feedback_request_id);

  if (statusError) {
    return { error: `回答は保存しましたが、状態を変えられませんでした: ${statusError.message}` };
  }

  // 29章: 共有したい場合も、勝手に team へは上げない。選手へ承認を求める。
  if (input.suggests_team_share) {
    await supabase.from('feedback_share_requests').insert({
      team_id: session.teamId,
      feedback_request_id: input.feedback_request_id,
      requested_by: session.teamMemberId,
      target_visibility: 'team',
      status: 'pending',
    });
  }

  await notify(session, {
    requestId: input.feedback_request_id,
    targetMemberId: request.requester_id,
    type: 'feedback_answered',
    title: '動画の質問に回答が来ました',
    body: input.conclusion.slice(0, 120),
  });

  revalidatePath('/feedback');
  revalidatePath(`/feedback/${input.feedback_request_id}`);
  revalidatePath('/today');

  return {
    success: input.suggests_team_share
      ? '回答しました。チームへの共有は、選手が承認すると反映されます。'
      : '回答しました。',
  };
}

/** 再質問・補足（56章）。 */
export async function postFeedbackMessage(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const session = await requireSession();

  const parsed = feedbackMessageSchema.safeParse({
    feedback_request_id: text(formData, 'feedback_request_id') ?? '',
    body: text(formData, 'body') ?? '',
    message_type: text(formData, 'message_type') ?? 'comment',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, status, requester_id, assigned_coach_id')
    .eq('team_id', session.teamId)
    .eq('id', input.feedback_request_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!request) return { error: '対象の質問が見つかりません。' };

  const actor = actorFor(session, request.requester_id);
  if (actor === 'observer') {
    return { error: 'この質問には書き込めません。' };
  }

  const { error } = await supabase.from('feedback_messages').insert({
    team_id: session.teamId,
    feedback_request_id: input.feedback_request_id,
    sender_id: session.teamMemberId,
    message_type: input.message_type,
    body: input.body,
  });

  if (error) return { error: `書き込めませんでした: ${error.message}` };

  // 再質問なら、状態も follow_up へ動かす
  if (input.message_type === 'follow_up_question' && isActionAllowed(request.status, actor, 'follow_up')) {
    await applyTransition(session, input.feedback_request_id, 'follow_up');
  }

  await notify(session, {
    requestId: input.feedback_request_id,
    targetMemberId: actor === 'requester' ? (request.assigned_coach_id ?? null) : request.requester_id,
    type: input.message_type === 'follow_up_question' ? 'feedback_follow_up' : 'general',
    title:
      input.message_type === 'follow_up_question' ? '再質問が届きました' : '動画の質問にコメントが付きました',
    body: input.body.slice(0, 120),
  });

  revalidatePath(`/feedback/${input.feedback_request_id}`);
  revalidatePath('/today');

  return {
    success: input.message_type === 'follow_up_question' ? '再質問を送りました。' : '書き込みました。',
  };
}

/** コーチからのチーム共有の提案（29章）。 */
export async function requestTeamShare(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const session = await requirePermission('video.feedback_answer');

  const parsed = shareRequestSchema.safeParse({
    feedback_request_id: text(formData, 'feedback_request_id') ?? '',
    target_visibility: text(formData, 'target_visibility') ?? 'team',
    reason: text(formData, 'reason'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, requester_id, visibility')
    .eq('team_id', session.teamId)
    .eq('id', input.feedback_request_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!request) return { error: '対象の質問が見つかりません。' };
  if (request.visibility === 'team') return { error: 'この質問はすでにチームへ共有されています。' };

  const { error } = await supabase.from('feedback_share_requests').insert({
    team_id: session.teamId,
    feedback_request_id: input.feedback_request_id,
    requested_by: session.teamMemberId,
    target_visibility: input.target_visibility,
    reason: input.reason,
    status: 'pending',
  });

  if (error) return { error: `提案できませんでした: ${error.message}` };

  await notify(session, {
    requestId: input.feedback_request_id,
    targetMemberId: request.requester_id,
    type: 'share_approval_requested',
    title: 'コーチがチームへの共有を提案しています',
    body: 'あなたが承認すると、チーム全員が見られるようになります。',
  });

  revalidatePath(`/feedback/${input.feedback_request_id}`);
  return { success: '共有を提案しました。選手が承認すると反映されます。' };
}

/**
 * 共有提案への返事（29章）。
 *
 * **承認できるのは質問した本人だけ。** RLS でも同じ条件で守っている。
 * 承認して初めて visibility が team になる。
 */
export async function decideTeamShare(
  _prevState: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const session = await requireSession();

  const parsed = shareDecisionSchema.safeParse({
    share_request_id: text(formData, 'share_request_id') ?? '',
    decision: text(formData, 'decision') ?? '',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const { data: shareRequest } = await supabase
    .from('feedback_share_requests')
    .select('id, feedback_request_id, target_visibility, status')
    .eq('team_id', session.teamId)
    .eq('id', input.share_request_id)
    .maybeSingle();

  if (!shareRequest) return { error: '対象の提案が見つかりません。' };
  if (shareRequest.status !== 'pending') return { error: 'この提案にはすでに返事をしています。' };

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('id, requester_id')
    .eq('id', shareRequest.feedback_request_id)
    .maybeSingle();

  if (!request) return { error: '対象の質問が見つかりません。' };
  if (request.requester_id !== session.teamMemberId) {
    return { error: 'チームへの共有を決められるのは、質問した本人だけです。' };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('feedback_share_requests')
    .update({ status: input.decision, responded_at: now })
    .eq('id', input.share_request_id);

  if (error) return { error: `返事を保存できませんでした: ${error.message}` };

  if (input.decision === 'approved') {
    await supabase
      .from('feedback_requests')
      .update({ visibility: shareRequest.target_visibility })
      .eq('id', shareRequest.feedback_request_id);
  }

  revalidatePath(`/feedback/${shareRequest.feedback_request_id}`);
  revalidatePath('/today');

  return {
    success:
      input.decision === 'approved'
        ? 'チームへの共有を承認しました。'
        : '共有しないことにしました。この質問はコーチとあなただけが見られます。',
  };
}

/**
 * アプリ内通知（57章）。
 * 失敗しても本来の処理は止めない（通知が出ないだけ）。
 */
async function notify(
  session: AppSession,
  input: {
    requestId: string;
    targetMemberId: string | null;
    type: string;
    title: string;
    body: string;
  },
): Promise<void> {
  if (!input.targetMemberId) return;

  try {
    const supabase = await createClient();

    const { data: notification } = await supabase
      .from('notifications')
      .insert({
        team_id: session.teamId,
        notification_type: input.type,
        title: input.title,
        body: input.body,
        link_path: `/feedback/${input.requestId}`,
        related_table: 'feedback_requests',
        related_id: input.requestId,
        created_by: session.profileId,
      })
      .select('id')
      .single();

    if (notification) {
      await supabase.from('notification_targets').insert({
        notification_id: notification.id,
        team_member_id: input.targetMemberId,
      });
    }
  } catch {
    // 通知は本筋ではない。落ちても回答や共有は成立させる。
  }
}
