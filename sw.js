/* เก็บไฟล์หน้าแอปไว้ในเครื่อง ให้เปิดเร็ว (ข้อมูลงานยังดึงจาก Google Sheet ทุกครั้ง) */
const CACHE = 'jodngan-v13';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // ลองโหลดจากเน็ตก่อน (ได้เวอร์ชันล่าสุด) ถ้าไม่ได้ค่อยใช้ของในเครื่อง
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
