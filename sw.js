/*
 * Service Worker：離線快取 + 接收 Android 分享選單送來的截圖
 * 更新網站內容時，把 VERSION 加 1，使用者下次開啟就會換成新版。
 */
const VERSION = 2;
const CACHE = `cat-solver-v${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'queens-engine.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('cat-solver-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // 先用快取（離線也能開），同時在背景抓新版放進快取
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const network = fetch(req).then((res) => {
      if (res.ok && !url.search) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    e.waitUntil(network);
    return cached || (await network) || new Response('目前離線，且尚未快取這個檔案', { status: 503 });
  })());
});

// 分享進來的圖片先存進快取，再轉回主頁面由頁面讀取
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const file = form.get('image');
    if (file) {
      const cache = await caches.open('shared-image');
      await cache.put('shared-image', new Response(file, { headers: { 'Content-Type': file.type || 'image/png' } }));
    }
  } catch (err) {
    // 讀不到就讓頁面顯示提示訊息
  }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}
