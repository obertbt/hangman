import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { env, getServerEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Server Component / Server Action / Route Handler 用クライアント。
 *
 * Server Component からは Cookie を書き込めないため、set が失敗しても無視する。
 * セッションの更新は proxy 側でまとめて行う。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からの呼び出し。proxy が更新するため問題ない。
        }
      },
    },
  });
}

/**
 * RLS を迂回する管理用クライアント。
 *
 * 使ってよいのは、RLS では表現できない処理だけ:
 *   - 招待の受け入れ（まだどのチームにも属していない人を処理する）
 *   - R2 の物理削除など、バックグラウンド処理
 *
 * 呼ぶ前に必ずアプリ側で権限を確認すること（75章: 両方で守る）。
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // 管理用クライアントはセッションを持たない
      },
    },
  });
}

/**
 * ログイン中のユーザーを取得する。
 *
 * `getSession()` は Cookie の中身をそのまま信じるため、サーバー側では使わない。
 * 認証が必要な処理では必ずこの関数（= `getUser()`）の結果を使う。
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
