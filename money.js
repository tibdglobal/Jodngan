/* จดครบ — รายรับ-รายจ่ายส่วนตัว */
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const cfg = LS.get('cfg', { url: '', key: '' });
if (!cfg.url) cfg.url = DEFAULT_URL;

/* หมวด + ไอคอน */
const CATS = {
  out: [['อาหาร', '🍚'], ['เครื่องดื่ม/กาแฟ', '☕'], ['เดินทาง', '🚗'], ['ค่าเช่าห้อง', '🔑'], ['เสื้อผ้า', '👕'], ['ออกกำลังกาย', '🏃'], ['อุปกรณ์กีฬา', '🏸'],
    ['ของใช้', '🧴'], ['ซักผ้า', '🧺'], ['เติมเกม', '🎮'], ['การ์ด', '🃏'], ['ค่าน้ำไฟ/โทรศัพท์', '💡'], ['สุขภาพ', '💊'], ['บันเทิง/ท่องเที่ยว', '🎬'], ['การศึกษา', '📚'], ['อื่นๆ', '📦']],
  in: [['เงินเดือน', '💼'], ['โบนัส', '🎉'], ['งานเสริม/ฟรีแลนซ์', '🧑‍💻'], ['ขายของ', '🏷'], ['ดอกเบี้ย/ปันผล', '📈'], ['ได้เงินคืน', '↩️'], ['อื่นๆ', '💰']],
};
const KW = {
  out: [['อาหาร', /ข้าว|ก๋วยเตี๋ยว|อาหาร|กับข้าว|ส้มตำ|หมูกระทะ|ชาบู|บุฟเฟ่|line\s*man|grab\s*food|foodpanda|robinhood|ขนม|มื้อ|kfc|mcdonald|เซเว่น|7-?eleven|ตลาด/i],
    ['เครื่องดื่ม/กาแฟ', /กาแฟ|ชานม|ชาไข่มุก|coffee|cafe|café|คาเฟ่|starbucks|amazon|อเมซอน|น้ำดื่ม|เครื่องดื่ม|เบียร์/i],
    ['เดินทาง', /grab|bolt|แท็กซี่|taxi|bts|mrt|รถไฟ|รถเมล์|วิน|น้ำมัน|ปตท|ptt|บางจาก|shell|ทางด่วน|easy\s*pass|จอดรถ|ตั๋ว|เครื่องบิน/i],
    ['ค่าเช่าห้อง', /ค่าเช่า|ค่าห้อง|เช่าห้อง|คอนโด|หอพัก|อพาร์ท|ส่วนกลาง/i],
    ['เสื้อผ้า', /เสื้อ|กางเกง|กระโปรง|ชุด|รองเท้า|ถุงเท้า|uniqlo|h&m|zara/i],
    ['อุปกรณ์กีฬา', /อุปกรณ์กีฬา|ไม้แบด|ลูกแบด|ลูกขนไก่|ไม้เทนนิส|ลูกบอล|ฟุตบอล|ดัมเบล|เสื่อโยคะ|จักรยาน|decathlon|super\s*sports|กีฬา/i],
    ['ออกกำลังกาย', /ฟิตเนส|fitness|gym|ยิม|วิ่ง|ว่ายน้ำ|สระ|โยคะ|yoga|มวย|แบด|ค่าสนาม|ค่าคอร์ท|เทรนเนอร์|ปั่นจักรยาน|ออกกำลัง/i],
    ['ค่าน้ำไฟ/โทรศัพท์', /ค่าไฟ|ค่าน้ำ|ค่าเน็ต|อินเทอร์เน็ต|internet|wifi|ais|true|dtac|ค่าโทร|มือถือ/i],
    ['สุขภาพ', /ยา|หมอ|คลินิก|โรงพยาบาล|ทำฟัน/i],
    ['เติมเกม', /เติมเกม|เติมเพชร|เติมเงินเกม|top-?up|rov|free\s*fire|pubg|genshin|honkai|garena|steam|playstation|psn|nintendo|valorant|razer\s*gold|truemoney\s*game/i],
    ['การ์ด', /การ์ด|โปเกมอน|pokemon|pokémon|yu-?gi-?oh|ยูกิ|tcg|บูสเตอร์|booster|one\s*piece\s*card|magic\s*the\s*gathering|การ์ดเกม/i],
    ['ซักผ้า', /ซักผ้า|ร้านซัก|เครื่องซัก|อบผ้า|ผงซักฟอก|น้ำยาซักผ้า|ปรับผ้านุ่ม|ซักรีด|รีดผ้า|otteri|หยอดเหรียญ/i],
    ['ของใช้', /ของใช้|สบู่|แชมพู|ยาสีฟัน|แปรงสีฟัน|ทิชชู่|ทิชชู|กระดาษชำระ|ถุงขยะ|โฟมล้างหน้า|ครีม|ผ้าอนามัย|มีดโกน|watsons|วัตสัน|boots|eveandboy|shopee|lazada|lotus|โลตัส|big\s*c|บิ๊กซี|makro|แม็คโคร|tops|ikea|เฟอร์นิเจอร์/i],
    ['บันเทิง/ท่องเที่ยว', /หนัง|netflix|spotify|youtube|disney|คอนเสิร์ต|เที่ยว|โรงแรม|hotel|agoda/i],
    ['การศึกษา', /หนังสือ|คอร์ส|course|เรียน|ค่าเทอม/i]],
  in: [['เงินเดือน', /เงินเดือน|salary/i], ['โบนัส', /โบนัส|bonus/i], ['งานเสริม/ฟรีแลนซ์', /ฟรีแลนซ์|freelance|งานเสริม|ค่าจ้าง|ค่าแรง/i],
    ['ขายของ', /ขาย|ออเดอร์/i], ['ดอกเบี้ย/ปันผล', /ดอกเบี้ย|ปันผล/i], ['ได้เงินคืน', /คืน|refund|cashback/i]],
};
const icon = (type, cat) => ((CATS[type] || []).find(c => c[0] === cat) || [0, type === 'in' ? '💰' : (cat ? '🏷' : '📦')])[1];

let items = LS.get('money', []);
let month = '';
let view = LS.get('moneyView', 'list');
let qType = 'out', qCat = '';
let editing = null;
let calDay = '';
let qDate = '';   // วันที่ที่จะจด (ว่าง = วันนี้)

/* ---------- ช่วยเหลือ ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sum = list => list.reduce((s, x) => s + Number(x.amount || 0), 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[-.]/g, '');
const monthName = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const monthShort = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'short' });
const addMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const inMonth = (x, m) => (x.date || '').slice(0, 7) === m;
const dayLabel = s => { const t = today(); const y = ymd(new Date(Date.now() - 864e5)); const d = new Date(s + 'T00:00:00'); return (s === t ? 'วันนี้ · ' : s === y ? 'เมื่อวาน · ' : '') + d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(action, payload = {}) {
  const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action, key: cfg.key, ...payload }), redirect: 'follow' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
function showStatus(msg, ok) { const el = $('#status'); el.textContent = msg || ''; el.hidden = !msg; el.classList.toggle('ok', !!ok); }
function upsert(m) { const i = items.findIndex(x => x.id === m.id); if (i > -1) items[i] = m; else items.push(m); LS.set('money', items); }

async function sync() {
  if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่องนี้ กลับไปหน้าหลักแล้วเปิดลิงก์จาก LINE ก่อน'); return; }
  $('#btnSync').classList.add('spin');
  try { items = (await api('money_list')).items; LS.set('money', items); showStatus(''); render(); }
  catch (e) { showStatus('ดึงข้อมูลไม่สำเร็จ: ' + e.message); }
  finally { $('#btnSync').classList.remove('spin'); }
}

/* เดาหมวด: เคยจดชื่อนี้ไว้หมวดไหน → ใช้หมวดนั้น · ไม่งั้นดูจากคำ */
function guessCat(type, note) {
  const t = String(note || '').trim();
  if (!t) return '';
  const hit = [...items].reverse().find(x => x.type === type && x.cat && String(x.note).trim() === t);
  if (hit) return hit.cat;
  const r = (KW[type] || []).find(x => x[1].test(t));
  return r ? r[0] : '';
}

/* ---------- แสดงผล ---------- */
function render() {
  if (!month) month = today().slice(0, 7);
  const cur = today().slice(0, 7);
  $('#mLabel').textContent = monthName(month) + (month === cur ? ' · เดือนนี้' : '');
  $('#mNext').disabled = month >= cur;
  const mm = items.filter(x => inMonth(x, month));
  const prev = items.filter(x => inMonth(x, addMonth(month, -1)));
  const I = sum(mm.filter(x => x.type === 'in')), O = sum(mm.filter(x => x.type === 'out'));
  const pI = sum(prev.filter(x => x.type === 'in')), pO = sum(prev.filter(x => x.type === 'out'));
  $('#sIn').textContent = baht(I);
  $('#sOut').textContent = baht(O);
  $('#sBal').textContent = (I - O < 0 ? '-' : '') + baht(Math.abs(I - O));
  $('#hero').classList.toggle('neg', I - O < 0);
  const cmp = (a, b) => !b ? '' : (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round((a - b) / b * 100)) + '% จากเดือนก่อน';
  $('#sInCmp').textContent = cmp(I, pI);
  $('#sOutCmp').textContent = cmp(O, pO);
  // แถบ: ใช้ไปกี่ % ของรายรับ (เกิน 100% = ใช้เกินรายรับ)
  const pct = I ? O / I * 100 : (O ? 100 : 0);
  $('#flowOut').style.width = Math.min(100, pct) + '%';
  $('#flow').classList.toggle('over', I ? O > I : O > 0);
  $('#flow').setAttribute('aria-label', I ? `ใช้ไป ${Math.round(pct)}% ของรายรับ` : 'ยังไม่มีรายรับ');
  $('#sBalNote').textContent = !I && !O ? 'ยังไม่มีรายการเดือนนี้'
    : !I ? 'ยังไม่ได้จดรายรับเดือนนี้'
    : O > I ? `ใช้เกินรายรับ ${baht(O - I)}`
    : `ใช้ไป ${Math.round(pct)}% ของรายรับ`;
  // จดเร็ว
  $('#qType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === qType));
  $('#mInput').placeholder = qType === 'in' ? '25000 เงินเดือน' : '120 ข้าวมันไก่';
  $('.mo-comp').classList.toggle('is-in', qType === 'in');
  renderQDate();
  renderQCats();
  // มุมมอง
  $('#vTabs').querySelectorAll('button').forEach(c => c.classList.toggle('on', c.dataset.v === view));
  $('#vList').hidden = view !== 'list';
  $('#vCal').hidden = view !== 'cal';
  $('#vChart').hidden = view !== 'chart';
  if (view === 'list') renderList(mm);
  if (view === 'cal') renderCal(mm);
  if (view === 'chart') renderChart(mm);
}

/* หมวดทั้งหมดของประเภทนี้: หมวดตั้งต้น + หมวดที่เคยพิมพ์เอง (อื่นๆ อยู่ท้ายสุด) */
function allCats(type) {
  const base = CATS[type].map(c => c[0]);
  const used = [...new Set(items.filter(x => x.type === type).map(x => String(x.cat || '').trim()).filter(c => c && !base.includes(c)))];
  if (qCat && type === qType && !base.includes(qCat) && !used.includes(qCat)) used.push(qCat);
  return base.slice(0, -1).concat(used, base.slice(-1));
}
let catsOpen = false;
/* หมวดเรียงตามที่ใช้บ่อย (90 วันล่าสุด) · โชว์ 7 อันแรก ที่เหลือกด "หมวดอื่น" */
function catsByUse(type) {
  const since = ymd(new Date(Date.now() - 90 * 864e5)), n = {};
  items.forEach(x => { if (x.type === type && x.cat && x.date >= since) n[x.cat] = (n[x.cat] || 0) + 1; });
  const all = allCats(type), base = all.map((c, i) => [c, i]);
  return base.sort((a, b) => (n[b[0]] || 0) - (n[a[0]] || 0) || a[1] - b[1]).map(x => x[0]);
}
function renderQCats() {
  const box = $('#qCats');
  box.innerHTML = '';
  const list = catsByUse(qType);
  const SHOW = 7;
  let shown = catsOpen ? list : list.slice(0, SHOW);
  if (qCat && !shown.includes(qCat)) shown = shown.concat(qCat);
  shown.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="ic"></span><span></span>';
    b.firstChild.textContent = icon(qType, c);
    b.lastChild.textContent = c;
    b.classList.toggle('on', qCat === c);
    b.setAttribute('aria-pressed', qCat === c);
    b.onclick = () => { qCat = qCat === c ? '' : c; renderQCats(); $('#mInput').focus(); };
    box.appendChild(b);
  });
  if (list.length > SHOW) {
    const m = document.createElement('button');
    m.type = 'button'; m.className = 'more';
    m.textContent = catsOpen ? 'ย่อ' : `หมวดอื่น (${list.length - SHOW})`;
    m.onclick = () => { catsOpen = !catsOpen; renderQCats(); };
    box.appendChild(m);
  }
  const w = document.createElement('button');
  w.type = 'button'; w.className = 'more';
  w.textContent = '✏️ ตั้งชื่อเอง';
  w.onclick = () => {
    const v = (prompt('ชื่อหมวด (เช่น ค่าขนม, ของฝาก)') || '').trim().slice(0, 40);
    if (!v) return;
    qCat = v; renderQCats(); $('#mInput').focus();
  };
  box.appendChild(w);
}

/* สีประจำหมวด (ตรงกับกราฟ) */
function catColor(type, cat) {
  const list = allCats(type);
  const i = Math.max(0, list.indexOf(cat || 'อื่นๆ'));
  return type === 'in' ? ['#15803d', '#0f766e', '#0891b2', '#65a30d', '#2563eb', '#7c3aed', '#78716c'][i % 7] : PALETTE[i % PALETTE.length];
}

function row(x) {
  const el = document.createElement('div');
  el.className = 'item mo-item';
  el.innerHTML = '<span class="mo-ic"></span><button class="body"><span class="title"></span><span class="meta"></span></button><b class="mo-amt"></b>';
  const ic = el.querySelector('.mo-ic');
  ic.textContent = icon(x.type, x.cat);
  ic.style.setProperty('--c', catColor(x.type, x.cat));
  el.querySelector('.title').textContent = x.note || x.cat || (x.type === 'in' ? 'รายรับ' : 'รายจ่าย');
  el.querySelector('.meta').textContent = [x.cat || 'ไม่มีหมวด', x.pay, x.file ? '📎 สลิป' : ''].filter(Boolean).join('  ·  ');
  const a = el.querySelector('.mo-amt');
  a.textContent = (x.type === 'in' ? '+' : '−') + Number(x.amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  a.classList.add(x.type === 'in' ? 'in' : 'out');
  el.querySelector('.body').onclick = () => openDlg(x);
  el.querySelector('.mo-ic').onclick = () => openDlg(x);
  return el;
}

function renderList(mm, only) {
  const box = only || $('#vList');
  box.innerHTML = '';
  if (!mm.length) { box.innerHTML = `<p class="empty">${only ? 'ไม่มีรายการวันนี้' : 'ยังไม่มีรายการเดือนนี้ พิมพ์ยอดกับชื่อในกล่องด้านบน แล้วกด จด'}</p>`; return; }
  const days = {};
  mm.forEach(x => { (days[x.date] = days[x.date] || []).push(x); });
  Object.keys(days).sort().reverse().forEach(d => {
    const list = days[d].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const sec = document.createElement('section');
    sec.className = 'group';
    const o = sum(list.filter(x => x.type === 'out')), i = sum(list.filter(x => x.type === 'in'));
    const dd = new Date(d + 'T00:00:00'), rel = d === today() ? 'วันนี้' : d === ymd(new Date(Date.now() - 864e5)) ? 'เมื่อวาน' : '';
    sec.innerHTML = `<h3 class="mo-day"><b>${dd.getDate()}</b><span class="w">${esc(rel || dd.toLocaleDateString('th-TH', { weekday: 'long' }))}<small>${esc(dd.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }))}</small></span><span class="t">${i ? '<em class="in">+' + baht(i) + '</em>' : ''}${o ? '<em class="out">−' + baht(o) + '</em>' : ''}</span></h3><div class="items"></div>`;
    list.forEach(x => sec.querySelector('.items').appendChild(row(x)));
    box.appendChild(sec);
  });
}

function renderCal(mm) {
  const box = $('#vCal');
  box.innerHTML = '';
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
  const cal = document.createElement('div');
  cal.className = 'cal';
  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].forEach(d => { const e = document.createElement('div'); e.className = 'dow'; e.textContent = d; grid.appendChild(e); });
  for (let i = 0; i < first.getDay(); i++) grid.appendChild(document.createElement('div'));
  if (!calDay || calDay.slice(0, 7) !== month) calDay = month === today().slice(0, 7) ? today() : `${month}-01`;
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${pad(d)}`;
    const list = mm.filter(x => x.date === ds);
    const o = sum(list.filter(x => x.type === 'out')), i = sum(list.filter(x => x.type === 'in'));
    const b = document.createElement('button');
    b.className = 'day mo-dayc' + (ds === today() ? ' today' : '') + (ds === calDay ? ' sel' : '');
    b.innerHTML = `<span class="num">${d}</span>${i ? `<small class="in">+${short$(i)}</small>` : ''}${o ? `<small class="out">-${short$(o)}</small>` : ''}`;
    b.onclick = () => { calDay = ds; qDate = ds === today() ? '' : (ds > today() ? '' : ds); renderQDate(); renderCal(mm); };
    grid.appendChild(b);
  }
  cal.appendChild(grid);
  box.appendChild(cal);
  const h = document.createElement('h3');
  h.className = 'mo-calh';
  h.textContent = dayLabel(calDay);
  box.appendChild(h);
  const holder = document.createElement('div');
  box.appendChild(holder);
  renderList(mm.filter(x => x.date === calDay), holder);
}
const short$ = n => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : Math.round(n).toLocaleString('th-TH');

/* ---------- สรุปและกราฟ ---------- */
const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#059669', '#dc2626', '#0891b2', '#65a30d', '#9333ea', '#78716c'];
function donut(parts, total) {
  let a = -Math.PI / 2, out = '';
  const R = 60, r = 38, cx = 70, cy = 70;
  if (parts.length === 1) return `<svg viewBox="0 0 140 140" class="donut"><circle cx="70" cy="70" r="49" fill="none" stroke="${parts[0][2]}" stroke-width="22"/></svg>`;
  parts.forEach(([, v, col]) => {
    const da = v / total * Math.PI * 2, a2 = a + da, big = da > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    out += `<path d="M${p(R, a)} A${R},${R} 0 ${big} 1 ${p(R, a2)} L${p(r, a2)} A${r},${r} 0 ${big} 0 ${p(r, a)} Z" fill="${col}"/>`;
    a = a2;
  });
  return `<svg viewBox="0 0 140 140" class="donut">${out}</svg>`;
}
function catCard(title, list, type) {
  const by = {};
  list.forEach(x => { const k = x.cat || 'อื่นๆ'; by[k] = (by[k] || 0) + Number(x.amount || 0); });
  const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, catColor(type, k)]);
  const total = sum(list);
  const card = document.createElement('section');
  card.className = 's-card';
  if (!total) { card.innerHTML = `<h3>${title}</h3><p class="hint">ยังไม่มีข้อมูล</p>`; return card; }
  card.innerHTML = `<h3>${title} <small>${baht(total)}</small></h3><div class="mo-donut">${donut(parts, total)}<div class="mo-legend">${parts.map(([k, v, col]) =>
    `<div><i style="background:${col}"></i><span>${icon(type, k)} ${esc(k)}</span><b>${baht(v)}</b><small>${Math.round(v / total * 100)}%</small></div>`).join('')}</div></div>`;
  return card;
}
function renderChart(mm) {
  const box = $('#vChart');
  box.innerHTML = '';
  box.appendChild(catCard('รายจ่ายแยกหมวด', mm.filter(x => x.type === 'out'), 'out'));
  box.appendChild(catCard('รายรับแยกหมวด', mm.filter(x => x.type === 'in'), 'in'));
  // 12 เดือน
  const ms = Array.from({ length: 12 }, (_, i) => addMonth(month, i - 11));
  const data = ms.map(m => { const l = items.filter(x => inMonth(x, m)); return [m, sum(l.filter(x => x.type === 'in')), sum(l.filter(x => x.type === 'out'))]; });
  const max = Math.max(1, ...data.flatMap(d => [d[1], d[2]]));
  const card = document.createElement('section');
  card.className = 's-card';
  card.innerHTML = `<h3>ย้อนหลัง 12 เดือน <small><i class="lg in"></i>รายรับ <i class="lg out"></i>รายจ่าย</small></h3><div class="mo-bars">${data.map(([m, i, o]) =>
    `<button class="mo-bar${m === month ? ' on' : ''}" data-m="${m}" title="${monthName(m)}: รับ ${baht(i)} จ่าย ${baht(o)}"><span class="pair"><i class="in" style="height:${i / max * 100}%"></i><i class="out" style="height:${o / max * 100}%"></i></span><span class="m">${monthShort(m)}</span></button>`).join('')}</div>`;
  card.querySelectorAll('.mo-bar').forEach(b => b.onclick = () => { month = b.dataset.m; render(); });
  box.appendChild(card);
  // ตาราง
  const t = document.createElement('section');
  t.className = 's-card';
  t.innerHTML = `<h3>สรุปรายเดือน</h3><table class="mo-tbl"><thead><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>คงเหลือ</th></tr></thead><tbody>${data.slice().reverse().filter(d => d[1] || d[2]).map(([m, i, o]) =>
    `<tr><td>${monthName(m)}</td><td class="in">${baht(i)}</td><td class="out">${baht(o)}</td><td class="${i - o < 0 ? 'out' : ''}">${i - o < 0 ? '-' : ''}${baht(Math.abs(i - o))}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">ยังไม่มีข้อมูล</td></tr>'}</tbody></table>`;
  box.appendChild(t);
}

/* ---------- จดเร็ว ---------- */
function parseQuick(text) {
  let s = text.trim(), type = qType, date = '', m;
  if ((m = s.match(/^(\+|รับ\s*)/))) { type = 'in'; s = s.slice(m[0].length); }
  else if ((m = s.match(/^(-|จ่าย\s*)/))) { type = 'out'; s = s.slice(m[0].length); }
  if ((m = s.match(/^(เมื่อวาน(นี้)?)\s*/))) { date = ymd(new Date(Date.now() - 864e5)); s = s.slice(m[0].length); }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\s+/))) { const d = new Date(); date = `${d.getFullYear()}-${pad(m[2])}-${pad(m[1])}`; s = s.slice(m[0].length); }
  const am = s.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(บาท|บ\.?)?/);
  const amount = am ? Number(am[1].replace(/,/g, '')) : null;
  const note = am ? (s.slice(0, am.index) + ' ' + s.slice(am.index + am[0].length)).replace(/\s+/g, ' ').trim() : s.trim();
  return { type, date, amount, note };
}
$('#qType').querySelectorAll('button').forEach(b => b.onclick = () => { qType = b.dataset.v; qCat = ''; render(); });
$('#mQuick').addEventListener('submit', async e => {
  e.preventDefault();
  const p = parseQuick($('#mInput').value);
  if (p.amount === null) { showStatus('ใส่จำนวนเงินด้วย เช่น 120 ข้าว'); return; }
  showStatus('');
  const now = new Date().toISOString();
  const x = { id: uid(), type: p.type, date: p.date || qDate || today(), amount: String(p.amount),
    note: p.note || qCat || (p.type === 'in' ? 'รายรับ' : 'รายจ่าย'), cat: qCat || guessCat(p.type, p.note), pay: '', file: null, created: now };
  $('#mInput').value = '';
  qCat = '';
  upsert(x);
  if (!inMonth(x, month)) month = x.date.slice(0, 7);
  render();
  toast(`${x.type === 'in' ? '💰 รับ' : '💸 จ่าย'} ${baht(x.amount)} · ${x.note}${x.cat ? ' [' + x.cat + ']' : ''}`, () => del(x.id), () => openDlg(x));
  try { upsert((await api('money_save', { item: x })).item); render(); }
  catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
});

/* ---------- แก้ไข ---------- */
const dlg = $('#mDlg'), form = $('#mForm');
function openDlg(x) {
  editing = x;
  const f = form.elements;
  ['type', 'date', 'amount', 'note', 'cat', 'pay'].forEach(k => { f[k].value = x[k] ?? ''; });
  if (!Number(x.amount)) f.amount.value = '';
  $('#mDlgTitle').textContent = x.type === 'in' ? 'รายรับ' : 'รายจ่าย';
  $('#mSuggest').hidden = true;
  const ff = $('#fFile');
  ff.hidden = !x.file;
  ff.innerHTML = x.file ? `<span class="field-label">สลิป / ใบเสร็จ</span><a class="mo-file" href="${esc(x.file.url)}" target="_blank" rel="noopener">${x.file.thumb ? `<img src="${x.file.thumb}" alt="">` : '<span class="ficon">PDF</span>'}<span>เปิดดูไฟล์</span></a>` : '';
  paintType(); renderFCats();
  if (!dlg.open) dlg.showModal();
  if (!Number(x.amount)) setTimeout(() => f.amount.focus(), 50);
}
function paintType() { const v = form.elements.type.value || 'out'; $('#fType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); }
function renderFCats() {
  const box = $('#fCats'), inp = form.elements.cat, type = form.elements.type.value || 'out';
  const all = allCats(type);
  if (inp.value.trim() && !all.includes(inp.value.trim())) all.splice(all.length - 1, 0, inp.value.trim());
  box.innerHTML = '';
  all.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = icon(type, c) + ' ' + c;
    b.classList.toggle('on', inp.value.trim() === c);
    b.onclick = () => { inp.value = inp.value.trim() === c ? '' : c; renderFCats(); };
    box.appendChild(b);
  });
}
form.elements.cat.addEventListener('input', renderFCats);
$('#fType').querySelectorAll('button').forEach(b => b.onclick = () => { form.elements.type.value = b.dataset.v; form.elements.cat.value = ''; paintType(); renderFCats(); });
form.addEventListener('submit', async () => {
  if (!editing) return;
  const f = form.elements;
  const x = { ...editing, type: f.type.value || 'out', date: f.date.value, note: f.note.value.trim(), cat: f.cat.value.trim(), pay: f.pay.value,
    amount: String(Number(String(f.amount.value).replace(/,/g, '')) || 0) };
  editing = null;
  upsert(x); render();
  try { upsert((await api('money_save', { item: x })).item); render(); }
  catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
});
$('#btnCancel').onclick = () => { editing = null; dlg.close(); };
$('#btnDel').onclick = () => {
  if (!editing || !confirm('ลบรายการนี้?' + (editing.file ? ' (ไฟล์สลิปจะไปอยู่ถังขยะของ Google Drive)' : ''))) return;
  const id = editing.id;
  editing = null; dlg.close();
  del(id);
};
async function del(id) {
  items = items.filter(x => x.id !== id);
  LS.set('money', items);
  render();
  try { await api('money_delete', { id }); } catch (e) { showStatus('ลบไม่สำเร็จ: ' + e.message); }
}

/* ---------- 📷 สลิป/ใบเสร็จ ---------- */
$('#btnSnap').onclick = () => { $('#mFile').value = ''; $('#mFile').click(); };
$('#mFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const p = parseQuick($('#mInput').value);
  let prep;
  try { prep = await prepare(file); } catch (err) { showStatus(err.message); return; }
  busyStart(prep.thumb);
  const item = { id: uid() };
  if (p.note) item.note = p.note;
  if (p.amount !== null) item.amount = p.amount;
  if (p.date || qDate) item.date = p.date || qDate;   // เลือกวันไว้ = ใช้วันนั้น (ไม่งั้นใช้วันที่อ่านจากสลิป)
  if (qCat) item.cat = qCat;
  let res;
  try { res = await api('money_snap', { item, type: qType, ...prep }); }
  catch (err) { busyEnd(); showStatus('อ่านสลิปไม่สำเร็จ: ' + err.message); return; }
  busyEnd();
  $('#mInput').value = ''; qCat = '';
  const x = res.item, o = res.ocr || {};
  upsert(x);
  if (!inMonth(x, month)) month = x.date.slice(0, 7);
  render();
  openDlg(x);
  const box = $('#mSuggest');
  const got = [o.date && 'วันที่', o.amount && 'ยอดเงิน', o.vendor && 'ชื่อร้าน/ผู้รับ'].filter(Boolean);
  box.innerHTML = `<p>${got.length ? '🔎 อ่านได้: ' + got.join(' · ') : '📷 เก็บรูปแล้ว แต่อ่านข้อมูลไม่ได้ กรอกเองได้เลย'}</p><p class="hint">${got.length ? 'บันทึกแล้ว · ตรวจอีกครั้ง ถ้าแก้อะไรกด บันทึก' : 'รูปชัด ไม่เอียง จะอ่านได้ดีขึ้น'}</p>`;
  box.hidden = false;
});
let busyTick = null;
function busyStart(img) {
  const t0 = Date.now();
  $('#busyImg').hidden = !img;
  if (img) $('#busyImg').src = img;
  const steps = [[0, 'กำลังส่งรูป…'], [2, 'กำลังอ่านสลิป…'], [6, 'กำลังหายอดเงิน วันที่…'], [14, 'ใกล้เสร็จแล้ว…']];
  const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); $('#busyMsg').textContent = steps.filter(x => s >= x[0]).pop()[1]; $('#busySub').textContent = s + ' วินาที · ปกติใช้ราว 5–10 วินาที'; };
  clearInterval(busyTick); tick(); busyTick = setInterval(tick, 500);
  $('#busy').hidden = false;
}
function busyEnd() { clearInterval(busyTick); $('#busy').hidden = true; }
async function prepare(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF ใหญ่เกิน 10MB');
    return { mime: 'application/pdf', data: await toB64(file), thumb: '' };
  }
  const img = await new Promise((ok, bad) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => bad(new Error('เปิดรูปนี้ไม่ได้')); i.src = u; });
  return { mime: 'image/jpeg', data: draw(img, 1800, 0.82).split(',')[1], thumb: draw(img, 160, 0.6) };
}
function draw(img, max, q) {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const toB64 = file => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => bad(new Error('อ่านไฟล์ไม่ได้')); r.readAsDataURL(file); });

/* แถบแจ้ง + ยกเลิก/แก้ */
let toastTimer = null;
function toast(msg, undo, edit) {
  $('#toastMsg').textContent = msg;
  $('#toastUndo').textContent = '↩ ยกเลิก';
  $('#toastUndo').onclick = () => { $('#toast').hidden = true; undo && undo(); };
  $('#toastMsg').onclick = () => { $('#toast').hidden = true; edit && edit(); };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

/* ---------- เดือน / มุมมอง ---------- */
/* เปลี่ยนเดือน = วันที่จดย้ายไปเดือนนั้นด้วย (จดย้อนหลังง่าย) */
function monthDate(m) {
  if (m === today().slice(0, 7)) return '';
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return `${m}-${pad(Math.min(new Date().getDate(), last))}`;
}
$('#mPrev').onclick = () => { month = addMonth(month, -1); qDate = monthDate(month); render(); };
$('#mNext').onclick = () => { if (month < today().slice(0, 7)) { month = addMonth(month, 1); qDate = monthDate(month); render(); } };
$('#mLabel').onclick = () => { month = today().slice(0, 7); qDate = ''; render(); };

/* วันที่ที่จะจด: วันนี้ / เมื่อวาน / เลือกวัน */
function renderQDate() {
  const d = qDate || today(), y = ymd(new Date(Date.now() - 864e5));
  $('#qdToday').classList.toggle('on', d === today());
  $('#qdYest').classList.toggle('on', d === y);
  const other = d !== today() && d !== y;
  $('#qdPick').classList.toggle('on', other);
  $('#qdPickLbl').textContent = other ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'เลือกวัน';
  $('#qdInput').value = d;
  $('#qdInput').max = today();
}
$('#qdToday').onclick = () => { qDate = ''; month = today().slice(0, 7); render(); };
$('#qdYest').onclick = () => { qDate = ymd(new Date(Date.now() - 864e5)); month = qDate.slice(0, 7); render(); };
$('#qdInput').addEventListener('change', () => {
  const v = $('#qdInput').value;
  if (!v) return;
  qDate = v === today() ? '' : v;
  month = v.slice(0, 7);
  render();
});

$('#vTabs').querySelectorAll('button').forEach(c => c.onclick = () => { view = c.dataset.v; LS.set('moneyView', view); render(); });
$('#btnSync').onclick = sync;
render();
sync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
