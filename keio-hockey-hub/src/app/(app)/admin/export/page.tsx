import type { Metadata } from 'next';

import { Card, CardHeader } from '@/components/ui/card';
import { EXPORT_DESCRIPTIONS, EXPORT_LABELS, EXPORT_TYPES } from '@/features/ops/export';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: '記録の書き出し' };

/**
 * CSV の書き出し（3章の12: 過去の資産を失わない）。
 *
 * 誰でも開ける。**出る中身は RLS が決める。**
 * 選手が押せば自分のぶん、コーチが押せば見える範囲すべてが出る。
 * 「自分の記録を持ち出せる」ことは、選手にとっても大事なこと。
 */
export default async function ExportPage() {
  await requireSession();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">記録の書き出し</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          記録を CSV で取り出せます。Excel でも Google スプレッドシートでも開けます。
        </p>
      </header>

      <Card>
        <CardHeader title="書き出せるもの" />
        <ul className="space-y-2">
          {EXPORT_TYPES.map((type) => (
            <li key={type}>
              {/* Server Action ではなく普通のリンク。ブラウザにダウンロードさせる */}
              <a
                href={`/admin/export/${type}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-[--color-border] px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{EXPORT_LABELS[type]}</span>
                  <span className="block text-xs text-[--color-muted]">{EXPORT_DESCRIPTIONS[type]}</span>
                </span>
                <span className="text-keio-700 dark:text-keio-300 shrink-0 text-sm underline">CSV</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="出る範囲について" />
        <p className="text-sm">
          出るのは、その画面で自分に見えているものだけです。
          選手が押せば自分の記録、コーチが押せば見える範囲すべてが出ます。
        </p>
        <p className="mt-2 text-sm text-[--color-muted]">
          個人の記録なので、書き出したファイルの扱いには気をつけてください。
          ファイル名に氏名は入れていません。
        </p>
      </Card>
    </div>
  );
}
