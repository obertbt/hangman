import type { Metadata } from 'next';

import { FormMessage } from '@/components/ui/field';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = { title: 'ログイン' };

const LINK_ERRORS: Record<string, string> = {
  invalid_link: 'リンクが正しくありません。もう一度お試しください。',
  expired_link: 'リンクの有効期限が切れています。もう一度お試しください。',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // next はサーバー側で読んでフォームへ渡す。
  // クライアントで useSearchParams を使うと、フォームが初回の HTML に含まれなくなるため。
  const { error, next } = await searchParams;
  const linkError = error ? LINK_ERRORS[error] : undefined;

  return (
    <div className="space-y-4">
      {linkError ? <FormMessage>{linkError}</FormMessage> : null}
      <LoginForm next={next} />
    </div>
  );
}
