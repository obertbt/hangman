import type { Metadata, Viewport } from 'next';

import { env } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: env.NEXT_PUBLIC_APP_NAME,
  description: '慶應義塾大学 女子フィールドホッケー部のチーム管理システム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 入力欄の拡大を止めつつ、利用者の拡大操作は妨げない
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
