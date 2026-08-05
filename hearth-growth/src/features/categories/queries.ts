import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { CategoryRow } from '@/types/database.types';

/**
 * 自分が使えるカテゴリー。
 * 個人カテゴリーと、所属グループの共通カテゴリーの両方を RLS が返す。
 */
export async function listCategories({ activeOnly = true }: { activeOnly?: boolean } = {}): Promise<
  CategoryRow[]
> {
  const supabase = await createClient();

  let query = supabase.from('categories').select('*').order('sort_order').order('created_at');
  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listCategories failed', error);
    return [];
  }
  return data ?? [];
}
