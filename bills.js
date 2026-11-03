/* จดครบ — จดบิล / เบิกเงิน */
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const cfg = LS.get('cfg', { url: '', key: '' });
if (!cfg.url) cfg.url = DEFAULT_URL;

const KIND = {
  taxinv: { icon: '🧾', name: 'ใบกำกับภาษี' },
  receipt: { icon: '🧾', name: 'ใบเสร็จ' },
  cert: { icon: '✍️', name: 'ใบรับรองแทนใบเสร็จ' },
  slip: { icon: '📷', name: 'สลิป/รูปแคป' },
  other: { icon: '📄', name: 'อื่นๆ' },
};
const ST = {
  draft: '📝 ขาดหลักฐาน', ready: '📎 พร้อมเบิก', submitted: '📤 ส่งเบิกแล้ว', paid: '✅ ได้เงินแล้ว',
};

let bills = LS.get('bills', []);
let tab = 'all';        // สถานะในหน้าย่อย (all = ทั้งหมด)
let view = 'home';      // home = หน้าหลักเบิกเงิน | list = รายการ | summary = สรุป
let snapNew = false;    // กด 📷 = สร้างบิลใหม่จากรูป
let editing = null;      // บิลที่เปิดอยู่
let attachFor = null;    // บิลที่กำลังแนบหลักฐาน
let attachKind = '';
let sumMonth = '';       // เดือนที่ดูในหน้าสรุป (yyyy-mm)
let fKind = 'all';       // ชนิดหลักฐานที่กรองในคลัง
const folderUrl = {};    // ลิงก์โฟลเดอร์ Drive ของแต่ละเดือน
const thumbAsked = {};   // เดือนที่ขอรูปย่อแล้ว

/* ---------- ช่วยเหลือ ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const short = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+d}/${+m}`; };
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sum = list => list.reduce((s, b) => s + Number(b.amount || 0), 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[-.]/g, '');
const vatOf = b => (b.vat === 'yes' || (b.files || []).some(f => f.kind === 'taxinv')) ? 'yes' : (b.vat === 'no' ? 'no' : '');
const vatAmtOf = b => vatOf(b) === 'yes' ? (Number(b.vatAmt) || Math.round(Number(b.amount || 0) * 7 / 107 * 100) / 100) : 0;
const r2 = n => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hasProof = b => (b.files || []).length > 0;
// มีเอกสารตัวจริงไหม: รูปถ่ายใบเสร็จ/ใบกำกับ = มีตัวจริง (ไม่ต้องแนบภาพท้ายใบเบิก) · PDF/สลิป/รูปแคป = ไม่มีตัวจริง
const isOrig = f => f.orig !== undefined && f.orig !== '' ? !!f.orig : (/^image\/jpe?g$/.test(f.mime || '') && ['receipt', 'taxinv', 'cert'].includes(f.kind));   // แนบไฟล์อะไรก็ได้ (รวมสลิป) = มีหลักฐานแล้ว

async function api(action, payload = {}) {
  const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action, key: cfg.key, ...payload }), redirect: 'follow' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
function showStatus(msg, ok) {
  const el = $('#status');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.classList.toggle('ok', !!ok);
}
function upsert(b) {
  const i = bills.findIndex(x => x.id === b.id);
  if (i > -1) bills[i] = b; else bills.push(b);
  LS.set('bills', bills);
}

async function sync() {
  if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่องนี้ กลับไปหน้าหลักแล้วเปิดลิงก์จาก LINE ก่อน'); return; }
  $('#btnSync').classList.add('spin');
  try {
    const { bills: remote } = await api('bills_list');
    bills = remote;
    LS.set('bills', bills);
    showStatus('');
    render();
  } catch (e) {
    showStatus('ดึงข้อมูลไม่สำเร็จ: ' + e.message);
  } finally {
    $('#btnSync').classList.remove('spin');
  }
}

/* ---------- แสดงผล ---------- */
const monthName = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const monthShort = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'short' });
const addMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const inMonth = (b, m) => (b.date || '').slice(0, 7) === m;

function render() {
  if (!sumMonth) sumMonth = today().slice(0, 7);
  const cur = today().slice(0, 7);
  const mb = bills.filter(b => inMonth(b, sumMonth));

  // แถบเดือน
  $('#mLabel').textContent = monthName(sumMonth) + (sumMonth === cur ? ' · เดือนนี้' : '');
  $('#mNext').disabled = sumMonth >= cur;
  const paidM = mb.filter(b => b.status === 'paid');
  $('#mTotal').textContent = mb.length
    ? `จ่ายไป ${baht(sum(mb))} · ${mb.length} รายการ` + (paidM.length ? ` · ได้คืนแล้ว ${baht(sum(paidM))}` : '')
    : 'ยังไม่มีบิลในเดือนนี้';

  // เดือนอื่นที่ยังขาดหลักฐาน
  const older = bills.filter(b => b.status === 'draft' && !inMonth(b, sumMonth));
  const ob = $('#mOlder');
  ob.innerHTML = '';
  ob.hidden = !older.length;
  if (older.length) {
    const by = {};
    older.forEach(b => { const m = (b.date || '').slice(0, 7); by[m] = (by[m] || 0) + 1; });
    const t = document.createElement('span');
    t.textContent = `📝 เดือนอื่นยังขาดหลักฐาน ${older.length} รายการ:`;
    ob.appendChild(t);
    Object.keys(by).sort().reverse().forEach(m => {
      const b = document.createElement('button');
      b.className = 'mini';
      b.textContent = `${monthShort(m)} ${by[m]}`;
      b.onclick = () => { sumMonth = m; go('list/draft'); };
      ob.appendChild(b);
    });
  }

  // หน้าไหน
  $('#vHome').hidden = view !== 'home';
  $('#vList').hidden = view !== 'list';
  $('#vSum').hidden = view !== 'summary';
  $('#vFiles').hidden = view !== 'files';
  $('#vBack').hidden = view === 'home';
  $('#vToApp').hidden = view !== 'home';
  $('#vSub').hidden = view !== 'home';
  $('#vTitle').textContent = view === 'home' ? 'เบิกเงิน' : view === 'summary' ? 'สรุปและย้อนหลัง' : view === 'files' ? 'คลังหลักฐาน'
    : tab === 'all' ? 'บิลทั้งหมด' : ST[tab].replace(/^\S+\s/, '');

  // ช่องสรุป (ของเดือนที่เลือก)
  document.querySelectorAll('.b-tile').forEach(t => {
    const list = mb.filter(b => b.status === t.dataset.st);
    t.querySelector('.amt').textContent = baht(sum(list));
    t.querySelector('.cnt').textContent = `${list.length} รายการ`;
  });
  document.querySelectorAll('#bTabs .chip').forEach(c => {
    c.classList.toggle('on', c.dataset.st === tab);
    c.dataset.n = c.dataset.st === 'all' ? mb.length : mb.filter(b => b.status === c.dataset.st).length;
  });
  // ตัวเลือกโปรเจ็ค
  const projs = [...new Set(bills.map(b => b.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  $('#bProjList').innerHTML = '';
  projs.forEach(p => { const o = document.createElement('option'); o.value = p; $('#bProjList').appendChild(o); });

  const ready = bills.filter(b => b.status === 'ready');
  $('#bBar').hidden = view !== 'list' || tab !== 'ready' || !ready.length;
  $('#btnClaim').textContent = `สร้างใบเบิก (${ready.length} รายการ ${baht(sum(ready))})`;
  $('#goClaim').hidden = !ready.length;
  $('#goClaimN').textContent = `${ready.length} รายการพร้อมเบิก · ${baht(sum(ready))}`;

  const nf = mb.reduce((n, b) => n + (b.files || []).length, 0);
  $('#goFilesN').textContent = nf ? `${nf} ไฟล์ในเดือนนี้ · รูปใบเสร็จ ใบกำกับภาษี สลิป` : 'ยังไม่มีไฟล์ในเดือนนี้';
  if (view === 'summary') { const sb = $('#vSum'); sb.innerHTML = ''; renderSummary(sb); return; }
  if (view === 'files') { renderFilesView(mb); return; }
  if (view === 'home') { renderHome(mb); return; }

  const box = $('#bList');
  box.innerHTML = '';
  const list = mb.filter(b => tab === 'all' || b.status === tab)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
  if (!list.length) {
    const msg = { draft: 'ไม่มีบิลที่ขาดหลักฐานในเดือนนี้ 👍', ready: 'ยังไม่มีบิลที่พร้อมเบิกในเดือนนี้', submitted: 'ไม่มีบิลที่รอเงินคืนในเดือนนี้', paid: 'ยังไม่มีบิลที่ได้เงินแล้วในเดือนนี้' }[tab] || 'ยังไม่มีบิลในเดือนนี้ จดด้านบนได้เลย';
    box.innerHTML = `<p class="empty">${msg}</p>`;
    return;
  }

  if (tab === 'submitted') {
    // จัดกลุ่มตามใบเบิก (กด "ได้เงินแล้ว" = ทั้งใบ รวมรายการจากเดือนอื่นในใบเดียวกัน)
    const groups = {};
    list.forEach(b => { (groups[b.claim || 'ไม่ระบุใบเบิก'] = groups[b.claim || 'ไม่ระบุใบเบิก'] || []).push(b); });
    Object.entries(groups).forEach(([claim, items]) => {
      const whole = bills.filter(b => b.status === 'submitted' && (b.claim || 'ไม่ระบุใบเบิก') === claim);
      const sec = section(`${claim} · ${baht(sum(whole))}` + (whole.length > items.length ? ` (รวมเดือนอื่น ${whole.length - items.length})` : ''));
      const btn = document.createElement('button');
      btn.className = 'mini paid-btn';
      btn.textContent = '✅ ได้เงินแล้ว';
      btn.onclick = () => quickMark(whole, 'paid');
      sec.querySelector('h3').appendChild(btn);
      items.forEach(b => sec.querySelector('.items').appendChild(row(b)));
      box.appendChild(sec);
    });
    return;
  }
  const sec = section(`${tab === 'all' ? 'ทั้งหมด' : ST[tab]} · ${baht(sum(list))}`);
  list.forEach(b => sec.querySelector('.items').appendChild(row(b)));
  box.appendChild(sec);
}

/* หน้าหลักเบิกเงิน: รายการล่าสุดของเดือน */
function renderHome(mb) {
  const box = $('#hRecent');
  box.innerHTML = '';
  const list = [...mb].sort((a, b) => (b.created || b.date || '').localeCompare(a.created || a.date || '')).slice(0, 5);
  $('#goAll').textContent = mb.length > list.length ? `ดูทั้งหมด (${mb.length}) ›` : 'ดูทั้งหมด ›';
  if (!list.length) { box.innerHTML = '<p class="empty small">ยังไม่มีบิลในเดือนนี้</p>'; return; }
  const wrap = document.createElement('div');
  wrap.className = 'items';
  list.forEach(b => wrap.appendChild(row(b)));
  box.appendChild(wrap);
}

/* ---------- คลังหลักฐาน: ไฟล์ทั้งหมดของเดือน ---------- */
function renderFilesView(mb) {
  const items = [];
  mb.forEach(b => (b.files || []).forEach(f => items.push({ b, f })));
  items.sort((x, y) => (y.b.date || '').localeCompare(x.b.date || ''));
  // ปุ่มกรองตามชนิด
  const nav = $('#fTabs');
  nav.innerHTML = '';
  const kinds = [['all', 'ทั้งหมด']].concat(Object.entries(KIND).map(([k, v]) => [k, v.name]));
  kinds.forEach(([k, name]) => {
    const n = k === 'all' ? items.length : items.filter(x => x.f.kind === k).length;
    if (k !== 'all' && !n) return;
    const c = document.createElement('button');
    c.className = 'chip' + (fKind === k ? ' on' : '');
    c.textContent = name;
    c.dataset.n = n;
    c.onclick = () => { fKind = k; render(); };
    nav.appendChild(c);
  });
  if (fKind !== 'all' && !items.some(x => x.f.kind === fKind)) fKind = 'all';
  // ตารางรูป
  const grid = $('#fGrid');
  grid.innerHTML = '';
  const shown = items.filter(x => fKind === 'all' || x.f.kind === fKind);
  if (!shown.length) grid.innerHTML = '<p class="empty">ยังไม่มีหลักฐานในเดือนนี้</p>';
  shown.forEach(({ b, f }) => {
    const card = document.createElement('div');
    card.className = 'f-card';
    const a = document.createElement('a');
    a.href = f.url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'f-img';
    const ico = () => { const i = document.createElement('span'); i.className = 'f-ico'; i.textContent = f.mime === 'application/pdf' ? 'PDF' : '📄'; return i; };
    // รูปย่อ: ถ้ายังไม่มี (เช่น PDF) ระบบจะขอรูปย่อจาก Google Drive ให้ด้านล่าง
    const src = f.thumb || '';
    if (src) {
      const img = document.createElement('img');
      img.src = src; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.replaceWith(ico());
      a.appendChild(img);
    } else a.appendChild(ico());
    const k = document.createElement('span');
    k.className = 'f-kind';
    k.textContent = (KIND[f.kind] || KIND.other).name;
    a.appendChild(k);
    const cap = document.createElement('button');
    cap.type = 'button'; cap.className = 'f-cap';
    cap.innerHTML = '<b></b><span></span>';
    cap.querySelector('b').textContent = `${short(b.date)} · ${baht(b.amount)}`;
    cap.querySelector('span').textContent = b.desc || '';
    cap.onclick = () => openDlg(b);
    card.append(a, cap);
    grid.appendChild(card);
  });
  // บิลที่ยังไม่มีหลักฐาน
  const miss = mb.filter(b => !hasProof(b));
  const mbox = $('#fMissing');
  mbox.innerHTML = '';
  if (miss.length) {
    const sec = section(`📝 ยังไม่มีหลักฐาน · ${miss.length} รายการ`);
    miss.forEach(b => sec.querySelector('.items').appendChild(row(b)));
    mbox.appendChild(sec);
  }
  // ไฟล์ที่ยังไม่มีรูปย่อ (PDF / ส่งจาก LINE) → ให้ระบบทำรูปย่อจาก Drive (ครั้งเดียวต่อเดือน)
  if (cfg.key && !thumbAsked[sumMonth] && items.some(x => !x.f.thumb)) {
    const mm = sumMonth;
    thumbAsked[mm] = true;
    api('bill_thumbs', { month: mm }).then(r => { (r.bills || []).forEach(upsert); if ((r.bills || []).length) render(); }).catch(() => {});
  }
  // ลิงก์โฟลเดอร์ Drive (ดึงครั้งเดียวต่อเดือน)
  const m = sumMonth, link = $('#fDrive');
  link.hidden = !folderUrl[m];
  if (folderUrl[m]) link.href = folderUrl[m];
  else if (items.length && cfg.key) {
    api('bill_folder', { month: m }).then(r => { folderUrl[m] = r.url; if (view === 'files' && sumMonth === m) { link.href = r.url; link.hidden = false; } }).catch(() => {});
  }
}

/* ---------- เปลี่ยนหน้า (ใช้ # เพื่อให้ปุ่มย้อนกลับของมือถือใช้ได้) ---------- */
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('list/')) { view = 'list'; tab = ['draft', 'ready', 'submitted', 'paid', 'all'].includes(h.slice(5)) ? h.slice(5) : 'all'; }
  else if (h === 'summary') view = 'summary';
  else if (h === 'files') view = 'files';
  else view = 'home';
  render();
  window.scrollTo(0, 0);
}
function go(h) { if (location.hash.slice(1) === h) route(); else location.hash = h; }
window.addEventListener('hashchange', route);

/* ---------- สรุป: ยอดรวมทั้งหมด + ย้อนหลัง 12 เดือน + แยกหมวด/บริษัทของเดือนที่เลือก ---------- */
function renderSummary(box) {
  const by = st => bills.filter(b => b.status === st);
  const pending = [...by('draft'), ...by('ready'), ...by('submitted')];
  const all = document.createElement('section');
  all.className = 's-card';
  all.innerHTML = '<h3>ยอดรวมทั้งหมด</h3><div class="s-grid"></div>';
  [['จ่ายไปทั้งหมด', sum(bills), bills.length], ['ได้คืนแล้ว', sum(by('paid')), by('paid').length], ['ยังค้างรับคืน', sum(pending), pending.length]].forEach(([l, v, n], i) => {
    const d = document.createElement('div');
    d.className = 's-num' + (i === 2 ? ' warn' : '');
    d.innerHTML = '<span></span><b></b><small></small>';
    d.children[0].textContent = l; d.children[1].textContent = baht(v); d.children[2].textContent = `${n} รายการ`;
    all.querySelector('.s-grid').appendChild(d);
  });
  box.appendChild(all);

  // 12 เดือนล่าสุด
  const cur = today().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonth(cur, i - 11));
  const vals = months.map(m => sum(bills.filter(b => inMonth(b, m))));
  const max = Math.max(...vals, 1);
  const chart = document.createElement('section');
  chart.className = 's-card';
  chart.innerHTML = '<h3>ย้อนหลัง 12 เดือน <small>(กดเพื่อดูเดือนนั้น)</small></h3><div class="s-bars"></div>';
  months.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 's-bar' + (m === sumMonth ? ' on' : '');
    b.title = `${monthName(m)} ${baht(vals[i])}`;
    b.innerHTML = '<span class="v"></span><i></i><span class="m"></span>';
    b.querySelector('.v').textContent = vals[i] ? (vals[i] >= 1000 ? (vals[i] / 1000).toFixed(vals[i] >= 10000 ? 0 : 1) + 'k' : Math.round(vals[i])) : '';
    b.querySelector('i').style.height = Math.max(vals[i] ? 4 : 0, Math.round(vals[i] / max * 100)) + '%';
    b.querySelector('.m').textContent = monthShort(m);
    b.onclick = () => { sumMonth = m; render(); };
    chart.querySelector('.s-bars').appendChild(b);
  });
  box.appendChild(chart);

  // แยกหมวด / บริษัท ของเดือนที่เลือก
  const mb = bills.filter(b => inMonth(b, sumMonth));
  [['แยกตามหมวด', 'cat', 'ไม่ระบุหมวด'], ['แยกตามโปรเจ็ค/บริษัท', 'project', 'ไม่ระบุ']].forEach(([title, key, none]) => {
    const g = {};
    mb.forEach(b => { const k = b[key] || none; g[k] = (g[k] || 0) + Number(b.amount || 0); });
    const rows = Object.entries(g).sort((a, b) => b[1] - a[1]);
    const sec = document.createElement('section');
    sec.className = 's-card';
    sec.innerHTML = '<h3></h3>';
    sec.querySelector('h3').textContent = `${title} · ${monthName(sumMonth)}`;
    if (!rows.length) { sec.insertAdjacentHTML('beforeend', '<p class="hint">ยังไม่มีบิลในเดือนนี้</p>'); box.appendChild(sec); return; }
    const top = rows[0][1] || 1;
    rows.forEach(([k, v]) => {
      const r = document.createElement('div');
      r.className = 's-row';
      r.innerHTML = '<span class="k"></span><span class="track"><i></i></span><b></b>';
      r.querySelector('.k').textContent = k;
      r.querySelector('i').style.width = Math.round(v / top * 100) + '%';
      r.querySelector('b').textContent = baht(v);
      sec.appendChild(r);
    });
    box.appendChild(sec);
  });
}

function section(title) {
  const sec = document.createElement('section');
  sec.className = 'group';
  sec.innerHTML = '<h3></h3><div class="items"></div>';
  sec.querySelector('h3').textContent = title;
  return sec;
}

function row(b) {
  const el = document.createElement('div');
  el.className = 'item b-item';
  const body = document.createElement('button');
  body.className = 'body';
  body.innerHTML = '<span class="title"></span><span class="meta"></span><span class="b-proofs"></span>';
  const t = body.querySelector('.title');
  if (b.project) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = b.project; t.appendChild(tag); }
  t.append(b.desc);
  body.querySelector('.meta').textContent = [short(b.date), b.cat, vatOf(b) === 'yes' ? '🧾 VAT' : '', b.pay, view === 'list' && tab !== 'all' ? '' : ST[b.status]].filter(Boolean).join(' · ');
  const pf = body.querySelector('.b-proofs');
  if (!(b.files || []).length) pf.innerHTML = '<span class="missing">ยังไม่มีหลักฐาน</span>';
  else (b.files || []).forEach(f => { const s = document.createElement('span'); s.className = 'pf ' + f.kind; s.textContent = KIND[f.kind].icon + ' ' + KIND[f.kind].name; pf.appendChild(s); });
  body.onclick = () => openDlg(b);

  const right = document.createElement('div');
  right.className = 'b-right';
  const amt = document.createElement('b');
  amt.className = 'b-amt';
  amt.textContent = baht(b.amount);
  right.appendChild(amt);
  // ปุ่มขั้นถัดไป: ขาดหลักฐาน → แนบ | พร้อมเบิก → ส่งเบิกแล้ว | ส่งเบิกแล้ว → ได้เงินแล้ว
  const next = { draft: ['📎 แนบ', () => askKind(b)],
    ready: ['📤 ส่งเบิกแล้ว', () => quickMark([b], 'submitted')],
    submitted: ['✅ ได้เงินแล้ว', () => quickMark([b], 'paid')] }[b.status];
  if (next) {
    const at = document.createElement('button');
    at.className = 'edit-btn strong step-' + b.status;
    at.type = 'button';
    at.textContent = next[0];
    at.onclick = next[1];
    right.appendChild(at);
  }
  el.append(body, right);
  return el;
}

/* ---------- จดเร็ว ---------- */
function parseQuick(text) {
  let s = text.trim(), project = '', amount = null, date = '', m;
  s = s.replace(/(^|\s)#(\S+)/, (a, sp, name) => { project = name; return sp; }).trim();
  // วันที่นำหน้า: วันนี้ / เมื่อวาน / เมื่อวานซืน / 28/10
  if ((m = s.match(/^(วันนี้|เมื่อวานซืน|เมื่อวาน)\s+/))) {
    const back = { 'วันนี้': 0, 'เมื่อวาน': 1, 'เมื่อวานซืน': 2 }[m[1]];
    const d = new Date(); d.setDate(d.getDate() - back); date = ymd(d);
    s = s.slice(m[0].length);
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+/))) {
    const dd = +m[1], mm = +m[2];
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      let y = m[3] ? +m[3] : new Date().getFullYear();
      if (y > 2400) y -= 543; else if (y < 100) y = y >= 50 ? 2500 + y - 543 : 2000 + y;
      let c = `${y}-${pad(mm)}-${pad(dd)}`;
      if (!m[3] && c > today()) c = `${y - 1}-${pad(mm)}-${pad(dd)}`;   // ไม่ใส่ปี + อยู่ในอนาคต = ปีที่แล้ว
      date = c;
      s = s.slice(m[0].length);
    }
  }
  if ((m = s.match(/^([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)?\s+/))) { amount = m[1]; s = s.slice(m[0].length); }
  else if ((m = s.match(/\s+([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)?$/))) { amount = m[1]; s = s.slice(0, m.index); }
  return { amount: amount ? Number(amount.replace(/,/g, '')) : null, desc: s.trim(), project, date };
}

$('#bQuick').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#bInput');
  const p = parseQuick(input.value);
  if (!p.desc) return;
  const now = new Date().toISOString();
  const b = { id: uid(), date: p.date || today(), amount: p.amount ?? 0, desc: p.desc, project: p.project, cat: '', pay: '', vendor: '', status: 'draft', files: [], note: '', created: now };
  input.value = '';
  upsert(b);
  if (p.date && p.date.slice(0, 7) !== today().slice(0, 7)) sumMonth = p.date.slice(0, 7);
  render();
  if (p.amount === null) openDlg(b);   // ไม่ได้ใส่จำนวนเงิน = เปิดให้กรอก
  try { upsert((await api('bill_save', { bill: b })).bill); render(); }
  catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
});

/* ---------- ไปหน้าย่อย ---------- */
document.querySelectorAll('.b-tile').forEach(c => c.onclick = () => go('list/' + c.dataset.st));
document.querySelectorAll('#bTabs .chip').forEach(c => c.onclick = () => {
  history.replaceState(null, '', '#list/' + c.dataset.st);   // สลับแท็บไม่ต้องเก็บประวัติ
  route();
});
$('#goAll').onclick = () => go('list/all');
$('#goSum').onclick = () => go('summary');
$('#goFiles').onclick = () => go('files');
$('#goClaim').onclick = () => $('#btnClaim').onclick();
$('#vBack').onclick = () => go('');

/* ---------- แก้ไข ---------- */
const dlg = $('#bDlg'), form = $('#bForm');
function openDlg(b) {
  editing = b;
  const f = form.elements;
  ['date', 'amount', 'desc', 'project', 'cat', 'pay', 'vendor', 'note', 'status', 'vat', 'vatAmt'].forEach(k => { f[k].value = b[k] ?? ''; });
  if (!f.vat.value && vatOf(b)) f.vat.value = vatOf(b);
  if (!Number(b.amount)) f.amount.value = '';
  $('#bSuggest').hidden = true;
  renderFiles();
  renderCats();
  renderSteps();
  renderVat();
  if (!dlg.open) dlg.showModal();
  if (!Number(b.amount)) setTimeout(() => f.amount.focus(), 50);
}
/* หมวด: แตะเลือก หรือพิมพ์เอง (หมวดที่พิมพ์เองจะขึ้นเป็นปุ่มให้ครั้งต่อไป) */
const BASE_CATS = ['เดินทาง', 'อาหาร/รับรอง', 'ค่าห้องประชุม', 'ที่พัก', 'อุปกรณ์/วัสดุ', 'ค่าบริการ', 'อื่นๆ'];
function syncCats() {
  const v = form.elements.cat.value.trim();
  $('#bCats').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent === v));
}
function renderCats() {
  const box = $('#bCats'), inp = form.elements.cat;
  const used = [...new Set(bills.map(b => String(b.cat || '').trim()).filter(Boolean))];
  const all = BASE_CATS.concat(used.filter(c => !BASE_CATS.includes(c)));
  const cur = inp.value.trim();
  if (cur && !all.includes(cur)) all.push(cur);
  box.innerHTML = '';
  all.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c;
    b.onclick = () => { inp.value = inp.value.trim() === c ? '' : c; syncCats(); };
    box.appendChild(b);
  });
  syncCats();
}
form.elements.cat.addEventListener('input', syncCats);

function renderFiles() {
  const box = $('#bFiles');
  box.innerHTML = '';
  const files = (editing && editing.files) || [];
  $('#bFilesLbl').textContent = files.length ? `หลักฐาน · ${files.length} ไฟล์` : 'หลักฐาน';
  $('#btnAttach').innerHTML = files.length ? '＋ เพิ่มหลักฐานอีก <small>(แนบได้หลายไฟล์)</small>' : '📎 แนบหลักฐาน <small>(แนบได้หลายไฟล์)</small>';
  if (!files.length) { box.innerHTML = '<p class="hint">ยังไม่มี แนบได้ทีหลัง</p>'; return; }
  files.forEach(f => {
    const a = document.createElement('div');
    a.className = 'b-file';
    const link = document.createElement('a');
    link.href = f.url; link.target = '_blank'; link.rel = 'noopener'; link.className = 'bf-thumb';
    if (f.thumb) { const img = document.createElement('img'); img.src = f.thumb; img.alt = ''; link.appendChild(img); }
    else { const i = document.createElement('span'); i.className = 'ficon'; i.textContent = f.mime === 'application/pdf' ? 'PDF' : '📄'; link.appendChild(i); }
    // ชนิดหลักฐาน: เปลี่ยนได้ทีละไฟล์
    const sel = document.createElement('select');
    sel.className = 'bf-kind';
    sel.setAttribute('aria-label', 'ชนิดหลักฐาน');
    Object.entries(KIND).forEach(([k, v]) => sel.add(new Option(v.icon + ' ' + v.name, k)));
    sel.value = KIND[f.kind] ? f.kind : 'other';
    sel.onchange = async () => {
      const id = editing.id;
      f.kind = sel.value;
      try {
        const { bill } = await api('bill_filekind', { id, fileId: f.id, kind: sel.value });
        upsert(bill);
        if (editing && editing.id === id) { editing = bill; form.elements.status.value = bill.status; renderSteps(); renderFiles(); }
        render();
      } catch (e) { showStatus('เปลี่ยนชนิดไม่สำเร็จ: ' + e.message); }
    };
    const open = document.createElement('a');
    open.href = f.url; open.target = '_blank'; open.rel = 'noopener'; open.className = 'bf-open'; open.textContent = 'เปิดดู';
    const og = document.createElement('button');
    og.type = 'button';
    const paintOg = () => { og.className = 'bf-orig' + (isOrig(f) ? ' on' : ''); og.textContent = isOrig(f) ? '📄 มีตัวจริง · ไม่แนบท้ายใบเบิก' : '🖨 แนบภาพท้ายใบเบิก'; };
    paintOg();
    og.onclick = async () => {
      const id = editing.id, v = !isOrig(f);
      f.orig = v; paintOg();
      try { const { bill } = await api('bill_fileorig', { id, fileId: f.id, orig: v }); upsert(bill); if (editing && editing.id === id) editing = { ...editing, files: bill.files }; }
      catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
    };
    const line = document.createElement('div');
    line.className = 'bf-line';
    line.append(open, og);
    const info = document.createElement('div');
    info.className = 'bf-info';
    info.append(sel, line);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'b-x'; x.textContent = '×'; x.setAttribute('aria-label', 'เอาหลักฐานนี้ออก');
    x.onclick = async () => {
      if (!confirm('เอาหลักฐานนี้ออก? (ไฟล์จะไปอยู่ถังขยะของ Google Drive)')) return;
      try {
        const { bill } = await api('bill_unfile', { id: editing.id, fileId: f.id });
        editing = bill; upsert(bill); renderFiles(); form.elements.status.value = bill.status; renderSteps(); render();
      } catch (e) { showStatus('เอาออกไม่สำเร็จ: ' + e.message); }
    };
    a.append(link, info, x);
    box.appendChild(a);
  });
}

/* VAT: มี / ไม่มี + ยอด VAT (เว้นว่าง = คิดจากยอด 7/107) */
function renderVat() {
  const f = form.elements;
  $('#bVat').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === f.vat.value));
  $('#bVatAmtWrap').hidden = f.vat.value !== 'yes';
  const amt = Number(String(f.amount.value).replace(/,/g, '')) || 0;
  f.vatAmt.placeholder = amt ? 'คิดให้ ≈ ' + r2(amt * 7 / 107) : 'ยอด VAT';
}
$('#bVat').querySelectorAll('button').forEach(x => x.onclick = () => {
  const f = form.elements;
  f.vat.value = f.vat.value === x.dataset.v ? '' : x.dataset.v;
  renderVat();
});
form.elements.amount.addEventListener('input', () => renderVat());

/* สถานะในหน้ารายละเอียด: แตะขั้นที่ต้องการ (มีผลทันที) */
const STEPS = [['draft', '📝', 'ขาดหลักฐาน'], ['ready', '📎', 'พร้อมเบิก'], ['submitted', '📤', 'ส่งเบิกแล้ว'], ['paid', '✅', 'ได้เงินแล้ว']];
function renderSteps() {
  const box = $('#bSteps');
  box.innerHTML = '';
  if (!editing) return;
  const cur = form.elements.status.value || editing.status;
  const idx = STEPS.findIndex(x => x[0] === cur);
  STEPS.forEach(([st, ic, name], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'b-step' + (i < idx ? ' done' : '') + (i === idx ? ' on' : '');
    const when = st === 'submitted' ? editing.submitted : st === 'paid' ? editing.paid : '';
    b.innerHTML = '<span class="ic"></span><span class="nm"></span><small></small>';
    b.querySelector('.ic').textContent = ic;
    b.querySelector('.nm').textContent = name;
    b.querySelector('small').textContent = i <= idx && when ? short(when) : (st === 'submitted' && i === idx && editing.claim ? editing.claim : '');
    b.onclick = async () => {
      if (st === cur) return;
      if (st === 'ready' && !hasProof(editing)) { alert('ต้องแนบหลักฐานก่อน (ใบเสร็จ ใบกำกับภาษี หรือสลิปก็ได้) ถึงจะพร้อมเบิก'); return; }
      const id = editing.id;
      form.elements.status.value = st;
      editing = { ...editing, status: st };
      renderSteps();
      await quickMark([bills.find(x => x.id === id) || editing], st, true);
      const nb = bills.find(x => x.id === id);
      if (nb && editing && editing.id === id) { editing = { ...editing, status: nb.status, submitted: nb.submitted, paid: nb.paid, claim: nb.claim }; form.elements.status.value = nb.status; renderSteps(); }
    };
    box.appendChild(b);
  });
}

form.addEventListener('submit', async () => {
  if (!editing) return;
  const f = form.elements;
  const b = { ...editing };
  ['date', 'desc', 'project', 'cat', 'pay', 'vendor', 'note', 'vat'].forEach(k => { b[k] = f[k].value.trim(); });
  b.vatAmt = b.vat === 'yes' ? String(f.vatAmt.value).replace(/,/g, '').trim() : '';
  b.amount = Number(String(f.amount.value).replace(/,/g, '')) || 0;
  const statusChanged = f.status.value !== editing.status;
  b.status = f.status.value;
  editing = null;
  upsert(b);
  render();
  try {
    const payload = { ...b };
    if (!statusChanged) delete payload.status;   // ให้ระบบเลื่อนสถานะตามหลักฐานเอง
    upsert((await api('bill_save', { bill: payload })).bill);
    render();
  } catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
});
$('#btnBCancel').onclick = () => { editing = null; dlg.close(); };
$('#btnBDelete').onclick = async () => {
  if (!editing || !confirm('ลบบิลนี้? (ไฟล์หลักฐานจะไปอยู่ถังขยะของ Google Drive)')) return;
  const id = editing.id;
  bills = bills.filter(b => b.id !== id);
  LS.set('bills', bills);
  editing = null;
  dlg.close();
  render();
  try { await api('bill_delete', { id }); } catch (e) { showStatus('ลบไม่สำเร็จ: ' + e.message); }
};
$('#btnAttach').onclick = () => askKind(editing);

/* ---------- แนบหลักฐาน ---------- */
const kDlg = $('#kDlg');
function askKind(b) {
  attachFor = b;
  $('#kFor').textContent = `${short(b.date)} · ${b.desc} · ${baht(b.amount)}`;
  kDlg.showModal();
}
$('#btnKCancel').onclick = () => kDlg.close();

/* 📷 ถ่าย/เลือกรูปใบเสร็จ → สร้างบิลใหม่ เติมวันที่ ยอด ร้าน จากรูป */
$('#btnSnap').onclick = () => {
  snapNew = true;
  attachFor = null;
  attachKind = 'auto';
  $('#bFile').value = '';
  $('#bFile').click();
};
kDlg.querySelectorAll('[data-kind]').forEach(btn => btn.onclick = () => {
  attachKind = btn.dataset.kind;
  kDlg.close();
  $('#bFile').value = '';
  $('#bFile').click();
});

$('#bFile').addEventListener('change', async e => {
  const files = [...e.target.files];
  const isSnap = snapNew;
  snapNew = false;
  if (!files.length) return;
  if (isSnap) { snapBill(files[0]); return; }
  if (!attachFor) return;
  let found = null, filled = {}, prev = {};   // สิ่งที่อ่านได้ / ที่ระบบเติมให้ / ค่าเดิม
  const before = { ...attachFor };
  for (let i = 0; i < files.length; i++) {
    try {
      const prep = await prepare(files[i]);
      busyStart(prep.thumb, files.length > 1 ? `ไฟล์ ${i + 1}/${files.length}` : '');
      const res = await api('bill_upload', { id: attachFor.id, kind: attachKind, ...prep });
      attachFor = res.bill;
      upsert(res.bill);
      if (res.ocr && (res.ocr.date || res.ocr.amount || res.ocr.vendor) && !found) found = res.ocr;
      Object.entries(res.filled || {}).forEach(([k, v]) => { if (!(k in filled)) { filled[k] = v; prev[k] = (res.prev || {})[k] ?? before[k] ?? ''; } });
      render();
    } catch (err) {
      busyEnd();
      showStatus('อัปโหลดไม่สำเร็จ: ' + err.message);
      return;
    }
  }
  busyEnd();
  const b = attachFor;
  const inDlg = editing && editing.id === b.id && dlg.open;
  if (inDlg) {
    // กำลังแก้อยู่: ใส่เฉพาะช่องที่ระบบเติม (ช่องอื่นที่พิมพ์ค้างไว้ไม่หาย)
    const f = form.elements;
    Object.entries(filled).forEach(([k, v]) => { if (f[k]) f[k].value = v; });
    editing = { ...b };
    f.status.value = b.status;
    renderFiles(); renderSteps(); renderCats(); renderVat();
  } else {
    openDlg(b);
  }
  showRead(found, filled, prev, b);
});

/* แสดงว่าอ่านอะไรได้ และเติมอะไรให้แล้ว (กดใช้ค่าเดิมได้) */
function showRead(ocr, filled, prev, b) {
  const box = $('#bSuggest');
  box.innerHTML = '';
  const f = form.elements;
  const NAME = { date: 'วันที่', amount: 'ยอด', vendor: 'ร้าน', cat: 'หมวด', desc: 'รายละเอียด', vat: 'VAT', vatAmt: 'ยอด VAT' };
  const show = (k, v) => k === 'date' ? short(v) : (k === 'amount' || k === 'vatAmt') ? baht(v) : k === 'vat' ? (v === 'yes' ? 'มี' : v === 'no' ? 'ไม่มี' : '-') : v;
  const head = document.createElement('p');
  if (!ocr) {
    head.textContent = '📎 แนบแล้ว · อ่านวันที่/ยอดจากไฟล์นี้ไม่ได้ กรอกเองได้เลย';
    box.appendChild(head);
    box.hidden = false;
    return;
  }
  const keys = Object.keys(filled);
  head.textContent = keys.length
    ? '🔎 อ่านจากหลักฐานแล้วเติมให้: ' + keys.map(k => `${NAME[k]} ${show(k, filled[k])}`).join(' · ')
    : '🔎 อ่านจากหลักฐานได้: ' + [ocr.date && 'วันที่ ' + short(ocr.date), ocr.amount && 'ยอด ' + baht(ocr.amount), ocr.vendor && 'ร้าน ' + ocr.vendor].filter(Boolean).join(' · ');
  box.appendChild(head);
  const btns = document.createElement('div');
  btns.className = 'b-sg-btns';
  const add = (label, fn) => {
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'mini';
    x.textContent = label;
    x.onclick = () => { fn(); x.disabled = true; x.textContent = '✓ ' + label; syncCats(); renderVat(); };
    btns.appendChild(x);
  };
  // ย้อนค่าที่เติม (เฉพาะที่เดิมมีค่า)
  keys.filter(k => k !== 'vat' && k !== 'vatAmt' && (k === 'date' || (prev[k] && Number(prev[k]) !== 0))).forEach(k =>
    add(`↩ ใช้${NAME[k]}เดิม ${show(k, prev[k])}`, () => { f[k].value = prev[k]; }));
  // ที่อ่านได้แต่ไม่ได้เติม เพราะไม่อยากทับของเดิม
  if (ocr.date && !('date' in filled) && ocr.date !== f.date.value)
    add(`ใช้วันที่ ${short(ocr.date)}/${String(+ocr.date.slice(0, 4) + 543).slice(2)}`, () => { f.date.value = ocr.date; });
  if (ocr.amount && !('amount' in filled) && Number(ocr.amount) !== Number(f.amount.value)) {
    add(`ใช้ยอด ${baht(ocr.amount)}`, () => { f.amount.value = ocr.amount; });
    if ((b.files || []).length > 1 && Number(f.amount.value))
      add(`รวมยอด = ${baht(Number(f.amount.value) + Number(ocr.amount))}`, () => { f.amount.value = Math.round((Number(f.amount.value) + Number(ocr.amount)) * 100) / 100; });
  }
  if (btns.children.length) box.appendChild(btns);
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = keys.length ? 'บันทึกให้แล้ว · ตรวจอีกครั้ง ถ้าแก้อะไรกด บันทึก' : 'กดปุ่มเพื่อใช้ค่าที่อ่านได้ แล้วกด บันทึก';
  box.appendChild(note);
  box.hidden = false;
}

/* ---------- หน้าจอ "กำลังอ่านใบเสร็จ" ---------- */
let busyTick = null;
function busyStart(img, extra) {
  const t0 = Date.now();
  $('#busyImg').hidden = !img;
  if (img) $('#busyImg').src = img;
  const steps = [[0, 'กำลังส่งรูป…'], [2, 'กำลังอ่านใบเสร็จ…'], [6, 'กำลังหายอดเงิน วันที่ ชื่อร้าน…'], [14, 'ใกล้เสร็จแล้ว…']];
  const tick = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    $('#busyMsg').textContent = steps.filter(x => sec >= x[0]).pop()[1];
    $('#busySub').textContent = [extra, sec + ' วินาที · ปกติใช้ราว 5–10 วินาที'].filter(Boolean).join(' · ');
  };
  clearInterval(busyTick);
  tick();
  busyTick = setInterval(tick, 500);
  $('#busy').hidden = false;
}
function busyEnd() { clearInterval(busyTick); busyTick = null; $('#busy').hidden = true; }

/* 📷 บิลใหม่จากรูป: ส่งครั้งเดียว ระบบสร้างบิล เก็บไฟล์ อ่านข้อมูล แล้วเปิดให้ตรวจ */
async function snapBill(file) {
  const p = parseQuick($('#bInput').value);
  let prep;
  try { prep = await prepare(file); } catch (err) { showStatus(err.message); return; }
  busyStart(prep.thumb);
  const t = { id: uid(), project: p.project };
  if (p.desc) t.desc = p.desc;
  if (p.amount !== null) t.amount = p.amount;
  if (p.date) t.date = p.date;
  let res;
  try { res = await api('bill_snap', { bill: t, ...prep }); }
  catch (err) { busyEnd(); showStatus('อ่านใบเสร็จไม่สำเร็จ: ' + err.message); return; }
  busyEnd();
  $('#bInput').value = '';
  const b = res.bill, ocr = res.ocr || {};
  upsert(b); render();
  openDlg(b);
  const box = $('#bSuggest');
  box.innerHTML = '';
  const got = [ocr.date && 'วันที่', ocr.amount && 'ยอดเงิน', ocr.vendor && 'ชื่อร้าน', ocr.cat && 'หมวด'].filter(Boolean);
  const p1 = document.createElement('p');
  p1.textContent = got.length ? '🔎 อ่านได้: ' + got.join(' · ') : '📷 แนบรูปแล้ว แต่อ่านข้อมูลไม่ได้ กรอกเองได้เลย';
  const p2 = document.createElement('p');
  p2.className = 'hint';
  p2.textContent = got.length ? 'ตรวจให้ถูกก่อนกดบันทึก (อ่านอัตโนมัติอาจผิดได้)' : 'รูปชัด ไม่เอียง เห็นทั้งใบ จะอ่านได้ดีขึ้น';
  box.append(p1, p2);
  box.hidden = false;
  if (!ocr.amount && !p.amount) setTimeout(() => form.elements.amount.focus(), 60);
}

/* ย่อรูปก่อนส่ง (ประหยัดเน็ตและพื้นที่) + ทำรูปเล็กไว้แสดงในแอป */
async function prepare(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF ใหญ่เกิน 10MB');
    return { mime: 'application/pdf', data: await toB64(file), thumb: '' };
  }
  const img = await loadImage(file);
  return {
    mime: 'image/jpeg',
    data: draw(img, 1800, 0.82).split(',')[1],
    thumb: draw(img, 160, 0.6),
  };
}
function loadImage(file) {
  return new Promise((ok, bad) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => bad(new Error('เปิดรูปนี้ไม่ได้'));
    img.src = url;
  });
}
function draw(img, max, q) {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r);
  c.height = Math.round(img.naturalHeight * r);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
function toB64(file) {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => bad(new Error('อ่านไฟล์ไม่ได้'));
    r.readAsDataURL(file);
  });
}

/* ---------- ใบเบิก (แยก/รวม มี VAT · ไม่มี VAT) ---------- */
const cDlg = $('#cDlg');
let cVat = '*';
$('#cSplit').checked = LS.get('claimSplit', false);
$('#cSplit').onchange = () => { LS.set('claimSplit', $('#cSplit').checked); updateTotal(); };
$('#cAttach').checked = LS.get('claimAttach', true);
$('#cAttach').onchange = () => LS.set('claimAttach', $('#cAttach').checked);
$('#cVat').querySelectorAll('button').forEach(x => x.onclick = () => { cVat = x.dataset.v; renderClaim(); });
$('#btnClaim').onclick = () => {
  const ready = bills.filter(b => b.status === 'ready');
  const projs = [...new Set(ready.map(b => b.project || ''))];
  const sel = $('#cProj');
  sel.innerHTML = '';
  sel.add(new Option('ทั้งหมด', '*'));
  projs.forEach(p => sel.add(new Option(p || 'ไม่ระบุโปรเจ็ค', p)));
  cVat = '*';
  renderClaim();
  loadCfg();
  cDlg.showModal();
};
$('#cProj').onchange = renderClaim;
function claimItems() {
  return [...$('#cList').querySelectorAll('input:checked')].map(i => bills.find(b => b.id === i.value)).filter(Boolean);
}
const isVat = b => vatOf(b) === 'yes';
function renderClaim() {
  const p = $('#cProj').value;
  $('#cVat').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === cVat));
  const list = bills.filter(b => b.status === 'ready' && (p === '*' || (b.project || '') === p)
      && (cVat === '*' || (cVat === 'yes' ? isVat(b) : !isVat(b))))
    .sort((a, b) => (isVat(b) - isVat(a)) || (a.date || '').localeCompare(b.date || ''));
  const box = $('#cList');
  box.innerHTML = '';
  let lastGroup = null;
  list.forEach(b => {
    const g = isVat(b) ? 'yes' : 'no';
    if (cVat === '*' && g !== lastGroup) {
      const h = document.createElement('p');
      h.className = 'c-group';
      h.textContent = g === 'yes' ? '🧾 มี VAT' : 'ไม่มี VAT';
      box.appendChild(h);
      lastGroup = g;
    }
    const lab = document.createElement('label');
    lab.className = 'meet';
    lab.innerHTML = '<input type="checkbox" checked><span><span class="t"></span><span class="s"></span></span><b class="c-amt"></b>';
    lab.querySelector('input').value = b.id;
    lab.querySelector('.t').textContent = b.desc;
    lab.querySelector('.s').textContent = [short(b.date), b.project, isVat(b) ? 'VAT ' + baht(vatAmtOf(b)) : '', (b.files || []).map(f => KIND[f.kind].name).join(', ')].filter(Boolean).join(' · ');
    lab.querySelector('.c-amt').textContent = baht(b.amount);
    lab.querySelector('input').onchange = updateTotal;
    box.appendChild(lab);
  });
  if (!list.length) box.innerHTML = '<p class="empty small">ไม่มีรายการพร้อมเบิกตามที่เลือก</p>';
  updateTotal();
}
function claimGroups() {
  const items = claimItems();
  const v = items.filter(isVat), n = items.filter(b => !isVat(b));
  const split = $('#cSplit').checked && v.length && n.length;
  return { items, v, n, split };
}
function updateTotal() {
  const { items, v, n, split } = claimGroups();
  $('#cTotal').textContent = `${baht(sum(items))} (${items.length} รายการ)`;
  $('#cVatSum').textContent = items.length
    ? `🧾 มี VAT ${baht(sum(v))} (ก่อน VAT ${baht(sum(v) - v.reduce((s, b) => s + vatAmtOf(b), 0))} · VAT ${baht(v.reduce((s, b) => s + vatAmtOf(b), 0))}) · ไม่มี VAT ${baht(sum(n))}` +
      (split ? ' · จะออกเป็น 2 ใบ' : '')
    : '';
  $('#cSplitWrap').hidden = !(v.length && n.length);
  const fs = items.flatMap(b => b.files || []);
  const att = fs.filter(f => !isOrig(f)).length;
  $('#cAttachN').textContent = items.length ? `แนบภาพ ${att} ไฟล์ · ใช้ตัวจริง ${fs.length - att} ไฟล์` : '';
  $('#btnSubmitted').disabled = !items.length;
}
function claimNo() {
  const d = new Date();
  return `เบิก-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
/* ชุดเอกสาร: รวม = 1 ใบ (แบ่งหัวข้อ มี/ไม่มี VAT) | แยก = 2 ใบ เลขต่อท้าย -V / -N */
function claimDocs() {
  const { items, v, n, split } = claimGroups();
  const no = claimNo();
  if (split) return [{ no: no + '-V', title: 'รายการที่มี VAT (ใบกำกับภาษี)', groups: [['', v]] }, { no: no + '-N', title: 'รายการที่ไม่มี VAT', groups: [['', n]] }];
  const groups = v.length && n.length ? [['มี VAT', v], ['ไม่มี VAT', n]] : [['', items]];
  return [{ no, title: '', groups }];
}
$('#btnCopy').onclick = async () => {
  const head = ['ลำดับ', 'วันที่', 'รายละเอียด', 'โปรเจ็ค', 'หมวด', 'หลักฐาน', 'VAT', 'ยอดก่อน VAT', 'ยอด VAT', 'จำนวนเงิน'];
  const rows = [];
  claimDocs().forEach((d, di) => {
    if (di) rows.push([]);
    rows.push([d.no + (d.title ? ' · ' + d.title : '')], head);
    let i = 0;
    d.groups.forEach(([g, list]) => {
      if (g) rows.push(['', '', g]);
      list.forEach(b => rows.push([++i, b.date, b.desc, b.project, b.cat, (b.files || []).map(f => KIND[f.kind].name).join(', '),
        isVat(b) ? 'มี' : 'ไม่มี', Number(b.amount) - vatAmtOf(b), vatAmtOf(b), Number(b.amount)]));
    });
    const all = d.groups.flatMap(x => x[1]);
    const vt = all.reduce((s, b) => s + vatAmtOf(b), 0);
    rows.push(['', '', 'รวม', '', '', '', '', sum(all) - vt, vt, sum(all)]);
  });
  const tsv = rows.map(r => r.join('\t')).join('\n');
  try { await navigator.clipboard.writeText(tsv); $('#btnCopy').textContent = '✅ คัดลอกแล้ว'; }
  catch { prompt('คัดลอกตารางนี้', tsv); }
  setTimeout(() => { $('#btnCopy').textContent = '📋 คัดลอกตาราง (วางใน Excel/อีเมล)'; }, 2500);
};
/* ---------- ข้อมูลบนใบเบิก (เก็บที่ระบบ ใช้ได้ทุกเครื่อง) ---------- */
const CFG_DEFAULT = { company: 'บริษัท ทีไอบีดี จำกัด', short: 'TIBD', addr: '8/24 ซอยนาวงประชาพัฒนา 6 แขวงสีกัน เขตดอนเมือง กรุงเทพมหานคร',
  contact: 'โทร. 097-297-1777  Email : nutto0925@gmail.com', payer: 'นายณัชพล สมรักษ์', payee: 'นิติธร สีดำ', payeeAddr: '', payeeId: '', wht: '', idFile: '', idShow: true };
const CF = { company: '#cfCompany', short: '#cfShort', addr: '#cfAddr', contact: '#cfContact', payer: '#cfPayer', payee: '#cfPayee', payeeAddr: '#cfPayeeAddr', payeeId: '#cfPayeeId', wht: '#cfWht' };
let claimCfg = { ...CFG_DEFAULT, ...LS.get('claimCfg', {}) };
function fillCfg() {
  Object.entries(CF).forEach(([k, sel]) => { $(sel).value = claimCfg[k] || ''; });
  $('#cfIdShow').checked = claimCfg.idShow !== false;
  $('#cfIdState').textContent = claimCfg.idFile ? '✅ อัปโหลดแล้ว' : 'ยังไม่มี';
  $('#cfIdDel').hidden = !claimCfg.idFile;
  $('#cfIdBtn').textContent = claimCfg.idFile ? '📇 เปลี่ยนรูปบัตร' : '📇 อัปโหลดสำเนาบัตรประชาชน';
}
function saveCfg() { LS.set('claimCfg', claimCfg); clearTimeout(cfgTimer); cfgTimer = setTimeout(() => api('claim_cfg_set', { cfg: claimCfg }).catch(() => {}), 500); }
$('#cfIdShow').onchange = () => { claimCfg.idShow = $('#cfIdShow').checked; saveCfg(); };
$('#cfIdBtn').onclick = () => { $('#cfIdFile').value = ''; $('#cfIdFile').click(); };
$('#cfIdFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('#cfIdState').textContent = 'กำลังอัปโหลด…';
  try {
    const prep = await prepare(file);
    const r = await api('claim_idcard', { data: prep.data, mime: prep.mime });
    claimCfg = { ...claimCfg, ...r.cfg };
    if (r.idNo && !claimCfg.payeeId) claimCfg.payeeId = r.idNo;   // อ่านเลขบัตรจากรูปได้ = เติมให้
    LS.set('claimCfg', claimCfg);
    if (r.idNo) api('claim_cfg_set', { cfg: claimCfg }).catch(() => {});
    fillCfg();
    $('#cfIdState').textContent = '✅ อัปโหลดแล้ว' + (r.idNo ? ' · อ่านเลขบัตรให้แล้ว ตรวจอีกครั้ง' : '');
  } catch (err) { $('#cfIdState').textContent = 'อัปโหลดไม่สำเร็จ: ' + err.message; }
};
$('#cfIdDel').onclick = async () => {
  if (!confirm('ลบสำเนาบัตรประชาชนออกจากระบบ? (ไฟล์จะไปอยู่ถังขยะของ Google Drive)')) return;
  try { const r = await api('claim_idcard', { remove: true }); claimCfg = { ...claimCfg, ...r.cfg }; LS.set('claimCfg', claimCfg); fillCfg(); }
  catch (err) { showStatus('ลบไม่สำเร็จ: ' + err.message); }
};
let cfgTimer = null;
Object.entries(CF).forEach(([k, sel]) => $(sel).addEventListener('input', () => {
  claimCfg[k] = $(sel).value.trim();
  saveCfg();
}));
async function loadCfg() {
  fillCfg();
  try { const { cfg } = await api('claim_cfg'); if (cfg && Object.keys(cfg).length) { claimCfg = { ...CFG_DEFAULT, ...cfg }; LS.set('claimCfg', claimCfg); fillCfg(); } } catch {}
  if (!claimCfg.payee) $('#cCfg').open = true;   // ยังไม่ได้ใส่ชื่อผู้รับเงิน = เปิดให้กรอก
}

/* ตัวเลขเป็นคำอ่านภาษาไทย เช่น 5504 → ห้าพันห้าร้อยสี่บาทถ้วน */
function bahtText(n) {
  const D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'], U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const read = (s, high) => {
    s = String(s).replace(/^0+/, '');
    if (!s) return '';
    if (s.length > 6) return read(s.slice(0, -6)) + 'ล้าน' + read(s.slice(-6), true);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const d = +s[i], pos = s.length - i - 1;
      if (!d) continue;
      if (pos === 0 && d === 1 && (s.length > 1 || high)) out += 'เอ็ด';
      else if (pos === 1 && d === 2) out += 'ยี่';
      else if (pos === 1 && d === 1) out += '';
      else out += D[d];
      out += U[pos];
    }
    return out;
  };
  const [bt, st] = Math.abs(Number(n) || 0).toFixed(2).split('.');
  return (read(bt) || 'ศูนย์') + 'บาท' + (+st ? read(st) + 'สตางค์' : 'ถ้วน');
}
const thDate = d => new Date((d || today()) + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
const thMonth = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

/* ---------- พิมพ์ใบเบิก: ใบสำคัญรับเงิน + รายงานสรุปแยกหมวด + รายการพร้อมภาพหลักฐาน ---------- */
$('#btnPrint').onclick = async () => {
  if (!claimItems().length) return;
  const w = window.open('', '_blank');   // เปิดทันที (กันบล็อกป๊อปอัป) แล้วค่อยใส่เนื้อหา
  if (!w) { showStatus('เบราว์เซอร์บล็อกหน้าต่างใหม่ ลองอนุญาตป๊อปอัป'); return; }
  w.document.write('<p style="font-family:system-ui;padding:32px">กำลังเตรียมใบเบิกและภาพหลักฐาน…</p>');
  const c = claimCfg;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const docs = claimDocs();
  const attach = $('#cAttach').checked;
  let imgs = {};
  const need = attach ? docs.flatMap(d => d.groups.flatMap(g => g[1])).flatMap(b => (b.files || []).filter(f => !isOrig(f))).map(f => f.id) : [];
  const showId = c.idFile && c.idShow !== false;
  if (showId) need.push(c.idFile);
  if (need.length) { try { imgs = (await api('bill_images', { fileIds: need })).images || {}; } catch (e) { imgs = {}; } }

  const head = `<div class="co"><b>${esc(c.company)}</b><div>${esc(c.addr)}</div><div>${esc(c.contact)}</div></div>`;
  const doc = (d, idx) => {
    const all = d.groups.flatMap(x => x[1]).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const total = sum(all);
    const months = [...new Set(all.map(b => (b.date || '').slice(0, 7)))].sort();
    const period = months.length === 1 ? 'ประจำเดือน' + thMonth(months[0]) : 'ระหว่าง ' + thMonth(months[0]) + ' – ' + thMonth(months[months.length - 1]);
    // แยกหมวด
    const cats = [];
    all.forEach(b => { const k = (b.cat || '').trim() || 'อื่นๆ'; let g = cats.find(x => x[0] === k); if (!g) cats.push(g = [k, []]); g[1].push(b); });
    const wht = Number(c.wht) || 0, whtAmt = Math.round(total * wht) / 100, net = total - whtAmt;
    const vatT = all.reduce((s, b) => s + vatAmtOf(b), 0);

    // 1) ใบสำคัญรับเงิน (ตามฟอร์มบริษัท)
    const idDigits = String(c.payeeId || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split('');
    const boxes = (arr) => `<div class="bx">${arr.map(x => `<span>${x.trim() ? esc(x) : '&nbsp;'}</span>`).join('')}</div>`;
    const ROWS = Math.max(13, cats.length);
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const g = cats[i];
      let rem = '';
      if (i < 4 || i >= 7) rem = i === 7 ? `<td class="rem" rowspan="${ROWS - 7}"></td>` : (i > 7 ? '' : '<td class="rem"></td>');
      if (i === 4) rem = `<td class="sb"><span>จำนวนเต็ม</span><b>${r2(total)}</b><span>บาท</span></td>`;
      if (i === 5) rem = `<td class="sb tax"><span>ภาษี</span><i>${wht ? wht : ''}</i><span>%</span><b>${wht ? r2(whtAmt) : ''}</b><span>บาท</span></td>`;
      if (i === 6) rem = `<td class="sb"><span>รับจริง</span><b>${r2(net)}</b><span>บาท</span></td>`;
      return `<tr><td class="c">${i + 1}</td><td></td><td>${g ? esc(g[0]) : ''}</td><td class="r">${g ? r2(sum(g[1])) : ''}</td>${rem}</tr>`;
    }).join('');
    const vDate = (() => { const t = new Date(); const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${t.getDate()}-${M[t.getMonth()]}-${String(t.getFullYear() + 543).slice(2)}`; })();
    const idCard = showId && imgs[c.idFile] ? `<img class="idimg" src="${imgs[c.idFile].src}" alt="">` : '';
    const voucher = `<section class="page vch${idx ? ' pb' : ''}">
<div class="vh"><img class="logo" src="${new URL('logo-tibd.png', location.href).href}" alt="" onerror="this.remove()"><div><b>${esc(c.company)}</b><b>${esc(c.addr)}</b><b>${esc(c.contact)}</b></div></div>
<div class="vt-row"><div class="vt">ใบสำคัญรับเงิน</div></div>
<div class="vdate">วันที่ <span class="dl">${vDate}</span></div>
<div class="pl">
  <div class="pl-l">
    <p class="lb">รายละเอียดผู้รับเงิน</p>
    <div class="pf"><span>ชื่อ</span><div class="ln">${idCard ? '' : esc(c.payee)}</div></div>
    <div class="pf"><span>ที่อยู่</span><div class="ln">${idCard ? '' : esc(c.payeeAddr || '')}</div></div>
    <div class="pf"><span></span><div class="ln"></div></div>
    <div class="pf"><span></span><div class="ln"></div></div>
    ${idCard}
  </div>
  <div class="pl-r">
    <div>เลขที่บัตรประจำตัวประชาชน</div>${boxes(idDigits)}
    <div>เลขที่ประจำตัวผู้เสียภาษี</div>${boxes(Array(10).fill(' '))}
  </div>
</div>
<p class="rcv">ได้รับเงินจาก${esc(c.company)} เรียบร้อยแล้ว ดังรายการต่อไปนี้</p>
<table class="vtb"><colgroup><col style="width:9%"><col style="width:15%"><col style="width:36%"><col style="width:14%"><col style="width:26%"></colgroup>
<thead><tr><th>ลำดับที่</th><th>รหัสส่วนงาน</th><th>รายการ</th><th>จำนวนเงิน<br>(บาท)</th><th>หมายเหตุ</th></tr></thead>
<tbody>${rows}
<tr class="wd"><td>ตัวอักษร</td><td colspan="2" class="c">${bahtText(total)}</td><td class="r">${r2(total)}</td><td class="rem"></td></tr></tbody></table>
<div class="vsg"><div><div>ลงชื่อ <span class="dl w"></span></div><div>( <span class="dl n">${esc(c.payer)}</span> )</div><div>ผู้จ่าย</div></div>
<div><div>ลงชื่อ <span class="dl w"></span></div><div>( <span class="dl n">${esc(c.payee)}</span> )</div><div>ผู้รับเงิน</div></div></div>
<div class="vft"><u>หมายเหตุ&nbsp; สำหรับบุคคลภายนอก&nbsp; การรับชำระเงินในแต่ละครั้ง&nbsp; ผู้รับเงินจะต้องแนบสำเนาบัตรประจำตัวประชาชน</u><br>พร้อมลงลายมือชื่อรับรองเอกสาร</div>
</section>`;

    // 2) รายงานสรุป + 3) รายละเอียดแต่ละหมวดพร้อมภาพ
    let no = 0;
    const item = b => {
      no++;
      const files = b.files || [];
      const shots = attach ? files.filter(f => !isOrig(f)) : [];
      const origs = files.filter(isOrig);
      return `<div class="it"><h4>${no}. ${esc(b.desc)}</h4>
<p class="meta">โปรเจค: ${esc(b.project || '-')} &nbsp;|&nbsp; จำนวนเงิน: ${r2(b.amount)} บาท &nbsp;|&nbsp; ที่มา: ${esc(b.vendor || '-')} &nbsp;|&nbsp; วันที่: ${thDate(b.date)}${isVat(b) ? ` &nbsp;|&nbsp; VAT ${r2(vatAmtOf(b))} บาท` : ''}</p>
${b.note ? `<p class="note">หมายเหตุ: ${esc(b.note)}</p>` : ''}
${origs.length ? `<p class="orig">📄 ${origs.map(f => esc(KIND[f.kind].name)).join(', ')} ตัวจริงแนบแยก</p>` : ''}
${shots.map(f => imgs[f.id] ? `<img src="${imgs[f.id].src}" alt="">` : `<p class="miss">โหลดภาพไม่ได้ · <a href="${esc(f.url)}">เปิดไฟล์</a></p>`).join('')}
${!files.length ? '<p class="miss">ยังไม่มีหลักฐาน</p>' : ''}</div>`;
    };
    const report = `<section class="page pb">
<h2 class="rt">${esc(c.company)}${c.short ? ' (' + esc(c.short) + ')' : ''}</h2>
<h3 class="rt">รายงานสรุปค่าใช้จ่ายสำรองจ่าย ${period}</h3>
<p class="rt small">ผู้สำรองจ่าย: ${esc(c.payee || '-')} &nbsp;|&nbsp; จัดทำวันที่ ${thDate(today())} &nbsp;|&nbsp; เลขที่ ${esc(d.no)}${d.title ? ' &nbsp;|&nbsp; ' + esc(d.title) : ''}</p>
<p class="lb">สรุปยอดรวมแต่ละหมวด</p>
<table class="bt"><thead><tr><th>หมวดหมู่</th><th class="c" style="width:120px">จำนวนรายการ</th><th class="r" style="width:150px">ยอดรวม (บาท)</th></tr></thead><tbody>
${cats.map(([k, list]) => `<tr><td>หมวด${esc(k)}</td><td class="c">${list.length}</td><td class="r">${r2(sum(list))}</td></tr>`).join('')}
<tr class="tot"><td>รวมทั้งสิ้น</td><td class="c">${all.length}</td><td class="r">${r2(total)}</td></tr></tbody></table>
${cats.map(([k, list]) => `<div class="cat"><p class="lb">หมวด${esc(k)}</p><p class="ct">รวมหมวดนี้ <b>${r2(sum(list))}</b> บาท (${list.length} รายการ)</p>${list.map(item).join('')}</div>`).join('')}
</section>`;
    return voucher + report;
  };
  w.document.open();
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${docs.map(d => d.no).join(' + ')}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:14mm 14mm}body{font-family:"Sarabun","TH Sarabun New",system-ui,sans-serif;color:#111;font-size:14px;margin:0}
.page{max-width:780px;margin:0 auto}.pb{page-break-before:always;break-before:page}
.co{text-align:center;line-height:1.5;margin-bottom:6px}.co b{font-size:18px}
h1.vt{text-align:center;font-size:20px;margin:10px 0 0}.rt{text-align:center;margin:2px 0}h2.rt{font-size:19px}h3.rt{font-size:17px}
p{margin:6px 0}.r{text-align:right}.c{text-align:center}.small{font-size:12.5px;color:#444}.lb{font-weight:700;margin-top:14px}
table.bt{width:100%;border-collapse:collapse;margin:8px 0}table.bt th{background:#1d5fbf;color:#fff;font-weight:600;padding:7px 8px;border:1px solid #1d5fbf}
table.bt td{border:1px solid #999;padding:6px 8px}table.bt tr.tot td{font-weight:700;background:#f1f4f9}
.sign{display:flex;justify-content:space-between;margin-top:40px;text-align:center;line-height:2}.sign div{width:46%}
.vch{font-family:"Sarabun",serif;font-size:15px}.vh{display:flex;align-items:center;gap:14px}.vh .logo{height:58px}.vh b{display:block;font-size:16.5px;line-height:1.35}
.vt-row{margin:8px 0 0}.vt{display:inline-block;border:1.5px solid #000;padding:4px 44px;font-weight:700;font-size:18px}
.vdate{text-align:right;margin:2px 0 4px}.dl{display:inline-block;min-width:150px;border-bottom:1px dotted #000;text-align:center;padding:0 6px}.dl.w{min-width:230px}.dl.n{min-width:230px}
.pl{display:flex;gap:16px;align-items:flex-start}.pl-l{flex:1;position:relative;min-height:196px}.pl-r{width:47%;padding-top:20px;font-size:14.5px}
.lb{font-weight:700;margin:0 0 6px}.pf{display:flex;align-items:flex-end;gap:10px;height:28px}.pf span{width:44px}.pf .ln{flex:1;border-bottom:1px dotted #000;padding:0 4px 1px}
.idimg{position:absolute;left:48px;top:22px;width:7.2cm;height:4.55cm;object-fit:contain;object-position:left top;border-radius:6px}
.bx{display:flex;margin:2px 0 8px}.bx span{width:22px;height:24px;border:1px solid #2b4ccf;margin-left:-1px;display:flex;align-items:center;justify-content:center;font-size:14px}
.rcv{margin:14px 0 4px}
table.vtb{width:100%;border-collapse:collapse;table-layout:fixed}table.vtb th,table.vtb td{border:1px solid #000;padding:1px 6px;height:22px;font-size:14px}
table.vtb th{font-weight:700;text-align:center;line-height:1.25}
table.vtb td.sb{padding:0 4px}table.vtb td.sb{display:table-cell}.sb span,.sb b,.sb i{display:inline-block}.sb span:first-child{width:66px}.sb b{width:calc(100% - 66px - 36px);text-align:right;font-weight:400;border-bottom:1px dotted #000}.sb span:last-child{width:30px;text-align:right}
.sb.tax span:first-child{width:46px;text-align:center}.sb.tax i{width:26px;font-style:normal;text-align:center;border-left:1px solid #000;border-right:1px solid #000}.sb.tax span:nth-child(3){width:18px;text-align:center}.sb.tax b{width:calc(100% - 46px - 26px - 18px - 36px)}
tr.wd td:first-child{white-space:nowrap;font-size:13.5px;padding:2px 3px}
.vsg{display:flex;justify-content:space-between;border:1px solid #000;border-bottom:0;margin-top:6px;padding:10px 16px 6px}.vsg>div{width:48%;line-height:1.95}.vsg>div>div:last-child{text-align:center}.vsg>div>div:nth-child(2){padding-left:26px}
.vft{border:1px solid #000;text-align:center;font-size:13.5px;padding:6px 8px;line-height:1.9}
.payee{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.idc{flex:none;text-align:center}.idc img{display:block;width:8.6cm;max-height:5.6cm;object-fit:contain;border:1px solid #ccc}.idc small{font-size:11px;color:#444}
.foot{font-size:11.5px;color:#444;margin-top:28px;border-top:1px solid #ccc;padding-top:6px}.id{letter-spacing:2px}
.cat{margin-top:18px}.cat>.lb,.ct{break-after:avoid;page-break-after:avoid}.ct{color:#444}.ct b{color:#c2410c;font-size:16px}
.it{margin:14px 0 18px;break-inside:avoid-page}.it h4{font-size:16px;margin:0}.meta{font-size:13px;color:#333;margin:2px 0}
.note{color:#b91c1c;font-style:italic;font-size:13px}.orig{font-size:13px;color:#92400e}.miss{color:#b45309;font-size:13px}
.it img{display:block;max-width:100%;max-height:10.5cm;margin:6px 0;border:1px solid #ddd;break-inside:avoid}
a{color:#0f766e}</style></head><body>
${docs.map(doc).join('')}
<script>window.onload=()=>setTimeout(()=>window.print(),700)<\/script></body></html>`);
  w.document.close();
};
$('#btnCCancel').onclick = () => cDlg.close();
$('#btnSubmitted').onclick = async () => {
  const items = claimItems();
  if (!items.length) return;
  const docs = claimDocs();
  cDlg.close();
  go('list/submitted');
  toast(`📤 ส่งเบิกแล้ว · ${items.length} รายการ` + (docs.length > 1 ? ' (2 ใบ)' : ''), () => mark(items.map(b => b.id), 'ready'));
  for (const d of docs) await mark(d.groups.flatMap(x => x[1]).map(b => b.id), 'submitted', d.no);
};

/* เปลี่ยนสถานะแบบแตะเดียว + ปุ่มยกเลิก (ย้อนกลับได้ 6 วินาที) */
let toastTimer = null;
function toast(msg, undo) {
  $('#toastMsg').textContent = msg;
  $('#toastUndo').hidden = !undo;
  $('#toastUndo').onclick = () => { $('#toast').hidden = true; if (undo) undo(); };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}
async function quickMark(list, status, quiet) {
  const prev = list.map(b => [b.id, b.status]);
  const label = { draft: '📝 ขาดหลักฐาน', ready: '📎 พร้อมเบิก', submitted: '📤 ส่งเบิกแล้ว', paid: '✅ ได้เงินแล้ว' }[status];
  const what = list.length === 1 ? (list[0].desc || 'รายการนี้') : `${list.length} รายการ`;
  if (!quiet) toast(`${label} · ${what}`, async () => {
    // ย้อนกลับ: แยกตามสถานะเดิม
    const by = {};
    prev.forEach(([id, st]) => { (by[st] = by[st] || []).push(id); });
    for (const st of Object.keys(by)) await mark(by[st], st, st === 'submitted' ? claimNo() : '');
  });
  await mark(list.map(b => b.id), status, status === 'submitted' ? claimNo() : '');
}

async function mark(ids, status, claim) {
  ids.forEach(id => {
    const b = bills.find(x => x.id === id);
    if (!b) return;
    b.status = status;
    if (claim) b.claim = claim;
    if (status === 'submitted') { b.submitted = today(); b.paid = ''; }
    if (status === 'paid') b.paid = today();
    if (status === 'ready' || status === 'draft') { b.submitted = ''; b.paid = ''; b.claim = ''; }
  });
  LS.set('bills', bills);
  render();
  try {
    const { bills: changed } = await api('bill_mark', { ids, status, claim });
    changed.forEach(upsert);
    render();
  } catch (e) { showStatus('อัปเดตไม่สำเร็จ: ' + e.message); }
}

/* ---------- เลือกเดือน ---------- */
$('#mPrev').onclick = () => { sumMonth = addMonth(sumMonth, -1); render(); };
$('#mNext').onclick = () => { if (sumMonth < today().slice(0, 7)) { sumMonth = addMonth(sumMonth, 1); render(); } };
$('#mLabel').onclick = () => { sumMonth = today().slice(0, 7); render(); };

/* ---------- เริ่มต้น ---------- */
$('#btnSync').onclick = sync;
route();
sync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
