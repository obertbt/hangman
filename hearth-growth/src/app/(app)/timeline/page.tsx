import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'タイムライン' };

export default function TimelinePage() {
  return (
    <>
      <PageHeader title="タイムライン" description="仲間の積み重ねが並びます。" />
      <div className="space-y-4">
        <PhasePlaceholder
          phase={5}
          title="投稿一覧"
          items={[
            '新しい順に表示する（ランキングは使わない）',
            '20件ずつのページネーション',
            '閲覧できる投稿だけを RLS が返す',
          ]}
        />
        <PhasePlaceholder
          phase={6}
          title="リアクションとコメント"
          items={['1投稿につき1リアクション', 'コメントは元の投稿の公開範囲を超えない']}
        />
      </div>
    </>
  );
}
