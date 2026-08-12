import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardHeader } from '@/components/ui/card';
import { AcceptForm } from '@/features/invite/components/accept-form';
import {
  hashToken,
  INVITATION_STATE_MESSAGES,
  invitationState,
  looksLikeToken,
} from '@/features/invite/lib/token';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/auth/permissions';

export const metadata: Metadata = { title: '招待' };

/**
 * 招待を受ける画面。
 *
 * 開く人はまだログインしていない（`/invite` は公開パス）。
 * 見せるのは「どの部に、誰として招かれているか」だけ。
 * 他の部員の情報は出さない。
 *
 * リンクが使えないときも、**何が起きたのかと次にどうすればいいか**を書く。
 * 「無効です」だけだと、渡した側にも聞きようがない。
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 形が違うものは DB を引くまでもなく断る
  if (!looksLikeToken(token)) {
    return <InvalidLink message="このリンクは正しくありません。もう一度確認してください。" />;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc('find_invitation', { p_token_hash: hashToken(token) });
  const invitation = data?.[0];

  if (!invitation) {
    return <InvalidLink message="この招待リンクは見つかりませんでした。部の担当者に確認してください。" />;
  }

  const state = invitationState({
    expiresAt: invitation.expires_at,
    acceptedAt: invitation.accepted_at,
  });

  if (state !== 'valid') {
    return <InvalidLink message={INVITATION_STATE_MESSAGES[state]} />;
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-[--color-muted]">{invitation.team_name}</p>
        <h1 className="mt-1 text-xl font-bold">
          {invitation.invited_name ? `${invitation.invited_name}さん、ようこそ` : 'ようこそ'}
        </h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          {ROLE_LABELS[invitation.role_code]}として招かれています。
          パスワードを決めると、すぐ使いはじめられます。
        </p>
      </header>

      <Card>
        <CardHeader title="アカウントを作る" />
        <AcceptForm token={token} email={invitation.email} needsName={invitation.invited_name === null} />
      </Card>

      <Card>
        <CardHeader title="このリンクについて" />
        <ul className="space-y-1 text-sm text-[--color-muted]">
          <li>・使えるのは1回だけです</li>
          <li>・他の人には渡さないでください</li>
          <li>・心当たりがなければ、そのまま閉じてください</li>
        </ul>
      </Card>
    </div>
  );
}

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">この招待リンクは使えません</h1>
      </header>

      <Card>
        <p className="text-sm">{message}</p>
        <p className="mt-3 text-sm">
          すでにアカウントをお持ちなら、
          <Link href="/login" className="text-keio-700 dark:text-keio-300 mx-1 underline">
            ログイン
          </Link>
          からお入りください。
        </p>
      </Card>
    </div>
  );
}
