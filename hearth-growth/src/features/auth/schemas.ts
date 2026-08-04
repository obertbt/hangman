import { z } from 'zod';

/**
 * 認証まわりの入力スキーマ。
 * クライアント（React Hook Form）とサーバー（Server Action）の両方で同じものを使う。
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'メールアドレスを入力してください')
  .email('メールアドレスの形式が正しくありません');

/**
 * パスワードは長さだけを条件にする。
 * 記号の必須化は覚えにくいパスワードを生むため、要求しない。
 */
export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上にしてください')
  .max(72, 'パスワードは72文字以内にしてください');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, '表示名を入力してください')
  .max(50, '表示名は50文字以内にしてください');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'パスワードを入力してください'),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});

export const resetRequestSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: 'パスワードが一致しません',
    path: ['passwordConfirm'],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
