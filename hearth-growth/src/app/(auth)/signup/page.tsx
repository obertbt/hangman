import type { Metadata } from 'next';
import Link from 'next/link';

import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: '新規登録' };

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <PhasePlaceholder
        phase={1}
        title="新規登録"
        items={[
          'メールアドレス・パスワード・表示名',
          'プロフィールと初期カテゴリーは DB トリガーが自動作成する',
          '確認メールの送信',
        ]}
      />
      <p className="text-center text-sm text-[--color-muted]">
        <Link href="/login" className="underline underline-offset-4">
          ログイン
        </Link>
      </p>
    </div>
  );
}
