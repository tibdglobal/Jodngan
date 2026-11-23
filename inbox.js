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
const KINDS = [['', 'ทั้งหมด'], ['due', '⏰ ถึงวันดู'], ['meet', '📋 บันทึก'], ['card', '📇 ข้อมูล'], ['link', '🔗 ลิงก์'], ['note', '📝 โน้ต'], ['image', '🖼 รูป']];

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
    .replace(/(^|\s)#(\S+)/g, '$1<span class="in-tag">#$2</span>');
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
  const counts = { '': items.length, due: items.filter(isDue).length };
  items.forEach(o => { counts[o.kind] = (counts[o.kind] || 0) + 1; });
  $('#iFilters').innerHTML = KINDS.filter(([k]) => !k || counts[k]).map(([k, n]) =>
    `<button class="chip${filter === k ? ' on' : ''}" data-k="${k}">${n}<span class="n">${counts[k] || 0}</span></button>`).join('');
  const qq = q.trim().toLowerCase();
  if (filter === 'due' && !counts.due) filter = '';
  const list = items.filter(o => (!filter || (filter === 'due' ? isDue(o) : o.kind === filter)) && (!qq || [o.text, o.title, o.url, o.tags, o.ocr].join(' ').toLowerCase().includes(qq)))
    .sort((a, b) => (+!!isDue(b) - +!!isDue(a)) || String(b.created).localeCompare(String(a.created)));   // ถึงวันดู = ขึ้นก่อน
  if (!items.length) {
    $('#iList').innerHTML = `<div class="empty"><b>ยังไม่มีของฝาก</b>ส่งลิงก์ในแชท LINE หรือพิมพ์ "ฝาก ข้อความ" ก็เข้ามาที่นี่<br>รูปที่ไม่ใช่บิล แตะ "📌 เก็บไว้เฉยๆ" ในแชทได้</div>`;
    return;
  }
  if (!list.length) { $('#iList').innerHTML = '<div class="empty small">ไม่เจอรายการที่ค้นหา</div>'; return; }
  $('#iList').innerHTML = list.map(o => {
    const remBtn = '<span class="spacer"></span><button class="mini ghost" data-act="rem" title="ให้กลับมาดู" aria-label="ตั้งเตือนให้กลับมาดู">⏰</button>';
    const withRem = h => h.replace('<footer>', remHtml(o) + '<footer>').replace('<span class="spacer"></span>', remBtn).replace('class="in-card ', `class="in-card ${isDue(o) ? 'due ' : ''}`);
    if (o.kind === 'card') return withRem(cardHtml(o));
    if (o.kind === 'meet') return withRem(meetHtml(o));
    const rest = String(o.text || '').replace(o.url ? URL_RE : /$^/, '').trim();
    const pic = o.file && o.file.thumb ? `<a class="in-pic-big" href="${esc(o.file.url)}" target="_blank" rel="noopener"><img src="${o.file.thumb}" alt="" loading="lazy"></a>`
      : o.file ? `<a class="in-pic-big none" href="${esc(o.file.url)}" target="_blank" rel="noopener">🖼 เปิดรูป</a>` : '';
    const link = o.url ? `<a class="in-link" href="${esc(o.url)}" target="_blank" rel="noopener"><b>${esc(o.title || host(o.url) || o.url)}</b><small>🔗 ${esc(host(o.url))}</small></a>` : '';
    const body = rest ? `<p class="in-text">${textHtml(rest)}</p>` : '';
    const warn = looksSecret(o.text) ? `<div class="in-warn"><span>🔒 มีข้อความคล้ายรหัส/คีย์ กล่องฝากไม่ได้เข้ารหัส</span><button class="mini" data-act="vault">🔒 ย้ายไปตู้รหัส</button><button class="mini" data-act="del">🗑 ลบทิ้ง</button></div>` : '';
    const hitOcr = qq && o.ocr && ![o.text, o.title, o.url, o.tags].join(' ').toLowerCase().includes(qq);
    const ocrSnip = hitOcr ? (() => { const t = o.ocr, i = t.toLowerCase().indexOf(qq); return `<p class="in-ocr">🔍 พบในรูป: …${esc(t.slice(Math.max(0, i - 30), i))}<mark>${esc(t.slice(i, i + qq.length))}</mark>${esc(t.slice(i + qq.length, i + qq.length + 40))}…</p>`; })() : '';
    return `<article class="in-card${isDue(o) ? ' due' : ''}" data-id="${o.id}">
      ${warn}${pic}${link}${body}${ocrSnip}${remHtml(o)}
      <footer><small>${when(o.created)}</small><span class="spacer"></span>
        <button class="mini ghost" data-act="rem" title="ให้กลับมาดู" aria-label="ตั้งเตือนให้กลับมาดู">⏰</button>
        <button class="mini" data-act="task" title="ย้ายเป็นงาน">✓ ทำเป็นงาน</button>
        <button class="mini ghost" data-act="edit" aria-label="แก้ไข">✏️</button>
        <button class="mini ghost" data-act="del" aria-label="ลบ" title="ลบ">🗑</button>
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
  try { const { item } = await api('inbox_save', { item: { text } }); upsert(item); $('#iInput').value = ''; render(); toast('📌 ฝากไว้แล้ว'); }
  catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
});
$('#btnPic').addEventListener('click', () => $('#iFile').click());
$('#iFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  busy('กำลังส่งรูป…');
  try {
    const p = await prepare(file);
    const { item } = await api('inbox_upload', { ...p, name: file.name, text: $('#iInput').value.trim() });
    upsert(item); $('#iInput').value = ''; render(); toast('📌 เก็บรูปแล้ว');
  } catch (err) { showStatus('ส่งรูปไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
});
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
  const b = e.target.closest('[data-k]');
  if (!b) return;
  filter = b.dataset.k; LS.set('inboxFilter', filter); render();
});
$('#iSearch').addEventListener('input', e => { q = e.target.value; render(); });
$('#iList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const o = items.find(x => x.id === b.closest('.in-card').dataset.id);
  if (!o) return;
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
  if (t) { $('#iInput').value = t; history.replaceState(null, '', location.pathname); }
  if (p.get('q')) { q = p.get('q'); $('#iSearch').value = q; history.replaceState(null, '', location.pathname); render(); }
})();

$('#btnSync').addEventListener('click', sync);
// เริ่มหลังโหลดสคริปต์ครบ (inote.js ต่อจากไฟล์นี้)
document.addEventListener('DOMContentLoaded', () => { mergePending(); render(); sync(); });
