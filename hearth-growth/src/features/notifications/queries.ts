import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { NotificationType } from '@/types/database.types';

/** 一覧に出す件数。遡って読むものではないので、深追いしない。 */
export const NOTIFICATION_PAGE_SIZE = 50;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  /** きっかけを作った人の表示名。分からなければ null。 */
  actorName: string | null;
  actorAvatarUrl: string | null;
  /** まとめた人数。応援のときだけ2以上になりうる。 */
  actorCount: number;
  /** 対象の記録。削除済みなら null。 */
  postId: string | null;
  postTitle: string | null;
  groupId: string | null;
  groupName: string | null;
  isUnread: boolean;
  createdAt: string;
}

/**
 * 記録とグループは埋め込みで引く（それぞれ外部キーが1本しかないため）。
 *
 * profiles だけは `user_id` と `actor_id` の2本が向いているので埋め込まない。
 * 埋め込むには曖昧さを解く指定が要り、その書き方を間違えても
 * 型検査では気づけず、動かして初めて壊れる。数が知れているので別で引く。
 */
const SELECT_COLUMNS = `
  id, type, actor_id, actor_count, post_id, group_id, read_at, created_at,
  post:activity_posts(title, deleted_at),
  group:groups(name)
`;

/**
 * 自分あてのお知らせ。
 *
 * 何が返るかは RLS が決める（自分あての行しか読めない）。
 * 記録の題名やグループ名も RLS を通るため、
 * 見えなくなった記録の中身がここから漏れることはない。
 */
export async function listNotifications(): Promise<NotificationItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);

  if (error) {
    console.error('listNotifications failed', error);
    return [];
  }

  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id) => id !== null))];

  // 相手の名前はまとめて1回で引く（N+1 を避ける）
  const actors = new Map<string, { displayName: string; avatarUrl: string | null }>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', actorIds);

    for (const profile of profiles ?? []) {
      actors.set(profile.id, { displayName: profile.display_name, avatarUrl: profile.avatar_url });
    }
  }

  return rows.map((row) => {
    const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
    // 論理削除された記録へは案内しない
    const post = row.post && row.post.deleted_at === null ? row.post : null;

    return {
      id: row.id,
      type: row.type,
      actorName: actor?.displayName ?? null,
      actorAvatarUrl: actor?.avatarUrl ?? null,
      actorCount: row.actor_count,
      postId: post ? row.post_id : null,
      postTitle: post?.title ?? null,
      groupId: row.group_id,
      groupName: row.group?.name ?? null,
      isUnread: row.read_at === null,
      createdAt: row.created_at,
    };
  });
}

/**
 * 未読の数。ベルに出す数字。
 *
 * 行そのものは要らないので件数だけを取る。
 * 全画面で毎回引くため、未読だけの索引を使う軽い問い合わせにしている。
 */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  if (error) {
    console.error('countUnreadNotifications failed', error);
    return 0;
  }

  return count ?? 0;
}
