import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/**
 * メール内のリンク（招待・パスワード再設定）を受け取る。
 * 確認できたら目的の画面へ送る。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  // 外部URLへ飛ばされないようにする
  const redirectTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/today';

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL('/login?error=expired_link', origin));
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
