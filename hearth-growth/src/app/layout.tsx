import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP } from 'next/font/google';

import { ServiceWorker } from '@/components/layout/service-worker';

import './globals.css';

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Hearth Growth',
    template: '%s | Hearth Growth',
  },
  description: '親しい人と、日々の努力を静かに積み重ねるライフログ。',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Hearth Growth',
    statusBarStyle: 'default',
  },
  // クローズドなサービスのため、検索エンジンには載せない
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 入力欄をタップしたときの自動ズームは抑えるが、拡大操作は禁止しない
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#201a14' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJp.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
