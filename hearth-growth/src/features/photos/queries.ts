import 'server-only';

import type { PhotoView } from '@/features/photos/schemas';
import { createClient } from '@/lib/supabase/server';

/**
 * 閲覧 URL の有効期間。
 *
 * ページを開いたまま少し放置しても切れない程度に長く、
 * URL が外へ渡ったときにいつまでも生き続けない程度に短く。
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * 記録に添えられた写真をまとめて引く（タイムライン用）。
 *
 * 何が返るかは RLS が決めるため、ここでは公開範囲の条件を書かない。
 * URL の発行も Storage 側のポリシーを通るので、見えない写真の URL は作れない。
 *
 * 投稿ごとに問い合わせると N+1 になるので、台帳も URL 発行も1回にまとめる。
 */
export async function getPhotosForPosts(postIds: string[]): Promise<Map<string, PhotoView[]>> {
  const byPost = new Map<string, PhotoView[]>();
  if (postIds.length === 0) return byPost;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('activity_photos')
    .select('id, post_id, storage_path')
    .in('post_id', postIds)
    .order('sort_order');

  if (error) {
    console.error('getPhotosForPosts failed', error);
    return byPost;
  }

  const rows = data ?? [];
  if (rows.length === 0) return byPost;

  const { data: signed, error: signError } = await supabase.storage.from('activity-photos').createSignedUrls(
    rows.map((row) => row.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );

  if (signError) {
    console.error('createSignedUrls failed', signError);
  }

  // createSignedUrls は入力と同じ並びで返すが、明示的に対応付ける
  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.signedUrl && entry.path) urlByPath.set(entry.path, entry.signedUrl);
  }

  for (const row of rows) {
    const list = byPost.get(row.post_id) ?? [];
    list.push({ id: row.id, postId: row.post_id, url: urlByPath.get(row.storage_path) ?? null });
    byPost.set(row.post_id, list);
  }

  return byPost;
}

export async function getPhotosForPost(postId: string): Promise<PhotoView[]> {
  const byPost = await getPhotosForPosts([postId]);
  return byPost.get(postId) ?? [];
}
