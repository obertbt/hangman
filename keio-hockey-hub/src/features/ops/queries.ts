import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { limits } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import type {
  AuditLogRow,
  FileDeletionJobRow,
  NotificationRow,
  StorageUsageSnapshotRow,
} from '@/types/database.types';

import { daysUntilFull, reclaimableBytes, summarizeUsage, type UsageSummary } from './lib/capacity';

/**
 * 運用まわりの読み取り（59章・63章・57章）。
 *
 * 見えるかどうかは RLS が決める。
 *   容量・削除予約 … storage.manage を持つ人
 *   監査ログ       … スタッフ
 *   通知           … 自分が宛先のものだけ
 */

// -------------------------------------------------------------
// 通知（57章）
// -------------------------------------------------------------

export interface NotificationItem {
  notification: NotificationRow;
  targetId: string;
  readAt: string | null;
}

/**
 * 自分宛の通知。未読を先に、その中では新しい順。
 *
 * 「読んだものが上に残り続ける」と、新しい知らせが埋もれる。
 */
export async function listNotifications(session: AppSession, limit = 100): Promise<NotificationItem[]> {
  const supabase = await createClient();

  const { data: targets } = await supabase
    .from('notification_targets')
    .select('id, notification_id, read_at')
    .eq('team_member_id', session.teamMemberId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const rows = targets ?? [];
  if (rows.length === 0) return [];

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .in(
      'id',
      rows.map((row) => row.notification_id),
    );

  const byId = new Map((notifications ?? []).map((notification) => [notification.id, notification]));

  return rows
    .flatMap((row) => {
      const notification = byId.get(row.notification_id);
      return notification ? [{ notification, targetId: row.id, readAt: row.read_at }] : [];
    })
    .sort((left, right) => {
      const unread = Number(left.readAt !== null) - Number(right.readAt !== null);
      if (unread !== 0) return unread;
      return right.notification.created_at.localeCompare(left.notification.created_at);
    });
}

export async function countUnreadNotifications(session: AppSession): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('notification_targets')
    .select('id', { count: 'exact', head: true })
    .eq('team_member_id', session.teamMemberId)
    .is('read_at', null);
  return count ?? 0;
}

// -------------------------------------------------------------
// 容量（59章）
// -------------------------------------------------------------

export interface StorageOverview {
  latest: StorageUsageSnapshotRow | null;
  history: StorageUsageSnapshotRow[];
  usage: UsageSummary;
  /** 掃除すれば空く容量。 */
  reclaimable: number;
  /** このままだと何日で上限に届くか。分からなければ null。 */
  daysLeft: number | null;
  /** 期限が来ている削除予約。 */
  dueJobs: (FileDeletionJobRow & { storageKey: string | null; sizeBytes: number | null })[];
  /** 片付け待ちのアップロード。 */
  staleUploadCount: number;
}

export async function getStorageOverview(session: AppSession): Promise<StorageOverview> {
  const supabase = await createClient();

  const [snapshotResult, jobResult, staleResult] = await Promise.all([
    supabase
      .from('storage_usage_snapshots')
      .select('*')
      .eq('team_id', session.teamId)
      .order('captured_on', { ascending: false })
      .limit(60),
    supabase
      .from('file_deletion_jobs')
      .select('*')
      .eq('team_id', session.teamId)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(100),
    supabase
      .from('upload_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', session.teamId)
      .in('status', ['pending', 'uploading', 'uploaded', 'verifying'])
      .lt('expires_at', new Date().toISOString()),
  ]);

  const history = snapshotResult.data ?? [];
  const latest = history[0] ?? null;

  const usage = summarizeUsage(latest?.total_bytes ?? 0, limits.storageLimitBytes);

  const jobs = jobResult.data ?? [];
  const fileIds = jobs.map((job) => job.file_id);

  // 削除予約の中身は、論理削除済みのファイルなので通常の閲覧では引けない。
  // 何を消そうとしているかは key と容量だけ見せる（氏名は key に入っていない）。
  const { data: files } = fileIds.length
    ? await supabase.from('files').select('id, storage_key, size_bytes').in('id', fileIds)
    : { data: [] as { id: string; storage_key: string; size_bytes: number }[] };

  const fileById = new Map((files ?? []).map((file) => [file.id, file]));

  return {
    latest,
    history,
    usage,
    reclaimable: reclaimableBytes(latest?.deleted_bytes ?? 0, latest?.temp_bytes ?? 0),
    daysLeft: daysUntilFull(
      history.map((row) => ({ capturedOn: row.captured_on, totalBytes: row.total_bytes })),
      limits.storageLimitBytes,
    ),
    dueJobs: jobs.map((job) => ({
      ...job,
      storageKey: fileById.get(job.file_id)?.storage_key ?? null,
      sizeBytes: fileById.get(job.file_id)?.size_bytes ?? null,
    })),
    staleUploadCount: staleResult.count ?? 0,
  };
}

// -------------------------------------------------------------
// 監査ログ（63章）
// -------------------------------------------------------------

export interface AuditLogItem {
  log: AuditLogRow;
  actorName: string;
}

export interface AuditLogFilter {
  action?: string;
  /** 'YYYY-MM-DD'（Asia/Tokyo）。 */
  since?: string;
  limit?: number;
}

export async function listAuditLogs(
  session: AppSession,
  filter: AuditLogFilter = {},
): Promise<AuditLogItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('audit_logs')
    .select('*')
    .eq('team_id', session.teamId)
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 200);

  if (filter.action) query = query.eq('action', filter.action);
  if (filter.since) query = query.gte('created_at', `${filter.since}T00:00:00+09:00`);

  const { data } = await query;
  const logs = data ?? [];

  const actorIds = [...new Set(logs.map((log) => log.actor_id).filter((id): id is string => id !== null))];

  const { data: profiles } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name, display_name').in('id', actorIds)
    : { data: [] as { id: string; full_name: string; display_name: string | null }[] };

  const nameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.display_name ?? profile.full_name]),
  );

  return logs.map((log) => ({
    log,
    actorName: log.actor_id ? (nameById.get(log.actor_id) ?? '不明') : 'システム',
  }));
}

/** 絞り込みに使う、実際に記録されている操作の種類。 */
export async function listAuditActions(session: AppSession): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('action')
    .eq('team_id', session.teamId)
    .order('created_at', { ascending: false })
    .limit(500);

  return [...new Set((data ?? []).map((row) => row.action))].sort();
}
