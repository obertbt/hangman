'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission, requireSession } from '@/lib/auth/session';
import { validateClipRange } from '@/lib/storage/validation';
import { createClient } from '@/lib/supabase/server';
import { thumbnailUrlFor } from '@/lib/video/youtube';

import { askQuestionSchema, createClipSchema, registerVideoSchema } from './schemas';

/**
 * 動画の登録・仮想クリップ・質問投稿（18章・25章）。
 *
 * 動画本体はアプリに保存しない。YouTube の動画IDだけを持つ。
 * クリップも実ファイルを作らず、開始秒と終了秒だけを持つ。
 */

export interface VideoActionState {
  error?: string;
  success?: string;
  /** 作成したクリップのID。画面がその場で質問フォームを出すために使う。 */
  createdClipId?: string;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? '入力内容を確認してください。';
}

/** 動画の登録。video.upload を持つ人だけ。 */
export async function registerVideo(
  _prevState: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const session = await requirePermission('video.upload');

  const parsed = registerVideoSchema.safeParse({
    source: text(formData, 'source') ?? '',
    title: text(formData, 'title') ?? '',
    description: text(formData, 'description'),
    duration: text(formData, 'duration'),
    recorded_on: text(formData, 'recorded_on'),
    event_id: text(formData, 'event_id'),
    visibility: text(formData, 'visibility') ?? 'team',
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 同じ動画を二重に登録しない
  const { data: existing } = await supabase
    .from('videos')
    .select('id')
    .eq('team_id', session.teamId)
    .eq('provider', 'youtube')
    .eq('provider_video_id', input.source)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { error: 'この動画はすでに登録されています。' };
  }

  const { error } = await supabase.from('videos').insert({
    team_id: session.teamId,
    provider: 'youtube',
    provider_video_id: input.source,
    title: input.title,
    description: input.description,
    thumbnail_url: thumbnailUrlFor(input.source),
    duration_seconds: input.duration,
    // 'YYYY-MM-DD' を、その日の正午（JST）として保存する。
    // 日付だけの情報を timestamptz に入れるとき、時刻を0時にすると
    // タイムゾーン次第で前日になってしまう。
    recorded_at: input.recorded_on ? `${input.recorded_on}T12:00:00+09:00` : null,
    event_id: input.event_id,
    visibility: input.visibility,
    created_by: session.profileId,
  });

  if (error) return { error: `保存できませんでした: ${error.message}` };

  revalidatePath('/videos');
  return { success: '動画を登録しました。' };
}

/**
 * 仮想クリップの作成（18章 B）。
 * 実ファイルは切り出さない。範囲だけを保存する。
 */
export async function createClip(
  _prevState: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const session = await requireSession();

  const parsed = createClipSchema.safeParse({
    video_id: text(formData, 'video_id') ?? '',
    start: text(formData, 'start') ?? '',
    end: text(formData, 'end') ?? '',
    title: text(formData, 'title'),
    description: text(formData, 'description'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  // 元動画の長さと突き合わせる。DB 側のトリガでも守っているが、
  // ここで弾いたほうが利用者に理由を伝えられる。
  const { data: video } = await supabase
    .from('videos')
    .select('id, duration_seconds')
    .eq('team_id', session.teamId)
    .eq('id', input.video_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!video) return { error: '対象の動画が見つかりません。' };

  const check = validateClipRange(input.start, input.end, video.duration_seconds);
  if (!check.ok) return { error: check.reason };

  const { data: clip, error } = await supabase
    .from('video_clips')
    .insert({
      team_id: session.teamId,
      video_id: input.video_id,
      created_by: session.profileId,
      start_seconds: input.start,
      end_seconds: input.end,
      title: input.title,
      description: input.description,
    })
    .select('id')
    .single();

  if (error || !clip) {
    return { error: `保存できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  revalidatePath(`/videos/${input.video_id}`);
  return { success: '見てもらいたい場面を登録しました。', createdClipId: clip.id };
}

/**
 * 質問の投稿（25章）。
 *
 * 公開範囲の初期値は private_staff（29章）。
 * ここで team を選べるのは、投稿する本人が自分の意思で選んだ場合だけ。
 */
export async function askQuestion(
  _prevState: VideoActionState,
  formData: FormData,
): Promise<VideoActionState> {
  const session = await requirePermission('video.feedback_request');

  const clipId = text(formData, 'video_clip_id');

  const parsed = askQuestionSchema.safeParse({
    video_id: text(formData, 'video_id') ?? '',
    video_clip_id: clipId && clipId.trim() !== '' ? clipId : null,
    question_type: text(formData, 'question_type') ?? 'other',
    question: text(formData, 'question') ?? '',
    visibility: text(formData, 'visibility') ?? 'private_staff',
    assigned_coach_id: text(formData, 'assigned_coach_id'),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;

  const supabase = await createClient();

  const now = new Date().toISOString();

  const { error } = await supabase.from('feedback_requests').insert({
    team_id: session.teamId,
    requester_id: session.teamMemberId,
    video_id: input.video_id,
    video_clip_id: input.video_clip_id ?? null,
    assigned_coach_id: input.assigned_coach_id,
    question_type: input.question_type,
    question: input.question,
    // 下書きは作らず、その場で提出する。
    // 状態遷移は draft → submitted しか許されないため、最初から submitted で作る。
    status: 'submitted',
    visibility: input.visibility,
    submitted_at: now,
    assigned_at: input.assigned_coach_id ? now : null,
  });

  if (error) return { error: `投稿できませんでした: ${error.message}` };

  revalidatePath(`/videos/${input.video_id}`);
  revalidatePath('/today');
  return { success: '質問を投稿しました。コーチからの回答をお待ちください。' };
}
