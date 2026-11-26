/* จดครบ — 📌 กล่องฝาก: ลิงก์ โน้ต รูป ที่ยังไม่ใช่งาน (+ 📇 การ์ดข้อมูล / 📋 บันทึกประชุม อยู่ใน inote.js) */
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const cfg = LS.get('cfg', { url: '', key: '' });
if (!cfg.url) cfg.url = DEFAULT_URL;

let items = LS.get('inbox', []);
let filter = LS.get('inboxFilter', '');
let q = '';
let editing = null;
let toastTimer = 0;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const KINDS_DROP = [['', 'ทั้งหมด'], ['due', '⏰ ถึงวันดู'], ['stale', '🕸 ค้างนาน'], ['link', '🔗 ลิงก์'], ['note', '📝 โน้ต'], ['image', '🖼 รูป']];
const KINDS_BOOK = [['', 'ทั้งหมด'], ['pin', '📌 ปักไว้'], ['due', '⏰ ถึงวันดู'], ['note', '📝 โน้ต'], ['meet', '📋 ประชุม/ดูงาน'], ['card', '📇 ข้อมูล'], ['image', '🖼 รูป'], ['link', '🔗 ลิงก์']];
let mode = LS.get('inboxMode', 'drop') === 'book' ? 'book' : 'drop';   // 📥 ฝาก | 📒 บันทึก
const isBook = o => o.kind === 'meet' || o.kind === 'card' || o.book === '1';
const STALE_DAYS = 14;
const ageDays = o => { const d = new Date(String(o.created || '').replace(' ', 'T')); return isNaN(d) ? 0 : Math.floor((Date.now() - d) / 864e5); };
let tagF = LS.get('inboxTag', '');   // #แท็กที่กรองอยู่ (ใช้ร่วมกับประเภท)
const tagsOf = o => String(o.tags || '').split(',').map(s => s.trim()).filter(Boolean);
const isPin = o => o.pin === '1';

/* ---------- ☐ เช็กลิสต์ในโน้ต: บรรทัดที่ขึ้นต้นด้วย ☐ ☑ [ ] [x] (มี - นำหน้าได้) ---------- */
const CK_RE = /^(\s*)(?:[-*]\s*)?(\[( |x|X)?\]|☐|☑|✅)\s*/;
const ckDone = m => /x|☑|✅/i.test(m[2]);
function ckCount(t) {
  const ls = String(t || '').split('\n').map(l => l.match(CK_RE)).filter(Boolean);
  return { n: ls.length, d: ls.filter(ckDone).length };
}
/** สลับติ๊กบรรทัดเช็กลิสต์ลำดับที่ i ในข้อความ (นับเฉพาะบรรทัดเช็กลิสต์) */
function ckToggle(t, i) {
  let k = -1;
  return String(t || '').split('\n').map(l => {
    const m = l.match(CK_RE);
    if (!m || ++k !== i) return l;
    return m[1] + (ckDone(m) ? '☐ ' : '☑ ') + l.slice(m[0].length);
  }).join('\n');
}
/** ข้อความโน้ต → HTML (บรรทัดเช็กลิสต์เป็นช่องติ๊กกดได้) */
function noteHtml(rest) {
  let k = -1;
  const lines = String(rest).split('\n'), out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p class="in-text">${textHtml(para.join('\n'))}</p>`); para = []; } };
  for (const l of lines) {
    const m = l.match(CK_RE);
    if (!m) { para.push(l); continue; }
    flush(); k++;
    const done = ckDone(m);
    out.push(`<button type="button" class="in-ck${done ? ' done' : ''}" data-act="ck" data-i="${k}" role="checkbox" aria-checked="${done}"><span class="box">${done ? '✓' : ''}</span><span>${textHtml(l.slice(m[0].length))}</span></button>`);
  }
  flush();
  return out.join('').replace(/<p class="in-text">\s*<\/p>/g, '');
}

async function api(action, payload = {}) {
  const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action, key: cfg.key, ...payload }), redirect: 'follow' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
function showStatus(msg, ok) { const el = $('#status'); el.textContent = msg || ''; el.hidden = !msg; el.classList.toggle('ok', !!ok); }
function upsert(o) { const i = items.findIndex(x => x.id === o.id); if (i > -1) items[i] = o; else items.push(o); LS.set('inbox', items); }
function drop(id) { items = items.filter(x => x.id !== id); LS.set('inbox', items); }
function toast(msg) {
  $('#toastMsg').textContent = msg;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function busy(msg) { $('#busyMsg').textContent = msg; $('#busy').hidden = false; }
function busyEnd() { $('#busy').hidden = true; }

async function sync() {
  if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่องนี้ กลับไปหน้าหลักแล้วเปิดลิงก์จาก LINE ก่อน'); return; }
  $('#btnSync').classList.add('spin');
  try { items = (await api('inbox_list')).items; LS.set('inbox', items); mergePending(); showStatus(''); render(); flushDrafts(); setTimeout(ocrBackfill, 1500); }
  catch (e) { showStatus('ดึงข้อมูลไม่สำเร็จ: ' + e.message); }
  finally { $('#btnSync').classList.remove('spin'); }
}

/* ---------- แสดงผล ---------- */
function when(s) {
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d)) return '';
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (days === 0) return 'วันนี้ ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'เมื่อวาน';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: days > 300 ? '2-digit' : undefined });
}
function textHtml(t) {
  // ลิงก์ในข้อความกดได้ · #แท็ก เป็นป้าย
  return esc(t).replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, u => `<a href="${/^http/i.test(u) ? u : 'https://' + u}" target="_blank" rel="noopener">${u.length > 48 ? u.slice(0, 46) + '…' : u}</a>`)
    .replace(/(^|\s)#(\S+)/g, '$1<span class="in-tag" data-tag="$2" role="button" tabindex="0" title="ดูเฉพาะ #$2">#$2</span>');
}

/** ข้อความคล้ายรหัส/คีย์: มีคำว่า api key / password / token / secret / รหัสผ่าน หรือมีสายอักขระสุ่มยาว (ตัวเล็ก+ใหญ่+เลข ≥ 24 ตัว) */
function looksSecret(t) {
  t = String(t || '');
  if (/\b(api[\s_-]?key|secret|token|passw(or)?d|md5[\s_-]?key|private[\s_-]?key|client[\s_-]?secret)\b|รหัสผ่าน|พาสเวิร์ด/i.test(t)) return true;
  return (t.match(/[A-Za-z0-9+/_=-]{24,}/g) || []).some(w => /[a-z]/.test(w) && /[A-Z]/.test(w) && /\d/.test(w) && !/^https?/.test(w));
}

/* ---------- ⏰ ให้กลับมาดู ---------- */
const ymd = d => d.toLocaleDateString('sv-SE');
const todayS = () => ymd(new Date());
const isDue = o => o.remind && o.remind <= todayS();
function remHtml(o) {
  if (!o.remind) return '';
  const d = new Date(o.remind + 'T00:00:00'), lbl = isNaN(d) ? o.remind : d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  return isDue(o) ? `<div class="in-rem due">⏰ ถึงวันกลับมาดูแล้ว<button class="mini" data-act="remdone">✓ ดูแล้ว</button><button class="mini ghost" data-act="rem">เลื่อน</button></div>`
    : `<div class="in-rem">⏰ เตือนให้ดู ${esc(lbl)}<button class="mini ghost" data-act="rem">เปลี่ยน</button></div>`;
}
const REM_OPTS = [['พรุ่งนี้', 1], ['อีก 3 วัน', 3], ['สัปดาห์หน้า', 7], ['เดือนหน้า', 30]];
function remPick(o) {
  let dlg = $('#remDlg');
  if (!dlg) {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="remDlg" class="rem-dlg"><form method="dialog"><h2 tabindex="-1" autofocus>⏰ ให้กลับมาดูเมื่อไหร่</h2>
      <div class="rem-opts">${REM_OPTS.map(([n, d]) => `<button type="button" data-d="${d}">${n}</button>`).join('')}<label class="rem-date">📅 เลือกวัน<input type="date"></label></div>
      <div class="dlg-actions"><button type="button" class="danger" data-d="clear">ไม่ต้องเตือน</button><span class="spacer"></span><button type="button" class="ghost" data-d="cancel">ปิด</button></div></form></dialog>`);
    dlg = $('#remDlg');
    dlg.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; const v = b.dataset.d; dlg.close(); if (v !== 'cancel') dlg.onPick(v === 'clear' ? '' : ymd(new Date(Date.now() + Number(v) * 864e5))); });
    dlg.querySelector('input[type=date]').addEventListener('change', e => { if (e.target.value) { dlg.close(); dlg.onPick(e.target.value); } });
  }
  dlg.querySelector('input[type=date]').value = o.remind || '';
  dlg.querySelector('input[type=date]').min = ymd(new Date(Date.now() + 864e5));
  dlg.onPick = v => setRemind(o, v);
  dlg.showModal();
}
async function setRemind(o, v) {
  const before = o.remind || '';
  o.remind = v; upsert(o); render();
  toast(v ? '⏰ จะเตือนในสรุปตอนเช้าทาง LINE วันนั้น' : '✓ ไม่เตือนแล้ว');
  try { const r = await api('inbox_save', { item: { id: o.id, remind: v, only: 'remind' } }); if (r.item) { r.item.data = r.item.data || o.data; upsert({ ...o, remind: r.item.remind }); } }
  catch (err) { o.remind = before; upsert(o); render(); showStatus('ตั้งเตือนไม่สำเร็จ: ' + err.message); }
}

/* ---------- 📌 ปักไว้บนสุด ----------
   ส่งแบบ only:'remind' (ทางลัดที่ไม่แตะข้อความ/ประเภท) หลังบ้านรุ่นเก่าที่ยังไม่รู้จัก pin จะไม่ทำข้อมูลเสีย */
async function setPin(o, on) {
  const before = o.pin || '';
  o.pin = on ? '1' : ''; upsert(o); render();
  toast(on ? '📌 ปักไว้บนสุดแล้ว' : 'เลิกปักแล้ว');
  try {
    const r = await api('inbox_save', { item: { id: o.id, pin: o.pin, remind: o.remind || '', only: 'remind' } });
    if (r.item && r.item.pin === undefined) { o.pin = before; upsert(o); render(); showStatus('ปักยังใช้ไม่ได้: ต้องอัปหลังบ้านเป็นรุ่น 67 ก่อน'); }
  } catch (err) { o.pin = before; upsert(o); render(); showStatus('ปักไม่สำเร็จ: ' + err.message); }
}

/* ---------- 📒 เก็บเข้าบันทึก / ย้ายกลับไปฝาก (บันทึกประชุมกับการ์ดอยู่ในบันทึกเสมอ) ---------- */
async function setBook(o, on) {
  const before = o.book || '';
  o.book = on ? '1' : ''; upsert(o); render();
  toast(on ? '📒 เก็บเข้าบันทึกแล้ว' : '📥 ย้ายกลับไปฝากแล้ว');
  try {
    const r = await api('inbox_save', { item: { id: o.id, book: o.book, remind: o.remind || '', only: 'remind' } });
    if (r.item && r.item.book === undefined) { o.book = before; upsert(o); render(); showStatus('ย้ายยังใช้ไม่ได้: ต้องอัปหลังบ้านเป็นรุ่น 67 ก่อน'); }
  } catch (err) { o.book = before; upsert(o); render(); showStatus('ย้ายไม่สำเร็จ: ' + err.message); }
}
$('#iMode').addEventListener('click', e => {
  const b = e.target.closest('[data-m]');
  if (!b || b.dataset.m === mode) return;
  mode = b.dataset.m; LS.set('inboxMode', mode); filter = ''; LS.set('inboxFilter', ''); render();
});
$('#btnMove').addEventListener('click', () => { if (!editing) return; const o = editing; $('#iDlg').close(); setBook(o, !isBook(o)); });

/* ---------- ☐ ติ๊กเช็กลิสต์ในโน้ต (แก้ข้อความแล้วบันทึกเบื้องหลัง) ---------- */
const ckQ = {};
async function toggleCk(o, i) {
  const before = o.text;
  o.text = ckToggle(o.text, i); upsert(o); render();
  clearTimeout(ckQ[o.id]);
  ckQ[o.id] = setTimeout(async () => {   // ติ๊กหลายช่องติดกัน = ส่งครั้งเดียว
    try { const r = await api('inbox_save', { item: { id: o.id, text: o.text } }); if (r.item) upsert({ ...o, ...r.item, data: r.item.data || o.data }); }
    catch (err) { o.text = before; upsert(o); render(); showStatus('ติ๊กไม่สำเร็จ: ' + err.message); }
  }, 700);
}

/* ---------- 🔍 อ่านข้อความในรูป (OCR ของ Drive ทำทีละรูปเบื้องหลัง ไว้ค้นหา) ---------- */
let ocrBusy = false;
async function ocrBackfill() {
  if (ocrBusy || !cfg.key || !navigator.onLine) return;
  const todo = items.filter(o => o.kind === 'image' && o.file && o.file.id && !o.ocr).slice(0, 4);
  if (!todo.length) return;
  ocrBusy = true;
  for (const o of todo) {
    try { const r = await api('inbox_ocr', { id: o.id }); if (r.item) { o.ocr = r.item.ocr; upsert(o); } } catch (e) { o.ocr = o.ocr || ''; break; }
  }
  ocrBusy = false;
  if (q) render();
}

function render() {
  // 📥 ฝาก = รับเข้ามาก่อน แล้วจัดการให้หมด (ทำเป็นงาน / เก็บเข้าบันทึก / ลบ) · 📒 บันทึก = ที่เก็บไว้อ่านซ้ำ
  const inMode = items.filter(o => mode === 'book' ? isBook(o) : !isBook(o));
  const nDrop = items.filter(o => !isBook(o)).length, nBook = items.length - nDrop;
  $('#iModeDrop').textContent = nDrop ? String(nDrop) : '';
  $('#iModeBook').textContent = nBook ? String(nBook) : '';
  $('#iMode').querySelectorAll('[data-m]').forEach(b => { const on = b.dataset.m === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.body.classList.toggle('mode-book', mode === 'book');
  $('#iTitle').textContent = mode === 'book' ? 'บันทึก' : 'กล่องฝาก';
  const stale = inMode.filter(o => ageDays(o) >= STALE_DAYS).length;
  $('#iSub').textContent = mode === 'book' ? 'โน้ตที่เก็บไว้ · 📋 บันทึกประชุม/ดูงาน · 📇 การ์ดข้อมูล'
    : nDrop ? `รอจัดการ ${nDrop} รายการ` + (stale ? ` · ค้างเกิน ${STALE_DAYS} วัน ${stale}` : '') : 'ว่างแล้ว 🎉 ของใหม่จาก LINE จะเข้ามาที่นี่';
  iIn.placeholder = mode === 'book' ? 'จดบันทึก…' : 'จดโน้ต / ลิงก์';

  const qq = q.trim().toLowerCase();
  const pool = qq ? items : inMode;   // ค้นหา = หาทั้งฝากและบันทึก
  const KS = mode === 'book' && !qq ? KINDS_BOOK : KINDS_DROP;
  const counts = { '': pool.length, due: pool.filter(isDue).length, pin: pool.filter(isPin).length, stale: pool.filter(o => ageDays(o) >= STALE_DAYS).length };
  pool.forEach(o => { counts[o.kind] = (counts[o.kind] || 0) + 1; });
  if (filter && (!KS.some(([k]) => k === filter) || !counts[filter])) filter = '';
  // #แท็กที่ใช้บ่อย (สูงสุด 10) เป็นชิปกรองต่อท้ายประเภท
  const tc = {};
  pool.forEach(o => tagsOf(o).forEach(t => { tc[t] = (tc[t] || 0) + 1; }));
  if (tagF && !tc[tagF]) tagF = '';
  const tops = Object.keys(tc).sort((a, b) => tc[b] - tc[a] || a.localeCompare(b, 'th')).slice(0, 10);
  if (tagF && !tops.includes(tagF)) tops.push(tagF);
  const kindChips = KS.filter(([k]) => !k || counts[k]);
  $('#iFilters').innerHTML = (kindChips.length > 1 ? kindChips.map(([k, n]) =>
    `<button class="chip${filter === k ? ' on' : ''}" data-k="${k}">${n}<span class="n">${counts[k] || 0}</span></button>`).join('') : '')
    + (tops.length ? (kindChips.length > 1 ? '<span class="chip-sep" aria-hidden="true"></span>' : '') + tops.map(t =>
      `<button class="chip tag${tagF === t ? ' on' : ''}" data-tag="${esc(t)}">#${esc(t)}<span class="n">${tc[t]}</span></button>`).join('') : '');
  $('#iFilters').hidden = !$('#iFilters').innerHTML;
  const kindOk = o => !filter || (filter === 'due' ? isDue(o) : filter === 'pin' ? isPin(o) : filter === 'stale' ? ageDays(o) >= STALE_DAYS : o.kind === filter);
  const recent = o => String(mode === 'book' ? (o.updated || o.created) : o.created);
  const list = pool.filter(o => kindOk(o) && (!tagF || tagsOf(o).includes(tagF)) && (!qq || [o.text, o.title, o.url, o.tags, o.ocr].join(' ').toLowerCase().includes(qq)))
    .sort((a, b) => (mode === 'book' ? (+isPin(b) - +isPin(a)) : 0) || (+!!isDue(b) - +!!isDue(a)) || recent(b).localeCompare(recent(a)));   // บันทึก: ปัก → ถึงวันดู → แก้ล่าสุด · ฝาก: ถึงวันดู → ใหม่สุด
  if (!pool.length) {
    $('#iList').innerHTML = mode === 'book'
      ? `<div class="empty"><b>ยังไม่มีบันทึก</b>จดโน้ตด้านบน หรือกด 📋 เพื่อบันทึกประชุม/ดูงาน หรือทำการ์ดข้อมูล<br>ของในกล่องฝากที่อยากเก็บไว้นาน กด "📒 เก็บ" ได้</div>`
      : `<div class="empty"><b>กล่องฝากว่างแล้ว</b>ส่งลิงก์ในแชท LINE หรือพิมพ์ "ฝาก ข้อความ" ก็เข้ามาที่นี่<br>รูปที่ไม่ใช่บิล แตะ "📌 เก็บไว้เฉยๆ" ในแชทได้</div>`;
    return;
  }
  if (!list.length) { $('#iList').innerHTML = '<div class="empty small">ไม่เจอรายการที่ค้นหา</div>'; return; }
  $('#iList').innerHTML = list.map(o => {
    const book = isBook(o);
    const pinBtn = book ? `<button class="mini ghost pin-btn${isPin(o) ? ' on' : ''}" data-act="pin" title="${isPin(o) ? 'เลิกปัก' : 'ปักไว้บนสุด'}" aria-label="${isPin(o) ? 'เลิกปัก' : 'ปักไว้บนสุด'}" aria-pressed="${isPin(o)}">📌</button>` : '';
    const where = qq ? `<span class="in-where">${book ? '📒 บันทึก' : '📥 ฝาก'}</span>` : '';
    const remBtn = '<span class="spacer"></span>' + pinBtn + '<button class="mini ghost" data-act="rem" title="ให้กลับมาดู" aria-label="ตั้งเตือนให้กลับมาดู">⏰</button>';
    const cls = (isDue(o) ? 'due ' : '') + (book && isPin(o) ? 'pinned ' : '');
    const withRem = h => h.replace('<footer>', remHtml(o) + '<footer>').replace('<span class="spacer"></span>', where + remBtn).replace('class="in-card ', `class="in-card ${cls}`);
    if (o.kind === 'card') return withRem(cardHtml(o));
    if (o.kind === 'meet') return withRem(meetHtml(o));
    let rest = String(o.text || '').replace(o.url ? URL_RE : /$^/, '').trim();
    // บันทึก: บรรทัดแรกของโน้ต = หัวเรื่อง
    let head = '';
    if (book && o.kind === 'note' && rest.includes('\n') && !CK_RE.test(rest.split('\n')[0])) { head = `<h3 class="in-ttl">${textHtml(rest.split('\n')[0])}</h3>`; rest = rest.split('\n').slice(1).join('\n').trim(); }
    const pic = o.file && o.file.thumb ? `<a class="in-pic-big" href="${esc(o.file.url)}" target="_blank" rel="noopener"><img src="${o.file.thumb}" alt="" loading="lazy"></a>`
      : o.file ? `<a class="in-pic-big none" href="${esc(o.file.url)}" target="_blank" rel="noopener">🖼 เปิดรูป</a>` : '';
    const link = o.url ? `<a class="in-link" href="${esc(o.url)}" target="_blank" rel="noopener"><b>${esc(o.title || host(o.url) || o.url)}</b><small>🔗 ${esc(host(o.url))}</small></a>` : '';
    const ck = ckCount(o.text);
    const body = rest ? (ck.n ? `<div class="in-cks"><small class="ck-n">☑ ${ck.d}/${ck.n}</small>${noteHtml(rest)}</div>` : `<p class="in-text">${textHtml(rest)}</p>`) : '';
    const warn = looksSecret(o.text) ? `<div class="in-warn"><span>🔒 มีข้อความคล้ายรหัส/คีย์ กล่องฝากไม่ได้เข้ารหัส</span><button class="mini" data-act="vault">🔒 ย้ายไปตู้รหัส</button><button class="mini" data-act="del">🗑 ลบทิ้ง</button></div>` : '';
    const hitOcr = qq && o.ocr && ![o.text, o.title, o.url, o.tags].join(' ').toLowerCase().includes(qq);
    const ocrSnip = hitOcr ? (() => { const t = o.ocr, i = t.toLowerCase().indexOf(qq); return `<p class="in-ocr">🔍 พบในรูป: …${esc(t.slice(Math.max(0, i - 30), i))}<mark>${esc(t.slice(i, i + qq.length))}</mark>${esc(t.slice(i + qq.length, i + qq.length + 40))}…</p>`; })() : '';
    const age = ageDays(o), old = !book && age >= STALE_DAYS ? `<p class="in-old">🕸 ค้าง ${age} วัน · ยังใช้อยู่ไหม ถ้าไม่ใช้แล้วลบได้เลย</p>` : '';
    // ฝาก: ปุ่มจัดการให้เคลียร์ได้ในแตะเดียว (งาน / เก็บ / ลบ) · บันทึก: ปัก เตือน แก้ ลบ
    const acts = book
      ? `${pinBtn}<button class="mini ghost" data-act="rem" title="ให้กลับมาดู" aria-label="ตั้งเตือนให้กลับมาดู">⏰</button>
        <button class="mini ghost" data-act="edit" aria-label="แก้ไข">✏️</button>
        <button class="mini ghost" data-act="del" aria-label="ลบ" title="ลบ">🗑</button>`
      : `<button class="mini ghost" data-act="rem" title="ให้กลับมาดู" aria-label="ตั้งเตือนให้กลับมาดู">⏰</button>
        <button class="mini" data-act="task" title="ย้ายเป็นงาน">✓ งาน</button>
        <button class="mini" data-act="book" title="เก็บเข้าบันทึก">📒 เก็บ</button>
        <button class="mini ghost" data-act="edit" aria-label="แก้ไข">✏️</button>
        <button class="mini ghost" data-act="del" aria-label="ลบ" title="ลบ">🗑</button>`;
    return `<article class="in-card ${cls}" data-id="${o.id}">
      ${warn}${pic}${link}${head}${body}${ocrSnip}${old}${remHtml(o)}
      <footer><small>${when(book ? (o.updated || o.created) : o.created)}</small>${where}<span class="spacer"></span>
        ${acts}
      </footer>
    </article>`;
  }).join('');
}

/* ---------- เพิ่ม ---------- */
$('#iQuick').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#iInput').value.trim();
  if (!text) return;
  busy(URL_RE.test(text) ? 'กำลังดึงชื่อหน้าเว็บ…' : 'กำลังบันทึก…');
  const book = mode === 'book';
  try {
    const { item } = await api('inbox_save', { item: book ? { text, book: '1' } : { text } });
    if (book && item.book === undefined) item.book = '1';   // หลังบ้านรุ่นเก่า: ให้เห็นในบันทึกก่อน (ซิงก์รอบหน้าจะกลับไปฝาก)
    upsert(item); $('#iInput').value = ''; grow(); render(); toast(book ? '📒 จดบันทึกแล้ว' : '📥 ฝากไว้แล้ว');
  }
  catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
});

/* ช่องจดหลายบรรทัด: ขยายตามข้อความ · Enter = ขึ้นบรรทัดใหม่ · Ctrl/⌘+Enter หรือ ＋ = ฝาก
   พิมพ์ [] หรือ [ ] ต้นบรรทัด = ☐ ช่องติ๊ก · Enter ในบรรทัดช่องติ๊ก = เพิ่มช่องติ๊กบรรทัดถัดไป (บรรทัดว่าง = เลิก) */
const iIn = $('#iInput');
function grow(el = iIn) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, innerHeight * 0.45) + 'px'; }
function ckKeys(el, e) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return false;
  const v = el.value, s = el.selectionStart;
  if (s !== el.selectionEnd) return false;
  const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
  const m = line.match(CK_RE);
  if (!m) return false;
  e.preventDefault();
  if (!line.slice(m[0].length).trim()) { el.setRangeText('', ls, s, 'end'); }   // ช่องติ๊กว่าง + Enter = เลิกทำเช็กลิสต์
  else el.setRangeText('\n' + m[1] + '☐ ', s, s, 'end');
  el.dispatchEvent(new Event('input'));
  return true;
}
function ckTyped(el) {
  const s = el.selectionStart, v = el.value, ls = v.lastIndexOf('\n', s - 1) + 1;
  const m = v.slice(ls, s).match(/^(\s*)(?:-\s*)?\[ ?\] $/);
  if (m) el.setRangeText(m[1] + '☐ ', ls, s, 'end');
}
iIn.addEventListener('input', () => { ckTyped(iIn); grow(); });
iIn.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#iQuick').requestSubmit(); return; }
  ckKeys(iIn, e);
});
{ const ta = $('#iForm').elements.text; ta.addEventListener('keydown', e => ckKeys(ta, e)); ta.addEventListener('input', () => ckTyped(ta)); }
/* ปุ่ม ☐ ในหน้าแก้ไข: ทำบรรทัดที่เลือก (หรือบรรทัดที่เคอร์เซอร์อยู่) เป็นช่องติ๊ก · กดซ้ำ = เอาออก */
$('#btnCk').addEventListener('click', () => {
  const ta = $('#iForm').elements.text, v = ta.value;
  const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  let b = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), a));
  if (b < 0) b = v.length;
  const lines = v.slice(a, b).split('\n');
  const all = lines.every(l => CK_RE.test(l) || !l.trim());
  const out = lines.map(l => !l.trim() ? l : all ? l.replace(CK_RE, '$1') : CK_RE.test(l) ? l : l.replace(/^(\s*)(?:[-*•]\s+)?/, '$1☐ ')).join('\n');
  ta.setRangeText(out, a, b, 'select');
  ta.focus();
});

$('#btnPic').addEventListener('click', () => $('#iFile').click());
$('#iFile').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) uploadFile(file, iIn.value.trim());
});
async function uploadFile(file, text) {
  busy(file.type === 'application/pdf' ? 'กำลังส่งไฟล์…' : 'กำลังส่งรูป…');
  try {
    const p = await prepare(file);
    const { item } = await api('inbox_upload', { ...p, name: file.name, text });
    upsert(item); iIn.value = ''; grow(); render(); toast('📌 เก็บรูปแล้ว');
  } catch (err) { showStatus('ส่งรูปไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
}
async function prepare(file) {
  const toB64 = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => bad(new Error('อ่านไฟล์ไม่ได้')); r.readAsDataURL(f); });
  if (file.type === 'application/pdf') {
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF ใหญ่เกิน 10MB');
    return { mime: 'application/pdf', data: await toB64(file) };
  }
  const img = await new Promise((ok, bad) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => bad(new Error('เปิดรูปนี้ไม่ได้')); i.src = u; });
  const r = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] };
}

/* ---------- การ์ด ---------- */
$('#iFilters').addEventListener('click', e => {
  const t = e.target.closest('[data-tag]');
  if (t) { setTag(tagF === t.dataset.tag ? '' : t.dataset.tag); return; }
  const b = e.target.closest('[data-k]');
  if (!b) return;
  filter = b.dataset.k; LS.set('inboxFilter', filter); render();
});
function setTag(t) { tagF = t; LS.set('inboxTag', t); render(); if (t) scrollTo({ top: 0, behavior: 'smooth' }); }
$('#iSearch').addEventListener('input', e => { q = e.target.value; render(); });
$('#iList').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.in-tag[data-tag]')) { e.preventDefault(); e.target.click(); } });
$('#iList').addEventListener('click', e => {
  if (e.target.closest('.in-ck a')) return;   // ลิงก์ในบรรทัดเช็กลิสต์ = เปิดลิงก์ ไม่ติ๊ก
  const tg = e.target.closest('.in-tag[data-tag]');
  if (tg) { setTag(tagF === tg.dataset.tag ? '' : tg.dataset.tag); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const o = items.find(x => x.id === b.closest('.in-card').dataset.id);
  if (!o) return;
  if (b.dataset.act === 'pin') setPin(o, !isPin(o));
  if (b.dataset.act === 'book') setBook(o, true);
  if (b.dataset.act === 'ck') toggleCk(o, +b.dataset.i);
  if (b.dataset.act === 'edit') openEdit(o);
  if (b.dataset.act === 'task') toTask(o);
  if (b.dataset.act === 'del') delItem(o);
  if (b.dataset.act === 'rem') remPick(o);
  if (b.dataset.act === 'remdone') setRemind(o, '');
  if (b.dataset.act === 'vault') {
    const name = (String(o.title || o.text || '').split('\n').map(x => x.trim()).find(Boolean) || 'จากกล่องฝาก').replace(/[:：].*$/, '').slice(0, 60) || 'จากกล่องฝาก';
    try { sessionStorage.setItem('vaultFromInbox', JSON.stringify({ id: o.id, name, text: String(o.text || '') })); } catch (err) { return showStatus('ส่งต่อไม่ได้ในเบราว์เซอร์นี้'); }
    location.href = 'vault.html';
  }
});

async function toTask(o) {
  busy('กำลังย้ายเป็นงาน…');
  try {
    const { task } = await api('inbox_task', { id: o.id });
    drop(o.id);
    // ให้หน้างานเห็นงานใหม่ทันที (ก่อนดึงข้อมูลรอบถัดไป)
    const tasks = LS.get('tasks', []); tasks.push(task); LS.set('tasks', tasks);
    render(); toast('✓ ย้ายเป็นงานแล้ว: ' + task.title);
    if ($('#iDlg').open) $('#iDlg').close();
  } catch (err) { showStatus('ย้ายไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
}

function openEdit(o) {
  editing = o;
  const f = $('#iForm');
  f.elements.text.value = o.text || '';
  f.elements.title.value = o.title || '';
  f.elements.title.closest('label').hidden = !o.url;
  $('#btnMove').textContent = isBook(o) ? '📥 ย้ายกลับไปฝาก' : '📒 ย้ายไปบันทึก';
  $('#iPrev').innerHTML = o.file && o.file.thumb ? `<a class="in-pic-big" href="${esc(o.file.url)}" target="_blank" rel="noopener"><img src="${o.file.thumb}" alt=""></a>` : '';
  $('#iDlg').showModal();
}
$('#iForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!editing) return;
  const f = e.target;
  const item = { id: editing.id, text: f.elements.text.value };
  if (editing.url) item.title = f.elements.title.value;
  $('#iDlg').close();
  busy('กำลังบันทึก…');
  try { const r = await api('inbox_save', { item }); upsert(r.item); render(); }
  catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
});
$('#btnTask').addEventListener('click', () => editing && toTask(editing));
$('#btnDel').addEventListener('click', () => editing && delItem(editing));
async function delItem(o) {
  if (!confirm('ลบรายการนี้?' + (o.file ? ' (รูปจะถูกย้ายไปถังขยะใน Drive)' : ''))) return;
  if ($('#iDlg').open) $('#iDlg').close();
  drop(o.id); render();
  try { await api('inbox_delete', { id: o.id }); toast('🗑 ลบแล้ว'); }
  catch (err) { upsert(o); render(); showStatus('ลบไม่สำเร็จ: ' + err.message); }
}
$('#iDlg').addEventListener('click', e => { if (e.target === $('#iDlg')) $('#iDlg').close(); });

/* แชร์ลิงก์มาจากแอปอื่นด้วย ?text= / ?url= (ถ้าระบบส่งมา) */
(() => {
  const p = new URLSearchParams(location.search);
  const t = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join(' ').trim();
  if (t) { iIn.value = t; history.replaceState(null, '', location.pathname); setTimeout(() => { grow(); iIn.focus(); }, 50); }
  if (p.get('q')) { q = p.get('q'); $('#iSearch').value = q; history.replaceState(null, '', location.pathname); render(); }
  if (p.get('shared')) { history.replaceState(null, '', location.pathname); takeShared(); }
})();
/* 📤 แชร์จากแอปอื่นเข้าจดครบ (Android: เมนูแชร์ → จดครบ) · sw.js รับไว้ในแคช 'jodkrob-share' แล้วเปิดหน้านี้ ?shared=1 */
async function takeShared() {
  if (mode !== 'drop') { mode = 'drop'; LS.set('inboxMode', mode); render(); }   // ของที่แชร์มา = เข้ากล่องฝาก
  try {
    const c = await caches.open('jodkrob-share');
    const meta = await c.match('meta'), fr = await c.match('file');
    const m = meta ? await meta.json() : {};
    await c.delete('meta'); await c.delete('file');
    const text = [m.title, m.text, m.url].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join('\n').trim();
    if (fr) {
      const blob = await fr.blob();
      const file = new File([blob], m.name || 'shared', { type: blob.type || m.type || 'image/jpeg' });
      if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่องนี้ กลับไปหน้าหลักแล้วเปิดลิงก์จาก LINE ก่อน'); return; }
      uploadFile(file, text);
    } else if (text) { iIn.value = text; grow(); iIn.focus(); toast('📤 รับมาแล้ว ตรวจแล้วกด ＋ เพื่อฝาก'); }
  } catch (e) { showStatus('รับของที่แชร์มาไม่สำเร็จ: ' + e.message); }
}

$('#btnSync').addEventListener('click', sync);
// เริ่มหลังโหลดสคริปต์ครบ (inote.js ต่อจากไฟล์นี้)
document.addEventListener('DOMContentLoaded', () => { mergePending(); render(); sync(); });
