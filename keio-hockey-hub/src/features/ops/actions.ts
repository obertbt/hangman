'use server';

import { revalidatePath } from 'next/cache';

import { requirePermission, requireSession } from '@/lib/auth/session';
import { isKeyOwnedByTeam } from '@/lib/storage/keys';
import { getObjectStorage, isStorageConfigured } from '@/lib/storage/r2';
import { createClient } from '@/lib/supabase/server';

/**
 * 運用まわりの書き込み（59章・60章・57章）。
 *
 * 容量の集計と掃除は、他人の行や削除済みの行を触るため、
 * 0016 で用意した関数を通す。権限の確認は関数の中でも行われる。
 */

export interface OpsActionState {
  error?: string;
  success?: string;
}

// -------------------------------------------------------------
// 通知（57章）
// -------------------------------------------------------------

/** 既読にする。付けられるのは自分の宛先だけ（RLS）。 */
export async function markNotificationRead(targetId: string): Promise<OpsActionState> {
  const session = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('notification_targets')
    .update({ read_at: new Date().toISOString() })
    .eq('id', targetId)
    .eq('team_member_id', session.teamMemberId)
    .is('read_at', null);

  if (error) return { error: `更新できませんでした: ${error.message}` };

  revalidatePath('/notifications');
  revalidatePath('/today');
  return {};
}

export async function markAllNotificationsRead(): Promise<OpsActionState> {
  const session = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from('notification_targets')
    .update({ read_at: new Date().toISOString() })
    .eq('team_member_id', session.teamMemberId)
    .is('read_at', null);

  if (error) return { error: `更新できませんでした: ${error.message}` };

  revalidatePath('/notifications');
  revalidatePath('/today');
  return { success: 'すべて既読にしました。' };
}

// -------------------------------------------------------------
// 容量（59章）
// -------------------------------------------------------------

/**
 * いまの容量を数えて記録する。
 *
 * 本来は日次で自動的に走らせたいが、動かす仕組み（cron）を
 * 増やしたくないので、まずは管理画面から手で押す形にしている。
 * 記録は1日1件なので、何度押しても増えない。
 */
export async function captureStorageUsage(): Promise<OpsActionState> {
  const session = await requirePermission('storage.manage');
  const supabase = await createClient();

  const { error } = await supabase.rpc('capture_storage_usage', { p_team_id: session.teamId });
  if (error) return { error: `集計できませんでした: ${error.message}` };

  revalidatePath('/admin/storage');
  return { success: 'いまの容量を記録しました。' };
}

/**
 * 期限の来たファイルを R2 から消す（60章）。
 *
 * 実体を消すのはここ（DB からは R2 を触れない）。
 * 1件ずつ「消す → 記録する」を繰り返す。
 * 途中で失敗しても、そこまでのぶんは記録に残す。
 */
export async function runStorageCleanup(): Promise<OpsActionState> {
  const session = await requirePermission('storage.manage');

  if (!isStorageConfigured()) {
    return { error: '動画の保存先（Cloudflare R2）が設定されていません。' };
  }

  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from('file_deletion_jobs')
    .select('id, file_id')
    .eq('team_id', session.teamId)
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50);

  const pending = jobs ?? [];
  if (pending.length === 0) {
    return { success: '期限の来た削除予約はありませんでした。' };
  }

  const storage = getObjectStorage();
  let done = 0;
  let failed = 0;

  for (const job of pending) {
    // 削除済みのファイルは通常の閲覧では引けないので、key を取るために少し回り道をする
    const { data: file } = await supabase
      .from('files')
      .select('storage_key')
      .eq('id', job.file_id)
      .maybeSingle();

    if (!file) {
      // 行ごと消えているなら、予約だけ閉じる
      await supabase.rpc('complete_file_deletion', { p_job_id: job.id, p_error: null });
      done += 1;
      continue;
    }

    // 62章: 別チームの key を掴まされていないか
    if (!isKeyOwnedByTeam(file.storage_key, session.teamId)) {
      await supabase.rpc('complete_file_deletion', {
        p_job_id: job.id,
        p_error: '別のチームのファイルを指しています',
      });
      failed += 1;
      continue;
    }

    try {
      await storage.deleteObject(file.storage_key);
      const { error } = await supabase.rpc('complete_file_deletion', {
        p_job_id: job.id,
        p_error: null,
      });
      if (error) {
        failed += 1;
      } else {
        done += 1;
      }
    } catch (unexpected) {
      const message = unexpected instanceof Error ? unexpected.message : '不明なエラー';
      await supabase.rpc('complete_file_deletion', { p_job_id: job.id, p_error: message });
      failed += 1;
    }
  }

  revalidatePath('/admin/storage');

  return {
    success: `${done}件を削除しました。${failed > 0 ? `${failed}件は失敗したので、次回もう一度試します。` : ''}`,
  };
}

/** 途中でやめたアップロードを片付ける（21章）。 */
export async function expireStaleUploads(): Promise<OpsActionState> {
  const session = await requirePermission('storage.manage');
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('expire_stale_uploads', { p_team_id: session.teamId });
  if (error) return { error: `片付けられませんでした: ${error.message}` };

  revalidatePath('/admin/storage');
  return { success: `${data ?? 0}件のアップロードを片付けました。` };
}
