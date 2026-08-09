import type { PhotoView } from '@/features/photos/schemas';
import { cn } from '@/lib/utils/cn';

/**
 * 記録に添えられた写真の並び（7.5）。
 *
 * 見せ方は控えめにする。タイムラインの主役は「続いていること」であって、
 * 写真の出来ではない。1枚でも画面を占領しないよう高さを抑える。
 */
export function PhotoGrid({ photos }: { photos: PhotoView[] }) {
  const visible = photos.filter((photo) => photo.url !== null);
  if (visible.length === 0) return null;

  return (
    <ul
      className={cn(
        'mt-2 grid gap-1.5',
        visible.length === 1 ? 'max-w-56 grid-cols-1' : 'grid-cols-3 sm:grid-cols-4',
      )}
    >
      {visible.map((photo) => (
        <li key={photo.id}>
          <a href={photo.url ?? undefined} target="_blank" rel="noreferrer" className="block">
            {/* 期限付きの URL なので next/image の最適化は通さない */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url ?? undefined}
              alt="記録に添えられた写真"
              loading="lazy"
              className="aspect-square w-full rounded-xl object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
