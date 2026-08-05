'use client';

import { useEffect } from 'react';

/**
 * サービスワーカーの登録。
 *
 * 開発中は登録しない。古いキャッシュが残って、
 * 直したはずの画面が変わらない、という混乱を避けるため。
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // 登録できなくてもアプリは動く。黙って諦める理由だけ残す。
        console.warn('service worker registration failed', error);
      });
    };

    // 起動直後の描画と競合させない
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
