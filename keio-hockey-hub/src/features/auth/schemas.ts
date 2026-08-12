import { z } from 'zod';

/**
 * 入力の検証（Zod）。
 * クライアントとサーバーの両方で同じものを使う。
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください。')
    .email('メールアドレスの形式が正しくありません。'),
  password: z.string().min(1, 'パスワードを入力してください。'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください。')
    .email('メールアドレスの形式が正しくありません。'),
});

/**
 * パスワードは8文字以上。
 * 記号必須などの複雑な規則は課さない（覚えられずメモされるほうが危険）。
 */
export const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上にしてください。')
  .max(72, 'パスワードが長すぎます。');

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: 'パスワードが一致しません。',
    path: ['passwordConfirmation'],
  });

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
