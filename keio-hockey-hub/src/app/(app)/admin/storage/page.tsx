import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { StorageActions } from '@/features/ops/components/storage-actions';
import { USAGE_MESSAGES, type UsageLevel } from '@/features/ops/lib/capacity';
import { getStorageOverview } from '@/features/ops/queries';
import { requirePermission } from '@/lib/auth/session';
import { formatDateLabel, formatDateTimeInTokyo } from '@/lib/datetime';
import { isStorageConfigured } from '@/lib/storage/r2';
import { formatBytes } from '@/lib/storage/validation';

export const metadata: Metadata = { title: '保存容量' };

/**
 * 容量の状況と掃除（59章・60章）。
 *
 * 数字だけ出しても行動につながらないので、
 * 「いま何をすればいいか」と「押すと何が起きるか」を並べて出す。
 */
export default async function StoragePage() {
  const session = await requirePermission('storage.manage');
  const overview = await getStorageOverview(session);
  const configured = isStorageConfigured();

  const { usage, latest } = overview;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">保存容量</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          長く自分たちで運用し続けるための画面です。増え方を見て、早めに手を打ちます。
        </p>
      </header>

      <Card className={borderFor(usage.level)}>
        <CardHeader
          title="いまの使用量"
          description={latest ? `${formatDateLabel(latest.captured_on)} 時点` : 'まだ一度も数えていません'}
          action={<Badge tone={toneFor(usage.level)}>{labelFor(usage.level)}</Badge>}
        />

        {usage.limitBytes > 0 ? (
          <>
            <div
              className="bg-keio-100 dark:bg-keio-800 h-3 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={Math.min(100, Math.round(usage.percent))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="保存容量の使用率"
            >
              <div
                className={`h-full transition-[width] ${barFor(usage.level)}`}
                style={{ width: `${Math.min(100, usage.percent)}%` }}
              />
            </div>
            <p className="mt-2 text-sm">
              {formatBytes(usage.usedBytes)} / {formatBytes(usage.limitBytes)}（{usage.percent}%）
            </p>
            <p className="mt-1 text-sm text-[--color-muted]">{USAGE_MESSAGES[usage.level]}</p>
          </>
        ) : (
          <p className="text-sm">
            使用量 {formatBytes(usage.usedBytes)}。 上限（<code>STORAGE_LIMIT_BYTES</code>
            ）が設定されていないため、割合は出していません。
          </p>
        )}

        {overview.daysLeft !== null ? (
          <p className="mt-2 text-sm">
            いまの増え方が続くと、およそ <strong>{overview.daysLeft}日</strong> で上限に届きます。
          </p>
        ) : null}
      </Card>

      {latest ? (
        <Card>
          <CardHeader title="内訳" />
          <dl className="space-y-2 text-sm">
            <Row label="動画" value={formatBytes(latest.video_bytes)} />
            <Row label="画像" value={formatBytes(latest.image_bytes)} />
            <Row label="PDF" value={formatBytes(latest.pdf_bytes)} />
            <Row label="一時アップロード" value={formatBytes(latest.temp_bytes)} />
            <Row label="削除待ち（まだ容量を使っている）" value={formatBytes(latest.deleted_bytes)} />
            <Row label="ファイル数" value={`${latest.file_count}件`} />
          </dl>

          {overview.reclaimable > 0 ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40">
              片付ければ {formatBytes(overview.reclaimable)} 空きます。
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader title="手入れ" />
        <StorageActions
          dueCount={overview.dueJobs.length}
          staleCount={overview.staleUploadCount}
          storageConfigured={configured}
        />
        {!configured ? (
          <p className="mt-2 text-sm text-[--color-muted]">
            R2 が設定されていないため、実体の削除はできません。
            <Link href="/setup-check" className="text-keio-700 dark:text-keio-300 ml-1 underline">
              設定の状況を確認する
            </Link>
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="削除を待っているファイル"
          description="論理削除から30日を過ぎたもの。氏名は保存先の名前に入っていません。"
        />
        {overview.dueJobs.length === 0 ? (
          <EmptyState>いま消せるものはありません。</EmptyState>
        ) : (
          <ul className="space-y-2 text-sm">
            {overview.dueJobs.map((job) => (
              <li key={job.id} className="rounded-lg border border-[--color-border] px-3 py-2">
                <p className="font-mono text-xs break-all">{job.storageKey ?? '（不明）'}</p>
                <p className="mt-1 text-xs text-[--color-muted]">
                  {job.sizeBytes !== null ? `${formatBytes(job.sizeBytes)} / ` : ''}
                  予定 {formatDateTimeInTokyo(job.scheduled_for)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {overview.history.length > 1 ? (
        <Card>
          <CardHeader title="これまでの推移" description="日ごとの記録（新しい順）" />
          <ul className="space-y-1 text-sm">
            {overview.history.slice(0, 14).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3">
                <span className="text-[--color-muted]">{formatDateLabel(row.captured_on)}</span>
                <span>{formatBytes(row.total_bytes)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function labelFor(level: UsageLevel): string {
  return { ok: '余裕あり', notice: '注意', warning: '警告', critical: '緊急' }[level];
}

function toneFor(level: UsageLevel): 'success' | 'info' | 'warning' | 'danger' {
  return ({ ok: 'success', notice: 'info', warning: 'warning', critical: 'danger' } as const)[level];
}

function borderFor(level: UsageLevel): string | undefined {
  if (level === 'critical') return 'border-red-500';
  if (level === 'warning') return 'border-amber-400';
  return undefined;
}

function barFor(level: UsageLevel): string {
  return {
    ok: 'bg-emerald-600',
    notice: 'bg-keio-600',
    warning: 'bg-amber-500',
    critical: 'bg-red-600',
  }[level];
}
