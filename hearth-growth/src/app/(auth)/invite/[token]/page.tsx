import type { Metadata } from 'next';

import { PhasePlaceholder } from '@/components/ui/phase-placeholder';

export const metadata: Metadata = { title: '招待' };

/**
 * 招待リンク。ログイン前でも「どのグループへの招待か」だけは確認できる。
 * 表示する情報は get_invitation_preview() が返す範囲に限る。
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await params;

  return (
    <PhasePlaceholder
      phase={2}
      title="グループへの招待"
      items={[
        'get_invitation_preview(token) でグループ名と招待者名だけを表示する',
        '未ログインならログイン後に同じリンクへ戻す',
        'accept_invitation(token) で参加する',
        '期限切れ・失効・上限超過はその理由を表示する',
      ]}
    />
  );
}
