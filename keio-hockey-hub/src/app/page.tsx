import { redirect } from 'next/navigation';

import { getAppSession } from '@/lib/auth/session';

/**
 * 入口。
 * ログインしていれば「今日」へ、していなければログインへ送る。
 * この画面自体は何も表示しない。
 */
export default async function RootPage() {
  const session = await getAppSession();
  redirect(session ? '/today' : '/login');
}
