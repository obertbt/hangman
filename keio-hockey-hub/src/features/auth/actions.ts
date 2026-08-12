'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { translateAuthError } from './errors';
import { loginSchema, passwordResetRequestSchema } from './schemas';

/**
 * Server Action の戻り値。
 * 例外を投げるのではなく、画面に出せる形で返す。
 */
export interface ActionState {
  error?: string;
  success?: string;
}

/** 遷移先に外部URLを入れられないようにする（オープンリダイレクト対策）。 */
function safeNextPath(next: FormDataEntryValue | null): string {
  if (typeof next !== 'string') return '/today';
  if (!next.startsWith('/') || next.startsWith('//')) return '/today';
  return next;
}

export async function login(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: translateAuthError(error.message) };
  }

  redirect(safeNextPath(formData.get('next')));
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email);

  // 登録の有無に関わらず同じ文言を返す（登録されているか調べられないようにする）。
  return {
    success: 'パスワード再設定用のメールを送りました。届いていない場合は迷惑メールもご確認ください。',
  };
}
