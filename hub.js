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

  /* ---------- 🌗 โหมดกลางวัน / กลางคืน (LS theme: auto | light | dark) ----------
   * ไม่ต้องเขียน CSS ซ้ำ: เปลี่ยนเงื่อนไขของกฎ @media (prefers-color-scheme: dark) ใน style.css
   * บังคับกลางคืน = ใช้กฎมืดเสมอ (all) · บังคับกลางวัน = ไม่ใช้เลย (not all) · อัตโนมัติ = ตามเครื่อง */
  const DARK_Q = '(prefers-color-scheme: dark)';
  function applyTheme(t) {
    const want = t === 'dark' ? 'all' : t === 'light' ? 'not all' : DARK_Q;
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      const walk = list => { for (const r of list) { if (r.media && r.cssRules) { const mt = r.media.mediaText; if (r.__dk || /prefers-color-scheme:\s*dark/.test(mt)) { r.__dk = 1; r.media.mediaText = want; } else walk(r.cssRules); } } };
      walk(rules);
    }
    const dark = t === 'dark' || (t !== 'light' && matchMedia(DARK_Q).matches);
    document.documentElement.style.colorScheme = t === 'auto' ? '' : (dark ? 'dark' : 'light');
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.media = ''; m.content = dark ? '#111214' : '#f1f2f4'; });
  }
  window.hubTheme = { get: () => get('theme', 'auto'), set: t => { put('theme', t); applyTheme(t); } };
  if (get('theme', 'auto') !== 'auto') applyTheme(get('theme', 'auto'));

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
    moon: sv('<path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7Z"/>'),
    text: sv('<path d="M4 18 8.5 6h1L14 18M5.6 14h6.8"/><path d="M15 18l2.8-7.5h.4L21 18M15.9 15.6h4.2"/>'),
    grid: sv('<path d="M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01" stroke-width="2.6"/>'),
    cog: sv('<path d="M12.2 2.5h-.4a1.9 1.9 0 0 0-1.9 1.9v.2a1.9 1.9 0 0 1-.95 1.6l-.4.25a1.9 1.9 0 0 1-1.9 0l-.2-.1a1.9 1.9 0 0 0-2.6.7l-.2.35a1.9 1.9 0 0 0 .7 2.6l.2.1a1.9 1.9 0 0 1 .95 1.65v.5a1.9 1.9 0 0 1-.95 1.65l-.2.1a1.9 1.9 0 0 0-.7 2.6l.2.35a1.9 1.9 0 0 0 2.6.7l.2-.1a1.9 1.9 0 0 1 1.9 0l.4.25a1.9 1.9 0 0 1 .95 1.6v.2a1.9 1.9 0 0 0 1.9 1.9h.4a1.9 1.9 0 0 0 1.9-1.9v-.2a1.9 1.9 0 0 1 .95-1.6l.4-.25a1.9 1.9 0 0 1 1.9 0l.2.1a1.9 1.9 0 0 0 2.6-.7l.2-.35a1.9 1.9 0 0 0-.7-2.6l-.2-.1a1.9 1.9 0 0 1-.95-1.65v-.5a1.9 1.9 0 0 1 .95-1.65l.2-.1a1.9 1.9 0 0 0 .7-2.6l-.2-.35a1.9 1.9 0 0 0-2.6-.7l-.2.1a1.9 1.9 0 0 1-1.9 0l-.4-.25a1.9 1.9 0 0 1-.95-1.6v-.2a1.9 1.9 0 0 0-1.9-1.9z"/><circle cx="12" cy="12" r="3"/>'),
    refresh: sv('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.2h-4.2"/>'),
    link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
    split: sv('<path d="M5 12h14"/><circle cx="12" cy="6.3" r="1.5"/><circle cx="12" cy="17.7" r="1.5"/>'),
    cam: sv('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>'),
    pulse: sv('<path d="M3 12h4.2l2.3-5.5 5 11 2.3-5.5H21"/>'),
  };
  const TAB = { './': 'tasks', 'inbox.html': 'inbox', 'money.html': 'money', 'bills.html': 'bills', 'vault.html': 'vault', 'split.html': 'split', 'money.html#owe': 'users' };
  document.querySelectorAll('.tabbar a').forEach(a => { const k = TAB[a.getAttribute('href')], sp = a.querySelector('span'); if (k && sp) { sp.innerHTML = ICO[k]; sp.classList.add('ico'); } });
  document.querySelectorAll('[data-ico]').forEach(el => { if (ICO[el.dataset.ico]) el.innerHTML = ICO[el.dataset.ico]; });

  /* ---------- 🗒 ลายพื้นหลัง (LS bgStyle) + สีพื้น (LS bgTint) ---------- */
  const BGS = [['plain', 'เรียบ'], ['dots', 'ลายจุด'], ['stagger', 'จุดสลับ'], ['lines', 'เส้นบรรทัด'], ['grid', 'ตาราง'], ['diag', 'เส้นเฉียง'], ['waves', 'คลื่น'], ['noise', 'กระดาษสา'],
    ['circles', 'วงกลมซ้อน'], ['hex', 'รังผึ้ง'], ['topo', 'เส้นแผนที่'], ['leaves', 'ใบไม้'], ['sparkle', 'ประกาย'], ['terrazzo', 'หินขัด'], ['memphis', 'รูปทรงสนุก'], ['plaid', 'ผ้าขาวม้า']];
  const TINTS = [['auto', 'ตามหมวด'], ['mono', 'เทา'], ['sky', 'ฟ้า'], ['mint', 'มินต์'], ['peach', 'พีช'], ['lavender', 'ลาเวนเดอร์'], ['sand', 'ทราย'],
    ['g-dawn', 'รุ่งเช้า'], ['g-sea', 'ทะเล'], ['g-leaf', 'ใบไม้'], ['g-dusk', 'พลบค่ำ'], ['g-sunset', 'ตะวันตก']];
  const applyBg = () => {
    const ph = get('bgPhoto', '');
    let bg = get('bgStyle', 'dots'); if (bg === 'photo' && !ph) bg = 'dots';
    document.body.dataset.bg = bg; document.body.dataset.tint = get('bgTint', 'auto'); document.body.dataset.soft = get('bgSoft', true) ? '1' : '';
    if (ph) document.documentElement.style.setProperty('--photo', `url("${ph}")`); else document.documentElement.style.removeProperty('--photo');
  };
  /* 🖼 รูปของฉัน: ย่อเหลือด้านยาว 1400px JPEG แล้วเก็บในเครื่อง (LS bgPhoto) */
  async function pickPhoto() {
    const f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => res(i.files[0]); i.click(); });
    if (!f) return false;
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(f); });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    let q = .75, d = c.toDataURL('image/jpeg', q);
    while (d.length > 900000 && q > .4) { q -= .1; d = c.toDataURL('image/jpeg', q); }
    try { localStorage.setItem('bgPhoto', JSON.stringify(d)); } catch (e) { alert('รูปใหญ่เกินที่เครื่องเก็บได้ ลองรูปอื่นครับ'); return false; }
    put('bgStyle', 'photo'); applyBg(); return true;
  }
  window.hubBg = { get: () => get('bgStyle', 'dots'), set: v => { put('bgStyle', v); applyBg(); }, tint: () => get('bgTint', 'auto'), setTint: v => { put('bgTint', v); applyBg(); } };
  applyBg();

  /* ---------- 🔠 ขนาดตัวอักษร (LS fontScale 1 | 1.1 | 1.2) ---------- */
  // ขยายเฉพาะตัวอักษร (ทุก font-size ใน style.css คูณ var(--fs)) ไม่ขยายทั้งหน้า → ช่อง ปุ่ม หน้าต่าง ไม่ล้นจอ
  const applyScale = v => {
    v = Number(v) || 1;
    document.body.style.zoom = '';
    document.documentElement.style.setProperty('--fs', String(v));
    document.documentElement.classList.toggle('fs-lg', v > 1);
  };
  window.hubScale = { get: () => get('fontScale', 1), set: v => { put('fontScale', v); applyScale(v); } };
  applyScale(get('fontScale', 1));

  /* ---------- 🔴 เลขงานบนไอคอนแอป (LS badgeOn) = งานวันนี้ + เลยกำหนดที่ยังไม่เสร็จ · อัปเดตตอนเปิด/ซิงก์แอป ---------- */
  const badgeOk = 'setAppBadge' in navigator;
  function badgeCount() {
    const t = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    return get('tasks', []).filter(x => x && x.done !== '1' && x.date && x.date <= t).length;
  }
  function badgeUpdate() {
    if (!badgeOk) return;
    try {
      if (!get('badgeOn', false)) { navigator.clearAppBadge && navigator.clearAppBadge().catch(() => {}); return; }
      const n = badgeCount();
      (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
    } catch (e) {}
  }
  window.badgeUpdateRef = badgeUpdate;
  window.hubBadge = { ok: badgeOk, on: () => get('badgeOn', false), count: badgeCount, set: async v => {
    if (v && window.Notification && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
    put('badgeOn', !!v); badgeUpdate();
    return !v || !window.Notification || Notification.permission !== 'denied';
  } };
  window.addEventListener('storage', e => { if (e.key === 'tasks') badgeUpdate(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') badgeUpdate(); });
  setTimeout(badgeUpdate, 2500); setInterval(badgeUpdate, 60000);

  /* ---------- ⚙ ตั้งค่า (ทุกหน้า): โหมดสี · ขนาดตัวอักษร · ลายพื้นหลัง · สีพื้น · ลิงก์ ---------- */
  function seg(name, opts, cur) {
    return `<div class="ui-seg" role="radiogroup" data-k="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }
  function uiPaint(dlg) {
    dlg.querySelector('#uiBody').innerHTML = `
      <h3>โหมดสี</h3>${seg('theme', [['auto', 'อัตโนมัติ'], ['light', 'กลางวัน'], ['dark', 'กลางคืน']], window.hubTheme ? hubTheme.get() : 'auto')}
      <h3>ขนาดตัวอักษร</h3>${seg('scale', [[1, 'ปกติ'], [1.1, 'ใหญ่'], [1.2, 'ใหญ่มาก']], get('fontScale', 1))}
      ${`<h3>เลขงานบนไอคอนแอป</h3>${hubBadge.ok ? seg('badge', [['0', 'ปิด'], ['1', 'แสดงเลขงานวันนี้ + เลยกำหนด']], hubBadge.on() ? '1' : '0') + `<p class="ui-note">${hubBadge.on() ? 'ตอนนี้ ' + hubBadge.count() + ' งาน · ' : ''}อัปเดตตอนเปิดแอป · iPhone/iPad ต้องเพิ่มแอปไว้ที่หน้าโฮมและอนุญาตการแจ้งเตือน</p>` : '<p class="ui-note">เครื่อง/เบราว์เซอร์นี้ยังไม่รองรับเลขบนไอคอน (ต้องเพิ่มแอปไว้ที่หน้าโฮมก่อน)</p>'}`}
      <h3>ลายพื้นหลัง</h3>
      <div class="ui-sw" data-k="bg">${BGS.map(([v, l]) => `<button type="button" aria-pressed="${v === hubBg.get()}" data-v="${v}"><i class="pv" data-bg="${v}" data-tint="${hubBg.tint()}"></i><span>${l}</span></button>`).join('')}
        <button type="button" aria-pressed="${hubBg.get() === 'photo'}" data-v="photo"><i class="pv pv-photo" data-bg="${get('bgPhoto', '') ? 'photo' : 'plain'}" data-tint="${hubBg.tint()}">${get('bgPhoto', '') ? '' : ICO.cam}</i><span>รูปของฉัน</span></button></div>
      ${hubBg.get() === 'photo' ? `<div class="ui-photo">${seg('soft', [['1', 'จางนุ่ม (อ่านง่าย)'], ['0', 'ชัด']], get('bgSoft', true) ? '1' : '0')}<button type="button" class="ui-mini" data-go="photo">🖼 เปลี่ยนรูป</button></div>` : ''}
      <h3>สีพื้นหลัง</h3>
      <div class="ui-sw tint" data-k="tint">${TINTS.map(([v, l]) => `<button type="button" aria-pressed="${v === hubBg.tint()}" data-v="${v}"><i class="pv" data-bg="${hubBg.get()}" data-tint="${v}"></i><span>${l}</span></button>`).join('')}</div>
      <h3>อื่นๆ</h3>
      <div class="ui-links">
        ${document.getElementById('btnSettings') ? `<button type="button" data-go="conn">${ICO.link}<span>เชื่อมเครื่อง / ดึงข้อมูลใหม่</span></button>` : ''}
        ${`<a href="status.html">${ICO.pulse}<span>สถานะระบบ</span></a>`}
      </div>`;
  }
  function uiOpen() {
    let dlg = document.getElementById('uiDlg');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'uiDlg'; dlg.className = 'ui-dlg';
      dlg.innerHTML = `<div class="ui-head"><h2 tabindex="-1" autofocus>ตั้งค่า</h2><button type="button" class="icon-btn ui-x" aria-label="ปิด">✕</button></div><div id="uiBody"></div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('.ui-x').onclick = () => dlg.close();
      dlg.addEventListener('click', e => {
        if (e.target === dlg) return dlg.close();
        const b = e.target.closest('[data-v]'), box = b && b.parentElement;
        if (b && box && box.dataset.k) {
          const v = b.dataset.v, k = box.dataset.k;
          if (k === 'theme' && window.hubTheme) hubTheme.set(v);
          if (k === 'scale') hubScale.set(Number(v));
          if (k === 'bg' && v === 'photo' && !get('bgPhoto', '')) { pickPhoto().then(() => uiPaint(dlg)); return; }
          if (k === 'bg') hubBg.set(v);
          if (k === 'soft') { put('bgSoft', v === '1'); applyBg(); }
          if (k === 'tint') hubBg.setTint(v);
          if (k === 'badge') { hubBadge.set(v === '1').then(ok => { if (!ok) alert('เครื่องนี้ปิดการแจ้งเตือนของแอปไว้ เลขบนไอคอนจึงไม่ขึ้น เปิดได้ในตั้งค่าของเครื่อง'); const y = dlg.querySelector('#uiBody').scrollTop; uiPaint(dlg); dlg.querySelector('#uiBody').scrollTop = y; }); }
          const y = dlg.querySelector('#uiBody').scrollTop; uiPaint(dlg); dlg.querySelector('#uiBody').scrollTop = y;
          return;
        }
        if (e.target.closest('[data-go="photo"]')) { pickPhoto().then(() => uiPaint(dlg)); return; }
        if (e.target.closest('[data-go="conn"]')) { dlg.close(); document.getElementById('btnSettings').click(); }
      });
    }
    uiPaint(dlg); dlg.showModal();
  }
  window.hubSettings = uiOpen;
  (() => {
    const top = document.querySelector('header.top');
    if (!top) return;
    let act = top.querySelector('.top-actions');
    if (!act) { act = document.createElement('div'); act.className = 'top-actions'; top.appendChild(act); }
    const g = document.createElement('button');
    g.type = 'button'; g.className = 'icon-btn ui-gear'; g.title = 'ตั้งค่า'; g.setAttribute('aria-label', 'ตั้งค่า');
    g.innerHTML = ICO.cog; g.onclick = uiOpen;
    act.appendChild(g);
    // ⟳ / 🔒 เป็นไอคอนเส้นชุดเดียวกัน
    act.querySelectorAll('#btnSync').forEach(b => { if (b.textContent.trim() === '⟳') b.innerHTML = ICO.refresh; });
    const lk = document.getElementById('btnLock'); if (lk) lk.innerHTML = ICO.vault;
  })();

  function PAGE_EARLY() { return ['tasks', 'money', 'inbox', 'bills', 'vault', 'split'].find(c => document.body.classList.contains(c)); }
  /* ---------- 🎙 ปุ่มไมค์ในช่องจด: อัดเสียง → แปลงเป็น WAV 16k → AI ถอด + แปลงเป็นคำสั่ง → ใส่ในช่องให้ตรวจก่อนกด ＋ ---------- */
  (() => {
    const T = { tasks: ['#quickInput', 'จดงาน'], money: ['#mInput', 'จดเงิน'], inbox: ['#iInput', 'ฝาก'] }[PAGE_EARLY()];
    if (!T || !navigator.mediaDevices || !window.MediaRecorder) return;
    const input = document.querySelector(T[0]);
    if (!input) return;
    const sayQ = new URLSearchParams(location.search).get('say');   // มาจากปุ่ม "ไปหน้า…" ของไมค์หน้าอื่น
    if (sayQ) { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => { input.value = sayQ; input.focus(); }, 400); }
    const mic = document.createElement('button');
    mic.type = 'button'; mic.className = 'icon-btn mic-btn'; mic.title = 'พูดแทนพิมพ์'; mic.setAttribute('aria-label', 'พูดแทนพิมพ์');
    mic.innerHTML = ICO.mic;
    const wrap = document.createElement('span'); wrap.className = 'in-wrap';
    input.parentElement.insertBefore(wrap, input); wrap.appendChild(input); wrap.appendChild(mic);
    const tip = document.createElement('p'); tip.className = 'mic-tip'; tip.hidden = true;
    input.form.insertAdjacentElement('afterend', tip);
    const say = (h, ms) => { tip.innerHTML = h; tip.hidden = false; clearTimeout(say.t); if (ms) say.t = setTimeout(() => { tip.hidden = true; }, ms); };
    let rec = null, chunks = [], stream = null, timer = null, ph = input.placeholder;
    const stop = () => { if (rec && rec.state === 'recording') rec.stop(); };
    async function toWav(blob) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC(); const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close && ac.close();
      const rate = 16000, len = Math.ceil(buf.duration * rate);
      const off = new OfflineAudioContext(1, len, rate); const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
      const pcm = (await off.startRendering()).getChannelData(0);
      const dv = new DataView(new ArrayBuffer(44 + pcm.length * 2)), w = (o, t) => [...t].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
      for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
      let bin = ''; const u8 = new Uint8Array(dv.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { data: btoa(bin), sec: buf.duration };
    }
    mic.onclick = async () => {
      if (rec && rec.state === 'recording') return stop();
      if (mic.classList.contains('busy')) return;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { say('🎙 ใช้ไมค์ไม่ได้ ลองอนุญาตไมโครโฟนให้แอปในตั้งค่าของเครื่อง', 6000); return; }
      chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        clearTimeout(timer); stream.getTracks().forEach(t => t.stop());
        mic.classList.remove('rec'); mic.classList.add('busy'); input.placeholder = 'กำลังฟัง…';
        say('🎙 กำลังถอดเสียง…');
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          if (blob.size < 1500) throw new Error('เสียงสั้นเกินไป');
          const wav = await toWav(blob);
          if (wav.sec < 0.6) throw new Error('เสียงสั้นเกินไป');
          if (typeof window.api !== 'function') throw new Error('ยังไม่ได้เชื่อมเครื่อง');
          const r = await window.api('ai_voice', { data: wav.data, mime: 'audio/wav', page: PAGE_EARLY() });
          if (!r.text || !r.cmd) { say('🎙 ไม่ได้ยินคำพูดชัดๆ ลองใหม่ใกล้ไมค์อีกนิด', 5000); return; }
          let cmd = r.cmd;
          if (PAGE_EARLY() === 'inbox') cmd = cmd.replace(/^ฝาก\s*/, '');
          input.value = cmd; input.focus(); input.dispatchEvent(new Event('input', { bubbles: true }));
          const esc2 = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
          const wrong = { tasks: /^note$/, inbox: /^task$/ }[PAGE_EARLY()];
          const where = { task: ['./', 'หน้างาน'], note: ['inbox.html', 'กล่องฝาก'] }[r.kind];
          say(`🎙 ได้ยินว่า "${esc2(r.text)}" · ตรวจแล้วแตะ ＋ เพื่อ${T[1]}` + (wrong && wrong.test(r.kind) && where ? `<br>ดูเหมือนเรื่องของ${where[1]} <a href="${where[0].replace(/(#.*)?$/, '?say=' + encodeURIComponent(r.kind === 'note' ? cmd.replace(/^ฝาก\s*/, '') : cmd) + '$1')}">ไป${where[1]} ›</a>` : ''), 12000);
        } catch (e) { say('🎙 ' + (e.message || 'ถอดเสียงไม่สำเร็จ'), 6000); }
        finally { mic.classList.remove('busy'); input.placeholder = ph; }
      };
      rec.start(); mic.classList.add('rec'); input.placeholder = 'กำลังฟัง… แตะไมค์อีกครั้งเมื่อพูดจบ';
      say('🔴 กำลังอัด… พูดได้เลย แล้วแตะไมค์อีกครั้ง (สูงสุด 30 วินาที)');
      timer = setTimeout(stop, 30000);
    };
  })();

  /* ---------- แถบ รายรับ-จ่าย / หารกัน / ค้างกัน + ปุ่มสลิป: ไอคอนเส้น ---------- */
  document.querySelectorAll('#mSec a').forEach(a => { const k = { money: 'money', split: 'split', owe: 'users' }[a.dataset.s]; if (k) a.insertAdjacentHTML('afterbegin', `<i class="sec-ico" aria-hidden="true">${ICO[k]}</i>`); });
  const snap = document.getElementById('btnSnap');
  if (snap && /📷/.test(snap.textContent) && snap.closest('.mo-quick')) snap.innerHTML = ICO.cam + '<small>สลิป</small>';

  /* ---------- ช่องค้นหา: ไอคอนแว่นขยายแบบเส้น ---------- */
  (() => {
    const si = document.getElementById('searchInput');
    if (!si || si.parentElement.classList.contains('srch')) return;
    const w = document.createElement('label'); w.className = 'srch';
    si.parentElement.insertBefore(w, si); w.appendChild(si);
    w.insertAdjacentHTML('afterbegin', `<i aria-hidden="true">${sv('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>')}</i>`);
  })();

  /* ---------- 🗒 หน้าว่าง: ไอคอนของหมวด + ปุ่มเริ่มใช้ (ไม่ใส่ปุ่มในผลค้นหาที่ไม่เจอ) ---------- */
  const PAGE = ['tasks', 'money', 'bills', 'inbox', 'vault', 'split'].find(c => document.body.classList.contains(c));
  const START = {
    tasks: ['＋ จดงานแรก', () => document.getElementById('quickInput')],
    money: ['＋ จดรายการแรก', () => document.getElementById('mInput')],
    bills: ['📷 ถ่ายบิลใบแรก', () => document.getElementById('btnSnap'), true],
    inbox: ['＋ ฝากโน้ตแรก', () => document.getElementById('iInput')],
    vault: ['＋ เพิ่มรหัสแรก', () => document.getElementById('btnAdd'), true],
  };
  function decorateEmpty(root) {
    (root.querySelectorAll ? root : document).querySelectorAll('.empty:not(.small):not([data-dec])').forEach(el => {
      el.dataset.dec = '1';
      const k = { split: 'money' }[PAGE] || PAGE;
      if (ICO[k]) el.insertAdjacentHTML('afterbegin', `<span class="em-ico" aria-hidden="true">${ICO[k]}</span>`);
      const st = START[PAGE];
      if (!st || /ไม่พบ|ไม่เจอ|ค้นหา|ในโปรเจ็คนี้|ตามที่เลือก/.test(el.textContent)) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'em-go'; b.textContent = st[0];
      b.onclick = () => { const t = st[1](); if (!t) return; if (st[2]) t.click(); else { t.scrollIntoView({ block: 'center' }); t.focus(); } };
      el.appendChild(b);
    });
  }
  new MutationObserver(ms => { if (ms.some(m => m.addedNodes.length)) decorateEmpty(document); }).observe(document.body, { childList: true, subtree: true });
  setTimeout(() => decorateEmpty(document), 0);

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
        res.clone().json().then(d => { lastErr = d && d.ok === false ? (d.error || 'error') : ''; if (!lastErr) { lastOk = Date.now(); put('hubLastSync', lastOk); setTimeout(() => window.badgeUpdateRef && window.badgeUpdateRef(), 400); } })
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
    const bills = get('bills', null);
    const ready = bills ? bills.filter(b => b.status === 'ready') : [], draft = bills ? bills.filter(b => b.status === 'draft') : [];
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
    box.innerHTML = `<div class="td-h"><b>วันนี้</b></div>`
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
    ].filter(g => g[1].length);
    if (!groups.length) return '';
    return `<section class="group x-search"><h3>จากหมวดอื่น</h3>` + groups.map(([name, list]) => `<div class="items">
      <div class="xs-h">${name} · ${list.length}</div>
      ${list.slice(0, 5).map(r => `<a class="xs-it" href="${r.href}"><span>${esc(r.t)}</span><small>${esc(r.s)}</small></a>`).join('')}
      ${list.length > 5 ? `<a class="xs-it more" href="${list[0].href}">ดูทั้งหมด ${list.length} รายการ ›</a>` : ''}
    </div>`).join('') + '</section>';
  };
})();

