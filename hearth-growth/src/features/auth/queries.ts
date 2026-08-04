import 'server-only';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { ProfileRow } from '@/types/database.types';

/**
 * ログイン中のユーザーのプロフィール。
 *
 * 通常は登録時のトリガー（handle_new_user）が作っているが、
 * 何らかの理由で欠けていた場合はここで作り直して、画面が壊れないようにする。
 */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

  if (profile) return profile;

  const fallbackName =
    (typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : null) ??
    user.email?.split('@')[0] ??
    'ユーザー';

  const { data: created } = await supabase
    .from('profiles')
    .insert({ id: user.id, display_name: fallbackName.slice(0, 50) })
    .select('*')
    .single();

  return created ?? null;
}

/** プロフィールが必要な画面で使う。未ログインならログイン画面へ送る。 */
export async function requireProfile(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }
  return profile;
}
