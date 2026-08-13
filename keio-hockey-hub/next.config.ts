import type { NextConfig } from 'next';

/**
 * プロフィール画像は Supabase Storage に置くため、そのホストだけを
 * next/image の対象として許可する。
 *
 * R2 のファイルは Private Bucket + 署名付き URL で配るため、
 * next/image の remotePatterns には載せない（22章）。
 */
function supabaseImagePattern() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];

  try {
    const { protocol, hostname } = new URL(url);
    return [
      {
        protocol: protocol.replace(':', '') as 'http' | 'https',
        hostname,
        pathname: '/storage/v1/object/public/**',
      },
    ];
  } catch {
    return [];
  }
}

/**
 * 出力の形を、置き場所に合わせて変える。
 *
 * Docker で動かすときは standalone が要る。
 * 必要なものだけをまとめてくれるので、イメージが小さく済む。
 *
 * **Vercel では standalone にしてはいけない。**
 * Vercel は同じことを自前でやるので、標準の出力を前提にしている。
 * standalone を指定すると、向こうが探しにいくファイルが置かれず、
 * こういう形で失敗する。
 *
 *   Error: ENOENT: no such file or directory,
 *          open '/vercel/path0/.next/next-server.js.nft.json'
 *
 * `VERCEL` は Vercel が自動で入れる環境変数。
 * どちらの動かし方も残したいので、片方に寄せない。
 */
const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  images: {
    remotePatterns: supabaseImagePattern(),
  },
};

export default nextConfig;
