import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import { ProgressBar } from '@/features/skills/components/progress-bar';
import { countAwaitingReview, getSkillOverview, type SkillCategoryNode } from '@/features/skills/queries';
import { can, requireSession } from '@/lib/auth/session';
import { SKILL_STATUS_LABELS } from '@/lib/labels';
import type { PlayerSkillStatus, SkillRow } from '@/types/database.types';

export const metadata: Metadata = { title: 'スキル' };

/**
 * 自分のスキルの到達状況（30章・31章）。
 *
 * 「いまどこまで来ていて、次に何を出せばいいか」だけを見せる。
 * 承認済みのものを畳んで隠したりはしない。積み上がったものが見えることが、
 * この画面のいちばんの目的（3章の6）。
 */
export default async function SkillsPage() {
  const session = await requireSession();
  const canReview = can(session, 'skill.review');

  const [overview, awaitingCount] = await Promise.all([
    getSkillOverview(session),
    canReview ? countAwaitingReview(session) : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">スキル</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          できるようになったことを、コーチに見てもらって記録に残します。
        </p>
      </header>

      {canReview && awaitingCount > 0 ? (
        <Card className="border-amber-400">
          <CardHeader
            title={`審査待ちの申請が${awaitingCount}件あります`}
            description="選手は返事を待っています。"
          />
          <Link href="/skills/applications" className="text-keio-700 dark:text-keio-300 text-sm underline">
            申請の一覧へ
          </Link>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="いまの到達度"
          description="小目標のうち、承認されたものの割合です。"
          action={
            <span className="flex gap-3">
              <Link
                href="/skills/applications"
                className="text-keio-700 dark:text-keio-300 text-sm underline"
              >
                申請の状況
              </Link>
              {canReview ? (
                <Link href="/admin/skills" className="text-keio-700 dark:text-keio-300 text-sm underline">
                  定義
                </Link>
              ) : null}
            </span>
          }
        />
        <ProgressBar
          percent={overview.total.percent}
          approved={overview.total.approved}
          total={overview.total.total}
          label="全体の到達度"
        />
        {overview.total.inProgress > 0 ? (
          <p className="mt-2 text-sm">いま {overview.total.inProgress}件を申請中です。</p>
        ) : null}
      </Card>

      {overview.categories.length === 0 ? (
        <Card>
          <EmptyState>
            スキルがまだ登録されていません。
            {canReview ? (
              <Link href="/admin/skills" className="ml-1 underline">
                スキル定義から登録する
              </Link>
            ) : (
              'コーチが大分類と目標を登録すると、ここに出ます。'
            )}
          </EmptyState>
        </Card>
      ) : (
        overview.categories.map((node) => (
          <CategoryCard
            key={node.category.id}
            node={node}
            statusOf={(skill) => overview.statusBySkill.get(skill.id)?.status ?? 'not_started'}
            openApplicationOf={(skill) => overview.openApplicationBySkill.get(skill.id)?.id ?? null}
          />
        ))
      )}
    </div>
  );
}

function CategoryCard({
  node,
  statusOf,
  openApplicationOf,
}: {
  node: SkillCategoryNode;
  statusOf: (skill: SkillRow) => PlayerSkillStatus;
  openApplicationOf: (skill: SkillRow) => string | null;
}) {
  return (
    <Card>
      <CardHeader title={node.category.name} description={node.category.description ?? undefined} />

      <ProgressBar
        percent={node.progress.percent}
        approved={node.progress.approved}
        total={node.progress.total}
        label={`${node.category.name}の到達度`}
      />

      {node.nodes.length === 0 ? (
        <EmptyState>この大分類にはまだ目標がありません。</EmptyState>
      ) : (
        <ul className="mt-3 space-y-3">
          {node.nodes.map(({ skill, children }) => (
            <li key={skill.id}>
              {/* 子がある中目標は入れ物。申請の対象は下の小目標。 */}
              {children.length > 0 ? (
                <>
                  <p className="text-sm font-medium">{skill.name}</p>
                  {skill.criteria ? <p className="text-xs text-[--color-muted]">{skill.criteria}</p> : null}
                  <ul className="mt-2 space-y-2 border-l border-[--color-border] pl-3">
                    {children.map((child) => (
                      <SkillRowItem
                        key={child.id}
                        skill={child}
                        status={statusOf(child)}
                        applicationId={openApplicationOf(child)}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <ul>
                  <SkillRowItem
                    skill={skill}
                    status={statusOf(skill)}
                    applicationId={openApplicationOf(skill)}
                  />
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SkillRowItem({
  skill,
  status,
  applicationId,
}: {
  skill: SkillRow;
  status: PlayerSkillStatus;
  applicationId: string | null;
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{skill.name}</p>
        {skill.criteria ? <p className="text-xs text-[--color-muted]">{skill.criteria}</p> : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={statusTone(status)}>{SKILL_STATUS_LABELS[status]}</Badge>

        {status === 'approved' ? null : applicationId ? (
          <Link
            href={`/skills/applications/${applicationId}`}
            className="text-keio-700 dark:text-keio-300 text-xs underline"
          >
            {status === 'feedback' ? '根拠を足す' : '申請を見る'}
          </Link>
        ) : (
          <Link
            href={`/skills/apply/${skill.id}`}
            className="text-keio-700 dark:text-keio-300 text-xs underline"
          >
            申請する
          </Link>
        )}
      </div>
    </li>
  );
}

function statusTone(status: PlayerSkillStatus): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'applied':
      return 'info';
    case 'feedback':
      return 'warning';
    default:
      return 'neutral';
  }
}
