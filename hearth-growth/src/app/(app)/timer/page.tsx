import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'タイマー' };

export default function TimerPage() {
  return (
    <>
      <PageHeader title="活動を始める" description="カテゴリーを選ぶだけで始められます。" />
      <div className="space-y-4">
        <PhasePlaceholder
          phase={3}
          title="タイマー"
          items={[
            'カテゴリー選択と開始',
            '一時停止・再開・終了・キャンセル',
            '経過時間は started_at から計算する（画面側で秒を保持しない）',
            '再読み込みしても状態を復元する',
            'running / paused は1ユーザー1件まで',
          ]}
        />
        <PhasePlaceholder
          phase={4}
          title="活動終了画面"
          items={['活動時間の確認', '振り返りの入力（任意）', '公開範囲の選択', '投稿 または 非公開で保存']}
        />
      </div>
    </>
  );
}
