import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type {
  FeedbackMessageRow,
  FeedbackRequestRow,
  FeedbackResponseRow,
  FeedbackShareRequestRow,
  VideoClipRow,
  VideoRow,
} from '@/types/database.types';

import { isAwaitingCoach, isAwaitingPlayer } from './lib/state';

/**
 * 動画フィードバックの読み取り（27章・28章）。
 *
 * 見えるかどうかは RLS が決める。
 *   本人 / video.feedback_answer を持つ人 / team 公開のもの
 */

export interface FeedbackDetail {
  request: FeedbackRequestRow;
  video: VideoRow | null;
  clip: VideoClipRow | null;
  responses: FeedbackResponseRow[];
  messages: FeedbackMessageRow[];
  shareRequest: FeedbackShareRequestRow | null;
  requesterName: string;
  responderNames: Map<string, string>;
}

export async function getFeedbackDetail(
  session: AppSession,
  requestId: string,
): Promise<FeedbackDetail | null> {
  const supabase = await createClient();

  const { data: request } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('id', requestId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!request) return null;

  const [videoResult, clipResult, responseResult, messageResult, shareResult] = await Promise.all([
    request.video_id
      ? supabase.from('videos').select('*').eq('id', request.video_id).is('deleted_at', null).maybeSingle()
      : Promise.resolve({ data: null }),
    request.video_clip_id
      ? supabase
          .from('video_clips')
          .select('*')
          .eq('id', request.video_clip_id)
          .is('deleted_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // 55章: 回答は上書きしない。古い順に並べて、やり取りの流れが分かるようにする。
    supabase
      .from('feedback_responses')
      .select('*')
      .eq('feedback_request_id', requestId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('feedback_messages')
      .select('*')
      .eq('feedback_request_id', requestId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('feedback_share_requests')
      .select('*')
      .eq('feedback_request_id', requestId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const responses = responseResult.data ?? [];
  const memberIds = [request.requester_id, ...responses.map((response) => response.responder_id)];
  const names = await resolveMemberNames(session, memberIds);

  return {
    request,
    video: videoResult.data,
    clip: clipResult.data,
    responses,
    messages: messageResult.data ?? [],
    shareRequest: shareResult.data ?? null,
    requesterName: names.get(request.requester_id) ?? '不明',
    responderNames: names,
  };
}

/** team_member_id → 表示名。 */
async function resolveMemberNames(session: AppSession, memberIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds)];
  const result = new Map<string, string>();
  if (unique.length === 0) return result;

  const supabase = await createClient();
  const { data } = await supabase
    .from('team_members')
    .select('id, profiles(full_name, display_name)')
    .eq('team_id', session.teamId)
    .in('id', unique);

  for (const row of data ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    result.set(row.id, pickName(profile));
  }
  return result;
}

export interface FeedbackListItem {
  request: FeedbackRequestRow;
  requesterName: string;
  videoTitle: string | null;
  clip: VideoClipRow | null;
}

/** 一覧に必要なものをまとめて引く。 */
async function decorate(session: AppSession, requests: FeedbackRequestRow[]): Promise<FeedbackListItem[]> {
  if (requests.length === 0) return [];

  const supabase = await createClient();

  const videoIds = [...new Set(requests.map((r) => r.video_id).filter((id): id is string => id !== null))];
  const clipIds = [
    ...new Set(requests.map((r) => r.video_clip_id).filter((id): id is string => id !== null)),
  ];

  const [videoResult, clipResult, names] = await Promise.all([
    videoIds.length > 0
      ? supabase.from('videos').select('id, title').in('id', videoIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    clipIds.length > 0
      ? supabase.from('video_clips').select('*').in('id', clipIds)
      : Promise.resolve({ data: [] as VideoClipRow[] }),
    resolveMemberNames(
      session,
      requests.map((request) => request.requester_id),
    ),
  ]);

  const titleById = new Map((videoResult.data ?? []).map((video) => [video.id, video.title]));
  const clipById = new Map((clipResult.data ?? []).map((clip) => [clip.id, clip]));

  return requests.map((request) => ({
    request,
    requesterName: names.get(request.requester_id) ?? '不明',
    videoTitle: request.video_id ? (titleById.get(request.video_id) ?? null) : null,
    clip: request.video_clip_id ? (clipById.get(request.video_clip_id) ?? null) : null,
  }));
}

/**
 * コーチ向け: 対応が要る質問。
 * 待たせている順に並べる（見落としを減らす。依頼書3章の4）。
 */
export async function listAwaitingCoach(session: AppSession): Promise<FeedbackListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('team_id', session.teamId)
    .in('status', ['submitted', 'assigned', 'reviewing', 'follow_up'])
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true, nullsFirst: false });

  return decorate(session, data ?? []);
}

/** コーチ向け: 回答したが、まだ選手が見ていないもの（12章）。 */
export async function listAwaitingPlayerAck(session: AppSession): Promise<FeedbackListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('team_id', session.teamId)
    .eq('status', 'answered')
    .is('deleted_at', null)
    .order('answered_at', { ascending: true, nullsFirst: false });

  return decorate(session, data ?? []);
}

/** 選手向け: 自分が出した質問。 */
export async function listMyFeedback(session: AppSession, limit = 50): Promise<FeedbackListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('requester_id', session.teamMemberId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  return decorate(session, data ?? []);
}

/** 選手向け: まだ確認していない回答の数。今日のダッシュボードで使う。 */
export async function countUnreadAnswers(session: AppSession): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('feedback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', session.teamMemberId)
    .eq('status', 'answered')
    .is('deleted_at', null);
  return count ?? 0;
}

/** 選手向け: まだ回答が来ていない質問の数。 */
export async function countWaitingQuestions(session: AppSession): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('feedback_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', session.teamMemberId)
    .in('status', ['submitted', 'assigned', 'reviewing', 'follow_up'])
    .is('deleted_at', null);
  return count ?? 0;
}

/** 選手向け: 承認を求められているチーム共有（29章）。 */
export async function listPendingShareRequests(
  session: AppSession,
): Promise<{ shareRequest: FeedbackShareRequestRow; request: FeedbackRequestRow }[]> {
  const supabase = await createClient();

  const { data: myRequests } = await supabase
    .from('feedback_requests')
    .select('*')
    .eq('requester_id', session.teamMemberId)
    .is('deleted_at', null);

  const requests = myRequests ?? [];
  if (requests.length === 0) return [];

  const { data: shares } = await supabase
    .from('feedback_share_requests')
    .select('*')
    .eq('status', 'pending')
    .in(
      'feedback_request_id',
      requests.map((request) => request.id),
    );

  const requestById = new Map(requests.map((request) => [request.id, request]));

  return (shares ?? []).flatMap((shareRequest) => {
    const request = requestById.get(shareRequest.feedback_request_id);
    return request ? [{ shareRequest, request }] : [];
  });
}

/**
 * 直近の「次回課題」を引き継ぐ（依頼書3章の5）。
 *
 * 回答の next_task が、次の練習の個人目標の候補になる。
 * ここが「フィードバックが次の練習課題につながる」の実装。
 */
export async function findLatestNextTask(
  session: AppSession,
): Promise<{ nextTask: string; feedbackRequestId: string } | null> {
  const supabase = await createClient();

  // 自分が出した質問のうち、回答が来ていて、まだ完了していないもの
  const { data: requests } = await supabase
    .from('feedback_requests')
    .select('id')
    .eq('requester_id', session.teamMemberId)
    .in('status', ['answered', 'acknowledged'])
    .is('deleted_at', null)
    .order('answered_at', { ascending: false })
    .limit(10);

  const requestIds = (requests ?? []).map((request) => request.id);
  if (requestIds.length === 0) return null;

  const { data: responses } = await supabase
    .from('feedback_responses')
    .select('feedback_request_id, next_task, created_at')
    .in('feedback_request_id', requestIds)
    .not('next_task', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const latest = responses?.[0];
  if (!latest?.next_task) return null;

  return { nextTask: latest.next_task, feedbackRequestId: latest.feedback_request_id };
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

export { isAwaitingCoach, isAwaitingPlayer };
