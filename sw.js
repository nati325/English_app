// Service worker: מטמון offline-first. מעלים גרסה כדי לרענן.
const V = 'np-v20';
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/stage.js', 'js/store.js', 'js/srs.js', 'js/speech.js', 'js/views.js', 'js/azure.js', 'js/tutor.js', 'js/rhythm.js', 'js/placement.js', 'js/pages.js', 'js/learn.js', 'js/teacher.js', 'js/icons.js', 'data/placement.js', 'js/rec.js', 'data/rhythm.js', 'data/words.json', 'data/phonemes.js', 'data/talk.js',
  'assets/animals/fox.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // רק קבצי האפליקציה; בקשות לשירותים חיצוניים עוברות ישירות
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return r; })));
});
