import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  CreateInviteForm,
  RevokeInviteButton,
  type InvitableMember,
} from '@/features/invite/components/invite-forms';
import { invitationState, INVITATION_VALID_DAYS } from '@/features/invite/lib/token';
import { isStaff, requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { formatDateTimeInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: '招待' };

/**
 * 招待の発行（Phase 1 の積み残し）。
 *
 * これが無いと、新入部員が入るたびに Supabase の管理画面を開くことになる。
 * 長くは続かない（3章の11）。
 */
export default async function InvitationsPage() {
  const session = await requireSession();

  if (!isStaff(session)) {
    redirect('/today?denied=' + encodeURIComponent('invitation'));
  }

  const supabase = await createClient();

  const [{ data: invitations }, { data: members }] = await Promise.all([
    supabase
      .from('team_invitations')
      .select('*')
      .eq('team_id', session.teamId)
      .order('created_at', { ascending: false })
      .limit(100),
    // 移行で登録したが、まだログインしていない部員（ADR-0002）
    supabase
      .from('team_members')
      .select('id, jersey_number, profiles(full_name, display_name, user_id)')
      .eq('team_id', session.teamId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('jersey_number', { ascending: true, nullsFirst: false }),
  ]);

  const invitable: InvitableMember[] = (members ?? []).flatMap((member) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    if (!profile || profile.user_id) return [];
    return [{ id: member.id, name: profile.display_name || profile.full_name }];
  });

  const rows = invitations ?? [];
  const pending = rows.filter(
    (row) => invitationState({ expiresAt: row.expires_at, acceptedAt: row.accepted_at }) === 'valid',
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">招待</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          リンクを作って渡すと、その人が自分でアカウントを作れます。
        </p>
      </header>

      {invitable.length > 0 ? (
        <Card>
          <CardHeader
            title={`まだログインしていない部員が${invitable.length}名います`}
            description="移行で登録したまま、アカウントを作っていない人です。"
          />
          <p className="text-sm">
            下のフォームで「名簿の誰か」から選ぶと、その人にログインを結び付けられます。
            記録が別々になりません。
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="招待リンクを作る" />
        <CreateInviteForm members={invitable} canAssignRole={session.role === 'system_admin'} />
      </Card>

      <Card>
        <CardHeader title="いま有効な招待" description={`${pending.length}件`} />
        {rows.length === 0 ? (
          <EmptyState>まだ招待はありません。</EmptyState>
        ) : (
          <ul className="divide-y divide-[--color-border]">
            {rows.map((row) => {
              const state = invitationState({
                expiresAt: row.expires_at,
                acceptedAt: row.accepted_at,
              });

              return (
                <li key={row.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={state === 'valid' ? 'info' : state === 'accepted' ? 'success' : 'neutral'}>
                        {state === 'valid' ? '有効' : state === 'accepted' ? '参加済み' : '期限切れ'}
                      </Badge>
                      <span className="font-medium break-all">{row.email}</span>
                      <span className="text-xs text-[--color-muted]">{ROLE_LABELS[row.role_code]}</span>
                    </p>
                    <p className="mt-1 text-xs text-[--color-muted]">
                      {state === 'accepted' && row.accepted_at
                        ? `${formatDateTimeInTokyo(row.accepted_at)} に参加`
                        : `${formatDateTimeInTokyo(row.expires_at)} まで`}
                    </p>
                  </div>

                  {state === 'valid' ? <RevokeInviteButton invitationId={row.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="気をつけること" />
        <ul className="space-y-1 text-sm text-[--color-muted]">
          <li>・リンクは**作った直後の1回しか表示できません**。保存しているのは照合用の値だけです</li>
          <li>・リンクは{INVITATION_VALID_DAYS}日で切れます。使えるのは1回だけです</li>
          <li>・渡す相手を間違えたら、すぐ「取り消す」を押してください</li>
          <li>・選手以外を招待できるのは管理者だけです</li>
        </ul>
        <p className="mt-2 text-sm">
          <Link href="/members" className="text-keio-700 dark:text-keio-300 underline">
            名簿へ
          </Link>
        </p>
      </Card>
    </div>
  );
}
