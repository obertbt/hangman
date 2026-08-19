import { createClient } from '@/lib/supabase/client';

/**
 * この端末で通知を受け取れるようにする。
 *
 * 宛先はブラウザが発行する。端末やブラウザを変えると別の宛先になるので、
 * 「アカウントに1つ」ではなく「端末ごとに1行」持つ。
 */

/**
 * base64url の公開鍵を、ブラウザが求める形へ直す。
 *
 * 戻りを `Uint8Array<ArrayBuffer>` と明示している。
 * 既定の `Uint8Array` は共有メモリの可能性を含み、
 * `applicationServerKey` が受け取る型と合わないため。
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** ArrayBuffer を base64url にする（DB へ入れる形）。 */
function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type SubscribeResult = { ok: true } | { ok: false; message: string };

export async function subscribeThisDevice(vapidPublicKey: string): Promise<SubscribeResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, message: 'この端末では通知を受け取れません。' };
  }
  if (!vapidPublicKey) {
    return { ok: false, message: '通知の設定がまだ済んでいません（鍵が未設定です）。' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      message: '通知が許可されませんでした。ブラウザの設定から許可してください。',
    };
  }

  const registration = await navigator.serviceWorker.ready;

  // すでに別の鍵で登録されていると、送っても届かない。取り直す。
  const existing = await registration.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  } catch (error) {
    console.error('push subscribe failed', error);
    return { ok: false, message: '通知の登録に失敗しました。時間をおいてお試しください。' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'ログインし直してください。' };

  // 同じ端末で登録し直したときは上書きする
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: toBase64Url(subscription.getKey('p256dh')),
      auth: toBase64Url(subscription.getKey('auth')),
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.error('push subscription save failed', error);
    return { ok: false, message: '通知の登録を保存できませんでした。' };
  }

  return { ok: true };
}

export async function unsubscribeThisDevice(): Promise<SubscribeResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, message: 'この端末では通知を扱えません。' };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true };

  const supabase = createClient();
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  await subscription.unsubscribe();

  return { ok: true };
}

/** この端末が登録済みか。 */
export async function isThisDeviceSubscribed(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) !== null;
}
