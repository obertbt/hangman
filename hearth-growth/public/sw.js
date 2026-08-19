/*
 * Hearth Growth のサービスワーカー。
 *
 * 意図的に最小限にしている。
 *   * 記録や投稿はキャッシュしない。古い内容を新しいものとして見せないため。
 *   * 事前に持つのはオフライン用のページとアイコンだけ。
 *   * 画面遷移は常にネットワークを先に試し、繋がらないときだけ代わりを出す。
 *
 * 迷ったらキャッシュしない。ライフログで古い数字が出る方が困る。
 */
const CACHE = 'hearth-growth-shell-v3';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 画面遷移だけを扱う。API も画像もそのまま通す。
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const offline = await cache.match(OFFLINE_URL);
      return (
        offline ??
        new Response('オフラインです', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      );
    }),
  );
});

/*
 * ここから下は通知の受け取り。
 *
 * 予定時刻に「起きていますか？」を出し、「起きている」を押したら
 * その場で睡眠を終える。アプリを開かせない。
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 中身が読めなくても、通知そのものは出す（userVisibleOnly の約束）
  }

  const title = payload.title || '起きていますか？';
  const options = {
    body: payload.body || '「起きている」を押すと、睡眠の記録を終えます。',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: payload.tag || 'wake-alarm',
    // 寝起きに押し損ねないよう、自分で消えないようにする
    requireInteraction: true,
    actions: [
      { action: 'wake', title: '起きている' },
      { action: 'later', title: 'あとで' },
    ],
    data: { url: '/home' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'later') return;

  event.waitUntil(
    (async () => {
      // 「起きている」なら、開かずにその場で終える。
      // 同一オリジンなので、ログインの手形（Cookie）も一緒に送られる。
      if (event.action === 'wake') {
        try {
          const response = await fetch('/api/sleep/wake', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (response.ok) {
            await self.registration.showNotification('おはようございます', {
              body: '睡眠の記録を残しました。',
              icon: '/icons/icon.svg',
              tag: 'wake-alarm',
            });
            return;
          }
        } catch {
          // 通信できないときは、アプリを開いて手で終えてもらう
        }
      }

      const url = (event.notification.data && event.notification.data.url) || '/home';
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => client.url.includes(url));
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
