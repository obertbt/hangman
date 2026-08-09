'use server';

import { revalidatePath } from 'next/cache';

import { attachPhotosSchema, MAX_PHOTOS_PER_POST, type AttachPhotosInput } from '@/features/photos/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validations/common';

/**
 * 記録に添えた写真の登録と削除。
 *
 * 実体（画像そのもの）はブラウザから Storage へ直接送る。
 * ここで扱うのは「どの記録に、どの実体が属するか」だけ。
 *
 * 誰が見られるかは RLS が決める。この層では公開範囲を判断しない。
 */

function revalidatePhotoViews(postId: string) {
  revalidatePath('/timeline');
  revalidatePath('/activities');
  revalidatePath(`/activities/${postId}`);
}

/**
 * 送信済みの実体を記録に紐付ける。
 *
 * 記録を作ってから呼ぶ。順番が逆だと、記録のない写真が残ってしまう。
 */
export async function attachPhotosAction(input: AttachPhotosInput): Promise<ActionResult> {
  const parsed = attachPhotosSchema.safeParse(input);
  if (!parsed.success) return fail('写真を登録できませんでした。');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail('ログインし直してください。');

  // 自分のフォルダ・その記録のフォルダ以外は受け付けない。
  // Storage 側のポリシーでも同じ制限を掛けているが、
  // 他人のパスを台帳にだけ書き込む余地を残さないため、ここでも見る。
  const prefix = `${user.id}/${parsed.data.postId}/`;
  if (!parsed.data.paths.every((path) => path.startsWith(prefix))) {
    return fail('写真を登録できませんでした。');
  }

  const { count } = await supabase
    .from('activity_photos')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', parsed.data.postId);

  if ((count ?? 0) + parsed.data.paths.length > MAX_PHOTOS_PER_POST) {
    return fail(`写真は1件につき${MAX_PHOTOS_PER_POST}枚までです。`);
  }

  const { error } = await supabase.from('activity_photos').insert(
    parsed.data.paths.map((path, index) => ({
      post_id: parsed.data.postId,
      user_id: user.id,
      storage_path: path,
      sort_order: (count ?? 0) + index,
    })),
  );

  if (error) {
    console.error('attachPhotos failed', error);
    return fail('写真を登録できませんでした。時間をおいてお試しください。');
  }

  revalidatePhotoViews(parsed.data.postId);
  return ok();
}

/**
 * 1枚だけ取り消す。
 *
 * 台帳の行を消しただけでは実体が残り、パスを知っている人には見え続ける。
 * 行を消せたときだけ実体も消す。
 */
export async function deletePhotoAction(photoId: string): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(photoId);
  if (!parsed.success) return fail('この写真は見つかりませんでした。');

  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from('activity_photos')
    .delete()
    .eq('id', parsed.data)
    .select('post_id, storage_path')
    .maybeSingle();

  if (error) {
    console.error('deletePhoto failed', error);
    return fail('写真を削除できませんでした。時間をおいてお試しください。');
  }
  if (!deleted) return fail('この写真は見つかりませんでした。');

  const { error: storageError } = await supabase.storage
    .from('activity-photos')
    .remove([deleted.storage_path]);

  // 実体が残っても台帳から消えていれば画面には出ない。
  // ここで失敗を握り潰さず、後から追えるように残す。
  if (storageError) {
    console.error('deletePhoto: storage object left behind', {
      path: deleted.storage_path,
      error: storageError,
    });
  }

  revalidatePhotoViews(deleted.post_id);
  return ok();
}
