'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FormMessage, Select } from '@/components/ui/field';
import {
  changeMemberPermission,
  changeMemberRole,
  type MemberAdminState,
} from '@/features/members/admin-actions';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import type { RoleCode } from '@/types/database.types';

const ROLES: RoleCode[] = ['system_admin', 'coach', 'manager', 'player'];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '変更しています…' : label}
    </Button>
  );
}

/** 役割の変更（13章）。 */
export function RoleEditor({
  memberId,
  currentRole,
  isSelf,
}: {
  memberId: string;
  currentRole: RoleCode;
  isSelf: boolean;
}) {
  const [state, formAction] = useActionState<MemberAdminState, FormData>(changeMemberRole, {});

  if (isSelf) {
    return (
      <p className="text-sm text-[--color-muted]">
        自分の役割は変えられません。 うっかり自分を降格させて操作できなくなる事故を防ぐためです。
        変える必要があるときは、他の管理者に頼んでください。
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="team_member_id" value={memberId} />

      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <Field label="役割" htmlFor="role_code" hint="役割を変えると、既定の権限もまとめて変わります。">
        <Select id="role_code" name="role_code" defaultValue={currentRole}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton label="役割を変える" />
    </form>
  );
}

export interface PermissionRow {
  code: string;
  label: string;
  /** 役割の既定。 */
  byRole: boolean;
  /** 個別設定。無ければ null。 */
  override: boolean | null;
  /** いま実際にできるか。 */
  effective: boolean;
}

/**
 * 個別権限の付け外し（13章）。
 *
 * 「役割の既定」と「この人だけの設定」を分けて見せる。
 * どちらで効いているのか分からないと、あとで直せない。
 */
export function PermissionEditor({ memberId, rows }: { memberId: string; rows: PermissionRow[] }) {
  const [state, formAction] = useActionState<MemberAdminState, FormData>(changeMemberPermission, {});

  return (
    <div className="space-y-3">
      {state.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      {state.success ? <FormMessage tone="success">{state.success}</FormMessage> : null}

      <ul className="divide-y divide-[--color-border]">
        {rows.map((row) => (
          <li key={row.code} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="mt-0.5 text-xs text-[--color-muted]">
                  役割の既定: {row.byRole ? 'あり' : 'なし'}
                  {row.override !== null ? ` / この人だけ ${row.override ? '付与' : '剥奪'}` : ''}
                </p>
              </div>

              <span
                className={`shrink-0 text-sm ${row.effective ? 'text-emerald-700 dark:text-emerald-400' : 'text-[--color-muted]'}`}
              >
                {row.effective ? 'できる' : 'できない'}
              </span>
            </div>

            <form action={formAction} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="team_member_id" value={memberId} />
              <input type="hidden" name="permission_code" value={row.code} />

              <Button type="submit" name="mode" value="grant" size="sm" variant="outline">
                付与する
              </Button>
              <Button type="submit" name="mode" value="revoke" size="sm" variant="outline">
                外す
              </Button>
              {row.override !== null ? (
                <Button type="submit" name="mode" value="reset" size="sm" variant="ghost">
                  役割どおりに戻す
                </Button>
              ) : null}
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
