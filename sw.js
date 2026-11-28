/* เก็บไฟล์หน้าแอปไว้ในเครื่อง ให้เปิดเร็ว (ข้อมูลงานยังดึงจาก Google Sheet ทุกครั้ง) */
const CACHE = 'jodngan-v116';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'vault.html', 'vault.js', 'bills.html', 'bills.js', 'inbox.html', 'notes.html', 'inbox.js', 'month.html', 'month.js', 'status.html', 'status.js', 'mcore.js', 'inote.js', 'iaudio.js', 'meet.js', 'hub.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'logo-tibd.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'jodkrob-share').map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // 📤 รับของที่แชร์มาจากแอปอื่น (manifest share_target) เก็บไว้ให้หน้ากล่องฝากหยิบไปใช้
  if (e.request.method === 'POST' && url.origin === location.origin && /\/inbox\.html$/.test(url.pathname)) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), c = await caches.open('jodkrob-share');
        const f = fd.get('file');
        const meta = { title: fd.get('title') || '', text: fd.get('text') || '', url: fd.get('url') || '' };
        await c.delete('file');
        if (f && f.size) { meta.name = f.name; meta.type = f.type; await c.put('file', new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } })); }
        await c.put('meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
      } catch (err) {}
      return Response.redirect(new URL('inbox.html?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // ลองโหลดจากเน็ตก่อน (ได้เวอร์ชันล่าสุด) ถ้าไม่ได้ค่อยใช้ของในเครื่อง
  e.respondWith(
    // no-cache = ถามเซิร์ฟเวอร์ทุกครั้งว่าไฟล์เปลี่ยนไหม (กันได้ CSS/JS เก่าจากแคชของเบราว์เซอร์)
    fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' }))
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
