'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import {
  isThisDeviceSubscribed,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '@/features/push/subscribe';

/**
 * この端末で通知を受け取るかどうか。
 *
 * 宛先はブラウザが端末ごとに発行するので、設定もアカウント単位ではなく端末単位。
 * スマートフォンで登録しても、パソコンには届かない。
 */
export function DevicePushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isThisDeviceSubscribed().then((subscribed) => {
      if (!cancelled) setState(subscribed ? 'on' : 'off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!vapidPublicKey) {
    return (
      <p className="text-sm text-[--color-muted]">
        通知の設定がまだ済んでいません。docs/DEPLOY.md の「通知を使えるようにする」を参照してください。
      </p>
    );
  }

  const toggle = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const result =
        state === 'on' ? await unsubscribeThisDevice() : await subscribeThisDevice(vapidPublicKey);
      if (result.ok) {
        setState(state === 'on' ? 'off' : 'on');
      } else {
        setError(result.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {error ? <FormMessage>{error}</FormMessage> : null}

      <p className="text-sm">
        {state === 'unknown'
          ? '確認しています…'
          : state === 'on'
            ? 'この端末で通知を受け取ります。'
            : 'この端末では通知を受け取りません。'}
      </p>

      <Button variant="secondary" size="sm" disabled={isBusy || state === 'unknown'} onClick={toggle}>
        {isBusy ? '処理しています…' : state === 'on' ? '通知を止める' : 'この端末で通知を受け取る'}
      </Button>

      <p className="text-xs text-[--color-muted]">
        端末ごとの設定です。使うのは起床予定の「起きていますか？」だけで、
        応援やコメントは通知しません（アプリ内のお知らせに出ます）。
      </p>
    </div>
  );
}
