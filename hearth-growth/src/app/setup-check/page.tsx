import type { Metadata } from 'next';

import { env } from '@/lib/env';

export const metadata: Metadata = { title: '接続の確認', robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

/**
 * 設定の自己診断（docs/DEPLOY.md から使う）。
 *
 * ログインできないとき、原因が「URL が違う」「鍵が違う」「メール確認が有効」の
 * どれなのかを切り分けるためのページ。ログイン前でも開ける。
 *
 * 出すのは、すでにブラウザへ配られている情報だけ。
 * 鍵は先頭数文字と長さしか表示しない。
 */
interface CheckResult {
  ok: boolean;
  title: string;
  detail: string;
  hint?: string;
}

async function checkAuthEndpoint(): Promise<CheckResult & { autoconfirm?: boolean }> {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`;

  try {
    const response = await fetch(url, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        title: '鍵が受け付けられませんでした',
        detail: `HTTP ${response.status}`,
        hint: 'NEXT_PUBLIC_SUPABASE_ANON_KEY を、Supabase の API Keys ページからコピーし直してください。',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        title: '想定しない応答が返りました',
        detail: `HTTP ${response.status}`,
        hint: 'NEXT_PUBLIC_SUPABASE_URL が別の場所を指していないか確認してください。',
      };
    }

    const settings = (await response.json()) as { mailer_autoconfirm?: boolean };
    return {
      ok: true,
      title: 'Supabase に接続できています',
      detail: `HTTP ${response.status}`,
      autoconfirm: settings.mailer_autoconfirm,
    };
  } catch (error) {
    return {
      ok: false,
      title: 'Supabase に届きませんでした',
      detail: error instanceof Error ? error.name : '不明な失敗',
      hint: 'NEXT_PUBLIC_SUPABASE_URL の値を確認してください。末尾の / や余分な文字が入っていませんか。',
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/profiles?select=id&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (response.status === 404) {
      return {
        ok: false,
        title: 'テーブルが見つかりません',
        detail: `HTTP ${response.status}`,
        hint: 'supabase/setup/ の SQL（01〜06）をすべて実行したか確認してください。',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        title: 'データベースへ問い合わせできませんでした',
        detail: `HTTP ${response.status}`,
      };
    }

    return { ok: true, title: 'テーブルを読み取れています', detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      title: 'データベースへ届きませんでした',
      detail: error instanceof Error ? error.name : '不明な失敗',
    };
  }
}

export default async function SetupCheckPage() {
  const [auth, database] = await Promise.all([checkAuthEndpoint(), checkDatabase()]);

  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const host = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
    } catch {
      return '（URL の形が不正です）';
    }
  })();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-4 px-4 py-8">
      <header>
        <h1 className="text-xl font-bold">接続の確認</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          ログインできないときに、設定のどこがおかしいかを調べるページです。
        </p>
      </header>

      <section className="space-y-3">
        {[auth, database].map((result) => (
          <div
            key={result.title}
            className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-4"
          >
            <p className="font-medium">
              <span aria-hidden className="mr-2">
                {result.ok ? '✅' : '❌'}
              </span>
              {result.title}
            </p>
            <p className="mt-1 text-xs text-[--color-muted]">{result.detail}</p>
            {result.hint ? <p className="mt-2 text-sm">{result.hint}</p> : null}
          </div>
        ))}

        {auth.ok && auth.autoconfirm === false ? (
          <div className="border-ember-400 bg-ember-400/10 rounded-2xl border p-4">
            <p className="font-medium">⚠️ メール確認が有効になっています</p>
            <p className="mt-2 text-sm">
              新規登録のたびに確認メールが送られます。無料の内蔵メールは送信数の制限が厳しく、
              失敗すると登録できません。Supabase の Authentication → Sign In / Providers → Email → Confirm
              email をオフにすると、すぐ登録できるようになります。
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[--color-border] bg-[--color-surface] p-4">
        <h2 className="text-sm font-medium text-[--color-muted]">いま設定されている値</h2>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="text-xs text-[--color-muted]">接続先</dt>
            <dd className="font-mono break-all">{host}</dd>
          </div>
          <div>
            <dt className="text-xs text-[--color-muted]">鍵</dt>
            {/* 鍵そのものは出さない。取り違えが分かる程度に留める。 */}
            <dd className="font-mono break-all">
              {key.slice(0, 8)}… （{key.length}文字）
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[--color-muted]">このサイトの URL 設定</dt>
            <dd className="font-mono break-all">{env.NEXT_PUBLIC_SITE_URL}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[--color-muted]">
          鍵は `sb_publishable_` か `eyJ` で始まります。別のもの（URL など）が入っていないか確認してください。
        </p>
      </section>
    </main>
  );
}
