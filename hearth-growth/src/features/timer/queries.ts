import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { ActivitySessionRow, CategoryRow } from '@/types/database.types';

export interface ActiveSession {
  session: ActivitySessionRow;
  category: Pick<CategoryRow, 'id' | 'name' | 'icon' | 'color'> | null;
  /** 起床予定。睡眠のタイマーで設定したときだけ入る。 */
  wakeAt: string | null;
  /**
   * サーバー（DB ではなくアプリサーバー）の現在時刻。
   * ブラウザの時計とのずれを補正するために画面へ渡す。
   */
  serverNow: string;
}

/**
 * 動いているタイマー。running か paused のどちらか1件だけ存在しうる。
 * ページを開き直しても、ここから状態を復元する（13.1）。
 */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('activity_sessions')
    .select('*, category:categories(id, name, icon, color)')
    .eq('user_id', user.id)
    .in('status', ['running', 'paused'])
    .maybeSingle();

  if (error) {
    console.error('getActiveSession failed', error);
    return null;
  }
  if (!data) return null;

  const { category, ...session } = data;

  // 起床予定は睡眠のときだけ。無ければ null のまま。
  const { data: alarm } = await supabase
    .from('sleep_alarms')
    .select('wake_at')
    .eq('session_id', session.id)
    .maybeSingle();

  return {
    session,
    category,
    wakeAt: alarm?.wake_at ?? null,
    serverNow: new Date().toISOString(),
  };
}

/** 直近で終了したセッションのうち、まだ投稿になっていないもの。 */
export async function getLatestCompletedSession(): Promise<
  (Omit<ActiveSession, 'serverNow' | 'wakeAt'> & { hasPost: boolean }) | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('activity_sessions')
    .select('*, category:categories(id, name, icon, color)')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const { data: post } = await supabase
    .from('activity_posts')
    .select('id')
    .eq('session_id', data.id)
    .maybeSingle();

  const { category, ...session } = data;
  return { session, category, hasPost: Boolean(post) };
}
