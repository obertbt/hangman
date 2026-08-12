import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { listAuditActions, listAuditLogs } from '@/features/ops/queries';
import { requireSession, isStaff } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: '操作の記録' };

/** 63章で記録すると決めた操作の日本語。知らない値はそのまま出す。 */
const ACTION_LABELS: Record<string, string> = {
  'import.execute': 'データ移行を実行',
  'import.rollback': 'データ移行を取り消し',
  'video.delete': '動画を削除',
  'file.hard_delete': 'ファイルの実体を削除',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * 操作の記録（63章）。
 *
 * 「誰が・いつ・何に対して・何をしたか」だけを残す。
 * 秘密鍵や署名付き URL は記録していない。
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; since?: string }>;
}) {
  const session = await requireSession();

  // 監査ログはスタッフだけ（RLS も同じ条件）
  if (!isStaff(session)) {
    redirect('/today?denied=' + encodeURIComponent('audit.view'));
  }

  const { action, since } = await searchParams;

  const [items, actions] = await Promise.all([
    listAuditLogs(session, { action, since }),
    listAuditActions(session),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">操作の記録</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          誰が・いつ・何をしたか。あとから確かめられるように残しています。
        </p>
      </header>

      {actions.length > 0 ? (
        <Card>
          <CardHeader title="絞り込む" />
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href="/admin/audit"
                className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-sm ${
                  action ? 'border-[--color-border]' : 'border-keio-600 font-medium'
                }`}
              >
                すべて
              </Link>
            </li>
            {actions.map((value) => (
              <li key={value}>
                <Link
                  href={`/admin/audit?action=${encodeURIComponent(value)}`}
                  className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-sm ${
                    action === value ? 'border-keio-600 font-medium' : 'border-[--color-border]'
                  }`}
                >
                  {actionLabel(value)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="記録" description={`${items.length}件（新しい順、最大200件）`} />
        {items.length === 0 ? (
          <EmptyState>まだ記録がありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {items.map(({ log, actorName }) => (
              <li key={log.id} className="py-3">
                <p className="text-sm">
                  <span className="font-medium">{actorName}</span>
                  <span className="ml-2">{actionLabel(log.action)}</span>
                </p>
                {log.summary ? (
                  <p className="mt-1 text-sm break-all text-[--color-muted]">{log.summary}</p>
                ) : null}
                <p className="mt-1 text-xs text-[--color-muted]">
                  {formatDateTimeInTokyo(log.created_at)}
                  {log.target_table ? ` / ${log.target_table}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="残していないもの" />
        <p className="text-sm">
          秘密鍵と署名付き URL そのものは記録していません。 保存先の名前（key）には氏名を入れていません。
        </p>
        <p className="mt-2 text-xs text-[--color-muted]">
          監査ログは書き換えも削除もできません（`authenticated` から権限を外しています）。
        </p>
      </Card>
    </div>
  );
}
