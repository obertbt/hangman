import type { Metadata } from 'next';

import { ResetRequestForm } from '@/features/auth/components/reset-request-form';

export const metadata: Metadata = { title: 'パスワード再設定' };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[--color-muted]">
        登録したメールアドレスへ、パスワード再設定用のリンクをお送りします。
      </p>
      <ResetRequestForm />
    </div>
  );
}
