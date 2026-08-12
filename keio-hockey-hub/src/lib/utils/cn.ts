import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind のクラスを安全に結合する。後から渡したものが勝つ。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
