const CACHE_NAME = "time-regulus-v2.0.1"; // バージョンアップ時にはここを必ず変更してください
const urlsToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./QRCorde.PNG"
];

// インストール時に必要なアセットをキャッシュ
self.addEventListener("install", event => {
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 指定されたすべてのファイルをキャッシュに追加
      return cache.addAll(urlsToCache);
    })
  );
});

// 起動時に古いキャッシュを削除し、すぐに制御を奪取
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            // 現在のキャッシュ名と異なる古いキャッシュを削除（キャッシュバスティング）
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      // ★修正箇所: 新しいService Workerが即座にクライアントを制御できるようにする
      return self.clients.claim();      
    })
  );
});

// リクエスト時にキャッシュ優先で応答する（Cache First戦略）
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      // キャッシュが存在すれば、それを返す。なければネットワークから取得
      return response || fetch(event.request);
    })
  );
});

// ★修正箇所: postMessageを受け取り、skipWaitingを実行するリスナー
// script.jsからの「更新ボタンがクリックされた」メッセージを受け取る
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    // 待機中のService Workerを強制的にアクティブ化
    self.skipWaiting();
  }
});