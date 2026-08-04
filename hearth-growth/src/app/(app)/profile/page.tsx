import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'マイページ' };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="マイページ" description="自分の積み重ねを振り返る場所です。" settingsLink />
      <div className="space-y-4">
        <PhasePlaceholder phase={1} title="プロフィール" items={['表示名', 'プロフィール画像', '自己紹介']} />
        <PhasePlaceholder
          phase={7}
          title="活動の集計"
          items={['今日と今週の活動時間', 'カテゴリー別の内訳', '連続記録日数', '週間目標の進捗']}
        />
      </div>
    </>
  );
}
