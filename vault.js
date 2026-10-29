/* จดครบ — ศูนย์รวมรหัสผ่าน
 * เข้ารหัส/ถอดรหัสในเครื่องเท่านั้น (PBKDF2-SHA256 → AES-256-GCM)
 * Google Sheet เก็บแค่ข้อมูลที่เข้ารหัสแล้ว รหัสหลักไม่ถูกส่งไปที่ไหน
 */
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
};
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const cfg = LS.get('cfg', { url: '', key: '' });
if (!cfg.url) cfg.url = DEFAULT_URL;

const ITER = 310000;               // รอบของ PBKDF2 (ยิ่งมากยิ่งเดายาก)
const CHECK_TEXT = 'jodngan-vault-ok';
const LOCK_IDLE_MS = 5 * 60 * 1000;    // ไม่ได้ใช้ 5 นาที = ล็อก
const LOCK_HIDDEN_MS = 60 * 1000;      // สลับไปแอปอื่นเกิน 1 นาที = ล็อก
const DEFAULT_CATS = ['งาน', 'ธนาคาร/การเงิน', 'อีเมล', 'โซเชียล', 'ช้อปปิ้ง', 'อื่นๆ'];

let vault = null;        // { salt, check, items:[{id, iv, ct}] } จากเซิร์ฟเวอร์
let key = null;          // CryptoKey (อยู่ในหน่วยความจำเท่านั้น)
let items = [];          // รายการที่ถอดรหัสแล้ว
let cat = '';
let editing = null;
let idleTimer = null, hiddenTimer = null;

/* ---------- base64 / crypto ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(password, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(k, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decryptJSON(k, iv, ct) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

/* ---------- API ---------- */
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

/* ---------- หน้าจอ ---------- */
function show(id) {
  ['#vNoLink', '#vSetup', '#vUnlock', '#vMain'].forEach(s => { $(s).hidden = s !== id; });
  $('#btnLock').hidden = id !== '#vMain';
  if (id === '#vUnlock') setTimeout(() => $('#vUnlock').elements.pw.focus(), 50);
  if (id === '#vSetup') setTimeout(() => $('#vSetup').elements.p1.focus(), 50);
}

async function load() {
  if (!cfg.key) { show('#vNoLink'); return; }
  try {
    vault = await api('vault_list');
  } catch (e) {
    showStatus('โหลดไม่สำเร็จ: ' + e.message);
    return;
  }
  show(vault.salt ? (key ? '#vMain' : '#vUnlock') : '#vSetup');
  if (key) await decryptAll();
}

async function decryptAll() {
  const out = [];
  let bad = 0;
  for (const it of vault.items) {
    try { out.push({ id: it.id, updated: it.updated, ...(await decryptJSON(key, it.iv, it.ct)) }); }
    catch { bad++; }
  }
  items = out;
  if (bad) showStatus(`ถอดรหัสไม่ได้ ${bad} รายการ`);
  render();
}

/* ตั้งรหัสหลักครั้งแรก */
$('#vSetup').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  if (f.p1.value !== f.p2.value) { showStatus('รหัสหลักทั้งสองช่องไม่ตรงกัน'); return; }
  showStatus('กำลังตั้งค่า…', true);
  const salt = b64(rand(16));
  const k = await deriveKey(f.p1.value, salt);
  const check = JSON.stringify(await encryptJSON(k, { t: CHECK_TEXT }));
  try {
    await api('vault_init', { salt, check });
  } catch (err) { showStatus('ตั้งค่าไม่สำเร็จ: ' + err.message); return; }
  f.p1.value = f.p2.value = '';
  key = k;
  showStatus('');
  touch();
  await load();
});

/* ปลดล็อก */
$('#vUnlock').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = e.target.elements.pw;
  showStatus('กำลังปลดล็อก…', true);
  try {
    const k = await deriveKey(pw.value, vault.salt);
    const c = JSON.parse(vault.check);
    const v = await decryptJSON(k, c.iv, c.ct);
    if (v.t !== CHECK_TEXT) throw new Error();
    key = k;
  } catch {
    showStatus('รหัสหลักไม่ถูกต้อง');
    pw.select();
    return;
  }
  pw.value = '';
  showStatus('');
  show('#vMain');
  touch();
  await decryptAll();
});

/* ล็อก: ล้างกุญแจและข้อมูลที่ถอดรหัสแล้วออกจากหน่วยความจำ */
function lock() {
  key = null;
  items = [];
  editing = null;
  if ($('#vDlg').open) $('#vDlg').close();
  $('#vList').innerHTML = '';
  $('#vSearch').value = '';
  clearTimeout(idleTimer);
  if (vault && vault.salt) show('#vUnlock');
}
$('#btnLock').onclick = lock;
function touch() {
  clearTimeout(idleTimer);
  if (key) idleTimer = setTimeout(lock, LOCK_IDLE_MS);
}
['pointerdown', 'keydown', 'scroll'].forEach(ev => document.addEventListener(ev, touch, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenTimer = setTimeout(lock, LOCK_HIDDEN_MS);
  else clearTimeout(hiddenTimer);
});

/* ---------- รายการ ---------- */
const catsOf = () => [...new Set([...items.map(i => i.cat || 'อื่นๆ')])].sort((a, b) => a.localeCompare(b, 'th'));

function render() {
  // หมวด
  const nav = $('#vCats');
  nav.innerHTML = '';
  const cats = catsOf();
  if (cat && !cats.includes(cat)) cat = '';
  [['ทั้งหมด', '', items.length], ...cats.map(c => [c, c, items.filter(i => (i.cat || 'อื่นๆ') === c).length])].forEach(([label, val, n]) => {
    const b = document.createElement('button');
    b.className = 'chip' + (cat === val ? ' on' : '');
    b.innerHTML = '<span></span><span class="n"></span>';
    b.firstChild.textContent = label;
    b.lastChild.textContent = n;
    b.onclick = () => { cat = val; render(); };
    nav.appendChild(b);
  });
  $('#vCatList').innerHTML = '';
  [...new Set([...DEFAULT_CATS, ...cats])].forEach(c => { const o = document.createElement('option'); o.value = c; $('#vCatList').appendChild(o); });

  // รายการ
  const q = $('#vSearch').value.trim().toLowerCase();
  const list = items
    .filter(i => !cat || (i.cat || 'อื่นๆ') === cat)
    .filter(i => !q || [i.name, i.user, i.url, i.note, i.cat].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.cat || 'อื่นๆ').localeCompare(b.cat || 'อื่นๆ', 'th') || a.name.localeCompare(b.name, 'th'));

  const box = $('#vList');
  box.innerHTML = '';
  $('#vSub').textContent = `${items.length} รายการ · เข้ารหัสในเครื่องก่อนบันทึก`;
  if (!items.length) { box.innerHTML = '<p class="empty">ยังไม่มีรหัสผ่าน กด ＋ เพื่อเพิ่ม</p>'; return; }
  if (!list.length) { box.innerHTML = '<p class="empty">ไม่พบรายการที่ค้นหา</p>'; return; }

  let last = null, wrap = null;
  for (const it of list) {
    const c = it.cat || 'อื่นๆ';
    if (c !== last) {
      last = c;
      const sec = document.createElement('section');
      sec.className = 'group';
      sec.innerHTML = '<h3></h3><div class="items"></div>';
      sec.querySelector('h3').textContent = c;
      box.appendChild(sec);
      wrap = sec.querySelector('.items');
    }
    wrap.appendChild(row(it));
  }
}

function row(it) {
  const el = document.createElement('div');
  el.className = 'item v-item';
  const av = document.createElement('span');
  av.className = 'avatar';
  av.textContent = (it.name || '?').trim().charAt(0).toUpperCase();
  const body = document.createElement('button');
  body.className = 'body';
  body.innerHTML = '<span class="title"></span><span class="meta"></span>';
  body.querySelector('.title').textContent = it.name;
  body.querySelector('.meta').textContent = it.user || (it.url ? it.url.replace(/^https?:\/\//, '') : '');
  body.onclick = () => openDlg(it);
  const acts = document.createElement('span');
  acts.className = 'v-acts';
  if (it.user) acts.appendChild(copyBtn('👤', 'คัดลอกผู้ใช้', it.user));
  if (it.pass) acts.appendChild(copyBtn('🔑', 'คัดลอกรหัส', it.pass));
  el.append(av, body, acts);
  return el;
}

function copyBtn(icon, label, value) {
  const b = document.createElement('button');
  b.className = 'edit-btn';
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.textContent = icon;
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(value); b.textContent = '✓'; }
    catch { b.textContent = '✗'; }
    setTimeout(() => { b.textContent = icon; }, 1500);
  };
  return b;
}
$('#vSearch').addEventListener('input', render);

/* ---------- เพิ่ม / แก้ไข ---------- */
const dlg = $('#vDlg'), form = $('#vForm');
function openDlg(it) {
  editing = it || null;
  const f = form.elements;
  $('#vDlgTitle').textContent = it ? 'แก้ไขรหัส' : 'เพิ่มรหัส';
  $('#btnVDelete').hidden = !it;
  f.name.value = it ? it.name : '';
  f.cat.value = it ? (it.cat || '') : (cat || '');
  f.user.value = it ? (it.user || '') : '';
  f.pass.value = it ? (it.pass || '') : '';
  f.url.value = it ? (it.url || '') : '';
  f.note.value = it ? (it.note || '') : '';
  f.pass.type = 'password';
  $('#btnShow').textContent = 'แสดง';
  dlg.showModal();
}
$('#btnAdd').onclick = () => openDlg(null);
$('#btnVCancel').onclick = () => { editing = null; dlg.close(); };
$('#btnShow').onclick = () => {
  const p = form.elements.pass;
  p.type = p.type === 'password' ? 'text' : 'password';
  $('#btnShow').textContent = p.type === 'password' ? 'แสดง' : 'ซ่อน';
};
$('#btnGen').onclick = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_?';
  const r = rand(16);
  form.elements.pass.value = Array.from(r, x => chars[x % chars.length]).join('');
  form.elements.pass.type = 'text';
  $('#btnShow').textContent = 'ซ่อน';
};

form.addEventListener('submit', async () => {
  if (!key) return;
  const f = form.elements;
  const data = {
    name: f.name.value.trim(), cat: f.cat.value.trim(), user: f.user.value.trim(),
    pass: f.pass.value, url: f.url.value.trim(), note: f.note.value,
  };
  const id = editing ? editing.id : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '');
  const sealed = await encryptJSON(key, data);
  // อัปเดตบนจอทันที
  const i = items.findIndex(x => x.id === id);
  if (i > -1) items[i] = { id, ...data }; else items.push({ id, ...data });
  editing = null;
  render();
  try {
    await api('vault_save', { item: { id, ...sealed } });
    const vi = vault.items.findIndex(x => x.id === id);
    if (vi > -1) vault.items[vi] = { id, ...sealed }; else vault.items.push({ id, ...sealed });
    showStatus('');
  } catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
});

$('#btnVDelete').onclick = async () => {
  if (!editing || !confirm('ลบรหัสนี้?')) return;
  const id = editing.id;
  items = items.filter(x => x.id !== id);
  vault.items = vault.items.filter(x => x.id !== id);
  editing = null;
  dlg.close();
  render();
  try { await api('vault_delete', { id }); } catch (e) { showStatus('ลบไม่สำเร็จ: ' + e.message); }
};

/* ---------- เริ่มต้น ---------- */
if (!window.crypto || !crypto.subtle) {
  showStatus('เบราว์เซอร์นี้ไม่รองรับการเข้ารหัส');
} else {
  load();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
