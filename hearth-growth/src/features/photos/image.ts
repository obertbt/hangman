import { PHOTO_MAX_EDGE } from '@/features/photos/schemas';

/**
 * 送る前に写真を小さくする。
 *
 * ここで縮めておく理由は2つ。
 *   * 電波の弱い場所でも記録が終わる
 *   * 撮影時の付随情報（Exif の位置情報など）が canvas を通す時点で落ちる
 *
 * 縮小できなかったときは元のファイルをそのまま返す。
 * 写真を諦めるより、少し重くても記録が残るほうが良い。
 */
export async function downscaleImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });

    // 縮小しても大きくなる場合（すでに十分小さい画像など）は元のほうを使う
    if (!blob || blob.size >= file.size) return file;

    return blob;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** バケットが受け付ける形式に合わせた拡張子。 */
export function extensionForType(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
