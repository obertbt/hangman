import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, ChevronRight, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { getCoachDashboard, getPlayerDashboard } from '@/features/dashboard/queries';
import { pendingActions, todayHeadline } from '@/features/dashboard/lib/pending-actions';
import { isStaff, requireSession } from '@/lib/auth/session';
import { formatDateLabel, formatTimeLabel } from '@/lib/datetime';
import { EVENT_TYPE_LABELS } from '@/lib/labels';
import type { EventRow } from '@/types/database.types';

export const metadata: Metadata = { title: '今日' };

/**
 * ログイン後の最重要画面（10章）。
 * 単なる情報一覧ではなく「今この瞬間に何をすべきか」を出す。
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const session = await requireSession();
  const { denied } = await searchParams;

  return (
    <div className="space-y-4">
      {denied ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          その画面を開く権限がありません（{denied}）。必要な場合は管理者へ連絡してください。
        </p>
      ) : null}

      {isStaff(session) ? <CoachToday /> : <PlayerToday />}
    </div>
  );
}

async function PlayerToday() {
  const session = await requireSession();
  const data = await getPlayerDashboard(session);
  const actions = pendingActions(data.todayState);
  const headline = todayHeadline(data.todayState);

  return (
    <>
      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(data.date)}</p>
        <h1 className="mt-1 text-xl font-bold">{headline}</h1>
      </header>

      {/* 残っていること。ここが画面の主役。 */}
      <Card>
        <CardHeader title="残っていること" />
        {actions.length === 0 ? (
          <EmptyState>いまやることはありません。おつかれさまでした。</EmptyState>
        ) : (
          <ul className="space-y-2">
            {actions.map((action) => (
              <li key={action.key}>
                <Link
                  href={action.href}
                  className="bg-action-500/10 text-action-700 hover:bg-action-500/20 dark:text-action-400 flex min-h-12 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium"
                >
                  {action.label}
                  <ChevronRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="今日の予定" icon={<CalendarDays size={16} aria-hidden />} />
        {data.events.length === 0 ? (
          <EmptyState>今日の予定は登録されていません。</EmptyState>
        ) : (
          <ul className="space-y-3">
            {data.events.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
        )}
      </Card>

      {data.week ? (
        <Card>
          <CardHeader
            title="今週のテーマ"
            description={`${formatDateLabel(data.week.start_date)} 〜 ${formatDateLabel(data.week.end_date)}`}
          />
          <p className="text-base font-semibold">{data.week.theme ?? 'テーマは未設定です'}</p>
          {data.week.focus_task ? (
            <p className="mt-2 text-sm text-[--color-muted]">{data.week.focus_task}</p>
          ) : null}
          {data.week.weekly_message ? (
            <p className="bg-keio-50 dark:bg-keio-800/40 mt-3 rounded-lg px-3 py-2 text-sm">
              {data.week.weekly_message}
            </p>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader title="今週のテーマ" />
          <EmptyState>今週の週データがまだ作られていません。</EmptyState>
        </Card>
      )}

      <Card>
        <CardHeader title="今日の個人目標" icon={<Target size={16} aria-hidden />} />
        {data.personalGoal ? (
          <p className="text-sm">{data.personalGoal}</p>
        ) : (
          <EmptyState>まだ決めていません。</EmptyState>
        )}
      </Card>

      {data.season ? (
        <Card>
          <CardHeader title="シーズン目標" description={data.season.name} />
          <p className="text-sm">{data.season.goal ?? '未設定'}</p>
          {data.season.theme ? (
            <p className="mt-1 text-sm text-[--color-muted]">テーマ: {data.season.theme}</p>
          ) : null}
        </Card>
      ) : null}

      {data.upcoming.length > 0 ? (
        <Card>
          <CardHeader title="次の予定" />
          <ul className="space-y-3">
            {data.upcoming.map((event) => (
              <EventItem key={event.id} event={event} showDate />
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

async function CoachToday() {
  const session = await requireSession();
  const data = await getCoachDashboard(session);

  return (
    <>
      <header>
        <p className="text-xs text-[--color-muted]">{formatDateLabel(data.date)}</p>
        <h1 className="mt-1 text-xl font-bold">今日の状況</h1>
      </header>

      <Card>
        <CardHeader title="今日の予定" icon={<CalendarDays size={16} aria-hidden />} />
        {data.events.length === 0 ? (
          <EmptyState>今日の予定は登録されていません。</EmptyState>
        ) : (
          <ul className="space-y-3">
            {data.events.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="コンディションに注意が要る選手"
          icon={<AlertTriangle size={16} aria-hidden />}
          description="痛みの申告、調子2以下、疲労4以上"
        />
        {data.concerningConditions.length === 0 ? (
          <EmptyState>今日の申告の中に、注意が要るものはありません。</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.concerningConditions.map((row) => (
              <li key={row.name} className="rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40">
                <span className="font-medium">{row.name}</span>
                <span className="ml-2 text-[--color-muted]">{row.note}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="日報の提出状況" description={`在籍選手 ${data.activeMemberCount} 名`} />
        {data.missingReportNames.length === 0 ? (
          <EmptyState>未提出の選手はいません。</EmptyState>
        ) : (
          <>
            <p className="mb-2 text-sm">未提出 {data.missingReportNames.length} 名</p>
            <p className="text-sm text-[--color-muted]">{data.missingReportNames.join('、')}</p>
          </>
        )}
      </Card>

      {data.week ? (
        <Card>
          <CardHeader title="今週のテーマ" />
          <p className="text-base font-semibold">{data.week.theme ?? '未設定'}</p>
          {data.week.focus_task ? (
            <p className="mt-2 text-sm text-[--color-muted]">{data.week.focus_task}</p>
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader title="今週のテーマ" />
          <EmptyState>
            今週の週データがまだありません。
            <Link href="/schedule" className="ml-1 underline">
              予定から作成
            </Link>
          </EmptyState>
        </Card>
      )}
    </>
  );
}

function EventItem({ event, showDate = false }: { event: EventRow; showDate?: boolean }) {
  const start = formatTimeLabel(event.start_time);
  const end = formatTimeLabel(event.end_time);

  return (
    <li className="border-b border-[--color-border] pb-3 last:border-0 last:pb-0">
      <Link href={`/schedule/events/${event.id}`} className="block">
        <div className="flex items-center gap-2">
          <Badge tone={event.event_type === 'match' ? 'action' : 'info'}>
            {EVENT_TYPE_LABELS[event.event_type]}
          </Badge>
          <span className="text-sm font-medium">{event.title}</span>
        </div>
        <p className="mt-1 text-xs text-[--color-muted]">
          {showDate ? `${formatDateLabel(event.event_date)} ` : ''}
          {start ? `${start}${end ? `〜${end}` : ''}` : '時刻未定'}
          {event.location ? ` / ${event.location}` : ''}
        </p>
        {event.theme ? <p className="mt-1 text-sm">テーマ: {event.theme}</p> : null}
      </Link>
    </li>
  );
}
