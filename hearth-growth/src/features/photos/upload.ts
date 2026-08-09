import { attachPhotosAction } from '@/features/photos/actions';
import { extensionForType } from '@/features/photos/image';
import { createClient } from '@/lib/supabase/client';

/** 選んだあと、まだどの記録にも属していない写真。 */
export interface PendingPhoto {
  /** 画面上で1枚を見分けるためだけの識別子。 */
  key: string;
  blob: Blob;
  /** プレビュー用の object URL。破棄は呼び出し側の責任。 */
  previewUrl: string;
}

/**
 * 記録を作ったあとに、選んでおいた写真を送って紐付ける。
 *
 * 実体はブラウザから Storage へ直接送る（サーバーを経由させない）。
 * 送り終えてから台帳へ書き込むので、
 * 途中で失敗しても「記録に写真が付いていない」で止まる。
 * 逆順にすると、実体のない写真が記録に現れてしまう。
 *
 * 記録そのものは既に保存できている場面なので、
 * 写真が送れなかったときも記録は取り消さず、伝えるだけにする。
 */
export async function uploadPendingPhotos(
  userId: string,
  postId: string,
  photos: PendingPhoto[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (photos.length === 0) return { ok: true };

  const supabase = createClient();
  const paths: string[] = [];

  for (const photo of photos) {
    const contentType = photo.blob.type || 'image/jpeg';
    const path = `${userId}/${postId}/${crypto.randomUUID()}.${extensionForType(contentType)}`;

    const { error } = await supabase.storage
      .from('activity-photos')
      .upload(path, photo.blob, { contentType, upsert: false });

    if (error) {
      console.error('photo upload failed', error);
      // 送れたぶんだけでも記録に残す。1枚の失敗で全部を捨てない。
      break;
    }
    paths.push(path);
  }

  if (paths.length === 0) {
    return { ok: false, message: '写真を送れませんでした。記録は保存されています。' };
  }

  const result = await attachPhotosAction({ postId, paths });
  if (!result.ok) return { ok: false, message: result.message };

  if (paths.length < photos.length) {
    return { ok: false, message: '一部の写真を送れませんでした。記録は保存されています。' };
  }

  return { ok: true };
}
