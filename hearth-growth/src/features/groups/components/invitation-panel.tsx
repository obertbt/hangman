'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select } from '@/components/ui/field';
import { createInvitationAction, revokeInvitationAction } from '@/features/groups/actions';
import { INVITATION_DEFAULTS } from '@/features/groups/schemas';
import type { GroupInvitationRow } from '@/types/database.types';

interface InvitationPanelProps {
  groupId: string;
  invitations: GroupInvitationRow[];
  /** 招待リンクの組み立てに使う。サーバー側の設定値を渡す。 */
  siteUrl: string;
}

function invitationUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/invite/${token}`;
}

function formatExpiry(value: string): string {
  return new Date(value).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function InvitationPanel({ groupId, invitations, siteUrl }: InvitationPanelProps) {
  const router = useRouter();
  const [expiresInDays, setExpiresInDays] = useState<number>(INVITATION_DEFAULTS.expiresInDays);
  const [maxUses, setMaxUses] = useState<number>(INVITATION_DEFAULTS.maxUses);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createInvitationAction({ groupId, expiresInDays, maxUses });
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleRevoke = (invitationId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeInvitationAction(groupId, invitationId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleCopy = async (token: string) => {
    const url = invitationUrl(siteUrl, token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // クリップボードが使えない環境では、選択できるよう入力欄に出しているだけで十分
      setError('コピーできませんでした。リンクを長押しして選択してください。');
    }
  };

  return (
    <div className="space-y-4">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="有効期限" htmlFor="expiresInDays">
          <Select
            id="expiresInDays"
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          >
            <option value={1}>1日</option>
            <option value={7}>7日</option>
            <option value={30}>30日</option>
          </Select>
        </Field>
        <Field label="使える回数" htmlFor="maxUses">
          <Select id="maxUses" value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))}>
            <option value={1}>1回</option>
            <option value={10}>10回</option>
            <option value={50}>50回</option>
          </Select>
        </Field>
      </div>

      <Button onClick={handleCreate} disabled={isPending}>
        {isPending ? '発行しています…' : '招待リンクを発行する'}
      </Button>

      {invitations.length === 0 ? (
        <p className="text-sm text-[--color-muted]">有効な招待リンクはありません。</p>
      ) : (
        <ul className="space-y-3">
          {invitations.map((invitation) => {
            const url = invitationUrl(siteUrl, invitation.token);
            const isExhausted = invitation.used_count >= invitation.max_uses;
            const isExpired = new Date(invitation.expires_at) <= new Date();

            return (
              <li key={invitation.id} className="rounded-xl border border-[--color-border] p-3">
                <input
                  readOnly
                  value={url}
                  aria-label="招待リンク"
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full rounded-lg bg-[--color-background] px-2 py-1.5 text-xs"
                />
                <p className="mt-2 text-xs text-[--color-muted]">
                  {formatExpiry(invitation.expires_at)}まで / {invitation.used_count} of {invitation.max_uses}{' '}
                  回使用
                  {isExpired ? '（期限切れ）' : null}
                  {!isExpired && isExhausted ? '（上限に達しています）' : null}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleCopy(invitation.token)}>
                    {copiedToken === invitation.token ? 'コピーしました' : 'コピー'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => handleRevoke(invitation.id)}
                  >
                    無効にする
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-[--color-muted]">
        リンクを知っている人は誰でも参加できます。親しい人にだけ渡してください。
      </p>
    </div>
  );
}
