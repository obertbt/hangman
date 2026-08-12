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

const nextConfig: NextConfig = {
  // Docker で動かすため、必要なものだけをまとめた出力にする。
  output: 'standalone',
  images: {
    remotePatterns: supabaseImagePattern(),
  },
};

export default nextConfig;
