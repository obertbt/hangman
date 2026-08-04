import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: 'グループ' };

export default function GroupsPage() {
  return (
    <>
      <PageHeader title="グループ" description="親しい人だけの場所です。" />
      <div className="space-y-4">
        <PhasePlaceholder
          phase={2}
          title="グループの作成と参加"
          items={[
            'グループ作成（create_group で owner 登録まで一度に行う）',
            '招待リンクの発行と失効',
            '招待リンクからの参加（accept_invitation）',
            'メンバー一覧と権限変更',
          ]}
        />
        <PhasePlaceholder
          phase={7}
          title="グループの今週"
          items={['メンバーごとの継続状況', '順位ではなく達成率を出す']}
        />
      </div>
    </>
  );
}
