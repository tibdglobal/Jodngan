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
  draft: '📝 ขาดหลักฐาน', ready: '📎 พร้อมเบิก', submitted: '📤 ยื่นแล้ว', paid: '✅ ได้เงินแล้ว',
};

let bills = LS.get('bills', []);
let tab = 'all';        // สถานะในหน้าย่อย (all = ทั้งหมด)
let view = 'home';      // home = หน้าหลักเบิกเงิน | list = รายการ | summary = สรุป
let snapNew = false;    // กด 📷 = สร้างบิลใหม่จากรูป
let editing = null;      // บิลที่เปิดอยู่
let attachFor = null;    // บิลที่กำลังแนบหลักฐาน
let attachKind = '';
let sumMonth = '';       // เดือนที่ดูในหน้าสรุป (yyyy-mm)

/* ---------- ช่วยเหลือ ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const short = s => { if (!s) return ''; const [, m, d] = s.split('-'); return `${+d}/${+m}`; };
const baht = n => '฿' + Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sum = list => list.reduce((s, b) => s + Number(b.amount || 0), 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[-.]/g, '');
const hasProof = b => (b.files || []).some(f => ['taxinv', 'receipt', 'cert'].includes(f.kind));

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
  $('#vBack').hidden = view === 'home';
  $('#vToApp').hidden = view !== 'home';
  $('#vSub').hidden = view !== 'home';
  $('#vTitle').textContent = view === 'home' ? 'เบิกเงิน' : view === 'summary' ? 'สรุปและย้อนหลัง'
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

  if (view === 'summary') { const sb = $('#vSum'); sb.innerHTML = ''; renderSummary(sb); return; }
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
      btn.onclick = () => mark(whole.map(b => b.id), 'paid');
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

/* ---------- เปลี่ยนหน้า (ใช้ # เพื่อให้ปุ่มย้อนกลับของมือถือใช้ได้) ---------- */
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('list/')) { view = 'list'; tab = ['draft', 'ready', 'submitted', 'paid', 'all'].includes(h.slice(5)) ? h.slice(5) : 'all'; }
  else if (h === 'summary') view = 'summary';
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
  body.querySelector('.meta').textContent = [short(b.date), b.cat, b.pay, view === 'list' && tab !== 'all' ? '' : ST[b.status]].filter(Boolean).join(' · ');
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
  if (b.status === 'draft' || b.status === 'ready') {
    const at = document.createElement('button');
    at.className = 'edit-btn' + (b.status === 'draft' ? ' strong' : '');
    at.type = 'button';
    at.textContent = '📎 แนบ';
    at.onclick = () => askKind(b);
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
$('#goClaim').onclick = () => $('#btnClaim').onclick();
$('#vBack').onclick = () => go('');

/* ---------- แก้ไข ---------- */
const dlg = $('#bDlg'), form = $('#bForm');
function openDlg(b) {
  editing = b;
  const f = form.elements;
  ['date', 'amount', 'desc', 'project', 'cat', 'pay', 'vendor', 'note', 'status'].forEach(k => { f[k].value = b[k] ?? ''; });
  if (!Number(b.amount)) f.amount.value = '';
  $('#bSuggest').hidden = true;
  renderFiles();
  if (!dlg.open) dlg.showModal();
  if (!Number(b.amount)) setTimeout(() => f.amount.focus(), 50);
}
function renderFiles() {
  const box = $('#bFiles');
  box.innerHTML = '';
  const files = (editing && editing.files) || [];
  if (!files.length) { box.innerHTML = '<p class="hint">ยังไม่มี แนบได้ทีหลัง</p>'; return; }
  files.forEach(f => {
    const a = document.createElement('div');
    a.className = 'b-file';
    const link = document.createElement('a');
    link.href = f.url; link.target = '_blank'; link.rel = 'noopener';
    if (f.thumb) { const img = document.createElement('img'); img.src = f.thumb; img.alt = ''; link.appendChild(img); }
    else { const i = document.createElement('span'); i.className = 'ficon'; i.textContent = f.mime === 'application/pdf' ? 'PDF' : '📄'; link.appendChild(i); }
    const cap = document.createElement('span');
    cap.textContent = KIND[f.kind].name;
    link.appendChild(cap);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'b-x'; x.textContent = '×'; x.setAttribute('aria-label', 'เอาหลักฐานนี้ออก');
    x.onclick = async () => {
      if (!confirm('เอาหลักฐานนี้ออก? (ไฟล์จะไปอยู่ถังขยะของ Google Drive)')) return;
      try {
        const { bill } = await api('bill_unfile', { id: editing.id, fileId: f.id });
        editing = bill; upsert(bill); renderFiles(); form.elements.status.value = bill.status; render();
      } catch (e) { showStatus('เอาออกไม่สำเร็จ: ' + e.message); }
    };
    a.append(link, x);
    box.appendChild(a);
  });
}
form.addEventListener('submit', async () => {
  if (!editing) return;
  const f = form.elements;
  const b = { ...editing };
  ['date', 'desc', 'project', 'cat', 'pay', 'vendor', 'note'].forEach(k => { b[k] = f[k].value.trim(); });
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
  if (isSnap) {
    // สร้างบิลก่อน (ใช้ข้อความที่พิมพ์ไว้ถ้ามี)
    const p = parseQuick($('#bInput').value);
    const now = new Date().toISOString();
    const nb = { id: uid(), date: p.date || today(), amount: p.amount ?? 0, desc: p.desc || 'รอใส่รายละเอียด', project: p.project,
      cat: '', pay: '', vendor: '', status: 'draft', files: [], note: '', created: now };
    nb.typed = !!p.desc;
    showStatus('กำลังสร้างบิล…', true);
    try { attachFor = { ...(await api('bill_save', { bill: nb })).bill, typed: nb.typed, typedAmt: p.amount !== null, typedDate: !!p.date }; }
    catch (err) { showStatus('สร้างบิลไม่สำเร็จ: ' + err.message); return; }
    $('#bInput').value = '';
    upsert(attachFor);
    render();
  }
  if (!attachFor) return;
  let found = null;   // วันที่/ยอดที่อ่านได้จากหลักฐาน
  for (let i = 0; i < files.length; i++) {
    showStatus(`กำลังอัปโหลดและอ่านหลักฐาน ${i + 1}/${files.length}…`, true);
    try {
      const prep = await prepare(files[i]);
      const { bill, ocr } = await api('bill_upload', { id: attachFor.id, kind: attachKind, ...prep });
      attachFor = { ...bill, typed: attachFor.typed, typedAmt: attachFor.typedAmt, typedDate: attachFor.typedDate };
      upsert(bill);
      if (ocr && (ocr.date || ocr.amount) && !found) found = ocr;
      if (editing && editing.id === bill.id) { editing = bill; renderFiles(); form.elements.status.value = bill.status; }
      render();
    } catch (err) {
      showStatus('อัปโหลดไม่สำเร็จ: ' + err.message);
      return;
    }
  }
  showStatus(attachFor.status === 'ready' ? '✅ แนบแล้ว รายการนี้พร้อมเบิก' : '✅ แนบแล้ว', true);
  setTimeout(() => showStatus(''), 3000);

  if (isSnap) {
    // บิลใหม่จากรูป: เติมสิ่งที่อ่านได้ให้เลย (ยกเว้นที่พิมพ์มาเอง) แล้วเปิดให้ตรวจ
    const fill = { id: attachFor.id };
    if (found && found.date && !attachFor.typedDate) fill.date = found.date;
    if (found && found.amount && !attachFor.typedAmt) fill.amount = found.amount;
    if (found && found.vendor) { fill.vendor = found.vendor; if (!attachFor.typed) fill.desc = found.vendor; }
    let b = attachFor;
    if (Object.keys(fill).length > 1) {
      b = { ...attachFor, ...fill };
      upsert(b); render();
      try { b = (await api('bill_save', { bill: fill })).bill; upsert(b); render(); } catch {}
    }
    openDlg(b);
    const box = $('#bSuggest');
    box.innerHTML = '';
    const p1 = document.createElement('p');
    p1.textContent = found && (found.date || found.amount) ? '🔎 เติมจากใบเสร็จให้แล้ว' : '📷 แนบรูปแล้ว อ่านวันที่/ยอดไม่ได้ กรอกเองได้เลย';
    const p2 = document.createElement('p');
    p2.className = 'hint';
    p2.textContent = 'ตรวจวันที่ ยอด และรายละเอียด แล้วกดบันทึก';
    box.append(p1, p2);
    box.hidden = false;
    if (!attachFor.typed || !found || !found.vendor) setTimeout(() => form.elements.desc.select(), 60);
    return;
  }

  if (!found) return;
  // ยังไม่ได้ใส่ยอด = เติมให้เลย
  if (found.amount && !Number(attachFor.amount)) {
    const b = { ...attachFor, amount: found.amount };
    upsert(b); render();
    try { upsert((await api('bill_save', { bill: { id: b.id, amount: b.amount } })).bill); } catch {}
    attachFor = b;
    found.amountFilled = true;
  }
  const diffDate = found.date && found.date !== attachFor.date;
  const diffAmt = found.amount && Number(found.amount) !== Number(attachFor.amount);
  if (diffDate || diffAmt || found.amountFilled) {
    if (!editing || editing.id !== attachFor.id) openDlg(attachFor);
    showSuggest(found, diffDate, diffAmt);
  }
});

/* แสดงสิ่งที่อ่านได้จากหลักฐาน ให้กดใช้ค่า (ยังไม่บันทึกจนกด บันทึก) */
function showSuggest(ocr, diffDate, diffAmt) {
  const box = $('#bSuggest');
  box.innerHTML = '';
  const title = document.createElement('p');
  title.textContent = '🔎 อ่านจากหลักฐาน';
  box.appendChild(title);
  const f = form.elements;
  if (ocr.amountFilled) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = `เติมยอด ${baht(ocr.amount)} ให้แล้ว (แก้ได้)`;
    box.appendChild(p);
  }
  const btns = document.createElement('div');
  btns.className = 'b-sg-btns';
  if (diffDate) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini';
    b.textContent = `ใช้วันที่ ${short(ocr.date)}/${String(+ocr.date.slice(0, 4) + 543).slice(2)}`;
    b.onclick = () => { f.date.value = ocr.date; b.disabled = true; b.textContent = '✓ ' + b.textContent; };
    btns.appendChild(b);
  }
  if (diffAmt && !ocr.amountFilled) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini';
    b.textContent = `ใช้ยอด ${baht(ocr.amount)}`;
    b.onclick = () => { f.amount.value = ocr.amount; b.disabled = true; b.textContent = '✓ ' + b.textContent; };
    btns.appendChild(b);
  }
  if (btns.children.length) box.appendChild(btns);
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'ตรวจให้ถูกก่อนกดบันทึก (อ่านอัตโนมัติอาจผิดได้)';
  box.appendChild(note);
  box.hidden = false;
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

/* ---------- ใบเบิก ---------- */
const cDlg = $('#cDlg');
$('#btnClaim').onclick = () => {
  const ready = bills.filter(b => b.status === 'ready');
  const projs = [...new Set(ready.map(b => b.project || ''))];
  const sel = $('#cProj');
  sel.innerHTML = '';
  sel.add(new Option('ทั้งหมด', '*'));
  projs.forEach(p => sel.add(new Option(p || 'ไม่ระบุโปรเจ็ค', p)));
  renderClaim();
  cDlg.showModal();
};
$('#cProj').onchange = renderClaim;
function claimItems() {
  return [...$('#cList').querySelectorAll('input:checked')].map(i => bills.find(b => b.id === i.value)).filter(Boolean);
}
function renderClaim() {
  const p = $('#cProj').value;
  const list = bills.filter(b => b.status === 'ready' && (p === '*' || (b.project || '') === p))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const box = $('#cList');
  box.innerHTML = '';
  list.forEach(b => {
    const lab = document.createElement('label');
    lab.className = 'meet';
    lab.innerHTML = '<input type="checkbox" checked><span><span class="t"></span><span class="s"></span></span><b class="c-amt"></b>';
    lab.querySelector('input').value = b.id;
    lab.querySelector('.t').textContent = b.desc;
    lab.querySelector('.s').textContent = [short(b.date), b.project, (b.files || []).map(f => KIND[f.kind].name).join(', ')].filter(Boolean).join(' · ');
    lab.querySelector('.c-amt').textContent = baht(b.amount);
    lab.querySelector('input').onchange = updateTotal;
    box.appendChild(lab);
  });
  updateTotal();
}
function updateTotal() {
  const items = claimItems();
  $('#cTotal').textContent = `${baht(sum(items))} (${items.length} รายการ)`;
  $('#btnSubmitted').disabled = !items.length;
}
function claimNo() {
  const d = new Date();
  return `เบิก-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
$('#btnCopy').onclick = async () => {
  const items = claimItems();
  const rows = [['ลำดับ', 'วันที่', 'รายละเอียด', 'โปรเจ็ค', 'หมวด', 'หลักฐาน', 'จำนวนเงิน']]
    .concat(items.map((b, i) => [i + 1, b.date, b.desc, b.project, b.cat, (b.files || []).map(f => KIND[f.kind].name).join(', '), Number(b.amount)]))
    .concat([['', '', 'รวม', '', '', '', sum(items)]]);
  const tsv = rows.map(r => r.join('\t')).join('\n');
  try { await navigator.clipboard.writeText(tsv); $('#btnCopy').textContent = '✅ คัดลอกแล้ว'; }
  catch { prompt('คัดลอกตารางนี้', tsv); }
  setTimeout(() => { $('#btnCopy').textContent = '📋 คัดลอกตาราง (วางใน Excel/อีเมล)'; }, 2500);
};
$('#btnPrint').onclick = () => {
  const items = claimItems();
  if (!items.length) return;
  const p = $('#cProj').value;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = items.map((b, i) => `<tr><td>${i + 1}</td><td>${esc(b.date)}</td><td>${esc(b.desc)}${b.vendor ? '<br><small>' + esc(b.vendor) + '</small>' : ''}</td><td>${esc(b.project)}</td><td>${(b.files || []).map(f => `<a href="${esc(f.url)}">${esc(KIND[f.kind].name)}</a>`).join('<br>')}</td><td class="r">${Number(b.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td></tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) { showStatus('เบราว์เซอร์บล็อกหน้าต่างใหม่ ลองอนุญาตป๊อปอัป'); return; }
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${claimNo()}</title>
<style>body{font-family:"IBM Plex Sans Thai",system-ui,sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ccc;padding:6px 8px;vertical-align:top;text-align:left}th{background:#f3f3f3}
.r{text-align:right;white-space:nowrap}tfoot td{font-weight:600}.sign{margin-top:48px;display:flex;justify-content:space-between;font-size:13px}.sign div{width:40%;text-align:center;border-top:1px solid #999;padding-top:6px}
a{color:#0f766e}</style></head><body>
<h1>ใบสรุปขอเบิกเงิน ${esc(claimNo())}</h1><p>${p === '*' ? '' : 'โปรเจ็ค/บริษัท: ' + esc(p || 'ไม่ระบุ') + ' · '}วันที่ ${new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
<table><thead><tr><th>#</th><th>วันที่</th><th>รายละเอียด</th><th>โปรเจ็ค</th><th>หลักฐาน</th><th class="r">จำนวนเงิน (บาท)</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="5" class="r">รวมทั้งสิ้น</td><td class="r">${sum(items).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td></tr></tfoot></table>
<div class="sign"><div>ผู้ขอเบิก</div><div>ผู้อนุมัติ</div></div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
};
$('#btnCCancel').onclick = () => cDlg.close();
$('#btnSubmitted').onclick = async () => {
  const items = claimItems();
  if (!items.length) return;
  cDlg.close();
  await mark(items.map(b => b.id), 'submitted', claimNo());
  go('list/submitted');
};

async function mark(ids, status, claim) {
  ids.forEach(id => {
    const b = bills.find(x => x.id === id);
    if (!b) return;
    b.status = status;
    if (claim) b.claim = claim;
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
