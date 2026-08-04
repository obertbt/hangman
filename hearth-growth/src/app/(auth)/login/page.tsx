import type { Metadata } from 'next';
import Link from 'next/link';

import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'ログイン' };

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <PhasePlaceholder
        phase={1}
        title="ログイン"
        items={[
          'メールアドレスとパスワード',
          'パスワード再設定への導線',
          'Google ログインは後から追加できる形にする',
        ]}
      />
      <p className="text-center text-sm text-[--color-muted]">
        <Link href="/signup" className="underline underline-offset-4">
          新規登録
        </Link>
      </p>
    </div>
  );
}
