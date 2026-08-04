import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind のクラスを衝突なく結合する。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
