import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';

/**
 * メール内リンクの受け口。
 * 登録確認・パスワード再設定・招待メールが、いずれもここへ戻ってくる。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  // 外部サイトへの誘導に使われないよう、自サイト内のパスだけを許可する
  const destination = safeRedirectPath(next);

  if (!tokenHash || !type) {
    redirect('/login?error=invalid_link');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect('/login?error=expired_link');
  }

  redirect(destination);
}
