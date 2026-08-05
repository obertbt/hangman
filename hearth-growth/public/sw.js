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
const CACHE = 'hearth-growth-shell-v1';
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
      return offline ?? new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }),
  );
});
