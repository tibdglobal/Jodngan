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

  /* ---------- 1) ป้ายสถานะซิงก์ ---------- */
  let inflight = 0, lastOk = get('hubLastSync', 0), lastErr = '';
  const host = document.querySelector('header.top > div:first-child');
  const pill = document.createElement('button');
  pill.type = 'button'; pill.className = 'sync-pill';
  pill.title = 'สถานะการซิงก์กับระบบ · กดเพื่อดึงใหม่';
  if (host) host.appendChild(pill);
  pill.addEventListener('click', () => { const b = document.getElementById('btnSync') || document.getElementById('btnReload'); if (b) b.click(); else location.reload(); });
  function paint() {
    if (!host) return;
    let cls = 'ok', txt;
    if (!navigator.onLine) { cls = 'warn'; txt = '⚠ ออฟไลน์ · จดไว้ในเครื่องก่อน'; }
    else if (inflight) { cls = 'busy'; txt = '⏳ กำลังซิงก์…'; }
    else if (lastErr) { cls = 'warn'; txt = '⚠ ซิงก์ไม่สำเร็จ · แตะเพื่อลองใหม่'; }
    else if (lastOk) { const d = new Date(lastOk); txt = '✓ ซิงก์แล้ว ' + (ymd(d) === ymd(new Date()) ? d.toTimeString().slice(0, 5) : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })); }
    else { cls = 'idle'; txt = '• ยังไม่ได้ซิงก์'; }
    pill.className = 'sync-pill ' + cls; pill.textContent = txt;
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (!isApi(input)) return realFetch(input, init);
    inflight++; paint();
    return realFetch(input, init).then(res => {
      res.clone().json().then(d => { lastErr = d && d.ok === false ? (d.error || 'error') : ''; if (!lastErr) { lastOk = Date.now(); put('hubLastSync', lastOk); } })
        .catch(() => { lastErr = 'ตอบกลับไม่ถูกต้อง'; }).finally(() => { inflight = Math.max(0, inflight - 1); paint(); });
      return res;
    }, err => { inflight = Math.max(0, inflight - 1); lastErr = String(err && err.message || err); paint(); throw err; });
  };
  window.addEventListener('online', paint); window.addEventListener('offline', paint);
  setInterval(paint, 60000);
  paint();

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

  function today() {
    const si = document.getElementById('searchInput');
    box.hidden = !!(si && si.value.trim());   // กำลังค้นหา = ซ่อนแถบวันนี้
    const t = ymd(new Date()), soon = ymd(new Date(Date.now() + 3 * 864e5));
    const tasks = get('tasks', []).filter(x => x.done !== '1');
    const eff = x => x.date || '';
    const due = tasks.filter(x => eff(x) === t).length, late = tasks.filter(x => eff(x) && eff(x) < t).length;
    const mt = get('meetTasks', null);
    const meet = mt && Array.isArray(mt.tasks) ? mt.tasks.filter(x => x.open && x.scope === 'me' && x.due && x.due !== 'none' && x.due <= soon) : [];
    const bills = get('bills', null), money = get('money', null);
    const ready = bills ? bills.filter(b => b.status === 'ready') : [], draft = bills ? bills.filter(b => b.status === 'draft') : [];
    const spent = money ? money.filter(x => x.date === t && (x.type || 'out') === 'out').reduce((s, x) => s + Number(x.amount || 0), 0) : null;
    const chip = (ico, main, sub, href, cls = '') => `<a class="td-chip ${cls}" ${href.startsWith('#') ? `data-go="${href}"` : `href="${href}"`}><span>${ico}</span><b>${main}</b><small>${sub}</small></a>`;
    box.innerHTML = `<div class="td-h"><b>☀️ วันนี้</b><small>${new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })}</small></div><div class="td-row">`
      + chip('✓', `${due} งาน`, late ? `เลยกำหนด ${late}` : 'ไม่มีงานค้าง', '#tasks', late ? 'warn' : '')
      + chip('📋', `${meet.length} งาน`, 'ประชุม ภายใน 3 วัน', '#meet', meet.some(x => x.due < t) ? 'warn' : '')
      + (bills ? chip('🧾', ready.length ? baht(ready.reduce((s, b) => s + Number(b.amount || 0), 0)) : '0', ready.length ? `รอส่งเบิก ${ready.length}` + (draft.length ? ` · ขาดใบ ${draft.length}` : '') : (draft.length ? `ขาดใบ ${draft.length}` : 'ไม่มีบิลค้าง'), 'bills.html', draft.length ? 'warn' : '') : '')
      + (money ? chip('💰', baht(spent), 'ใช้จ่ายวันนี้', 'money.html') : '')
      + '</div>';
  }
  box.addEventListener('click', e => {
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
