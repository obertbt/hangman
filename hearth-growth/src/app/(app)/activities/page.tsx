import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: '記録' };

export default function ActivitiesPage() {
  return (
    <>
      <PageHeader title="記録" description="タイマーを使わなかった活動もここから残せます。" />
      <div className="space-y-4">
        <PhasePlaceholder
          phase={4}
          title="手動で記録する"
          items={['カテゴリーと活動時間だけで保存できる', '本文は任意', '活動日を選べる']}
        />
        <PhasePlaceholder
          phase={4}
          title="自分の記録一覧"
          items={['過去の活動記録', '編集と論理削除', '非公開の記録もここから見られる']}
        />
      </div>
    </>
  );
}
