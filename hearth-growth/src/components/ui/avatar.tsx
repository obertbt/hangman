import Image from 'next/image';

import { cn } from '@/lib/utils/cn';

interface AvatarProps {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}

/** 画像が無いときは表示名の頭文字を出す。 */
export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  const initial = [...name][0] ?? '?';

  return (
    <span
      className={cn(
        'bg-hearth-200 text-hearth-800 inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden style={{ fontSize: size * 0.42 }} className="font-medium">
          {initial}
        </span>
      )}
    </span>
  );
}
