import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { PermissionEditor, RoleEditor, type PermissionRow } from '@/features/members/components/role-editor';
import {
  hasPermission,
  isPermission,
  PERMISSION_LABELS,
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type PermissionOverrides,
} from '@/lib/auth/permissions';
import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { MEMBER_STATUS_LABELS, POSITION_LABELS } from '@/lib/labels';

export const metadata: Metadata = { title: '部員の設定' };

/**
 * 部員1人の役割と権限（13章）。
 *
 * 管理者だけが開ける。RLS も同じ条件で守っている。
 * ここが無いと、コーチが増えるたびに SQL を書くことになる（3章の11）。
 */
export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  if (session.role !== 'system_admin') {
    redirect('/members');
  }

  const supabase = await createClient();

  const { data: member } = await supabase
    .from('team_members')
    .select('id, role_code, status, position, jersey_number, grade, profiles(full_name, display_name, email)')
    .eq('team_id', session.teamId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!member) notFound();

  const { data: overrideRows } = await supabase
    .from('member_permissions')
    .select('permission_code, granted')
    .eq('team_member_id', id);

  const overrides: PermissionOverrides = {};
  for (const row of overrideRows ?? []) {
    if (isPermission(row.permission_code)) {
      overrides[row.permission_code] = row.granted;
    }
  }

  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  const name = profile?.display_name || profile?.full_name || '不明';

  const rows: PermissionRow[] = PERMISSIONS.map((permission) => ({
    code: permission,
    label: PERMISSION_LABELS[permission],
    byRole: ROLE_PERMISSIONS[member.role_code].includes(permission),
    override: overrides[permission] ?? null,
    effective: hasPermission({ role: member.role_code, overrides }, permission),
  }));

  const isSelf = member.id === session.teamMemberId;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/members" className="text-keio-700 dark:text-keio-300 underline">
          ← 名簿へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">{name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[--color-muted]">
          <Badge tone="neutral">{ROLE_LABELS[member.role_code]}</Badge>
          <span>{MEMBER_STATUS_LABELS[member.status]}</span>
          {member.position ? <span>{POSITION_LABELS[member.position]}</span> : null}
          {member.jersey_number !== null ? <span>背番号 {member.jersey_number}</span> : null}
          {member.grade !== null ? <span>{member.grade}年</span> : null}
        </p>
      </header>

      <Card>
        <CardHeader
          title="役割"
          description="役割は権限の既定です。細かい調整は下の「できること」で行います。"
        />
        <RoleEditor memberId={member.id} currentRole={member.role_code} isSelf={isSelf} />
      </Card>

      <Card>
        <CardHeader title="できること" description="役割の既定を、この人だけ変えられます。" />
        <PermissionEditor memberId={member.id} rows={rows} />
      </Card>

      <Card>
        <CardHeader title="気をつけること" />
        <ul className="space-y-1 text-sm text-[--color-muted]">
          <li>・自分の役割は変えられません（自分を締め出す事故を防ぐため）</li>
          <li>・最後の管理者は降格も退部もできません</li>
          <li>・役割と権限の変更は、すべて操作の記録に残ります</li>
          <li>
            ・<code>データ移行を実行する</code>
            はコーチにも既定では渡していません。必要な人にだけ付けてください
          </li>
        </ul>
        <p className="mt-2 text-sm">
          <Link href="/admin/audit" className="text-keio-700 dark:text-keio-300 underline">
            操作の記録を見る
          </Link>
        </p>
      </Card>
    </div>
  );
}
