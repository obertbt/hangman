import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { ROLE_LABELS, PERMISSION_LABELS, PERMISSIONS } from '@/lib/auth/permissions';
import { can, requireSession } from '@/lib/auth/session';
import { env, limits } from '@/lib/env';

export const metadata: Metadata = { title: '設定' };

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">設定</h1>

      <Card>
        <CardHeader title="あなたの情報" />
        <dl className="space-y-2 text-sm">
          <Row label="氏名" value={session.fullName} />
          <Row label="表示名" value={session.displayName} />
          <Row label="メールアドレス" value={session.email ?? '未登録'} />
          <Row label="チーム" value={session.teamName} />
          <Row label="役割" value={ROLE_LABELS[session.role]} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="できること" description="役割ごとの既定に、個別の設定を足し引きした結果です。" />
        <ul className="space-y-1.5 text-sm">
          {PERMISSIONS.map((permission) => (
            <li key={permission} className="flex items-center justify-between gap-2">
              <span>{PERMISSION_LABELS[permission]}</span>
              {can(session, permission) ? (
                <Badge tone="success">あり</Badge>
              ) : (
                <Badge tone="neutral">なし</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="このシステムについて" />
        <dl className="space-y-2 text-sm">
          <Row label="名称" value={env.NEXT_PUBLIC_APP_NAME} />
          <Row
            label="動画の上限"
            value={`${limits.maxVideoDurationSeconds}秒 / ${Math.round(limits.maxVideoSizeBytes / 1024 / 1024)}MB`}
          />
          <Row label="1日の動画投稿" value={`${limits.maxDailyVideoUploadsPerUser}件まで`} />
          <Row label="表示タイムゾーン" value="Asia/Tokyo" />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
