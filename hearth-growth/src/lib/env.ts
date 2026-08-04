import { z } from 'zod';

/**
 * 環境変数はここでだけ読み、必ず検証してから使う。
 * 未設定のまま起動すると、実行時に分かりにくい失敗をするため、
 * 起動時点で「どの変数が足りないか」を明示して落とす。
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL は URL 形式で指定してください'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Next.js は `process.env.X` の形でしかクライアントバンドルへ値を埋め込まないため、
 * プロパティを1つずつ書き出す（分割代入やループでは置換されない）。
 */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
  });

  if (!result.success) {
    // どの変数が原因か必ず分かるよう、変数名を先頭に付ける
    const details = result.error.issues
      .map((issue) => {
        const name = issue.path.join('.');
        return name && !issue.message.includes(name) ? `- ${name}: ${issue.message}` : `- ${issue.message}`;
      })
      .join('\n');
    throw new Error(`環境変数の設定に問題があります。\n${details}\n.env.example を参照してください。`);
  }

  return result.data;
}

export const env: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});
