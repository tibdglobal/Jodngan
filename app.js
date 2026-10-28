/* จดงาน — หน้าบ้าน PWA */

const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let cfg = LS.get('cfg', { url: '', key: '' });
let tasks = LS.get('tasks', []);
let editing = null;
let filter = LS.get('filter', '');   // '' = ทั้งหมด, NONE = ไม่มีโปรเจ็ค, อื่นๆ = ชื่อโปรเจ็ค
const NONE = '\u0000none';
let mode = LS.get('mode', 'list');   // 'list' | 'cal'
let calMonth, selDay;                 // ตั้งค่าหลังมีฟังก์ชันวันที่
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/* ---------- วันที่ ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
const short = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+d}/${+m}`; };
const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const dayName = s => { const [y, m, d] = s.split('-').map(Number); return TH_DAYS[new Date(y, m - 1, d).getDay()]; };
selDay = today();
calMonth = selDay.slice(0, 7);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');

/* พิมพ์เร็ว: "พรุ่งนี้ 10:00 ส่งรายงาน", "5/11 14:30 ประชุม" */
function parseQuick(text) {
  let s = text.trim(), date = '', time = '', project = '', m;
  const t = today();
  // #แท็ก ที่ไหนก็ได้ = โปรเจ็ค/บริษัท
  s = s.replace(/(^|\s)#(\S+)/, (all, sp, name) => { project = name; return sp; }).replace(/\s{2,}/g, ' ').trim();
  if ((m = s.match(/^(วันนี้|พรุ่งนี้|มะรืน)\s*/))) {
    date = addDays(t, { 'วันนี้': 0, 'พรุ่งนี้': 1, 'มะรืน': 2 }[m[1]]);
    s = s.slice(m[0].length);
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?=\s|$)\s*/))) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      const y = +t.slice(0, 4);
      let c = `${y}-${pad(mo)}-${pad(d)}`;
      if (c < t) c = `${y + 1}-${pad(mo)}-${pad(d)}`;
      date = c; s = s.slice(m[0].length);
    }
  }
  if ((m = s.match(/^(\d{1,2})[:.](\d{2})(?:\s*น\.?)?(?=\s|$)\s*/))) {
    const h = +m[1], mi = +m[2];
    if (h < 24 && mi < 60) { time = `${pad(h)}:${pad(mi)}`; s = s.slice(m[0].length); }
  }
  const typedDate = !!date;
  if (time && !date) date = t;
  return { title: s.trim(), date, time, project, typedDate };
}

/* ---------- API ---------- */
async function api(action, payload = {}) {
  if (!cfg.url || !cfg.key) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ');
  // ส่งเป็น text/plain เพื่อไม่ให้ติด CORS preflight ของ Apps Script
  const res = await fetch(cfg.url, {
    method: 'POST',
    body: JSON.stringify({ action, key: cfg.key, ...payload }),
    redirect: 'follow',
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

function showStatus(msg) {
  const el = $('#status');
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function sync() {
  if (!cfg.url) { showStatus('ยังไม่ได้เชื่อมต่อ กด ⚙ เพื่อตั้งค่า'); return; }
  $('#btnSync').classList.add('spin');
  try {
    const { tasks: remote } = await api('list');
    tasks = remote;
    LS.set('tasks', tasks);
    showStatus('');
    render();
  } catch (e) {
    showStatus('ดึงข้อมูลไม่สำเร็จ: ' + e.message);
  } finally {
    $('#btnSync').classList.remove('spin');
  }
}

/* บันทึกบนเครื่องทันที แล้วส่งขึ้น Sheet */
async function save(action, task) {
  const i = tasks.findIndex(t => t.id === task.id);
  if (action === 'delete') { if (i > -1) tasks.splice(i, 1); }
  else if (i > -1) tasks[i] = { ...tasks[i], ...task };
  else tasks.push(task);
  LS.set('tasks', tasks);
  render();
  try {
    if (action === 'delete') await api('delete', { id: task.id });
    else await api(action, { task });
    showStatus('');
  } catch (e) {
    showStatus('บันทึกขึ้นระบบไม่สำเร็จ: ' + e.message + ' (กด ⟳ เพื่อลองใหม่)');
  }
}

/* ---------- แสดงผล ---------- */
const whenKey = t => (t.date || '9999-99-99') + (t.time || '99:99');

/* รายชื่อโปรเจ็คที่มีอยู่ (ชื่อแรกที่เจอเป็นตัวสะกดหลัก) + จำนวนงานค้าง */
function projects() {
  const map = new Map();
  for (const x of tasks) {
    if (!x.project) continue;
    const k = x.project.toLowerCase();
    if (!map.has(k)) map.set(k, { name: x.project, open: 0 });
    if (x.done !== '1') map.get(k).open++;
  }
  return [...map.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'th'));
}

function renderChips() {
  const list = projects();
  const nav = $('#chips');
  nav.innerHTML = '';
  if (!list.length) { filter = ''; return; }
  if (filter && filter !== NONE && !list.some(p => same(p.name, filter))) filter = '';

  const openAll = tasks.filter(x => x.done !== '1').length;
  const openNone = tasks.filter(x => x.done !== '1' && !x.project).length;
  const items = [['ทั้งหมด', '', openAll], ...list.map(p => ['#' + p.name, p.name, p.open])];
  if (openNone) items.push(['ไม่มีโปรเจ็ค', NONE, openNone]);

  for (const [label, value, n] of items) {
    const b = document.createElement('button');
    b.className = 'chip' + (same(filter, value) ? ' on' : '');
    b.innerHTML = '<span></span><span class="n"></span>';
    b.firstChild.textContent = label;
    b.lastChild.textContent = n;
    b.onclick = () => { filter = value; LS.set('filter', filter); render(); };
    nav.appendChild(b);
  }
  $('#projectList').innerHTML = list.map(p => `<option></option>`).join('');
  [...$('#projectList').children].forEach((o, i) => o.value = list[i].name);
}

function render() {
  renderChips();
  const t = today(), tmr = addDays(t, 1);
  const view = !filter ? tasks
    : filter === NONE ? tasks.filter(x => !x.project)
    : tasks.filter(x => same(x.project, filter));
  $('#btnView').textContent = mode === 'cal' ? '☰' : '📅';
  $('#btnView').title = mode === 'cal' ? 'ดูแบบรายการ' : 'ดูแบบปฏิทิน';
  if (mode === 'cal') { renderCal(view, t); return; }

  const open = view.filter(x => x.done !== '1').sort((a, b) => whenKey(a) < whenKey(b) ? -1 : 1);
  const done = view.filter(x => x.done === '1').sort((a, b) => (b.updated || '') < (a.updated || '') ? -1 : 1).slice(0, 15);

  const groups = [
    ['เลยกำหนด', 'overdue', open.filter(x => x.date && x.date < t)],
    ['วันนี้', '', open.filter(x => x.date === t)],
    ['พรุ่งนี้', '', open.filter(x => x.date === tmr)],
    ['ถัดไป', '', open.filter(x => x.date > tmr)],
    ['ไม่ระบุวัน', '', open.filter(x => !x.date)],
    ['เสร็จแล้ว', '', done],
  ];

  const list = $('#list');
  list.innerHTML = '';
  if (!view.length) {
    list.innerHTML = tasks.length
      ? '<p class="empty">ไม่มีงานในโปรเจ็คนี้</p>'
      : '<p class="empty">ยังไม่มีงาน เริ่มพิมพ์ด้านบนได้เลย</p>';
    return;
  }
  for (const [name, cls, items] of groups) {
    if (!items.length) continue;
    const sec = document.createElement('section');
    sec.className = 'group ' + cls;
    sec.innerHTML = `<h3>${name} · ${items.length}</h3><div class="items"></div>`;
    const box = sec.querySelector('.items');
    for (const task of items) box.appendChild(row(task, t));
    list.appendChild(sec);
  }
}

/* ---------- ปฏิทิน ---------- */
function renderCal(view, t) {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());          // อาทิตย์ก่อนวันที่ 1
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);

  const byDay = {};
  for (const x of view) if (x.date) (byDay[x.date] = byDay[x.date] || []).push(x);
  for (const k in byDay) byDay[k].sort((a, b) => whenKey(a) < whenKey(b) ? -1 : 1);

  const list = $('#list');
  list.innerHTML = '';
  const cal = document.createElement('section');
  cal.className = 'cal';
  cal.innerHTML = `
    <div class="cal-head">
      <button class="icon-btn" data-nav="-1" aria-label="เดือนก่อน">‹</button>
      <strong></strong>
      <button class="icon-btn" data-nav="1" aria-label="เดือนถัดไป">›</button>
      <button class="cal-today">วันนี้</button>
    </div>
    <div class="cal-grid">${TH_DAYS.map(d => `<span class="dow">${d.replace('.', '')}</span>`).join('')}</div>`;
  cal.querySelector('strong').textContent = first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  cal.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const d = new Date(y, m - 1 + Number(b.dataset.nav), 1);
    calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    render();
  });
  cal.querySelector('.cal-today').onclick = () => { selDay = t; calMonth = t.slice(0, 7); render(); };

  const grid = cal.querySelector('.cal-grid');
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d);
    const items = byDay[key] || [];
    const cell = document.createElement('button');
    cell.className = 'day'
      + (key.slice(0, 7) !== calMonth ? ' out' : '')
      + (key === t ? ' today' : '')
      + (key === selDay ? ' sel' : '');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    // จอมือถือ = จุด, จอใหญ่ = ชื่องานย่อ
    const dots = document.createElement('span');
    dots.className = 'dots';
    const names = document.createElement('span');
    names.className = 'names';
    items.forEach((x, j) => {
      const st = x.done === '1' ? 'done' : key < t ? 'late' : 'open';
      if (j < 4) {
        const dot = document.createElement('i');
        dot.className = st;
        dots.appendChild(dot);
      }
      if (j < 3) {
        const n = document.createElement('span');
        n.className = 'nm ' + st;
        n.textContent = (x.time ? x.time + ' ' : '') + x.title;
        names.appendChild(n);
      }
    });
    if (items.length > 3) {
      const more = document.createElement('span');
      more.className = 'nm more';
      more.textContent = `+${items.length - 3}`;
      names.appendChild(more);
    }
    cell.append(dots, names);
    cell.setAttribute('aria-label', `${d.getDate()} ${items.length} งาน`);
    cell.onclick = () => { selDay = key; calMonth = key.slice(0, 7); render(); };
    grid.appendChild(cell);
  }
  list.appendChild(cal);

  // รายการงานของวันที่เลือก
  const items = byDay[selDay] || [];
  const sec = document.createElement('section');
  sec.className = 'group';
  const label = `${dayName(selDay)} ${short(selDay)}` + (selDay === t ? ' · วันนี้' : '');
  sec.innerHTML = `<h3></h3><div class="items"></div>`;
  sec.querySelector('h3').textContent = `${label} · ${items.length} งาน`;
  const box = sec.querySelector('.items');
  if (items.length) items.forEach(x => box.appendChild(row(x, t)));
  else box.innerHTML = '<p class="day-empty">ไม่มีงาน พิมพ์ด้านบนเพื่อเพิ่มงานวันนี้</p>';
  list.appendChild(sec);

  const undated = view.filter(x => !x.date && x.done !== '1').length;
  if (undated) {
    const p = document.createElement('p');
    p.className = 'cal-note';
    p.textContent = `ไม่ระบุวัน ${undated} งาน (ดูได้ในมุมมองรายการ)`;
    list.appendChild(p);
  }
}

function row(task, t) {
  const el = document.createElement('div');
  el.className = 'item' + (task.done === '1' ? ' done' : '');

  const chk = document.createElement('button');
  chk.className = 'chk';
  chk.setAttribute('aria-label', task.done === '1' ? 'ยกเลิกเสร็จ' : 'ทำเสร็จ');
  chk.textContent = task.done === '1' ? '✓' : '';
  chk.onclick = () => save('update', { id: task.id, done: task.done === '1' ? '' : '1' });

  const body = document.createElement('button');
  body.className = 'body';
  const meta = [];
  if (task.date && task.date !== t) meta.push(`${dayName(task.date)} ${short(task.date)}`);
  if (task.time) meta.push(task.time);
  if (task.remind === '1' && task.time) meta.push('🔔');
  if (task.note) meta.push('📝');
  const late = task.done !== '1' && task.date && task.date < t;
  body.innerHTML = `<span class="title"></span><span class="meta${late ? ' late' : ''}"></span>`;
  body.querySelector('.title').textContent = task.title;
  if (task.project && !filter) {   // ดูรวมทุกโปรเจ็ค = แสดงป้ายโปรเจ็ค
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = task.project;
    body.querySelector('.title').prepend(tag);
  }
  const m = body.querySelector('.meta');
  m.textContent = meta.join(' · ');
  if (!meta.length) m.remove();
  body.onclick = () => openEdit(task);

  el.append(chk, body);
  return el;
}

/* ---------- เพิ่มงานเร็ว ---------- */
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#quickInput');
  const p = parseQuick(input.value);
  if (!p.title) return;
  const now = new Date().toISOString();
  // ไม่ได้พิมพ์ #แท็ก แต่กำลังดูโปรเจ็คไหนอยู่ = ใส่โปรเจ็คนั้นให้
  // อยู่หน้าปฏิทินแล้วไม่ได้พิมพ์วัน = ใส่วันที่เลือกไว้
  if (mode === 'cal' && !p.typedDate) p.date = selDay;
  let project = p.project || (filter && filter !== NONE ? filter : '');
  const known = projects().find(x => same(x.name, project));
  if (known) project = known.name;   // ใช้ตัวสะกดเดิม
  save('add', { id: uid(), title: p.title, note: '', date: p.date, time: p.time, remind: p.time ? '1' : '', done: '', project, created: now, updated: now });
  input.value = '';
});

/* ---------- แก้ไข ---------- */
const editDlg = $('#editDlg'), editForm = $('#editForm');

function openEdit(task) {
  editing = task;
  const f = editForm.elements;
  f.title.value = task.title || '';
  f.date.value = task.date || '';
  f.time.value = task.time || '';
  f.remind.checked = task.remind === '1';
  f.note.value = task.note || '';
  f.project.value = task.project || '';
  editDlg.showModal();
}

editForm.addEventListener('submit', () => {
  if (!editing) return;
  const f = editForm.elements;
  let date = f.date.value;
  const time = f.time.value;
  if (time && !date) date = today();
  save('update', {
    id: editing.id,
    title: f.title.value.trim() || editing.title,
    date, time,
    remind: f.remind.checked && time ? '1' : '',
    note: f.note.value,
    project: (() => {
      const v = f.project.value.trim().replace(/^#/, '');
      const known = projects().find(x => same(x.name, v));
      return known ? known.name : v;
    })(),
    updated: new Date().toISOString(),
  });
  editing = null;
});
$('#btnCancel').onclick = () => { editing = null; editDlg.close(); };
$('#btnDelete').onclick = () => {
  if (!editing) return;
  if (!confirm('ลบงานนี้?')) return;
  save('delete', { id: editing.id });
  editing = null;
  editDlg.close();
};

/* ---------- ตั้งค่า ---------- */
const setDlg = $('#setDlg'), setForm = $('#setForm');
$('#btnSettings').onclick = () => {
  setForm.elements.url.value = cfg.url;
  setForm.elements.key.value = cfg.key;
  setDlg.showModal();
};
$('#btnSetCancel').onclick = () => setDlg.close();
setForm.addEventListener('submit', () => {
  cfg = { url: setForm.elements.url.value.trim(), key: setForm.elements.key.value.trim() };
  LS.set('cfg', cfg);
  sync();
});

$('#btnSync').onclick = sync;
$('#btnView').onclick = () => { mode = mode === 'cal' ? 'list' : 'cal'; LS.set('mode', mode); render(); };

/* ---------- เริ่มต้น ---------- */
function setToday() {
  const d = new Date();
  $('#today').textContent = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
}
setToday();
render();
sync();

// กลับมาเปิดแอป = ดึงข้อมูลล่าสุดจากเครื่องอื่น
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { setToday(); sync(); }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
