import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { ActivityPostRow, CategoryRow, Visibility } from '@/types/database.types';

export interface ActivityListItem {
  id: string;
  title: string | null;
  body: string | null;
  durationSeconds: number;
  activityDate: string;
  visibility: Visibility;
  groupId: string | null;
  fromTimer: boolean;
  category: Pick<CategoryRow, 'id' | 'name' | 'icon' | 'color'> | null;
  photoCount: number;
}

export interface ActivityDetail extends ActivityListItem {
  post: ActivityPostRow;
  allowedUserIds: string[];
}

/**
 * 自分の活動記録。
 *
 * 注意: SELECT ポリシーは投稿者に対して論理削除した行も返す
 * （そうしないと deleted_at を立てる UPDATE 自体が弾かれるため）。
 * 一覧を出す側で必ず絞ること。詳細は supabase/policies/README.md。
 */
export async function listMyActivities({ limit = 30 }: { limit?: number } = {}): Promise<ActivityListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('activity_posts')
    .select('*, category:categories(id, name, icon, color), activity_photos(count)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listMyActivities failed', error);
    return [];
  }

  return (data ?? []).map(toListItem);
}

export async function getActivityDetail(postId: string): Promise<ActivityDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('activity_posts')
    .select('*, category:categories(id, name, icon, color)')
    .eq('id', postId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!data) return null;

  const { data: allowed } = await supabase.from('post_allowed_users').select('user_id').eq('post_id', postId);

  const { category, ...post } = data;

  return {
    ...toListItem(data),
    post,
    allowedUserIds: (allowed ?? []).map((row) => row.user_id),
    category,
  };
}

/**
 * selected 公開の宛先に選べる相手。
 * 同じグループにいる人だけ（グループ外のユーザー検索は MVP の対象外）。
 */
export async function listReachableUsers(): Promise<
  { userId: string; displayName: string; avatarUrl: string | null }[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // RLS により、自分と同じグループのプロフィールしか返らない
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .neq('id', user.id)
    .order('display_name');

  return (data ?? []).map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }));
}

type PostWithCategory = ActivityPostRow & {
  category: Pick<CategoryRow, 'id' | 'name' | 'icon' | 'color'> | null;
  activity_photos?: { count: number }[];
};

function toListItem(row: PostWithCategory): ActivityListItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    durationSeconds: row.duration_seconds,
    activityDate: row.activity_date,
    visibility: row.visibility,
    groupId: row.group_id,
    fromTimer: row.session_id !== null,
    category: row.category,
    photoCount: row.activity_photos?.[0]?.count ?? 0,
  };
}
