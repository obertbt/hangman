import 'server-only';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 消したものを戻す（60章の考え方を他の記録にも広げたもの）。
 *
 * 消したものは通常の閲覧では引けないので、一覧も復元も関数を通す（0020）。
 * 出るのは **その人が戻せるものだけ**（判定は関数の中）。
 */

export type DeletedKind = 'video' | 'video_clip' | 'training_record' | 'skill';

export interface DeletedItem {
  kind: DeletedKind;
  itemId: string;
  label: string;
  deletedAt: string;
  /** false なら実体がもう無い。押しても戻らない。 */
  restorable: boolean;
  note: string | null;
}

export const DELETED_KIND_LABELS: Record<DeletedKind, string> = {
  video: '動画',
  video_clip: '場面',
  training_record: 'トレーニング記録',
  skill: 'スキルの目標',
};

export async function listDeletedItems(session: AppSession): Promise<DeletedItem[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc('list_deleted_items', { p_team_id: session.teamId });

  return (
    (data ?? [])
      .map((row) => ({
        kind: row.kind as DeletedKind,
        itemId: row.item_id,
        label: row.label,
        deletedAt: row.deleted_at,
        restorable: row.restorable,
        note: row.note,
      }))
      // 新しく消したものから順に。直前の操作を取り消したい場面がいちばん多い。
      .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
  );
}
