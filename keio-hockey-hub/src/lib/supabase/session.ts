import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/lib/env';
import type { Database } from '@/types/database.types';

/** ログインなしで開けるパス。 */
const PUBLIC_PATHS = ['/login', '/reset-password', '/invite', '/auth', '/setup-check'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * セッション Cookie の更新と、未ログイン時の振り分けを行う。
 *
 * 重要: ここで作った response をそのまま返すこと。
 * 別の response を返すと、更新された認証 Cookie が失われる。
 *
 * ここでの判定は入口の振り分けに留める。
 * 本当の権限判定は RLS とサーバー側の requirePermission で行う（62章・75章）。
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    // ログイン後に元のページへ戻す
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/today';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}
