import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';
import { requireProfile } from '@/features/auth/queries';
import { VISIBILITY_LABELS } from '@/lib/permissions/visibility';

export const metadata: Metadata = { title: 'マイページ' };

export default async function ProfilePage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHeader title="マイページ" settingsLink />

      <Card>
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatar_url} name={profile.display_name} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{profile.display_name}</p>
            {profile.bio ? (
              <p className="mt-1 text-sm whitespace-pre-wrap text-[--color-muted]">{profile.bio}</p>
            ) : (
              <p className="mt-1 text-sm text-[--color-muted]">
                自己紹介はまだありません。
                <Link href="/settings" className="ml-1 underline underline-offset-4">
                  設定から書く
                </Link>
              </p>
            )}
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[--color-muted]">
              <div className="flex gap-1">
                <dt>タイムゾーン</dt>
                <dd>{profile.timezone}</dd>
              </div>
              <div className="flex gap-1">
                <dt>既定の公開範囲</dt>
                <dd>{VISIBILITY_LABELS[profile.default_visibility]}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-4">
        <PhasePlaceholder
          phase={7}
          title="活動の集計"
          items={['今日と今週の活動時間', 'カテゴリー別の内訳', '連続記録日数', '週間目標の進捗']}
        />
        <PhasePlaceholder
          phase={4}
          title="過去の記録"
          items={['自分の活動記録の一覧', '非公開の記録もここから見られる']}
        />
      </div>
    </>
  );
}
