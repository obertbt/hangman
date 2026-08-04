import type { Metadata } from 'next';

import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'パスワード再設定' };

export default function ResetPasswordPage() {
  return (
    <PhasePlaceholder
      phase={1}
      title="パスワード再設定"
      items={['再設定メールの送信', 'メール内リンクからの新パスワード設定']}
    />
  );
}
