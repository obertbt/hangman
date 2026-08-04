import type { Metadata } from 'next';

import { UpdatePasswordForm } from '@/features/auth/components/update-password-form';

export const metadata: Metadata = { title: '新しいパスワード' };

export default function UpdatePasswordPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[--color-muted]">新しいパスワードを設定してください。</p>
      <UpdatePasswordForm />
    </div>
  );
}
