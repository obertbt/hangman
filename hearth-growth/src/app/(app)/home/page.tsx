import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardTitle } from '@/components/ui/card';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';
import { formatDuration } from '@/lib/date/duration';
import { getToday, formatDateLabel, DEFAULT_TIMEZONE } from '@/lib/date/timezone';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'ホーム' };

export default async function HomePage() {
  // Phase 1 以降で profiles から表示名とタイムゾーンを読む。
  const user = await getCurrentUser();
  const today = getToday(DEFAULT_TIMEZONE);

  return (
    <>
      <PageHeader title={formatDateLabel(today)} description="今日も、少しずつ。" settingsLink />

      <section aria-label="今日の自分" className="grid grid-cols-2 gap-3">
        <Card>
          <CardTitle>今日の活動時間</CardTitle>
          <p className="mt-1 text-2xl font-bold">{formatDuration(0)}</p>
        </Card>
        <Card>
          <CardTitle>連続記録</CardTitle>
          <p className="mt-1 text-2xl font-bold">
            0<span className="ml-1 text-sm font-normal text-[--color-muted]">日</span>
          </p>
        </Card>
      </section>

      <div className="mt-4 space-y-4">
        <PhasePlaceholder
          phase={5}
          title="今、頑張っている人"
          items={[
            'グループのメンバーで活動中の人を表示する',
            'カテゴリーと開始からの経過時間を出す',
            'get_active_group_members() から取得する',
          ]}
        />
        <PhasePlaceholder
          phase={7}
          title="今日と今週のまとめ"
          items={['今日の合計活動時間と件数', '今週の目標に対する進捗', 'カテゴリー別の内訳']}
        />
        <PhasePlaceholder
          phase={5}
          title="タイムライン"
          items={['グループメンバーと自分の活動記録', '新しい順に20件ずつ読み込む']}
        />
      </div>

      {user ? null : (
        <p className="mt-6 text-xs text-[--color-muted]">
          Supabase 未接続のため、ログイン情報は表示していません。
        </p>
      )}
    </>
  );
}
