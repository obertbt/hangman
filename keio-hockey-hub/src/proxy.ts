import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/session';

/**
 * Next.js 16 で middleware は proxy に改称された。
 * ここでは認証セッションの更新と、未ログイン時のリダイレクトだけを行う。
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 静的ファイルと画像以外のすべてのパスで認証セッションを更新する。
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
