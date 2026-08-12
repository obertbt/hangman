'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '@/lib/auth/session';
import { todayInTokyo } from '@/lib/datetime';
import { limits } from '@/lib/env';
import { isKeyOwnedByTeam } from '@/lib/storage/keys';
import { getObjectStorage, isStorageConfigured } from '@/lib/storage/r2';
import { createClient } from '@/lib/supabase/server';

import { isSessionExpired, planUpload, sessionExpiryFrom, verifyUploadedObject } from './lib/plan';

/**
 * 短編動画の投稿（20章・21章）。
 *
 *   ブラウザ → 開始要求 → サーバーが確認 → Presigned PUT URL
 *   → ブラウザから R2 へ直接 PUT（サーバーを通さない）
 *   → 完了通知 → サーバーが実物を確認 → files を確定
 *
 * 守ること:
 *   * 動画本体をサーバーに通さない
 *   * Presigned URL を出す前に、必ずサーバー側で受け入れ判定をする
 *   * 「完了した」というブラウザの申告を信用しない
 *   * 署名付き URL を DB に保存しない
 */

const startSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.coerce.number().int().min(1),
  durationSeconds: z.coerce
    .number()
    .min(0)
    .max(60 * 60 * 12)
    .nullable(),
});

export interface StartUploadResult {
  error?: string;
  upload?: {
    sessionId: string;
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

/**
 * アップロードを始める。
 * ここでは R2 に何も書かない。置き場所を決めて、期限つきの URL を渡すだけ。
 */
export async function startVideoUpload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}): Promise<StartUploadResult> {
  const session = await requirePermission('video.upload');

  if (!isStorageConfigured()) {
    return {
      error:
        '動画の保存先（Cloudflare R2）が設定されていません。管理者に連絡してください（/setup-check で確認できます）。',
    };
  }

  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const supabase = await createClient();
  const today = todayInTokyo();

  // 19章: 1日の本数を数える。ブラウザの申告ではなく DB を見る。
  const { count } = await supabase
    .from('upload_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', session.profileId)
    .eq('media_type', 'video')
    .in('status', ['uploaded', 'verifying', 'ready'])
    .gte('created_at', `${today}T00:00:00+09:00`);

  const plan = planUpload({
    teamId: session.teamId,
    objectId: crypto.randomUUID(),
    originalFilename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.sizeBytes,
    durationSeconds: parsed.data.durationSeconds,
    mediaType: 'video',
    todayUploadCount: count ?? 0,
    dateOnly: today,
  });

  if (!plan.ok) return { error: plan.reason };

  const storage = getObjectStorage();
  const expiresAt = sessionExpiryFrom(limits.signedUrlExpirySeconds);

  const { data: uploadSession, error } = await supabase
    .from('upload_sessions')
    .insert({
      team_id: session.teamId,
      created_by: session.profileId,
      bucket: process.env.R2_BUCKET_NAME ?? '',
      storage_key: plan.plan.storageKey,
      declared_mime: plan.plan.mimeType,
      declared_size: plan.plan.sizeBytes,
      media_type: 'video',
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !uploadSession) {
    return { error: `アップロードを開始できませんでした: ${error?.message ?? '不明なエラー'}` };
  }

  const presigned = await storage.createUploadUrl({
    key: plan.plan.storageKey,
    contentType: plan.plan.mimeType,
    contentLength: plan.plan.sizeBytes,
  });

  // 署名付き URL は DB に保存しない（75章）。返すだけ。
  return {
    upload: {
      sessionId: uploadSession.id,
      url: presigned.url,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    },
  };
}

export interface CompleteUploadResult {
  error?: string;
  videoId?: string;
}

/**
 * アップロード完了。
 * ここで初めて R2 に問い合わせ、実物を確認してから files と videos を作る。
 */
export async function completeVideoUpload(input: {
  sessionId: string;
  title: string;
  durationSeconds: number | null;
}): Promise<CompleteUploadResult> {
  const session = await requirePermission('video.upload');

  const supabase = await createClient();

  const { data: uploadSession } = await supabase
    .from('upload_sessions')
    .select('*')
    .eq('id', input.sessionId)
    .eq('team_id', session.teamId)
    .maybeSingle();

  if (!uploadSession) return { error: 'アップロードの記録が見つかりません。' };
  if (uploadSession.created_by !== session.profileId) {
    return { error: 'このアップロードは別の人のものです。' };
  }
  if (uploadSession.status === 'ready') {
    return { error: 'このアップロードはすでに完了しています。' };
  }

  // 21章: 期限切れは受け付けない
  if (isSessionExpired(uploadSession.expires_at)) {
    await supabase
      .from('upload_sessions')
      .update({ status: 'failed', failure_reason: '期限切れ' })
      .eq('id', uploadSession.id);
    return { error: 'アップロードの有効期限が切れました。もう一度やり直してください。' };
  }

  // 別チームの key を掴まされていないか（62章）
  if (!isKeyOwnedByTeam(uploadSession.storage_key, session.teamId)) {
    return { error: 'このファイルは扱えません。' };
  }

  await supabase.from('upload_sessions').update({ status: 'verifying' }).eq('id', uploadSession.id);

  // 20章: ブラウザの申告ではなく、R2 の実物を見る
  const storage = getObjectStorage();
  const actual = await storage.statObject(uploadSession.storage_key);

  const verification = verifyUploadedObject({
    declaredSize: uploadSession.declared_size,
    declaredMime: uploadSession.declared_mime,
    actual: actual ? { sizeBytes: actual.sizeBytes, contentType: actual.contentType } : null,
  });

  if (!verification.ok) {
    await supabase
      .from('upload_sessions')
      .update({ status: 'failed', failure_reason: verification.reason })
      .eq('id', uploadSession.id);
    return { error: verification.reason };
  }

  const title = input.title.trim() === '' ? '自主練の動画' : input.title.trim().slice(0, 200);

  const { data: file, error: fileError } = await supabase
    .from('files')
    .insert({
      team_id: session.teamId,
      uploaded_by: session.profileId,
      storage_provider: 'r2',
      bucket: uploadSession.bucket,
      storage_key: uploadSession.storage_key,
      original_filename: null,
      normalized_filename: uploadSession.storage_key.split('/').pop() ?? null,
      mime_type: uploadSession.declared_mime,
      size_bytes: uploadSession.declared_size,
      media_type: 'video',
      duration_seconds: input.durationSeconds,
      upload_status: 'ready',
      visibility: 'private_staff',
      retention_policy: 'keep',
    })
    .select('id')
    .single();

  if (fileError || !file) {
    await supabase
      .from('upload_sessions')
      .update({ status: 'failed', failure_reason: fileError?.message ?? null })
      .eq('id', uploadSession.id);
    return { error: `保存できませんでした: ${fileError?.message ?? '不明なエラー'}` };
  }

  const { data: video, error: videoError } = await supabase
    .from('videos')
    .insert({
      team_id: session.teamId,
      provider: 'r2',
      provider_video_id: null,
      file_id: file.id,
      title,
      duration_seconds: input.durationSeconds,
      uploaded_at: new Date().toISOString(),
      // 29章と同じ考え方。自分の動画は既定で全体公開にしない。
      visibility: 'private_staff',
      created_by: session.profileId,
    })
    .select('id')
    .single();

  if (videoError || !video) {
    return { error: `動画として登録できませんでした: ${videoError?.message ?? '不明なエラー'}` };
  }

  await supabase
    .from('upload_sessions')
    .update({ status: 'ready', file_id: file.id, completed_at: new Date().toISOString() })
    .eq('id', uploadSession.id);

  revalidatePath('/videos');
  return { videoId: video.id };
}

/** 途中でやめた時の後始末。 */
export async function abortUpload(sessionId: string): Promise<void> {
  const session = await requirePermission('video.upload');
  const supabase = await createClient();

  await supabase
    .from('upload_sessions')
    .update({ status: 'failed', failure_reason: '利用者が中止' })
    .eq('id', sessionId)
    .eq('created_by', session.profileId);
}

/**
 * 再生用の署名付き URL を出す（22章）。
 *
 * 毎回発行する。DB には保存しない。
 * 見てよいかどうかは RLS が決める（videos が引ければ見てよい）。
 */
export async function getPlaybackUrl(
  videoId: string,
): Promise<{ error?: string; url?: string; expiresAt?: string }> {
  const session = await requirePermission('video.view_team');

  const supabase = await createClient();

  // RLS が効くので、見てはいけない動画はここで取れない
  const { data: video } = await supabase
    .from('videos')
    .select('id, provider, file_id')
    .eq('id', videoId)
    .eq('team_id', session.teamId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!video) return { error: 'この動画は見られません。' };
  if (video.provider !== 'r2' || !video.file_id) {
    return { error: 'この動画は署名付きURLでの再生に対応していません。' };
  }

  const { data: file } = await supabase
    .from('files')
    .select('storage_key, deleted_at')
    .eq('id', video.file_id)
    .maybeSingle();

  if (!file || file.deleted_at) return { error: 'このファイルは削除されています。' };

  // 62章: 別チームの key で URL を発行しない
  if (!isKeyOwnedByTeam(file.storage_key, session.teamId)) {
    return { error: 'この動画は見られません。' };
  }

  const storage = getObjectStorage();
  const download = await storage.createDownloadUrl({ key: file.storage_key });

  return { url: download.url, expiresAt: download.expiresAt };
}

/**
 * 投稿した動画の削除（60章・63章）。
 *
 * SELECT ポリシーが `deleted_at is null` を条件にしているため、
 * 通常の UPDATE では論理削除できない
 * （PostgreSQL は SELECT ポリシーを更新後の行にも適用する）。
 * 削除は 0013 で用意した関数を通す。関数側で権限・監査ログ・物理削除の予約を行う。
 */
export async function deleteVideo(videoId: string): Promise<{ error?: string; success?: string }> {
  await requirePermission('video.upload');

  const supabase = await createClient();
  const { error } = await supabase.rpc('soft_delete_video', { p_video_id: videoId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/videos');
  return { success: '動画を削除しました。30日以内なら「消したもの」から戻せます。' };
}
