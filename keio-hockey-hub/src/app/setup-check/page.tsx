import type { Metadata } from 'next';

import { isSupabaseConfigured } from '@/lib/env';
import { isStorageConfigured } from '@/lib/storage/r2';

export const metadata: Metadata = { title: '接続設定の確認' };

/**
 * 設定の自己診断。
 * 「動かない」時に、まずここを見れば原因が分かるようにする。
 * 値そのものは絶対に表示しない（設定済みかどうかだけ）。
 */
export default function SetupCheckPage() {
  const checks = [
    {
      label: 'Supabase（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）',
      ok: isSupabaseConfigured(),
      hint: 'ログインとデータ保存に必要です。',
    },
    {
      label: 'Supabase サービスロールキー（SUPABASE_SERVICE_ROLE_KEY）',
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hint: 'データ移行で使います。ブラウザには渡していません。',
    },
    {
      label: 'Cloudflare R2（R2_*）',
      ok: isStorageConfigured(),
      hint: 'Phase 7 の動画投稿で使います。今の段階では未設定でも動きます。',
    },
  ];

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="mb-1 text-lg font-bold">接続設定の確認</h1>
      <p className="mb-6 text-sm text-gray-500">設定されているかどうかだけを表示します。値は表示しません。</p>

      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.label} className="rounded-xl border border-gray-200 p-4">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              {check.label}
              <span className={check.ok ? 'text-emerald-600' : 'text-amber-600'}>
                {check.ok ? '設定済み' : '未設定'}
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-500">{check.hint}</p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-gray-500">
        設定方法は README と docs/deployment.md を参照してください。
      </p>
    </main>
  );
}
