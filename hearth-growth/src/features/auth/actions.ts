'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { toAuthErrorMessage } from '@/features/auth/errors';
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type ResetRequestInput,
  type SignInInput,
  type SignUpInput,
  type UpdatePasswordInput,
} from '@/features/auth/schemas';
import { fail, ok, type ActionResult } from '@/lib/actions/result';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils/safe-redirect';

/**
 * 認証の入口。入力は必ずサーバー側でも検証し直す。
 * クライアントの検証は体験のためであって、信頼の根拠にはしない。
 */

export async function signInAction(input: SignInInput, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return fail(toAuthErrorMessage(error));
  }

  redirect(safeRedirectPath(next));
}

export async function signUpAction(input: SignUpInput, next?: string): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // プロフィールと初期カテゴリーは handle_new_user トリガーがこの値を使って作る
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(
        safeRedirectPath(next),
      )}`,
    },
  });

  if (error) {
    // 画面には出さない詳細を、あとから追えるよう残す
    console.error('signUpAction failed', { code: error.code, status: error.status, message: error.message });
    return fail(toAuthErrorMessage(error));
  }

  // メール確認が有効な場合はセッションが発行されない。その場合は確認を促す。
  if (!data.session) {
    return ok();
  }

  redirect(safeRedirectPath(next));
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function requestPasswordResetAction(input: ResetRequestInput): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, 'email');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/reset-password/update`,
  });

  // 送信結果に関わらず同じ応答を返す。
  // 「そのメールアドレスは登録されていない」と分かると、利用者の存在が漏れるため。
  if (error && error.status === 429) {
    return fail(toAuthErrorMessage(error));
  }

  return ok();
}

export async function updatePasswordAction(input: UpdatePasswordInput): Promise<ActionResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, String(parsed.error.issues[0].path[0] ?? ''));
  }

  const supabase = await createClient();

  // 再設定リンクから来たセッションが有効かを確認する
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail('リンクの有効期限が切れています。もう一度パスワード再設定をお試しください。');
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return fail(toAuthErrorMessage(error));
  }

  redirect('/home');
}
