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
let query = '';                       // คำค้นหา
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
  // ช่วงเวลาคร่าวๆ / ไม่แน่ใจ
  if ((m = s.match(/^(?:ภายใน)?(สัปดาห์นี้|อาทิตย์นี้|สัปดาห์หน้า|อาทิตย์หน้า|เดือนนี้|เดือนหน้า)\s*/))) {
    const r = softDate(m[1]);
    return { title: s.slice(m[0].length).trim(), date: r.date, time: '', project, due: r.due, typedDate: true };
  }
  if ((m = s.match(/^(ไม่แน่ใจ|ยังไม่รู้|สักวัน)\s*/))) {
    return { title: s.slice(m[0].length).trim(), date: '', time: '', project, due: '', typedDate: true };
  }
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
  return { title: s.trim(), date, time, project, due: '', typedDate };
}

/* วันสุดท้ายของสัปดาห์ (อาทิตย์) หรือเดือน — คำว่า "หน้า" = ถัดไป */
function softDate(word) {
  const now = new Date();
  if (/สัปดาห์|อาทิตย์/.test(word)) {
    const toSun = (7 - now.getDay()) % 7 + (/หน้า/.test(word) ? 7 : 0);
    return { date: addDays(today(), toSun), due: 'week' };
  }
  const plus = /หน้า/.test(word) ? 1 : 0;
  return { date: ymd(new Date(now.getFullYear(), now.getMonth() + 1 + plus, 0)), due: 'month' };
}

/* กำหนดส่งที่ใช้จริง: งานแบบ "ก่อนงานอื่น" ใช้วันของงานนั้น */
const SOFT = { week: 1, month: 1, before: 1 };
const depOf = t => t.due === 'before' && t.dep ? tasks.find(x => x.id === t.dep) : null;
function effDate(t) {
  if (t.due === 'before') { const d = depOf(t); return d ? (d.date || '') : ''; }
  return t.date || '';
}
function dueText(t) {
  const d = effDate(t);
  if (t.due === 'before') {
    const dep = depOf(t);
    return 'ก่อน: ' + (dep ? dep.title : '(งานถูกลบแล้ว)') + (d ? ` (${short(d)})` : '');
  }
  if (t.due === 'week' || t.due === 'month') return `ภายใน ${dayName(d)} ${short(d)}`;
  return '';
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
const whenKey = t => (effDate(t) || '9999-99-99') + (t.time || '99:99');

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
  if (query) { renderSearch(view, t); return; }
  if (mode === 'cal') { renderCal(view, t); return; }

  const open = view.filter(x => x.done !== '1').sort((a, b) => whenKey(a) < whenKey(b) ? -1 : 1);
  const done = view.filter(x => x.done === '1').sort((a, b) => (b.updated || '') < (a.updated || '') ? -1 : 1).slice(0, 15);

  const E = x => effDate(x), soft = x => !!SOFT[x.due];
  const groups = [
    ['เลยกำหนด', 'overdue', open.filter(x => E(x) && E(x) < t)],
    ['วันนี้', '', open.filter(x => !soft(x) && E(x) === t)],
    ['พรุ่งนี้', '', open.filter(x => !soft(x) && E(x) === tmr)],
    ['ภายในช่วงเวลา', '', open.filter(x => soft(x) && E(x) >= t)],
    ['ถัดไป', '', open.filter(x => !soft(x) && E(x) > tmr)],
    ['ยังไม่กำหนดวัน', '', open.filter(x => !E(x))],
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

/* ---------- ค้นหา ---------- */
function renderSearch(view, t) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = view.filter(x => {
    const hay = [x.title, x.note, x.project].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  }).sort((a, b) => (a.done === '1') - (b.done === '1') || (whenKey(a) < whenKey(b) ? -1 : 1));

  const list = $('#list');
  list.innerHTML = '';
  const sec = document.createElement('section');
  sec.className = 'group';
  sec.innerHTML = '<h3></h3><div class="items"></div>';
  sec.querySelector('h3').textContent = `ผลการค้นหา · ${hits.length}` + (filter ? ' (ในโปรเจ็คที่เลือก)' : '');
  const box = sec.querySelector('.items');
  if (hits.length) hits.slice(0, 100).forEach(x => box.appendChild(row(x, t)));
  else box.innerHTML = '<p class="day-empty">ไม่พบงานที่ตรงกับคำค้น</p>';
  list.appendChild(sec);

  // ไฮไลต์คำที่ค้นในชื่องาน
  box.querySelectorAll('.title').forEach(el => {
    const tag = el.querySelector('.tag');
    const text = el.lastChild && el.lastChild.nodeType === 3 ? el.lastChild : null;
    if (!text) return;
    const src = text.textContent, low = src.toLowerCase();
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < src.length) {
      let best = -1, len = 0;
      for (const w of words) { const p = low.indexOf(w, i); if (p > -1 && (best < 0 || p < best)) { best = p; len = w.length; } }
      if (best < 0) { frag.append(src.slice(i)); break; }
      frag.append(src.slice(i, best));
      const mk = document.createElement('mark'); mk.textContent = src.slice(best, best + len); frag.append(mk);
      i = best + len;
    }
    text.replaceWith(frag);
    if (tag) el.prepend(tag);
  });
}

const searchBar = $('#searchBar'), searchInput = $('#searchInput');
$('#btnSearch').onclick = () => {
  searchBar.hidden = !searchBar.hidden;
  if (!searchBar.hidden) searchInput.focus();
  else { query = ''; searchInput.value = ''; render(); }
};
$('#btnSearchClose').onclick = () => { searchBar.hidden = true; query = ''; searchInput.value = ''; render(); };
searchInput.addEventListener('input', () => { query = searchInput.value.trim(); render(); });

/* ---------- ดึงประชุมจาก Google Calendar ---------- */
const meetDlg = $('#meetDlg'), meetForm = $('#meetForm'), meetList = $('#meetList');
let meetEvents = [];

$('#btnMeet').onclick = async () => {
  meetList.innerHTML = '<p class="hint">กำลังดึงนัดจาก Calendar…</p>';
  meetForm.elements.project.value = filter && filter !== NONE ? filter : '';
  $('#btnMeetAdd').disabled = true;
  meetDlg.showModal();
  try {
    const { events, missing } = await api('events');
    meetEvents = events;
    renderMeetings();
    if (missing && missing.length) {
      const p = document.createElement('p');
      p.className = 'hint warn';
      p.textContent = 'ยังดึงปฏิทินนี้ไม่ได้ (ต้องแชร์ให้บัญชีระบบก่อน): ' + missing.join(', ');
      meetList.prepend(p);
    }
  } catch (e) {
    meetList.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'ดึงไม่สำเร็จ: ' + e.message;
    meetList.appendChild(p);
  }
};

function renderMeetings() {
  meetList.innerHTML = '';
  if (!meetEvents.length) {
    meetList.innerHTML = '<p class="hint">ไม่มีนัดประชุมใน 14 วันข้างหน้า</p>';
    return;
  }
  let lastDay = '';
  meetEvents.forEach((ev, i) => {
    if (ev.date !== lastDay) {
      lastDay = ev.date;
      const h = document.createElement('div');
      h.className = 'meet-day';
      h.textContent = `${dayName(ev.date)} ${short(ev.date)}` + (ev.date === today() ? ' · วันนี้' : '');
      meetList.appendChild(h);
    }
    const lab = document.createElement('label');
    lab.className = 'meet' + (ev.imported ? ' added' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.i = i;
    // ตอบรับ/เป็นเจ้าของนัด = ติ๊กไว้ก่อน ยกเว้นเคยกดไม่เข้าแล้ว
    cb.checked = ev.imported || (!ev.skipped && (ev.status === 'YES' || ev.status === 'OWNER'));
    cb.disabled = ev.imported;
    const txt = document.createElement('span');
    txt.innerHTML = '<span class="t"></span><span class="s"></span>';
    txt.querySelector('.t').textContent = ev.title;
    if (ev.imported) {
      const b = document.createElement('span'); b.className = 'badge'; b.textContent = 'เพิ่มแล้ว';
      txt.querySelector('.t').append(b);
    }
    const st = { YES: 'ตอบรับแล้ว', MAYBE: 'อาจจะ', INVITED: 'ยังไม่ตอบ', OWNER: 'นัดของคุณ' }[ev.status] || '';
    txt.querySelector('.s').textContent = [`${ev.time}–${ev.end}`, ev.location, st, ev.cal && '📆 ' + ev.cal].filter(Boolean).join(' · ');
    lab.append(cb, txt);
    meetList.appendChild(lab);
  });
  $('#btnMeetAdd').disabled = false;
}

$('#btnMeetCancel').onclick = () => meetDlg.close();
meetForm.addEventListener('submit', async () => {
  const boxes = [...meetList.querySelectorAll('input[type=checkbox]:not(:disabled)')];
  const pick = boxes.filter(b => b.checked).map(b => meetEvents[b.dataset.i]);
  const skip = boxes.filter(b => !b.checked).map(b => meetEvents[b.dataset.i].key);
  if (!pick.length && !skip.length) return;
  let project = meetForm.elements.project.value.trim().replace(/^#/, '');
  const known = projects().find(x => same(x.name, project));
  if (known) project = known.name;
  showStatus('กำลังเพิ่มประชุม…');
  try {
    const { tasks: added } = await api('import', { events: pick, skip, project });
    tasks.push(...added);
    LS.set('tasks', tasks);
    showStatus('');
    render();
  } catch (e) {
    showStatus('เพิ่มประชุมไม่สำเร็จ: ' + e.message);
  }
});

/* ---------- ปฏิทิน ---------- */
function renderCal(view, t) {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());          // อาทิตย์ก่อนวันที่ 1
  const weeks = Math.ceil((first.getDay() + new Date(y, m, 0).getDate()) / 7);

  const byDay = {};
  for (const x of view) { const d = effDate(x); if (d) (byDay[d] = byDay[d] || []).push(x); }
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
      const st = (x.done === '1' ? 'done' : key < t ? 'late' : 'open') + (SOFT[x.due] ? ' soft' : '');
      if (j < 4) {
        const dot = document.createElement('i');
        dot.className = st;
        dots.appendChild(dot);
      }
      if (j < 3) {
        const n = document.createElement('span');
        n.className = 'nm ' + st;
        n.textContent = (SOFT[x.due] ? '≤ ' : x.time ? x.time + ' ' : '') + x.title;
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

  const undated = view.filter(x => !effDate(x) && x.done !== '1').length;
  if (undated) {
    const p = document.createElement('p');
    p.className = 'cal-note';
    p.textContent = `ยังไม่กำหนดวัน ${undated} งาน (ดูได้ในมุมมองรายการ) · ≤ = ภายในวันนั้น`;
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
  const ed = effDate(task);
  if (SOFT[task.due]) meta.push(dueText(task));
  else if (ed && ed !== t) meta.push(`${dayName(ed)} ${short(ed)}`);
  if (task.time && !SOFT[task.due]) meta.push(task.time);
  if (task.remind === '1' && task.time) meta.push('🔔');
  if (task.note) meta.push('📝');
  if (task.source) meta.push('👥');
  const late = task.done !== '1' && ed && ed < t;
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

/* รายการงานค้างให้เลือกเป็น "ก่อนงาน…" */
function fillDeps(select, excludeId, selected) {
  const open = tasks.filter(x => x.done !== '1' && x.id !== excludeId).sort((a, b) => whenKey(a) < whenKey(b) ? -1 : 1);
  select.innerHTML = '';
  const first = new Option(open.length ? '— เลือกงาน —' : '(ยังไม่มีงานอื่น)', '');
  select.add(first);
  for (const x of open) {
    const d = effDate(x);
    select.add(new Option((d ? short(d) + ' · ' : '') + x.title, x.id, false, x.id === selected));
  }
}

/* ---------- เพิ่มงานเร็ว ---------- */
const qInput = $('#quickInput'), whenBox = $('#when');
const qDate = $('#qDate'), qTime = $('#qTime'), qDep = $('#qDep');
let qKind = '';

function updateWhen() {
  whenBox.hidden = !qInput.value.trim();
  whenBox.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === qKind));
  qDate.hidden = qKind !== 'date';
  qTime.hidden = !['today', 'tomorrow', 'date'].includes(qKind);
  qDep.hidden = qKind !== 'before';
}
whenBox.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
  qKind = qKind === b.dataset.k ? '' : b.dataset.k;
  if (qKind === 'before') fillDeps(qDep, null, qDep.value);
  if (qKind === 'date' && !qDate.value) qDate.value = mode === 'cal' ? selDay : today();
  updateWhen();
});
qInput.addEventListener('input', updateWhen);

$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const p = parseQuick(qInput.value);
  if (!p.title) return;
  let { date, time, due } = p, dep = '';
  if (!p.typedDate) {   // ไม่ได้พิมพ์วันเอง = ใช้ที่เลือกจากปุ่ม
    const tm = qTime.value || p.time;
    switch (qKind) {
      case 'today':    date = today(); time = tm; break;
      case 'tomorrow': date = addDays(today(), 1); time = tm; break;
      case 'date':     date = qDate.value || today(); time = tm; break;
      case 'week':
      case 'month':    ({ date, due } = softDate(qKind === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้')); time = ''; break;
      case 'before':   dep = qDep.value; due = dep ? 'before' : ''; date = ''; time = ''; break;
      case 'unsure':   date = ''; time = ''; break;
      default:         if (mode === 'cal') date = selDay;   // หน้าปฏิทิน = วันที่เลือกไว้
    }
  }
  // ไม่ได้พิมพ์ #แท็ก แต่กำลังดูโปรเจ็คไหนอยู่ = ใส่โปรเจ็คนั้นให้
  let project = p.project || (filter && filter !== NONE ? filter : '');
  const known = projects().find(x => same(x.name, project));
  if (known) project = known.name;   // ใช้ตัวสะกดเดิม
  const now = new Date().toISOString();
  save('add', { id: uid(), title: p.title, note: '', date, time, remind: time ? '1' : '', done: '', project, due: due || '', dep, created: now, updated: now });
  qInput.value = ''; qKind = ''; qDate.value = ''; qTime.value = '';
  updateWhen();
});

/* ---------- แก้ไข ---------- */
const editDlg = $('#editDlg'), editForm = $('#editForm');

function updateEditDue(fromUser) {
  const f = editForm.elements, k = f.due.value;
  if (fromUser && (k === 'week' || k === 'month')) f.date.value = softDate(k === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้').date;
  $('#eDateRow').hidden = k === 'before' || k === 'unsure';
  $('#eTimeWrap').hidden = k !== '';
  $('#eDateLabel').textContent = k === 'week' || k === 'month' ? 'ภายในวันที่' : 'วันที่';
  $('#eDepRow').hidden = k !== 'before';
  f.remind.closest('label').hidden = k !== '';
}
editForm.elements.due.addEventListener('change', () => updateEditDue(true));

function openEdit(task) {
  editing = task;
  const f = editForm.elements;
  f.title.value = task.title || '';
  f.date.value = task.date || '';
  f.time.value = task.time || '';
  f.remind.checked = task.remind === '1';
  f.note.value = task.note || '';
  f.project.value = task.project || '';
  f.due.value = task.due || (task.date ? '' : 'unsure');
  fillDeps(f.dep, task.id, task.dep);
  updateEditDue(false);
  editDlg.showModal();
}

editForm.addEventListener('submit', () => {
  if (!editing) return;
  const f = editForm.elements;
  let due = f.due.value, date = f.date.value, time = f.time.value, dep = '';
  if (due === 'unsure') { due = ''; date = ''; time = ''; }
  else if (due === 'week' || due === 'month') { date = date || softDate(due === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้').date; time = ''; }
  else if (due === 'before') { dep = f.dep.value; if (!dep) due = ''; date = ''; time = ''; }
  else if (time && !date) date = today();
  save('update', {
    id: editing.id,
    title: f.title.value.trim() || editing.title,
    date, time, due, dep,
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
