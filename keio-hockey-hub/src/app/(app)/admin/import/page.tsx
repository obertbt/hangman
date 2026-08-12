import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ImportWizard } from '@/features/import/components/import-wizard';
import { RollbackButton } from '@/features/import/components/rollback-button';
import { listImportSessions } from '@/features/import/queries';
import { requirePermission } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';
import { IMPORT_STATUS_LABELS, IMPORT_TYPE_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: 'データ移行' };

/**
 * Import Center（34章）。
 * 開けるのは import.execute を持つ人だけ（50章）。
 */
export default async function ImportPage() {
  const session = await requirePermission('import.execute');
  const sessions = await listImportSessions(session.teamId);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">データ移行</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          Google スプレッドシートや CSV から、選手プロフィールを取り込みます。
        </p>
      </header>

      <ImportWizard />

      <Card>
        <CardHeader title="取り込み履歴" description="この取り込みで追加したデータは取り消せます。" />
        {sessions.length === 0 ? (
          <EmptyState>まだ取り込みを実行していません。</EmptyState>
        ) : (
          <ul className="space-y-3">
            {sessions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[--color-border] pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {IMPORT_TYPE_LABELS[row.import_type]}
                    <Badge
                      tone={
                        row.status === 'completed'
                          ? 'success'
                          : row.status === 'rolled_back'
                            ? 'neutral'
                            : row.status === 'failed'
                              ? 'danger'
                              : 'info'
                      }
                      className="ml-2"
                    >
                      {IMPORT_STATUS_LABELS[row.status]}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs text-[--color-muted]">
                    {formatDateTimeInTokyo(row.created_at)} / 取り込み {row.imported_rows} 件 / 全
                    {row.total_rows} 行
                  </p>
                  {row.note ? (
                    <p className="mt-1 text-xs whitespace-pre-line text-red-600">{row.note}</p>
                  ) : null}
                </div>

                {row.status === 'completed' && row.imported_rows > 0 ? (
                  <RollbackButton sessionId={row.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
