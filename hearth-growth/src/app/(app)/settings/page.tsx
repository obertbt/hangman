import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { requireProfile } from '@/features/auth/queries';
import { CategoryManager } from '@/features/categories/components/category-manager';
import { listCategories } from '@/features/categories/queries';
import { NotificationSettingsForm } from '@/features/notifications/components/notification-settings-form';
import { DevicePushToggle } from '@/features/push/components/device-push-toggle';
import { AvatarUploader } from '@/features/profile/components/avatar-uploader';
import { ProfileForm } from '@/features/profile/components/profile-form';

export const metadata: Metadata = { title: '設定' };

export default async function SettingsPage() {
  const profile = await requireProfile();
  // 使わない設定にしたカテゴリーもここでは出す
  const categories = await listCategories({ activeOnly: false });

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

        <Card>
          <CardTitle>カテゴリー</CardTitle>
          <div className="mt-3">
            <CategoryManager categories={categories} />
          </div>
        </Card>

        <Card>
          <CardTitle>お知らせ</CardTitle>
          <div className="mt-3">
            <NotificationSettingsForm profile={profile} />
          </div>
        </Card>

        <Card>
          <CardTitle>この端末への通知</CardTitle>
          <div className="mt-3">
            <DevicePushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
          </div>
        </Card>

        <PhasePlaceholder phase={16} title="そのほか" items={['アカウント削除']} />

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
