'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { FormMessage } from '@/components/ui/field';
import { PhotoPicker } from '@/features/photos/components/photo-picker';
import { deletePhotoAction } from '@/features/photos/actions';
import type { PhotoView } from '@/features/photos/schemas';
import { uploadPendingPhotos, type PendingPhoto } from '@/features/photos/upload';

interface PhotoEditorProps {
  postId: string;
  userId: string;
  photos: PhotoView[];
}

/**
 * 既にある記録の写真を足す・減らす（編集画面）。
 *
 * 記録は既に保存済みなので、選んだ時点で送ってしまってよい。
 * 本文の保存ボタンとは切り離し、写真だけで完結させる。
 */
export function PhotoEditor({ postId, userId, photos }: PhotoEditorProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAdd = (next: PendingPhoto[]) => {
    // 追加ぶんだけをその場で送る。取り消しは送る前に押せる。
    setPending(next);
  };

  const handleUpload = () => {
    if (pending.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await uploadPendingPhotos(userId, postId, pending);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      for (const photo of pending) URL.revokeObjectURL(photo.previewUrl);
      setPending([]);
      router.refresh();
    });
  };

  const handleDelete = (photoId: string) => {
    if (!window.confirm('この写真を削除しますか？')) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePhotoAction(photoId);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <FormMessage>{error}</FormMessage> : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2">
          {photos.map((photo) => (
            <li key={photo.id} className="relative">
              {/* 期限付きの URL なので next/image の最適化は通さない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url ?? undefined}
                alt="記録に添えられた写真"
                className="aspect-square w-full rounded-xl object-cover"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(photo.id)}
                className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-[--color-border] bg-[--color-surface] text-xs"
              >
                <span aria-hidden>×</span>
                <span className="sr-only">この写真を削除する</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <PhotoPicker value={pending} onChange={handleAdd} existingCount={photos.length} disabled={isPending} />

      {pending.length > 0 ? (
        <button
          type="button"
          disabled={isPending}
          onClick={handleUpload}
          className="text-sm underline underline-offset-4"
        >
          {isPending ? '追加しています…' : `選んだ${pending.length}枚を追加する`}
        </button>
      ) : null}
    </div>
  );
}
