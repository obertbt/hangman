import type { NotificationItem } from '@/features/notifications/queries';

/** 相手の名前が引けなかったときの呼び方。 */
const UNKNOWN_ACTOR = 'メンバー';

/**
 * お知らせ1件の文面と行き先。
 *
 * 数字を強調しない（10.1）。「5件の応援！」ではなく
 * 「◯◯さんほか2人が応援しています」と、人のことばで書く。
 */
export function notificationText(
  item: Pick<NotificationItem, 'type' | 'actorName' | 'actorCount' | 'groupName'>,
): string {
  const actor = item.actorName ?? UNKNOWN_ACTOR;

  switch (item.type) {
    case 'reaction':
      return item.actorCount > 1
        ? `${actor}さんほか${item.actorCount - 1}人が応援しています`
        : `${actor}さんが応援しています`;
    case 'comment':
      return `${actor}さんがコメントしました`;
    case 'group_join': {
      const group = item.groupName;
      return group ? `${actor}さんが「${group}」に参加しました` : `${actor}さんがグループに参加しました`;
    }
  }
}

/**
 * 押したときの行き先。行けない場合は null（押せないようにする）。
 *
 * 応援とコメントは必ず自分の記録に対するものなので、記録の画面へ送る。
 * 記録が消えていれば行き先は無い。
 */
export function notificationHref(item: Pick<NotificationItem, 'type' | 'postId' | 'groupId'>): string | null {
  switch (item.type) {
    case 'reaction':
    case 'comment':
      return item.postId ? `/activities/${item.postId}` : null;
    case 'group_join':
      return item.groupId ? `/groups/${item.groupId}` : null;
  }
}
