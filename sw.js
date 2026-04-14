const CACHE_NAME = 'rentfind-v11';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './map.html',
    './styles.css',
    './app.js',
    './map.js',
    './manifest.json',
    './icons/icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    const isNavigationRequest = event.request.mode === 'navigate';

    // Network-first keeps app files fresh while still supporting offline fallback.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                return networkResponse;
            })
            .catch(async () => {
                const cached = await caches.match(event.request);
                if (cached) {
                    return cached;
                }

                if (isNavigationRequest) {
                    return caches.match('./index.html');
                }

                return Response.error();
            })
    );
});
