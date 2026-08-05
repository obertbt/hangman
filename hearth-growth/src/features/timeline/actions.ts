'use server';

import { getTimeline, type TimelinePage } from '@/features/timeline/queries';

/**
 * 「さらに読み込む」で使う。
 * cursor より古い投稿を次の1ページ分だけ返す。
 */
export async function loadMoreTimelineAction(cursor: string): Promise<TimelinePage> {
  return getTimeline({ cursor });
}
