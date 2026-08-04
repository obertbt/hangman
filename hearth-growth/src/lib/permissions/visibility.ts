import type { Visibility } from '@/types/database.types';

/**
 * 公開範囲の表示情報。
 *
 * 注意: ここにあるのは「画面に何と出すか」だけで、権限判定ではない。
 * 実際の閲覧可否は Postgres の RLS (`can_view_post`) が唯一の正とする（9章）。
 */
export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: '自分だけ',
  group: 'グループ',
  selected: '選んだ人',
};

export const VISIBILITY_DESCRIPTIONS: Record<Visibility, string> = {
  private: '自分だけが見られます。タイムラインには出ません。',
  group: '選んだグループのメンバーが見られます。',
  selected: '選んだ人だけが見られます。',
};

export const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: Visibility;
  label: string;
  description: string;
}> = (['private', 'group', 'selected'] as const).map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
  description: VISIBILITY_DESCRIPTIONS[value],
}));

/** group 公開のときだけ group_id が必要。RLS の CHECK 制約と同じ条件を UI 側でも先に弾く。 */
export function requiresGroup(visibility: Visibility): boolean {
  return visibility === 'group';
}

/** selected 公開のときだけ閲覧許可ユーザーの指定が必要。 */
export function requiresAllowedUsers(visibility: Visibility): boolean {
  return visibility === 'selected';
}
