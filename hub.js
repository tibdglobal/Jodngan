/* จดครบ — ตัวช่วยรวมทุกหน้า (โหลดท้ายสุดของทุกหน้า)
 * 1) ป้ายสถานะซิงก์ที่หัวหน้า: ✓ ซิงก์แล้ว hh:mm / ⏳ กำลังซิงก์ / ⚠ ออฟไลน์ / ⚠ ซิงก์ไม่สำเร็จ (ดักทุกคำขอไประบบหลังบ้าน)
 * 2) หน้างาน: แถบ ☀️ วันนี้ (งานวันนี้/เลยกำหนด · งานประชุมใกล้กำหนด · บิลรอเบิก · ใช้จ่ายวันนี้)
 * 3) หน้างาน: ค้นหาข้ามหมวด (กล่องฝาก · บิลเบิก · รายรับรายจ่าย) ใต้ผลค้นหางาน
 * อ่านจากข้อมูลที่เก็บในเครื่องของแต่ละหน้า (localStorage) · หน้างานดึงบิล/เงินมาเก็บไว้ให้ถ้าเครื่องนี้ยังไม่เคยเปิด */
(() => {
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ymd = d => d.toLocaleDateString('sv-SE');
  const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const isApi = u => /script\.google(usercontent)?\.com\/macros\/|x\.test\/exec/.test(String(u && u.url || u || ''));

  /* ---------- 🎨 ไอคอนเส้นชุดเดียวทั้งแอป (แทนอีโมจิในแถบล่าง/ปุ่มหัวหน้า) ---------- */
  const sv = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = window.ICO = {
    tasks: sv('<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.3 2.6 2.6 4.8-5.2"/>'),
    inbox: sv('<path d="M4 13.5h4.2l1.4 2.4h4.8l1.4-2.4H20"/><path d="M6.3 5.5h11.4l2.3 8v4.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5z"/>'),
    money: sv('<path d="M5 7.5h13.5A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6.5A1.5 1.5 0 0 1 5.5 5H16"/><path d="M20 11.5h-3.5a1.8 1.8 0 0 0 0 3.6H20"/>'),
    bills: sv('<path d="M6.5 3.5h11v17l-2.75-1.6L12 20.5l-2.75-1.6L6.5 20.5z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/>'),
    vault: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/><path d="M12 14.4v2.2"/>'),
    users: sv('<circle cx="9" cy="8.5" r="3.1"/><path d="M3.6 19a5.4 5.4 0 0 1 10.8 0"/><path d="M15.3 5.7a3.1 3.1 0 0 1 0 5.7"/><path d="M17.3 13.9A5.4 5.4 0 0 1 20.4 19"/>'),
    cal: sv('<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
    list: sv('<path d="M9.5 7h10M9.5 12h10M9.5 17h10"/><path d="M5 7h.01M5 12h.01M5 17h.01" stroke-width="2.6"/>'),
    more: sv('<path d="M5.5 12h.01M12 12h.01M18.5 12h.01" stroke-width="3"/>'),
    chart: sv('<path d="M4 20h16"/><path d="M7.5 16.5v-5M12 16.5v-9M16.5 16.5v-7"/>'),
    gear: sv('<path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20"/><circle cx="15" cy="7.5" r="2.4"/><circle cx="9" cy="16.5" r="2.4"/>'),
    pulse: sv('<path d="M3 12h4.2l2.3-5.5 5 11 2.3-5.5H21"/>'),
  };
  const TAB = { './': 'tasks', 'inbox.html': 'inbox', 'money.html': 'money', 'bills.html': 'bills', 'vault.html': 'vault' };
  document.querySelectorAll('.tabbar a').forEach(a => { const k = TAB[a.getAttribute('href')], sp = a.querySelector('span'); if (k && sp) { sp.innerHTML = ICO[k]; sp.classList.add('ico'); } });
  document.querySelectorAll('[data-ico]').forEach(el => { if (ICO[el.dataset.ico]) el.innerHTML = ICO[el.dataset.ico]; });

  /* ---------- 1) ป้ายสถานะซิงก์ ---------- */
  let inflight = 0, lastOk = get('hubLastSync', 0), lastErr = '';
  const host = document.querySelector('header.top > div:first-child');
  const pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'sync-pill';
  pill.title = 'สถานะการซิงก์กับระบบ · กดเพื่อดึงใหม่';
  if (host) host.appendChild(pill);
  pill.addEventListener('click', () => { if (get('hubOutbox', []).length) { window.hubFlush && window.hubFlush(); return; } const b = document.getElementById('btnSync') || document.getElementById('btnReload'); if (b) b.click(); else location.reload(); });
  // หลอดโหลดบางๆ ชิดขอบบนจอ: ขึ้นเมื่อซิงก์นานเกิน 150 ms · เสร็จแล้ววิ่งเต็มหลอดแล้วจางหาย
  const bar = document.createElement('div');
  bar.className = 'sync-bar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'กำลังซิงก์');
  bar.innerHTML = '<i></i>';
  document.body.appendChild(bar);
  let barT = 0;
  function barPaint() {
    clearTimeout(barT);
    if (inflight) {
      if (!bar.classList.contains('on')) barT = setTimeout(() => { bar.classList.remove('done', 'fail'); bar.classList.add('on'); }, 150);
    } else if (bar.classList.contains('on')) {
      bar.classList.add(lastErr ? 'fail' : 'done');
      barT = setTimeout(() => bar.classList.remove('on', 'done', 'fail'), 650);
    }
  }
  function paint() {
    barPaint();
    if (!host) return;
    let cls = 'ok', txt;
    const nq = get('hubOutbox', []).length;
    if (!navigator.onLine) { cls = 'warn'; txt = '📴 ออฟไลน์ · จดไว้ในเครื่อง' + (nq ? ` (รอส่ง ${nq})` : ''); }
    else if (nq && !inflight) { cls = 'warn'; txt = `⏳ รอส่ง ${nq} รายการ · แตะเพื่อส่ง`; }
    else if (inflight) { cls = 'syncing'; txt = 'กำลังซิงก์…'; }
    else if (lastErr) { cls = 'warn'; txt = '⚠ ซิงก์ไม่สำเร็จ · แตะเพื่อลองใหม่'; }
    else if (lastOk) { const d = new Date(lastOk); txt = '✓ ซิงก์แล้ว ' + (ymd(d) === ymd(new Date()) ? d.toTimeString().slice(0, 5) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })); }
    else { cls = 'idle'; txt = '• ยังไม่ได้ซิงก์'; }
    pill.className = 'sync-pill ' + cls; pill.textContent = txt;
  }
  const realFetch = window.fetch.bind(window);
  /* 📴 กล่องรอส่ง: เน็ตหลุดตอนบันทึก → เก็บคำขอไว้ในเครื่อง (LS hubOutbox) แล้วตอบแอปว่า "บันทึกแล้ว" ทันที
   * เน็ตกลับมา / เปิดหน้า / ก่อนดึงข้อมูลใหม่ → ส่งออกตามลำดับ (ดึงข้อมูลหลังส่งครบ จึงไม่ทับของที่จดไว้) */
  const QUEUE = /^(add|update|delete|money_save|money_delete|inbox_save|inbox_delete|owe_save|owe_delete|bill_save)$/;
  const outbox = () => get('hubOutbox', []);
  const keyOf = b => b.action + ':' + ((b.task && b.task.id) || (b.item && b.item.id) || b.id || (b.docs && b.docs.map(d => d.id).join(',')) || Math.random());
  function enqueue(url, b) {
    if (b.action === 'inbox_save' && b.item && !b.item.id) {   // ฝากใหม่ตอนออฟไลน์: ตั้ง id ในเครื่อง (หลังบ้านใช้ id นี้ต่อ)
      const t = String(b.item.text || '');
      b.item = { ...b.item, id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[-.]/g, ''), kind: b.item.kind || (/https?:\/\//.test(t) ? 'link' : 'note'), created: new Date().toISOString(), title: b.item.title || '' };
    }
    const q = outbox(), k = keyOf(b);
    const i = q.findIndex(x => x.k === k);
    const rec = { k, url, body: b, at: Date.now() };
    if (i > -1) q[i] = rec; else q.push(rec);   // แก้รายการเดิมซ้ำ = เก็บฉบับล่าสุด
    put('hubOutbox', q); paint();
    const echo = { ok: true, queued: true };
    if (b.task) echo.task = b.task;
    if (b.item) echo.item = b.item;
    if (b.bill) echo.bill = b.bill;
    if (b.docs) echo.docs = b.docs;
    return new Response(JSON.stringify(echo), { headers: { 'Content-Type': 'application/json' } });
  }
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    if (!outbox().length || !navigator.onLine) return Promise.resolve();
    flushing = (async () => {
      inflight++; paint();
      try {
        while (outbox().length && navigator.onLine) {
          const rec = outbox()[0];
          let res;
          try { res = await realFetch(rec.url, { method: 'POST', body: JSON.stringify(rec.body), redirect: 'follow' }); }
          catch (e) { lastErr = 'ยังส่งไม่ได้'; break; }          // เน็ตยังไม่มา: เก็บไว้ลองรอบหน้า
          let d = {}; try { d = await res.json(); } catch (e) {}
          const q = outbox(); if (q.length && q[0].k === rec.k && q[0].at === rec.at) q.shift(); else { const j = q.findIndex(x => x.k === rec.k && x.at === rec.at); if (j > -1) q.splice(j, 1); }
          put('hubOutbox', q);
          if (d.ok === false) { const f = get('hubOutboxFail', []); f.push({ body: rec.body, error: d.error, at: Date.now() }); put('hubOutboxFail', f.slice(-20)); lastErr = d.error || 'ส่งไม่สำเร็จ'; }
          else { lastErr = ''; lastOk = Date.now(); put('hubLastSync', lastOk); }
        }
      } finally { inflight = Math.max(0, inflight - 1); flushing = null; paint(); }
      if (!outbox().length) document.dispatchEvent(new CustomEvent('hub:flushed'));
    })();
    return flushing;
  }
  window.hubFlush = flush;
  window.fetch = function (input, init) {
    if (!isApi(input)) return realFetch(input, init);
    let b = null; try { b = JSON.parse(init && init.body || 'null'); } catch (e) {}
    const url = String(input && input.url || input);
    const queueable = b && QUEUE.test(b.action || '');
    if (queueable && (!navigator.onLine || outbox().length)) return Promise.resolve(enqueue(url, b));   // ออฟไลน์ / ยังมีของค้างส่ง = ต่อคิว (รักษาลำดับ)
    const go = () => {
      inflight++; paint();
      return realFetch(input, init).then(res => {
        res.clone().json().then(d => { lastErr = d && d.ok === false ? (d.error || 'error') : ''; if (!lastErr) { lastOk = Date.now(); put('hubLastSync', lastOk); } })
          .catch(() => { lastErr = 'ตอบกลับไม่ถูกต้อง'; }).finally(() => { inflight = Math.max(0, inflight - 1); paint(); });
        return res;
      }, err => {
        inflight = Math.max(0, inflight - 1);
        if (queueable) { paint(); return enqueue(url, b); }            // ส่งไม่ออก (เน็ตหลุดกลางทาง) = เก็บไว้ก่อน
        lastErr = String(err && err.message || err); paint(); throw err;
      });
    };
    return outbox().length && navigator.onLine ? flush().then(go) : go();   // ดึงข้อมูลหลังส่งของค้างครบ
  };
  window.addEventListener('online', () => { paint(); flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flush(); });
  setTimeout(flush, 1500);
  window.addEventListener('online', paint); window.addEventListener('offline', paint);
  setInterval(paint, 60000);
  paint();

  /* ---------- ⚡ ปุ่มลัด (กดค้างไอคอนแอป) ?do=task|expense|snap|note ---------- */
  const DO = new URLSearchParams(location.search).get('do');
  if (DO) {
    history.replaceState(null, '', location.pathname + location.hash);
    setTimeout(() => {
      const focus = sel => { const el = document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } return el; };
      if (DO === 'task') focus('#quickInput');
      else if (DO === 'expense') focus('#mInput');
      else if (DO === 'note') focus('#iInput');
      else if (DO === 'snap') {
        // เบราว์เซอร์ไม่ให้เปิดกล้องเองโดยไม่แตะ → ขึ้นปุ่มใหญ่ให้แตะครั้งเดียว
        const btn = document.getElementById('btnSnap');
        if (!btn) return;
        const tip = document.createElement('button');
        tip.type = 'button'; tip.className = 'do-snap';
        tip.innerHTML = '📷 <b>แตะเพื่อถ่าย / เลือกรูป</b><small>' + (document.body.classList.contains('bills') ? 'บิลเบิกบริษัท' : 'สลิป / ใบเสร็จ รายจ่ายส่วนตัว') + '</small>';
        tip.onclick = () => { tip.remove(); btn.click(); };
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 15000);
      }
    }, 350);
  }

  /* ---------- 2) + 3) เฉพาะหน้างาน ---------- */
  if (!document.body.classList.contains('tasks')) return;
  const cfg = get('cfg', {});
  const api = async (action) => {
    const res = await fetch(cfg.url || 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec', { method: 'POST', body: JSON.stringify({ action, key: cfg.key }), redirect: 'follow' });
    const d = await res.json(); if (!d.ok) throw new Error(d.error || 'error'); return d;
  };

  const box = document.createElement('section');
  box.className = 'today-strip'; box.id = 'todayStrip';
  const status = document.getElementById('status');
  (status || document.getElementById('list')).before(box);

  let openK = '';   // ช่องที่กางดูอยู่
  const short = d => { const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return isNaN(x) ? '' : x.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); };
  function today() {
    const si = document.getElementById('searchInput');
    box.hidden = !!(si && si.value.trim());   // กำลังค้นหา = ซ่อนแถบวันนี้
    const t = ymd(new Date()), soon = ymd(new Date(Date.now() + 3 * 864e5));
    const tasks = get('tasks', []).filter(x => x.done !== '1');
    const eff = x => x.date || '';
    const dueL = tasks.filter(x => eff(x) === t), lateL = tasks.filter(x => eff(x) && eff(x) < t).sort((a, b) => eff(a) < eff(b) ? -1 : 1);
    const mt = get('meetTasks', null);
    const meet = mt && Array.isArray(mt.tasks) ? mt.tasks.filter(x => x.open && x.scope === 'me' && x.due && x.due !== 'none' && x.due <= soon).sort((a, b) => a.due < b.due ? -1 : 1) : [];
    const bills = get('bills', null), money = get('money', null);
    const ready = bills ? bills.filter(b => b.status === 'ready') : [], draft = bills ? bills.filter(b => b.status === 'draft') : [];
    const todayM = money ? money.filter(x => x.date === t) : [];
    const spent = todayM.filter(x => (x.type || 'out') === 'out').reduce((s, x) => s + Number(x.amount || 0), 0);

    const K = {
      tasks: { ico: ICO.tasks, main: `${dueL.length} งาน`, sub: lateL.length ? `เลยกำหนด ${lateL.length}` : 'ไม่มีงานค้าง', warn: lateL.length > 0,
        rows: [...lateL.map(x => [x.title, short(eff(x)), 'late']), ...dueL.map(x => [x.title, x.time || 'วันนี้', ''])],
        empty: 'วันนี้ไม่มีงานที่ต้องส่ง', go: ['ดูในรายการงาน', '#tasks'] },
      meet: { ico: ICO.users, main: `${meet.length} งาน`, sub: 'ประชุมใน 3 วัน', warn: meet.some(x => x.due < t),
        rows: meet.map(x => [x.task, (x.due < t ? 'เลย ' : '') + short(x.due), x.due < t ? 'late' : '']),
        empty: 'ไม่มีงานจากประชุมที่ใกล้กำหนด', go: ['เปิดงานจากคลังรายงาน', '#meet'] },
    };
    if (bills) K.bills = { ico: ICO.bills, main: ready.length ? baht(ready.reduce((s, b) => s + Number(b.amount || 0), 0)) : '0',
      sub: ready.length ? `รอส่งเบิก ${ready.length}` + (draft.length ? ` · ขาดใบ ${draft.length}` : '') : (draft.length ? `ขาดใบ ${draft.length}` : 'ไม่มีบิลค้าง'), warn: draft.length > 0,
      rows: [...draft.map(b => [b.desc || b.vendor || 'บิล', 'ขาดใบ · ' + baht(b.amount), 'late']), ...ready.map(b => [b.desc || b.vendor || 'บิล', baht(b.amount), ''])],
      empty: 'ไม่มีบิลค้างเบิก', go: ['ไปหน้าเบิก', 'bills.html'] };
    if (money) K.money = { ico: ICO.money, main: baht(spent), sub: 'ใช้จ่ายวันนี้', warn: false,
      rows: todayM.map(x => [x.note || x.cat || (x.type === 'in' ? 'รายรับ' : 'รายจ่าย'), (x.type === 'in' ? '+' : '−') + baht(x.amount), x.type === 'in' ? 'in' : '']),
      empty: 'วันนี้ยังไม่ได้จดรายจ่าย', go: ['ไปหน้าเงิน', 'money.html'] };
    if (!K[openK]) openK = '';

    const chip = k => { const c = K[k]; return `<button type="button" class="td-chip${c.warn ? ' warn' : ''}${openK === k ? ' on' : ''}" data-k="${k}" aria-expanded="${openK === k}"><span class="td-ico td-${k}">${c.ico}</span><b>${c.main}</b><small>${esc(c.sub)}</small></button>`; };
    let panel = '';
    if (openK) {
      const c = K[openK], more = c.rows.length - 8;
      panel = `<div class="td-panel" role="region">${c.rows.length
        ? `<ul>${c.rows.slice(0, 8).map(r => `<li class="${r[2]}"><span>${esc(r[0])}</span><small>${esc(r[1])}</small></li>`).join('')}</ul>${more > 0 ? `<p class="td-more">และอีก ${more} รายการ</p>` : ''}`
        : `<p class="td-empty">${c.empty}</p>`}
        <a class="td-go" ${c.go[1].startsWith('#') ? `href="${c.go[1]}" data-go="${c.go[1]}"` : `href="${c.go[1]}"`}>${c.go[0]} ›</a></div>`;
    }
    box.innerHTML = `<div class="td-h"><b>☀️ วันนี้</b><small>${new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })}</small></div>`
      + `<div class="td-row">${Object.keys(K).map(chip).join('')}</div>` + panel;
  }
  box.addEventListener('click', e => {
    const c = e.target.closest('[data-k]');
    if (c) { openK = openK === c.dataset.k ? '' : c.dataset.k; today(); return; }   // แตะ = กาง/พับดูรายการ ยังไม่ไปหน้าอื่น
    const a = e.target.closest('[data-go]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.go === '#meet') { const b = document.getElementById('btnMeetArc'); if (b) b.click(); }
    else { const g = document.querySelector('#list .group'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  window.hubToday = today;
  today();

  // ยังไม่เคยเปิดหน้าเบิก/เงินในเครื่องนี้ → ดึงมาเก็บไว้ (ครั้งเดียวต่อการเปิดหน้า)
  setTimeout(async () => {
    if (!cfg.key) return;
    try { if (!get('bills', null)) put('bills', (await api('bills_list')).bills || []); } catch (e) {}
    try { if (!get('money', null)) put('money', (await api('money_list')).items || []); } catch (e) {}
    try { const m = get('meetTasks', null); if (!m || Date.now() - (m.at || 0) > 3 * 3600e3) { const r = await api('meet_tasks'); put('meetTasks', { tasks: r.tasks, me: r.me, statuses: r.statuses, url: r.url, at: Date.now() }); } } catch (e) {}
    today();
  }, 2500);

  /* ค้นหาข้ามหมวด: เรียกจาก renderSearch ของ app.js */
  window.hubSearch = q => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const hit = s => { const h = String(s || '').toLowerCase(); return words.every(w => h.includes(w)); };
    const groups = [
      ['📌 กล่องฝาก', get('inbox', []).filter(o => hit([o.text, o.title, o.url, o.tags, o.data && JSON.stringify(o.data)].join(' ')))
        .map(o => ({ t: o.title || String(o.text || '').split('\n')[0] || (o.data && o.data.title) || 'รายการ', s: String(o.created || '').slice(0, 10), href: 'inbox.html?q=' + encodeURIComponent(q) }))],
      ['🧾 บิลเบิก', get('bills', []).filter(b => hit([b.desc, b.vendor, b.project, b.cat, b.note].join(' ')))
        .map(b => ({ t: b.desc || b.vendor || 'บิล', s: `${b.date || ''} · ${baht(b.amount)}`, href: 'bills.html' }))],
      ['💰 รายรับ-รายจ่าย', get('money', []).filter(x => hit([x.note, x.cat].join(' ')))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map(x => ({ t: x.note || x.cat, s: `${x.date || ''} · ${(x.type === 'in' ? '+' : '−') + baht(x.amount)}`, href: 'money.html' }))],
    ].filter(g => g[1].length);
    if (!groups.length) return '';
    return `<section class="group x-search"><h3>จากหมวดอื่น</h3>` + groups.map(([name, list]) => `<div class="items">
      <div class="xs-h">${name} · ${list.length}</div>
      ${list.slice(0, 5).map(r => `<a class="xs-it" href="${r.href}"><span>${esc(r.t)}</span><small>${esc(r.s)}</small></a>`).join('')}
      ${list.length > 5 ? `<a class="xs-it more" href="${list[0].href}">ดูทั้งหมด ${list.length} รายการ ›</a>` : ''}
    </div>`).join('') + '</section>';
  };
})();
