import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormMessage } from '@/components/ui/field';
import { AcceptInvitationButton } from '@/features/groups/components/accept-invitation';
import { INVITATION_REASON_MESSAGES } from '@/features/groups/errors';
import { getInvitationPreview } from '@/features/groups/queries';
import { invitationTokenSchema } from '@/features/groups/schemas';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: '招待' };

/**
 * 招待リンク。
 * ログイン前でも「どのグループへの招待か」だけは確認できる。
 * 表示するのは get_invitation_preview() が返す範囲（グループ名・招待者・人数）に限る。
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const parsedToken = invitationTokenSchema.safeParse(token);
  if (!parsedToken.success) {
    return (
      <Card className="space-y-3 text-center">
        <FormMessage>この招待リンクは正しくありません。</FormMessage>
        <Link href="/login" className="text-sm underline underline-offset-4">
          ログインへ
        </Link>
      </Card>
    );
  }

  const [preview, user] = await Promise.all([getInvitationPreview(parsedToken.data), getCurrentUser()]);

  if (!preview || !preview.is_valid) {
    const reason = preview?.reason ?? 'not_found';
    return (
      <Card className="space-y-3 text-center">
        <FormMessage>{INVITATION_REASON_MESSAGES[reason] ?? 'この招待リンクは使えません。'}</FormMessage>
        <Link href="/login" className="text-sm underline underline-offset-4">
          ログインへ
        </Link>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 text-center">
      <div>
        <p className="text-sm text-[--color-muted]">{preview.inviter_name}さんからの招待</p>
        <p className="mt-1 text-xl font-bold">{preview.group_name}</p>
        <p className="mt-1 text-sm text-[--color-muted]">現在 {preview.member_count} 人が参加しています</p>
      </div>

      {user ? (
        <AcceptInvitationButton token={parsedToken.data} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[--color-muted]">
            参加するにはログインが必要です。登録後、この画面に戻ります。
          </p>
          {/* Link の中に button を入れると入れ子が不正になるため、Link 自体をボタンとして装う */}
          <div className="flex flex-col gap-2">
            <Link
              href={`/signup?next=/invite/${parsedToken.data}`}
              className={buttonVariants({ size: 'lg', block: true })}
            >
              新規登録して参加する
            </Link>
            <Link
              href={`/login?next=/invite/${parsedToken.data}`}
              className={buttonVariants({ variant: 'outline', block: true })}
            >
              ログインして参加する
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}
