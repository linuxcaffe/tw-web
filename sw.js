// tw-web service worker — shell cache for PWA installability and for when the server is down
// API calls always go to network; only app shell assets are cached.

const CACHE = 'tw-web-v225';
const SHELL = [
    '/', '/index.html', '/styles.css',
    '/nav.js', '/tw-api.js', '/tw-filter.js', '/main.js', '/task-card.js', '/task-editor.js', '/task-editor-templates.html',
    '/agenda.html', '/agenda.js',
    '/calendar-planner.html', '/calendar-planner.js', '/calendar-planner.css', '/sun.js', '/tw-layers.js',
    '/fullcalendar.min.js', '/fullcalendar.min.css',
    '/kanban.html', '/about.html', '/help.html',
    '/xterm.js', '/xterm.css',
    '/codemirror-bundle.js',
    '/manifest.json', '/logo.svg', '/logo-192.png', '/logo-512.png',
    '/favicon.png', '/taskwarrior.svg', '/tw-logo.png',
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    // Delete stale caches. No clients.claim() — avoids invalidating in-flight
    // fetch Responses on the current page when the SW activates after --clean.
    // New SW takes effect on next navigation.
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    );
});

self.addEventListener('fetch', e => {
    // API calls (including SSE): always go direct to network.
    // Do NOT call e.respondWith() — bare return is correct here.
    // clients.claim() has been removed so there is no SW-activation race
    // that would invalidate in-flight responses.
    if (e.request.url.includes('/api/')) return;
    if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;

    // App shell: network first, the cache only when the server doesn't answer. Cache-first ran a
    // stale mix of old and new files after a day of updates, until tw-web-launch.sh --clean
    // (2026-10-24). The server is local or on Tailscale, so asking it first costs nothing; each
    // good answer refreshes the cache for the next time it's down.
    e.respondWith(
        fetch(e.request)
            .then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
                }
                return res;
            })
            .catch(() => caches.match(e.request, { ignoreSearch: true })
                .then(cached => cached || Promise.reject(new Error('offline, and not cached'))))
    );
});
