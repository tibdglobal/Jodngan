/* จดครบ — 📋 งานจากคลังรายงานการประชุม TIBD (หน้าแท็บงาน) · โหลดหลัง app.js (ใช้ $, LS, api, tasks, render, sync) */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toLocaleDateString('sv-SE');
  const thDate = d => { const x = new Date(d + 'T00:00:00'); return isNaN(x) ? d : x.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); };
  let data = LS.get('meetTasks', null), view = LS.get('meetView', 'me'), loading = false;

  document.body.insertAdjacentHTML('beforeend', `
  <dialog id="mtDlg" class="full mt-dlg">
    <div class="m-wrap">
      <header class="m-top">
        <button type="button" class="m-back" id="mtClose">‹ กลับ</button>
        <b class="mt-h">📋 งานจากประชุม</b>
        <span class="spacer"></span>
        <a class="mini" id="mtOpen" target="_blank" rel="noopener" hidden>คลัง ↗</a>
        <button type="button" class="mini" id="mtReload" aria-label="ดึงใหม่">⟳</button>
      </header>
      <nav class="chips mt-chips" id="mtChips"></nav>
      <div class="m-body" id="mtList"></div>
    </div>
  </dialog>`);

  const btn = document.createElement('button');
  btn.className = 'icon-btn'; btn.id = 'btnMeetArc'; btn.title = 'งานจากคลังรายงานการประชุม'; btn.setAttribute('aria-label', btn.title);
  btn.textContent = '📋';
  $('#btnMeet').after(btn);
  btn.addEventListener('click', () => { $('#mtDlg').showModal(); draw(); load(); });
  $('#mtClose').addEventListener('click', () => $('#mtDlg').close());
  $('#mtReload').addEventListener('click', () => load(true));

  async function load(force) {
    if (loading) return;
    loading = true;
    $('#mtReload').classList.add('spin');
    try {
      const r = await api('meet_tasks', {});
      data = { tasks: r.tasks, me: r.me, statuses: r.statuses, url: r.url, at: Date.now() };
      LS.set('meetTasks', data);
      draw();
      if (force) await api('meet_sync', {}).then(() => sync()).catch(() => {});
    } catch (e) {
      $('#mtList').innerHTML = `<div class="empty small">${/ยังไม่ได้เชื่อม/.test(e.message) ? 'ยังไม่ได้เชื่อมกับคลังรายงานการประชุม' : 'ดึงงานไม่สำเร็จ: ' + esc(e.message)}</div>`;
    } finally { loading = false; $('#mtReload').classList.remove('spin'); }
  }

  const pinned = t => tasks.some(x => x.id === `meet:${t.meetingId}:${t.index}`);
  const late = t => t.due && t.due !== 'none' && t.due < today();
  function draw() {
    if (!data) { $('#mtList').innerHTML = '<div class="empty small">กำลังดึงงานจากคลัง…</div>'; return; }
    const open = data.tasks.filter(t => t.open);
    const groups = { me: open.filter(t => t.scope === 'me'), team: open.filter(t => t.scope === 'team'), late: open.filter(late), pin: open.filter(pinned) };
    const label = { me: '👤 ของฉัน', team: '👥 ของทีม' + (data.me && data.me.teams.length ? ' ' + data.me.teams.join('/') : ''), late: '⚠️ เลยกำหนด', pin: '📌 ปักแล้ว' };
    $('#mtChips').innerHTML = Object.keys(label).map(k => `<button class="chip${view === k ? ' on' : ''}" data-v="${k}">${label[k]}<span class="n">${groups[k].length}</span></button>`).join('');
    if (data.url) { $('#mtOpen').href = data.url; $('#mtOpen').hidden = false; }
    const list = groups[view] || [];
    if (!list.length) { $('#mtList').innerHTML = '<div class="empty small">ไม่มีงานค้างในกลุ่มนี้ 🎉</div>'; return; }
    const byMeet = [];
    list.forEach(t => {
      let g = byMeet.find(x => x.id === t.meetingId);
      if (!g) byMeet.push(g = { id: t.meetingId, title: t.title, date: t.date, url: t.url, items: [] });
      g.items.push(t);
    });
    const st = data.statuses || {};
    $('#mtList').innerHTML = byMeet.map(g => `<section class="m-box mt-g">
      <div class="mt-gh"><small>${esc(thDate(g.date))}</small><b>${esc(g.title)}</b>${g.url ? `<a class="mini" href="${esc(g.url)}" target="_blank" rel="noopener">รายงาน ↗</a>` : ''}</div>
      ${g.items.map(t => `<div class="mt-t${late(t) ? ' late' : ''}" data-k="${esc(t.meetingId)}|${t.index}">
        <p>${esc(t.task)}</p>
        <div class="mt-meta"><span>👤 ${esc(t.owner || '-')}</span>${t.due && t.due !== 'none' ? `<span class="mt-due">📅 ${esc(thDate(t.due))}${late(t) ? ' เลยกำหนด' : ''}</span>` : ''}${t.note ? `<span>📝 ${esc(t.note)}</span>` : ''}</div>
        <div class="mt-act">
          <select aria-label="สถานะ">${Object.keys(st).map(s => `<option value="${s}"${s === t.status ? ' selected' : ''}>${st[s]}</option>`).join('')}</select>
          ${pinned(t) ? '<span class="m-sent">📌 อยู่ในงานแล้ว</span>' : '<button type="button" class="mini" data-pin>📌 ปักเข้างาน</button>'}
        </div>
      </div>`).join('')}
    </section>`).join('') + `<p class="hint mt-foot">เปลี่ยนสถานะที่นี่ = เปลี่ยนในคลังรายงานทันที · งานที่มีกำหนดส่งจะถูกปักเข้างานให้เองและเตือนทาง LINE · ติ๊กเสร็จในแท็บงาน คลังก็เปลี่ยนเป็นเสร็จแล้วตาม</p>`;
  }
  $('#mtChips').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; LS.set('meetView', view); draw(); } });
  const findT = el => { const [mid, i] = el.closest('.mt-t').dataset.k.split('|'); return data.tasks.find(t => t.meetingId === mid && t.index === Number(i)); };
  $('#mtList').addEventListener('change', async e => {
    if (e.target.tagName !== 'SELECT') return;
    const t = findT(e.target), prev = t.status, to = e.target.value;
    e.target.disabled = true;
    try {
      await api('meet_status', { meetingId: t.meetingId, index: t.index, status: to });
      t.status = to; t.open = to !== 'done' && to !== 'dropped';
      LS.set('meetTasks', data);
      const loc = tasks.find(x => x.id === `meet:${t.meetingId}:${t.index}`);
      if (loc) { loc.done = t.open ? '' : '1'; LS.set('tasks', tasks); render(); }
      draw();
    } catch (err) { e.target.value = prev; e.target.disabled = false; alert('เปลี่ยนสถานะไม่สำเร็จ: ' + err.message); }
  });
  $('#mtList').addEventListener('click', async e => {
    const b = e.target.closest('[data-pin]');
    if (!b) return;
    const t = findT(b);
    b.disabled = true; b.textContent = '…';
    try {
      const r = await api('meet_pin', { task: t });
      const i = tasks.findIndex(x => x.id === r.task.id);
      if (i > -1) tasks[i] = r.task; else tasks.push(r.task);
      LS.set('tasks', tasks); render(); draw();
    } catch (err) { b.disabled = false; b.textContent = '📌 ปักเข้างาน'; alert('ปักไม่สำเร็จ: ' + err.message); }
  });
})();
