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

/* ลืมรหัสหลัก: กู้ไม่ได้ (เข้ารหัสในเครื่อง) → ลบทั้งหมดแล้วตั้งรหัสใหม่ */
$('#btnForgot').onclick = async () => {
  const n = (vault && vault.items || []).length;
  const msg = n
    ? `รหัสหลักกู้คืนไม่ได้ เพราะไม่ได้ถูกส่งไปเก็บที่ไหน\n\nถ้าตั้งใหม่ รหัสผ่านที่เก็บไว้ ${n} รายการจะถูกลบทั้งหมด และกู้คืนไม่ได้\n\nพิมพ์คำว่า ลบ เพื่อยืนยัน`
    : 'ยังไม่มีรหัสผ่านที่เก็บไว้ ตั้งรหัสหลักใหม่ได้เลย\n\nพิมพ์คำว่า ลบ เพื่อยืนยัน';
  if ((prompt(msg) || '').trim() !== 'ลบ') return;
  try {
    await api('vault_reset');
    key = null;
    showStatus('ลบแล้ว ตั้งรหัสหลักใหม่ได้เลย', true);
    await load();
  } catch (e) { showStatus('ทำไม่สำเร็จ: ' + e.message); }
};

/* ล็อก: ล้างกุญแจและข้อมูลที่ถอดรหัสแล้วออกจากหน่วยความจำ */
function lock() {
  key = null;
  items = [];
  editing = null;
  if ($('#vDlg').open) $('#vDlg').close();
  if ($('#vImp').open) { $('#impText').value = ''; impRows = []; $('#impList').innerHTML = ''; $('#vImp').close(); }
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


/* ---------- นำเข้า: วางหลายรายการ (แยกช่องในเครื่องนี้ แล้วเข้ารหัสก่อนส่ง) ---------- */
const FIELD_ALIASES = {
  name: /^(name|title|account|ชื่อ|ชื่อบัญชี|บัญชี|แอป|app|service|บริการ)$/i,
  url: /^(url|website|web|site|login_uri|login uri|link|เว็บ|เว็บไซต์|ลิงก์|ลิงค์)$/i,
  user: /^(user|username|user ?name|login|login_username|email|e-mail|id|ผู้ใช้|ชื่อผู้ใช้|อีเมล|ไอดี|ยูส|ยูสเซอร์)$/i,
  pass: /^(pass|password|pwd|pw|login_password|รหัส|รหัสผ่าน|พาส|พาสเวิร์ด)$/i,
  note: /^(note|notes|extra|comment|โน้ต|โน๊ต|หมายเหตุ)$/i,
  cat: /^(category|folder|grouping|group|tag|หมวด|หมวดหมู่|กลุ่ม)$/i,
};
const fieldOf = h => Object.keys(FIELD_ALIASES).find(k => FIELD_ALIASES[k].test(String(h).trim()));
const looksUrl = s => (/^(https?:\/\/|www\.)\S+$/i.test(s) || /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(s)) && !/@/.test(s);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(s);
const looksUser = s => isEmail(s) || /^0\d{8,9}$/.test(s);

/** แยกบรรทัดแบบ CSV (รองรับ "ข้อความ, ที่มีจุลภาค") */
function splitDelim(line, d) {
  if (d !== ',') return line.split(d === '|' ? /\s*\|\s*/ : d).map(x => x.trim());
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"' && !cur.trim()) { q = true; cur = ''; }
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const delimOf = line => line.includes('\t') ? '\t' : line.includes('|') ? '|' : line.includes(',') ? ',' : line.includes(';') ? ';' : '';

function nameFrom(o) {
  if (o.name) return o.name;
  if (o.url) { try { const h = new URL(/^http/i.test(o.url) ? o.url : 'https://' + o.url).hostname.replace(/^(www|accounts?|login|m)\./, ''); return h.split('.')[0].replace(/^./, c => c.toUpperCase()); } catch {} }
  if (/@/.test(o.user || '')) return o.user.split('@')[1].split('.')[0].replace(/^./, c => c.toUpperCase());
  return '';
}

/** ไม่มีหัวตาราง: เดาว่าช่องไหนคืออะไร (ลำดับปกติ ชื่อ · ผู้ใช้ · รหัส · เว็บ · โน้ต) */
function guessFields(parts) {
  parts = parts.filter(x => x !== '');
  const o = {};
  const ui = parts.findIndex(looksUrl);
  if (ui > -1) o.url = parts.splice(ui, 1)[0];
  if (parts.length === 1) { o.pass = parts[0]; }
  else if (parts.length === 2) {
    // ผู้ใช้ + รหัส หรือ ชื่อ + รหัส
    if (looksUser(parts[0]) || o.url) { o.user = parts[0]; o.pass = parts[1]; }
    else { o.name = parts[0]; o.pass = parts[1]; }
  } else if (parts.length >= 3) {
    if (looksUser(parts[0]) && !looksUser(parts[1])) { o.user = parts[0]; o.pass = parts[1]; o.name = parts[2]; parts = parts.slice(3); }
    else { [o.name, o.user, o.pass] = parts; parts = parts.slice(3); }
    if (parts.length) o.note = parts.join(' · ');
  }
  return o;
}

function parseImport(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return [];
  const out = [];
  // 1) มีหัวตาราง
  const d0 = delimOf(nonEmpty[0]);
  if (d0) {
    const head = splitDelim(nonEmpty[0], d0).map(fieldOf);
    if (head.includes('pass') && head.filter(Boolean).length >= 2) {
      for (const l of nonEmpty.slice(1)) {
        const parts = splitDelim(l, d0), o = {};
        head.forEach((f, i) => { if (f && parts[i]) o[f] = o[f] ? o[f] + ' · ' + parts[i] : parts[i]; });
        if (o.pass || o.user) out.push(o);
      }
      return out;
    }
  }
  // 2) แยกเป็นก้อนตามบรรทัดว่าง แล้วดูแต่ละก้อนว่าเป็นแบบไหน
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/).map(bl => bl.split('\n').map(l => l.trim()).filter(Boolean)).filter(bl => bl.length);
  for (const bl of blocks) {
    const labeled = bl.some(l => labelOf(l));
    const delimAll = bl.every(l => delimOf(l));
    // บรรทัดละรายการ (คั่นด้วย tab | , หรือเว้นวรรคแบบ "ชื่อ user รหัส")
    const multiTok = bl.filter(l => /\s/.test(l) && !labelOf(l) && rowLike(l)).length;
    if (!labeled && (delimAll || (bl.length === 1 && (delimOf(bl[0]) || multiTok)) || multiTok > bl.length / 2)) {
      bl.forEach(l => { const o = parseLine(l); if (o.pass || o.user) out.push(o); });
    } else {
      parseFree(bl, out);   // บรรทัดละช่อง (ชื่อ / user / รหัส / ลิงก์ ...) หรือมีป้าย user: pass:
    }
  }
  return out;
}

/* "user: abc" / "ยูส abc" / "รหัส 1234" → ['user','abc'] */
function labelOf(l) {
  let m = l.match(/^\s*([^:：=]{1,20}?)\s*[:：=]\s*(.*)$/);
  if (m && fieldOf(m[1])) return [fieldOf(m[1]), m[2].trim()];
  m = l.match(/^\s*(\S+)\s+(\S.*)$/);
  if (m && fieldOf(m[1]) && fieldOf(m[1]) !== 'name') return [fieldOf(m[1]), m[2].trim()];
  return null;
}
/* บรรทัดนี้ดูเหมือน "ทั้งรายการในบรรทัดเดียว" ไหม: มีหลายคำ และคำท้ายดูเป็นรหัส หรือมีอีเมล/ลิงก์อยู่ข้างใน */
function rowLike(l) {
  const w = l.split(/\s+/);
  if (w.length < 2) return false;
  return w.some(x => looksUser(x) || looksUrl(x)) || secretLike(w[w.length - 1]);
}
const hasThai = s => /[฀-๿]/.test(s);
/* ดูเหมือนรหัส: คำเดียว มีตัวเลขหรือสัญลักษณ์ปน */
const secretLike = s => !/\s/.test(s) && !hasThai(s) && /\d|[^A-Za-z0-9]/.test(s) && !looksUrl(s) && !isEmail(s);
/* ดูเหมือนชื่อรายการ: มีภาษาไทย / มีเว้นวรรค / ขึ้นต้นตัวใหญ่ไม่มีตัวเลข เช่น Gmail, Shopee */
const nameLike = s => !looksUrl(s) && !/@/.test(s) && !/\d/.test(s.replace(/\s.*/, '')) && (hasThai(s) || /\s/.test(s) || /^[A-Z][A-Za-z.&'-]*$/.test(s));

/** บรรทัดละช่อง เช่น
 *  Gmail ↵ me@gmail.com ↵ Pass1234 ↵ https://gmail.com   (ไม่เว้นบรรทัดระหว่างรายการก็ได้ ระบบตัดเมื่อเจอชื่อใหม่) */
function parseFree(lines, out) {
  let g = {};
  const has = () => g.name || g.user || g.pass || g.url;
  const push = () => { if (g.pass || g.user) out.push(g); else if (g.name && out.length && !out[out.length - 1].note) out[out.length - 1].note = g.name; g = {}; };
  lines.forEach((l, i) => {
    const lab = labelOf(l);
    if (lab) {
      const [f, v] = lab;
      if (f === 'note') { g.note = g.note ? g.note + '\n' + v : v; return; }
      if (g[f] || (f === 'name' && has())) push();
      g[f] = v;
      return;
    }
    const next = lines[i + 1] && !labelOf(lines[i + 1]) ? lines[i + 1] : '';
    if (looksUrl(l)) { if (g.url) push(); g.url = l; return; }
    if (looksUser(l)) {
      if (g.user && !g.pass) { g.pass = l; return; }     // เบอร์โทรเป็นรหัสก็มี
      if (g.user) push();
      g.user = l; return;
    }
    const plainName = (!has() || g.pass) && !secretLike(l) && !looksUser(l) && next && (looksUser(next) || secretLike(next) || looksUrl(next));
    if (plainName || (nameLike(l) && !(g.user && !g.pass && secretLike(l)))) {
      if (has()) push();
      g.name = l; return;
    }
    // ที่เหลือ = user หรือ รหัส
    if (!g.user && !g.pass && next && !looksUrl(next) && !nameLike(next) && !looksUser(next)) { g.user = l; return; }
    if (!g.pass) { g.pass = l; return; }
    push(); g.user = l;
  });
  push();
}

function parseKvBlock(lines, KV, out) {
  let cur = null;
  const push = () => { if (cur && (cur.pass || cur.user)) out.push(cur); cur = null; };
  for (const l of lines) {
    const m = l.match(KV), f = m && fieldOf(m[1]);
    if (f) {
      if (!cur) cur = {};
      if (cur[f] && f !== 'note') { const keepName = null; push(); cur = {}; }   // ช่องซ้ำ = รายการใหม่
      cur[f] = cur[f] ? cur[f] + '\n' + m[2].trim() : m[2].trim();
    } else {
      if (cur && (cur.pass || cur.user)) push();
      if (!cur) cur = {};
      if (!cur.name) cur.name = l.trim().replace(/[:：]$/, ''); else cur.note = (cur.note ? cur.note + '\n' : '') + l.trim();
    }
  }
  push();
}

function parseLine(l) {
  const d = delimOf(l);
  if (d) return guessFields(splitDelim(l, d));
  // คั่นด้วยช่องว่าง: คำท้าย = รหัส, คำก่อนท้าย = ผู้ใช้ (ถ้าดูเหมือน), ที่เหลือ = ชื่อ
  const w = l.trim().split(/\s+/);
  if (w.length < 2) return guessFields(w);
  const pass = w.pop();
  const ascii = x => /^[\x21-\x7e]+$/.test(x);
  const user = w.length > 1 && (looksUser(w[w.length - 1]) || w.length > 2 || (ascii(w[0]) && ascii(w[1]))) ? w.pop() : (w.length === 1 && looksUser(w[0]) ? w.pop() : '');
  return guessFields([w.join(' '), user, pass]);
}

let impRows = [];
const imp = $('#vImp');
const impKey = o => (nameFrom(o) + '|' + (o.user || '')).toLowerCase();

$('#btnImp').onclick = () => { if (!key) return; impStep(1); imp.showModal(); setTimeout(() => $('#impText').focus(), 50); };
function impStep(n) {
  $('#impStep1').hidden = n !== 1; $('#impStep2').hidden = n !== 2;
  $('#impBack').hidden = n !== 2;
  $('#impNext').textContent = n === 1 ? 'อ่านข้อมูล' : 'บันทึก';
  $('#impNext').dataset.step = n;
}
function impClose() { $('#impText').value = ''; impRows = []; $('#impList').innerHTML = ''; imp.close(); }
$('#impCancel').onclick = impClose;
$('#impBack').onclick = () => impStep(1);

function renderImp() {
  const have = new Set(items.map(impKey));
  const box = $('#impList');
  box.innerHTML = '';
  impRows.forEach((o, i) => {
    const dup = have.has(impKey(o));
    if (o.on === undefined) o.on = !dup && !!nameFrom(o) && !!o.pass;
    const el = document.createElement('label');
    el.className = 'imp-row' + (o.on ? '' : ' off');
    el.innerHTML = '<input type="checkbox"><span class="imp-b"><input class="imp-name" placeholder="ตั้งชื่อ"><small></small></span><span class="imp-side"><span class="imp-flag"></span><button type="button" class="mini imp-sw" title="สลับ ผู้ใช้ ↔ รหัส">⇄</button></span>';
    const cb = el.querySelector('input[type=checkbox]');
    cb.checked = o.on;
    cb.onchange = () => { o.on = cb.checked; el.classList.toggle('off', !o.on); impSum(); };
    const nm = el.querySelector('.imp-name');
    nm.value = nameFrom(o);
    nm.oninput = () => { o.name = nm.value.trim(); };
    nm.onclick = e => e.preventDefault();
    el.querySelector('small').textContent = [o.user || '(ไม่มีผู้ใช้)', o.pass ? '•'.repeat(Math.min(10, o.pass.length)) : '(ไม่มีรหัส)', o.url ? o.url.replace(/^https?:\/\//, '') : '', o.cat || ''].filter(Boolean).join(' · ');
    el.querySelector('.imp-sw').onclick = e => { e.preventDefault(); [o.user, o.pass] = [o.pass || '', o.user || '']; o.on = undefined; renderImp(); };
    el.querySelector('.imp-flag').textContent = dup ? 'มีแล้ว' : !nameFrom(o) ? 'ใส่ชื่อ' : !o.pass ? 'ไม่มีรหัส' : '';
    box.appendChild(el);
  });
  impSum();
}
function impSum() {
  const n = impRows.filter(o => o.on).length;
  $('#impSum').textContent = `อ่านได้ ${impRows.length} รายการ · เลือกไว้ ${n} รายการ — ติ๊กออกรายการที่ไม่ต้องการ แก้ชื่อได้ตรงนี้ ส่วนอื่นแก้ทีหลังได้`;
  if ($('#impNext').dataset.step === '2') { $('#impNext').textContent = n ? `บันทึก ${n} รายการ` : 'บันทึก'; $('#impNext').disabled = !n; }
}

$('#impNext').onclick = async () => {
  if ($('#impNext').dataset.step !== '2') {
    impRows = parseImport($('#impText').value);
    if (!impRows.length) { alert('อ่านไม่เจอรายการ ลองให้แต่ละบรรทัดมี ผู้ใช้ และ รหัส คั่นด้วย Tab, | หรือ ,'); return; }
    impStep(2); renderImp();
    return;
  }
  if (!key) return;
  const def = $('#impCat').value.trim();
  const pick = impRows.filter(o => o.on);
  const miss = pick.filter(o => !nameFrom(o));
  if (miss.length) { alert(`ยังมี ${miss.length} รายการที่ไม่มีชื่อ ใส่ชื่อก่อนนะครับ`); return; }
  const btn = $('#impNext'); btn.disabled = true; btn.textContent = 'กำลังเข้ารหัส…';
  const sealedAll = [], plain = [];
  for (const o of pick) {
    const data = { name: nameFrom(o), cat: o.cat || def, user: o.user || '', pass: o.pass || '', url: o.url || '', note: o.note || '' };
    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^A-Za-z0-9]/g, '');
    sealedAll.push({ id, ...(await encryptJSON(key, data)) });
    plain.push({ id, ...data });
  }
  btn.textContent = 'กำลังบันทึก…';
  try {
    for (let i = 0; i < sealedAll.length; i += 100) await api('vault_save_many', { items: sealedAll.slice(i, i + 100) });
    vault.items.push(...sealedAll);
    items.push(...plain);
    impClose(); render();
    showStatus(`✓ นำเข้าแล้ว ${plain.length} รายการ`, true);
    setTimeout(() => showStatus(''), 4000);
  } catch (e) { showStatus('นำเข้าไม่สำเร็จ: ' + e.message); }
  finally { btn.disabled = false; impSum(); }
};

/* ---------- เริ่มต้น ---------- */
if (!window.crypto || !crypto.subtle) {
  showStatus('เบราว์เซอร์นี้ไม่รองรับการเข้ารหัส');
} else {
  load();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
