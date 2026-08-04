import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/session';

/**
 * Next.js 16 で middleware は proxy に改称された。
 * ここでは認証セッションの更新と、未ログイン時のリダイレクトだけを行う。
 * 本格的な権限判定はサーバー側（RLS）で行い、ここでの判定は入口の振り分けに留める。
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 静的ファイルと画像以外のすべてのパスで認証セッションを更新する。
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
