'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select, TextInput } from '@/components/ui/field';
import { createInvitation, revokeInvitation, type InviteState } from '@/features/invite/actions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import type { RoleCode } from '@/types/database.types';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="action" block disabled={pending}>
      {pending ? '作っています…' : label}
    </Button>
  );
}

export interface InvitableMember {
  id: string;
  name: string;
}

/**
 * 招待を作る。
 *
 * **リンクは作った直後の1回しか表示できない。**
 * DB にはハッシュしか残らないので、閉じたら二度と見られない。
 * それを画面で先に伝えておく。
 */
export function CreateInviteForm({
  members,
  canAssignRole,
}: {
  members: InvitableMember[];
  canAssignRole: boolean;
}) {
  const [state, formAction] = useActionState<InviteState, FormData>(createInvitation, {});
  const [copied, setCopied] = useState(false);

  const roles: RoleCode[] = canAssignRole ? ['player', 'coach', 'manager', 'system_admin'] : ['player'];

  return (
    <div className="space-y-4">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      {state.link ? (
        <div className="rounded-lg border border-emerald-500 px-3 py-3">
          <p className="text-sm font-medium">リンクを作りました</p>
          <p className="mt-1 text-xs text-[--color-muted]">
            この画面を閉じると二度と表示できません。いま渡してください。
          </p>

          <p className="mt-2 rounded-lg bg-[--color-surface] px-2 py-2 font-mono text-xs break-all">
            {state.link}
          </p>

          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              void navigator.clipboard.writeText(state.link ?? '');
              setCopied(true);
            }}
          >
            {copied ? 'コピーしました' : 'リンクをコピー'}
          </Button>
        </div>
      ) : null}

      <form action={formAction} className="space-y-4">
        <Field label="メールアドレス" htmlFor="email" required hint="この人がログインに使うアドレスです。">
          <TextInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            required
            placeholder="hanako@example.com"
          />
        </Field>

        {members.length > 0 ? (
          <Field
            label="名簿の誰か"
            htmlFor="team_member_id"
            hint="移行で登録した部員に、ログインを結び付けます。選ばなければ新しく迎えます。"
          >
            <Select id="team_member_id" name="team_member_id" defaultValue="">
              <option value="">新しく迎える（名簿に無い人）</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label="役割"
          htmlFor="role_code"
          hint={
            canAssignRole
              ? '選手以外を招待できるのは管理者だけです。'
              : '選手として招待します。役割を変えるには管理者に頼んでください。'
          }
        >
          <Select id="role_code" name="role_code" defaultValue="player">
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <SubmitButton label="招待リンクを作る" />
      </form>
    </div>
  );
}

/** 渡したリンクを無効にする。 */
export function RevokeInviteButton({ invitationId }: { invitationId: string }) {
  const [state, formAction] = useActionState<InviteState, FormData>(revokeInvitation, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="invitation_id" value={invitationId} />

      {confirming ? (
        <Button type="submit" variant="danger" size="sm">
          本当に取り消す
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
          取り消す
        </Button>
      )}

      {state.error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
