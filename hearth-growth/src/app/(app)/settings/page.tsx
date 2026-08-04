import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { requireProfile } from '@/features/auth/queries';
import { AvatarUploader } from '@/features/profile/components/avatar-uploader';
import { ProfileForm } from '@/features/profile/components/profile-form';

export const metadata: Metadata = { title: '設定' };

export default async function SettingsPage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHeader title="設定" />

      <div className="space-y-4">
        <Card>
          <CardTitle>プロフィール画像</CardTitle>
          <div className="mt-3">
            <AvatarUploader profile={profile} />
          </div>
        </Card>

        <Card>
          <CardTitle>プロフィール</CardTitle>
          <div className="mt-3">
            <ProfileForm profile={profile} />
          </div>
        </Card>

        <PhasePlaceholder
          phase={4}
          title="カテゴリー"
          items={['カテゴリーの追加と編集', '並び替え', '使わないカテゴリーを隠す']}
        />

        <PhasePlaceholder phase={8} title="そのほか" items={['通知設定', 'アカウント削除']} />

        <Card>
          <CardTitle>アカウント</CardTitle>
          <div className="mt-3">
            <SignOutButton />
          </div>
        </Card>
      </div>
    </>
  );
}
