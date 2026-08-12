'use client';

import { createBrowserClient } from '@supabase/ssr';

import { env } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * ブラウザ用クライアント。
 * ここで使う鍵は anon key だけ。service role key は絶対に持ち込まない（75章）。
 */
export function createClient() {
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
