import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: '設定' };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="設定" />
      <div className="space-y-4">
        <PhasePlaceholder
          phase={1}
          title="アカウント"
          items={['表示名・自己紹介・プロフィール画像', 'タイムゾーン', 'ログアウト']}
        />
        <PhasePlaceholder
          phase={4}
          title="記録の既定値"
          items={['デフォルト公開範囲', 'カテゴリーの並び替えと有効・無効']}
        />
        <PhasePlaceholder phase={8} title="そのほか" items={['通知設定', 'アカウント削除']} />
      </div>
    </>
  );
}
