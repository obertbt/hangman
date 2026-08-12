import type { Metadata } from 'next';

import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'ログイン' };

/**
 * Next.js 16 では searchParams が Promise になっている。
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">ログイン</h2>
      <LoginForm next={next ?? '/today'} />
      <p className="mt-6 text-xs text-[--color-muted]">
        アカウントは部の管理者が作成します。ログインできない場合は管理者へ連絡してください。
      </p>
    </>
  );
}
