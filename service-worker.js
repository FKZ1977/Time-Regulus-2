// Time Regulus Service Worker - PWA & Network-First for HTML
const CACHE_NAME = "time-regulus-v3.3.3-pwa-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./style-lock.css?c=32",
  "./style-main.css?c=71",
  "./script.js?c=92",
  "./i18n.js?v=17",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./QRCorde.PNG",
  "./fonts/Bellefair.ttf",
  "./fonts/BungeeShade.ttf",
  "./fonts/DiplomataSC.ttf",
  "./fonts/MoiraiOne.woff2",
  "./fonts/Orbitron-Bold.woff2",
  "./fonts/RubikDirt.woff2",
  "./fonts/ShareTechMono.woff2",
  "./fonts/Sixtyfour.woff2",
  "./fonts/VT323.woff2"
];

// インストール時に基本アセットをプリキャッシュし、待機せず即座にアクティブ化
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 起動時に古いバージョンのキャッシュを削除し、直ちにクライアントを制御
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// リクエスト処理: HTMLはNetwork First（最新優先＋オフラインフォールバック）、静的アセットはCache First
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // 外部ドメイン（Google Analytics等）は通常通りブラウザに任せる
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. HTML・ナビゲーションリクエスト: 【Network First】
  // オンラインならサーバーから最新を取得してキャッシュを更新。電波がない場合のみキャッシュを使用
  if (request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // オフライン時はキャッシュされたHTMLを返す
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match("./index.html") || caches.match("./");
          });
        })
    );
    return;
  }

  // 2. その他の静的ファイル (CSS, JS, 画像, フォント等): 【Cache First + ネットワーク更新】
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});

// メッセージを受け取り、skipWaitingを実行するリスナー
self.addEventListener("message", event => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
