import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { ActiveGroupMember, Visibility } from '@/types/database.types';

export const TIMELINE_PAGE_SIZE = 20;

export interface TimelineItem {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  title: string | null;
  body: string | null;
  durationSeconds: number;
  activityDate: string;
  visibility: Visibility;
  createdAt: string;
  reactionCount: number;
  commentCount: number;
  isMine: boolean;
}

export interface TimelinePage {
  items: TimelineItem[];
  /** 次のページを取るための created_at。null なら最後まで読み込み済み。 */
  nextCursor: string | null;
}

const SELECT_COLUMNS = `
  id, user_id, title, body, duration_seconds, activity_date, visibility, created_at,
  category:categories(name, icon, color),
  profile:profiles(display_name, avatar_url),
  reactions(count),
  comments(count)
`;

/**
 * タイムライン（7.5）。
 *
 * 新しい順に並べるだけで、ランキングは使わない。
 * 何が見えるかは RLS が決めるため、ここでは公開範囲の条件を書かない。
 *
 * ページ送りは created_at を使ったキーセット方式にしている。
 * offset だと、読んでいる最中に新しい投稿が入ったとき同じ行が二重に出る。
 */
export async function getTimeline({
  cursor,
  limit = TIMELINE_PAGE_SIZE,
}: { cursor?: string | null; limit?: number } = {}): Promise<TimelinePage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], nextCursor: null };

  let query = supabase
    .from('activity_posts')
    .select(SELECT_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    // 次のページがあるかを知るため1件多く取る
    .limit(limit + 1);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error('getTimeline failed', error);
    return { items: [], nextCursor: null };
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => ({
      id: row.id,
      userId: row.user_id,
      displayName: row.profile?.display_name ?? 'メンバー',
      avatarUrl: row.profile?.avatar_url ?? null,
      categoryName: row.category?.name ?? null,
      categoryIcon: row.category?.icon ?? null,
      categoryColor: row.category?.color ?? null,
      title: row.title,
      body: row.body,
      durationSeconds: row.duration_seconds,
      activityDate: row.activity_date,
      visibility: row.visibility,
      createdAt: row.created_at,
      reactionCount: row.reactions?.[0]?.count ?? 0,
      commentCount: row.comments?.[0]?.count ?? 0,
      isMine: row.user_id === user.id,
    })),
    nextCursor: hasMore ? (page.at(-1)?.created_at ?? null) : null,
  };
}

export interface ActiveMemberView extends ActiveGroupMember {
  isMe: boolean;
}

/**
 * 「今、頑張っている人」（7.2）。
 *
 * activity_sessions は本人しか読めないため、RPC が必要な列だけを返す。
 * タイトルとメモは返らない。
 */
export async function getActiveMembers(): Promise<{ members: ActiveMemberView[]; serverNow: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { members: [], serverNow: new Date().toISOString() };

  const { data, error } = await supabase.rpc('get_active_group_members');

  if (error) {
    console.error('getActiveMembers failed', error);
    return { members: [], serverNow: new Date().toISOString() };
  }

  return {
    members: (data ?? []).map((member) => ({ ...member, isMe: member.user_id === user.id })),
    serverNow: new Date().toISOString(),
  };
}
