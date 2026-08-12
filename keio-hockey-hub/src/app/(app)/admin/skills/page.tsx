import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardHeader, EmptyState } from '@/components/ui/card';
import {
  CategoryForm,
  DeleteSkillButton,
  SkillForm,
  type CategoryOption,
} from '@/features/skills/components/definition-forms';
import { getSkillOverview } from '@/features/skills/queries';
import { requirePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'スキル定義' };

/**
 * スキル定義の管理（30章）。
 *
 * これが無いと、大分類も目標も SQL でしか作れず、
 * スキル承認の仕組みを使い始められない（3章の11: 自分たちで運用できる）。
 *
 * 触れるのは `skill.review` を持つ人。
 */
export default async function SkillDefinitionPage() {
  const session = await requirePermission('skill.review');
  const overview = await getSkillOverview(session);

  const options: CategoryOption[] = overview.categories.map((node) => ({
    id: node.category.id,
    name: node.category.name,
    // 子を持てるのは中目標だけ（30章の階層は3段）
    parents: node.nodes.map((entry) => ({ id: entry.skill.id, name: entry.skill.name })),
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/skills" className="text-keio-700 dark:text-keio-300 underline">
          ← スキルへ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">スキル定義</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          大分類 → 中目標 → 小目標の3段で作ります。選手が申請するのは小目標です。
        </p>
      </header>

      <Card>
        <CardHeader title="いまの定義" description={`大分類 ${overview.categories.length}件`} />
        {overview.categories.length === 0 ? (
          <EmptyState>まだ何もありません。下の「大分類を作る」から始めてください。</EmptyState>
        ) : (
          <ul className="space-y-4">
            {overview.categories.map((node) => (
              <li key={node.category.id}>
                <p className="text-sm font-semibold">{node.category.name}</p>
                {node.category.description ? (
                  <p className="text-xs text-[--color-muted]">{node.category.description}</p>
                ) : null}

                {node.nodes.length === 0 ? (
                  <p className="mt-1 text-xs text-[--color-muted]">
                    まだ目標がありません。この大分類に中目標を足してください。
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 border-l border-[--color-border] pl-3">
                    {node.nodes.map(({ skill, children }) => (
                      <li key={skill.id}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm">{skill.name}</p>
                            {skill.criteria ? (
                              <p className="text-xs text-[--color-muted]">{skill.criteria}</p>
                            ) : null}
                          </div>
                          <DeleteSkillButton skillId={skill.id} name={skill.name} />
                        </div>

                        {children.length > 0 ? (
                          <ul className="mt-1 space-y-1 border-l border-[--color-border] pl-3">
                            {children.map((child) => (
                              <li key={child.id} className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm">{child.name}</p>
                                  {child.criteria ? (
                                    <p className="text-xs text-[--color-muted]">{child.criteria}</p>
                                  ) : null}
                                </div>
                                <DeleteSkillButton skillId={child.id} name={child.name} />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {options.length > 0 ? (
        <Card>
          <CardHeader title="目標を足す" description="中目標か、その下の小目標を作ります。" />
          <SkillForm categories={options} />
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="大分類を作る"
          description="30章の初期案は8種類（ドリブル・トラップ・ストローク・アジリティ・戦術理解・対人能力・メンタル・ホッケーIQ）。"
        />
        <CategoryForm />
      </Card>

      <Card>
        <CardHeader title="気をつけること" />
        <ul className="space-y-1 text-sm text-[--color-muted]">
          <li>・進捗に数えるのは小目標だけです。中目標は入れ物として扱います</li>
          <li>・すでに申請・承認のある目標は消せません（選手の積み上げを消さないため）</li>
          <li>・「できたと言える目安」を数えられる形にすると、審査が早くなります</li>
        </ul>
      </Card>
    </div>
  );
}
