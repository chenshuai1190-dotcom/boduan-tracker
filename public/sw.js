// ============ Service Worker: 缓存股票 Logo ============
// 第一次访问时静默下载,之后从本地缓存读取(0 延迟)
// 缓存名带版本号,改版本号会自动清除老缓存

const LOGO_CACHE = 'bottomline-logos-v1';
const APP_CACHE = 'bottomline-app-v1';

// Logo 域名白名单 - 这些域名的图片才会被缓存
const LOGO_HOSTS = [
  'logo.clearbit.com',
  'icons.duckduckgo.com',
  'www.google.com',  // Google Favicons API
];

// 安装阶段
self.addEventListener('install', (event) => {
  // 立刻激活,不等旧的 SW
  self.skipWaiting();
});

// 激活阶段:清理老版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => {
          // 删除老版本缓存
          if (k !== LOGO_CACHE && k !== APP_CACHE && k.startsWith('bottomline-')) {
            return caches.delete(k);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只处理 logo 域名的 GET 请求
  if (event.request.method !== 'GET') return;
  if (!LOGO_HOSTS.includes(url.hostname)) return;

  // Cache-First 策略:先看缓存,没有再网络
  event.respondWith(
    caches.open(LOGO_CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) {
          // 缓存命中 → 立刻返回(0 延迟!)
          return cached;
        }
        // 缓存未命中 → 网络请求 + 存入缓存
        return fetch(event.request).then(response => {
          // 只缓存成功的响应(避免缓存 404 错误)
          if (response.ok) {
            // 克隆一份存进缓存(因为响应流只能用一次)
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => {
          // 网络失败 → 返回空响应,让前端 onError 切换到下一个源
          return new Response('', { status: 503 });
        });
      })
    )
  );
});
