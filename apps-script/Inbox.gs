/* ===================== 📌 กล่องฝาก (ลิงก์ / โน้ต / รูป ที่ไม่ใช่งาน) + แยกประเภทข้อความจาก LINE ===================== */

const INBOX_SHEET = 'Inbox';
const INBOX_HEADERS = ['id', 'kind', 'text', 'url', 'title', 'file', 'tags', 'created', 'updated', 'data', 'remind', 'ocr'];   // remind = วันให้กลับมาดู · ocr = ข้อความในรูป (ไว้ค้นหา)   // data = JSON ของ 📇 การ์ดข้อมูล / 📋 บันทึกประชุม
const INBOX_FOLDER = 'จดครบ - กล่องฝาก';
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;

function inboxSheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(INBOX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INBOX_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), INBOX_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, INBOX_HEADERS.length).setValues([INBOX_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getRange(1, INBOX_HEADERS.length).getDisplayValue() !== INBOX_HEADERS[INBOX_HEADERS.length - 1]) {
    sh.getRange(1, 1, 1, INBOX_HEADERS.length).setValues([INBOX_HEADERS]).setFontWeight('bold');   // เพิ่มคอลัมน์ใหม่ (data)
    sh.getRange(1, INBOX_HEADERS.length, sh.getMaxRows(), 1).setNumberFormat('@');
  }
  return sh;
}

function inboxAll_() {
  const sh = inboxSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, INBOX_HEADERS.length).getDisplayValues().filter(r => r[0]).map(r => {
    const o = Object.fromEntries(INBOX_HEADERS.map((h, i) => [h, r[i]]));
    try { o.file = o.file ? JSON.parse(o.file) : null; } catch (e) { o.file = null; }
    try { o.data = o.data ? JSON.parse(o.data) : null; } catch (e) { o.data = null; }
    return o;
  });
}

function inboxRow_(id) {
  const sh = inboxSheet_(), last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const i = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]).indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

function inboxWrite_(o, row) {
  const sh = inboxSheet_();
  const out = Object.assign({}, o, { file: o.file ? JSON.stringify(o.file) : '', data: o.data ? JSON.stringify(o.data) : '' });
  const r = row || sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, INBOX_HEADERS.length).setNumberFormat('@').setValues([INBOX_HEADERS.map(h => String(out[h] == null ? '' : out[h]).slice(0, 45000))]);
}

function inboxTags_(text) {
  return [...new Set((String(text).match(/(^|\s)#(\S+)/g) || []).map(x => x.trim().slice(1)))].join(',');
}

/** ชื่อหน้าเว็บของลิงก์ (og:title หรือ <title>) อ่านไม่ได้ = ว่าง */
function linkTitle_(url) {
  try {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: false,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JodkrobBot/1.0)', 'Accept-Language': 'th,en;q=0.8' } });
    if (r.getResponseCode() >= 400) return '';
    const ct = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
    if (ct && !/html/i.test(ct)) return '';
    const cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || 'UTF-8';
    let html = '';
    try { html = r.getContentText(cs); } catch (e) { html = r.getContentText(); }
    html = html.slice(0, 300000);
    const m = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (!m) return '';
    return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (x, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch (e) { return ''; }
}

/** บันทึก/แก้ (ส่งมาเฉพาะบางช่องได้) */
function inboxSave_(t) {
  if (!t) throw new Error('ไม่มีข้อมูล');
  const row = inboxRow_(t.id);
  const cur = row ? inboxAll_().find(x => x.id === t.id) : null;
  const now = stamp_();
  const o = cur || { id: t.id || Utilities.getUuid().replace(/-/g, ''), created: now, file: null, title: '' };
  if (t.remind !== undefined) o.remind = String(t.remind || '').slice(0, 10);   // ⏰ วันให้กลับมาดู ('' = ไม่เตือน)
  if (t.only === 'remind' && cur) { o.updated = now; inboxWrite_(o, row); return o; }
  if (t.kind === 'card' || t.kind === 'meet') {   // การ์ดข้อมูล / บันทึกประชุม: เก็บเป็น JSON + ข้อความไว้ค้นหา
    const d = t.data || {};
    if (JSON.stringify(d).length > 45000) throw new Error('บันทึกยาวเกินไป ลองแยกเป็น 2 บันทึก หรือลบรูปบางรูป');
    o.kind = t.kind; o.data = d; o.url = ''; o.file = null;
    o.title = String(d.title || '').trim().slice(0, 200);
    o.text = String(t.text || o.title || '').trim().slice(0, 5000);
    o.tags = inboxTags_(o.text);
    if (!o.title && !o.text) throw new Error('ยังไม่มีข้อมูล');
    o.updated = now;
    inboxWrite_(o, row);
    return o;
  }
  if (t.text !== undefined) o.text = String(t.text).trim().slice(0, 5000);
  const u = String(o.text || '').match(URL_RE);
  let newUrl = u ? u[0].replace(/[).,]+$/, '') : '';
  if (newUrl && !/^https?:/i.test(newUrl)) newUrl = 'https://' + newUrl;
  if (newUrl !== (o.url || '')) { o.url = newUrl; o.title = newUrl ? linkTitle_(newUrl) : ''; }
  if (t.title !== undefined) o.title = String(t.title).trim().slice(0, 200);
  o.kind = o.file ? 'image' : o.url ? 'link' : 'note';
  o.tags = inboxTags_(o.text || '');
  if (!o.text && !o.file) throw new Error('ไม่มีข้อความ');
  o.updated = now;
  inboxWrite_(o, row);
  return o;
}

function inboxDelete_(id) {
  const row = inboxRow_(id);
  if (!row) return false;
  const o = inboxAll_().find(x => x.id === id);
  if (o && o.file && o.file.id) { try { DriveApp.getFileById(o.file.id).setTrashed(true); } catch (e) {} }
  inboxSheet_().deleteRow(row);
  return true;
}

function inboxFolder_() {
  let id = props.getProperty('INBOX_FOLDER_ID'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder(INBOX_FOLDER); props.setProperty('INBOX_FOLDER_ID', f.getId()); }
  return f;
}

function inboxThumb_(fid, max) {
  try {
    const meta = Drive.Files.get(fid, { fields: 'thumbnailLink' });
    if (!meta || !meta.thumbnailLink) return '';
    const token = ScriptApp.getOAuthToken();
    for (const n of [320, 220, 160]) {
      const r = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+[^/]*$/, '=s' + n), { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return '';
      const b = r.getBlob();
      const d = 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
      if (d.length <= (max || 30000)) return d;
    }
  } catch (e) {}
  return '';
}

/** แนบไฟล์ (ย้ายเข้าโฟลเดอร์กล่องฝาก) */
function inboxAttach_(o, file, mime) {
  try { file.moveTo(inboxFolder_()); } catch (e) {}
  o.file = { id: file.getId(), url: file.getUrl(), mime: mime || file.getMimeType(), thumb: inboxThumb_(file.getId()) };
  o.kind = 'image';
  o.updated = stamp_();
  inboxWrite_(o, inboxRow_(o.id));
  return o;
}

/** รูปที่ส่งมาทาง LINE (รอจัด) → เก็บไว้ในกล่องฝาก */
function inboxFromPending_(fid, pend) {
  const file = DriveApp.getFileById(fid);
  const now = stamp_();
  const o = { id: Utilities.getUuid().replace(/-/g, ''), kind: 'image', text: (pend && pend.vendor) || '', url: '', title: '', file: null, tags: '', created: now, updated: now };
  inboxWrite_(o);
  return inboxAttach_(o, file, (pend && pend.mime) || file.getMimeType());
}

/** อัปโหลดรูปจากหน้าเว็บ */
function inboxUpload_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const blob = Utilities.newBlob(Utilities.base64Decode(String(p.data || '')), mime, String(p.name || 'รูป').slice(0, 80));
  const file = inboxFolder_().createFile(blob);
  const now = stamp_();
  const o = { id: Utilities.getUuid().replace(/-/g, ''), kind: 'image', text: String(p.text || '').trim().slice(0, 5000), url: '', title: '', file: null, tags: inboxTags_(p.text || ''), created: now, updated: now };
  inboxWrite_(o);
  return inboxAttach_(o, file, mime);
}

/** 📷 รูปในบันทึกประชุม/ดูงาน: เก็บไฟล์ คืน {id,url,thumb เล็ก} (ไม่สร้างรายการใหม่) */
function inboxPhoto_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^image\//.test(mime)) throw new Error('รองรับเฉพาะรูป');
  const name = (String(p.name || 'บันทึก').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 60) || 'บันทึก') + '_' + stamp_().replace(/[:T]/g, '-') + '.jpg';
  const file = inboxFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(String(p.data || '')), mime, name));
  return { id: file.getId(), url: file.getUrl(), thumb: String(p.thumb || '').slice(0, 6000) || inboxThumb_(file.getId(), 6000) };
}

/** ☐ งานต่อจากบันทึก → งานจริง (อ่านวัน/เวลาจากข้อความ เช่น "ขอใบเสนอราคา ศุกร์นี้") */
function inboxTodo_(p) {
  const text = String(p.text || '').trim();
  if (!text) throw new Error('ไม่มีข้อความงาน');
  const q = parseQuick_(text);
  return addTask_({ title: q.title || text, date: q.date, time: q.time, remind: q.time ? '1' : '', project: q.project, due: q.due,
    note: String(p.note || '').slice(0, 1000) });
}

/** ย้ายของในกล่องฝากไปเป็นงาน */
function inboxToTask_(id) {
  const o = inboxAll_().find(x => x.id === id);
  if (!o) throw new Error('ไม่พบรายการนี้แล้ว');
  const rest = String(o.text || '').replace(URL_RE, ' ').replace(/\s+/g, ' ').trim();
  const base = rest || o.title || (o.kind === 'image' ? 'รูปจากกล่องฝาก' : 'ดูลิงก์');
  const p = parseQuick_(base);
  const t = addTask_({ title: p.title || base, date: p.date, time: p.time, remind: p.time ? '1' : '',
    project: p.project, due: p.due, note: [o.title && p.title !== o.title ? o.title : '', o.url, o.file ? o.file.url : ''].filter(Boolean).join('\n') });
  // รูป: เก็บไฟล์ไว้ (ลิงก์อยู่ในโน้ตของงาน) ลบแค่แถว
  inboxSheet_().deleteRow(inboxRow_(id));
  return t;
}

/* ===================== LINE: เดาประเภทข้อความ แล้วเปลี่ยนได้ในแตะเดียว ===================== */

const KIND_LABEL = { t: '✓ งาน', i: '📌 ฝากไว้' };

function srcPut_(id, text) { try { CacheService.getScriptCache().put('src:' + id, String(text).slice(0, 2000), 21600); } catch (e) {} }

/** ปุ่ม "เปลี่ยนเป็น…" ต่อท้ายทุกครั้งที่บันทึก */
function changeItems_(from, id, src) {
  const items = [];
  ['t', 'i'].filter(k => k !== from).forEach(k => {
    items.push(qr_('↔ ' + KIND_LABEL[k], 'chg|' + from + '|' + id + '|' + k, 'เปลี่ยนเป็น' + KIND_LABEL[k].replace(/^\S+\s/, '')));
  });
  items.push(qr_('🗑 ยกเลิก', 'chg|' + from + '|' + id + '|x', 'ยกเลิกรายการนี้'));
  return items;
}

function inboxLine_(o) {
  return '📌 ฝากไว้แล้ว' + (o.title ? '\n' + cut_(o.title, 80) : '') + (o.text && o.text !== o.url ? '\n' + cut_(o.text, 120) : o.url ? '\n' + o.url : '') +
    '\nดูได้ในแอป หน้า 📌 ฝาก';
}

/** บันทึกตามประเภทที่เลือก แล้วตอบพร้อมปุ่มเปลี่ยน · คืน false ถ้าทำไม่ได้ (เช่น ไม่มียอดเงิน) */
function saveAs_(token, kind, src, prefix) {
  if (kind !== 'i') kind = 't';
  let id, text;
  if (kind === 't') {
    const p = parseQuick_(src);
    if (!p.title) { reply_(token, 'ไม่มีชื่องาน'); return false; }
    if (p.project) { const hit = readAll_().find(x => x.project && x.project.toLowerCase() === p.project.toLowerCase()); if (hit) p.project = hit.project; }
    const t = addTask_({ title: p.title, date: p.date, time: p.time, remind: p.time ? '1' : '', project: p.project, due: p.due });
    id = t.id; text = '✅ ' + line1_(t) + (t.remind ? ' 🔔' : '');
  } else if (kind === 'i') {
    const o = inboxSave_({ text: src });
    id = o.id; text = inboxLine_(o);
  }
  srcPut_(id, src);
  replyQR_(token, (prefix ? prefix + '\n' : '') + text, changeItems_(kind, id, src));
  return true;
}

/** ข้อความเดิมของรายการ (จากแคช หรือสร้างจากข้อมูลที่บันทึกไว้) */
function srcOf_(kind, id) {
  if (kind !== 't' && kind !== 'i') return { ok: false };
  const c = CacheService.getScriptCache().get('src:' + id);
  if (kind === 't') { const t = readAll_().find(x => x.id === id); return t ? { ok: true, src: c || t.title } : { ok: false }; }
  if (kind === 'i') { const o = inboxAll_().find(x => x.id === id); return o ? { ok: true, src: c || o.text || o.url } : { ok: false }; }
  return { ok: false };
}

function removeAs_(kind, id) {
  if (kind === 't') deleteTask_(id);
  else if (kind === 'i') inboxDelete_(id);
}

/** ข้อความทั่วไป (ไม่ใช่คำสั่ง): ดูคำนำหน้า → ไม่งั้นเดาเอง */
function routeText_(token, text) {
  let m;
  const lock = LockService.getScriptLock();
  // คำนำหน้าบังคับประเภท
  if ((m = text.match(/^(?:ฝาก|โน้ต|โน๊ต|note|เก็บ|📌)\s*[:：]?\s+([\s\S]+)$/i))) return withLock_(lock, token, () => saveAs_(token, 'i', m[1].trim()));
  if ((m = text.match(/^(?:งาน|todo|✓)\s*[:：]?\s+([\s\S]+)$/i))) return withLock_(lock, token, () => saveAs_(token, 't', m[1].trim()));
  // มีลิงก์ = ฝากไว้
  if (URL_RE.test(text)) return withLock_(lock, token, () => saveAs_(token, 'i', text));
  const p = parseQuick_(text);
  if (!p.title) return;
  return withLock_(lock, token, () => saveAs_(token, 't', text));
}

function withLock_(lock, token, fn) {
  if (!lock.tryLock(15000)) return reply_(token, 'ระบบกำลังยุ่ง ลองส่งอีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

/** ปุ่มของระบบแยกประเภท (เรียกขณะถือล็อกอยู่แล้ว) · คืน true = จัดการแล้ว */
function routePostback_(ev) {
  const p = String(ev.postback && ev.postback.data || '').split('|');
  const cache = CacheService.getScriptCache();
  if (p[0] === 'as') {
    const src = cache.get('ask:' + p[2]);
    if (!src) { reply_(ev.replyToken, 'เลือกไปแล้ว หรือข้อความนี้เก่าเกินไป ลองพิมพ์ใหม่'); return true; }
    if (saveAs_(ev.replyToken, p[1], src)) cache.remove('ask:' + p[2]);
    return true;
  }
  if (p[0] === 'chg') {
    const from = p[1], id = p[2], to = p[3];
    const s = srcOf_(from, id);
    if (!s.ok) { reply_(ev.replyToken, 'รายการนี้ถูกเปลี่ยนหรือลบไปแล้ว'); return true; }
    if (to === 'x') { removeAs_(from, id); reply_(ev.replyToken, '🗑 ยกเลิกแล้ว (ไม่ได้บันทึก)'); return true; }
    if (saveAs_(ev.replyToken, to, s.src, '↔ เปลี่ยนจาก' + KIND_LABEL[from].replace(/^\S+\s/, '') + 'แล้ว')) removeAs_(from, id);
    return true;
  }
  if (p[0] === 'keep') {
    const fid = p[1];
    let pend = {};
    try { pend = JSON.parse(cache.get('pend:' + fid) || '{}'); } catch (e) {}
    let file;
    try { file = DriveApp.getFileById(fid); } catch (e) { reply_(ev.replyToken, 'ไม่พบรูปนี้แล้ว ลองส่งใหม่'); return true; }
    if (file.isTrashed() || (file.getParents().hasNext() && file.getParents().next().getName() !== 'รอจัด')) { reply_(ev.replyToken, 'รูปนี้จัดไปแล้ว'); return true; }
    const o = inboxFromPending_(fid, pend);
    cache.remove('pend:' + fid);
    billNextPending_(ev.replyToken, '📌 เก็บรูปไว้ในกล่องฝากแล้ว\nใส่คำอธิบาย หรือย้ายเป็นงานได้ในแอป หน้า 📌 ฝาก', [qr_('✓ ทำเป็นงาน', 'itask|' + o.id, 'ทำเป็นงาน')]);
    return true;
  }
  if (p[0] === 'itask') {
    let t;
    try { t = inboxToTask_(p[1]); } catch (e) { reply_(ev.replyToken, String(e.message || e)); return true; }
    reply_(ev.replyToken, '✅ ' + line1_(t) + '\nแก้ชื่องาน/วันที่ได้ในแอป');
    return true;
  }
  return false;
}

function inboxSummaryText_() {
  const list = inboxAll_().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  if (!list.length) return '📌 กล่องฝากยังว่าง\nส่งลิงก์มา หรือพิมพ์ "ฝาก ข้อความ" ได้เลย';
  return '📌 ฝากไว้ ' + list.length + ' รายการ (ล่าสุด)\n' + list.slice(0, 8).map(o =>
    '• ' + (o.kind === 'image' ? '🖼 ' : o.kind === 'link' ? '🔗 ' : '') + cut_(o.title || o.text || 'รูป', 50) + (o.url && !o.title ? '' : o.url ? '\n  ' + o.url : '')).join('\n') +
    '\n\nดูทั้งหมดในแอป หน้า 📌 ฝาก';
}

/* ===================== 🎙 เสียงประชุม (บันทึกประชุม/ดูงาน) =====================
 * ไฟล์เสียงใหญ่ → อัปทีละท่อนผ่าน resumable upload ของ Drive (ทำนอกล็อก ไม่แตะชีต)
 * audio_start {name, mime, size} → {session} · audio_chunk {session, offset, total, mime, data|probe} → {done, next | file} */
const AUDIO_UP = /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/;
const AUDIO_MIME = /^(audio|video)\/[\w.+-]+(;.*)?$/;
function audioFolder_() {
  let id = props.getProperty('AUDIO_FOLDER_ID'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch (e) { f = null; } }
  if (!f) { f = inboxFolder_().createFolder('เสียงประชุม'); props.setProperty('AUDIO_FOLDER_ID', f.getId()); }
  return f;
}
function audioName_(s) { return String(s || 'เสียงประชุม').replace(/[\\/:*?"<>|#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'เสียงประชุม'; }
function audioStart_(p) {
  const mime = String(p.mime || 'audio/webm').split(';')[0];
  if (!AUDIO_MIME.test(mime)) throw new Error('รองรับเฉพาะไฟล์เสียง/วิดีโอ');
  const size = Number(p.size) || 0;
  if (size <= 0 || size > 1024 * 1024 * 1024) throw new Error('ขนาดไฟล์ไม่ถูกต้อง (สูงสุด 1 GB)');
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    payload: JSON.stringify({ name: audioName_(p.name), mimeType: mime, parents: [audioFolder_().getId()] }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) }
  });
  const h = r.getHeaders(), loc = h.Location || h.location;
  if (r.getResponseCode() !== 200 || !loc) throw new Error('เริ่มอัปไม่ได้ (' + r.getResponseCode() + ')');
  return { session: loc };
}
function audioChunk_(p) {
  const s = String(p.session || ''), total = Number(p.total) || 0;
  if (!AUDIO_UP.test(s)) throw new Error('ลิงก์อัปโหลดไม่ถูกต้อง');
  let opt;
  if (p.probe) {
    opt = { method: 'put', muteHttpExceptions: true, followRedirects: false, headers: { 'Content-Range': 'bytes */' + total } };
  } else {
    const bytes = Utilities.base64Decode(String(p.data || '')), off = Number(p.offset) || 0;
    if (!bytes.length) throw new Error('ท่อนว่าง');
    opt = { method: 'put', muteHttpExceptions: true, followRedirects: false, payload: bytes,
      contentType: String(p.mime || 'application/octet-stream').split(';')[0],
      headers: { 'Content-Range': 'bytes ' + off + '-' + (off + bytes.length - 1) + '/' + total } };
  }
  const r = UrlFetchApp.fetch(s, opt), code = r.getResponseCode();
  if (code === 200 || code === 201) {
    const f = JSON.parse(r.getContentText());
    return { done: true, file: { id: f.id, name: f.name, size: Number(f.size) || total, url: f.webViewLink || 'https://drive.google.com/file/d/' + f.id + '/view' } };
  }
  if (code === 308) {
    const h = r.getHeaders(), rg = String(h.Range || h.range || '');
    const m = rg.match(/bytes=0-(\d+)/);
    return { done: false, next: m ? Number(m[1]) + 1 : 0 };
  }
  if (code === 404 || code === 410) throw new Error('ลิงก์อัปหมดอายุ ต้องเริ่มอัปใหม่');
  throw new Error('อัปท่อนไม่สำเร็จ (' + code + ')');
}
/** เอาเสียงออกจากบันทึก → ย้ายไฟล์ไปถังขยะ (เฉพาะไฟล์ในโฟลเดอร์เสียงของเรา) */
function audioRemove_(id) {
  const f = DriveApp.getFileById(String(id || ''));
  const inMine = f.getParents().hasNext() && f.getParents().next().getId() === audioFolder_().getId();
  if (!inMine) throw new Error('ไม่ใช่ไฟล์เสียงของกล่องฝาก');
  f.setTrashed(true);
  return true;
}
/** 🎧 ส่งสำเนาเข้าโฟลเดอร์ไฟล์เสียงประชุมของระบบถอดเสียง TIBD (ตั้งด้วย meet_setup {audio}) */
function audioToTibd_(p) {
  const dest = props.getProperty('MEET_AUDIO_ID');
  if (!dest) throw new Error('ยังไม่ได้ตั้งโฟลเดอร์ไฟล์เสียงของระบบถอดเสียง');
  const src = DriveApp.getFileById(String(p.id || ''));
  const ext = (src.getName().match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
  const name = audioName_(p.name).replace(/\.[a-z0-9]{2,5}$/i, '') + ext;
  const c = src.makeCopy(name, DriveApp.getFolderById(dest));
  return { id: c.getId(), name: c.getName(), url: c.getUrl() };
}

/* ===================== ⏰ ให้กลับมาดู + 🔍 ข้อความในรูป ===================== */
/** รายการที่ถึงวันให้กลับมาดู (สำหรับสรุปตอนเช้า) */
function inboxDueLine_() {
  const today = todayStr_();
  const due = inboxAll_().filter(o => o.remind && o.remind <= today);
  if (!due.length) return '';
  const name = o => (o.title || (o.data && o.data.title) || String(o.text || '').split('\n')[0] || 'รายการ').slice(0, 60);
  return '📌 ที่ฝากไว้ให้กลับมาดู ' + due.length + ' รายการ\n' + due.slice(0, 8).map(o => '• ' + name(o)).join('\n') + (due.length > 8 ? '\n• …อีก ' + (due.length - 8) : '');
}
/** อ่านข้อความในรูปด้วย OCR ของ Drive (ฟรี ไม่ใช้ AI) · ทำนอกล็อก */
function inboxOcrRead_(id) {
  const o = inboxAll_().find(x => x.id === String(id || ''));
  if (!o || !o.file || !o.file.id) throw new Error('ไม่พบรูป');
  if (o.file.mime && !/^image\/|pdf/.test(o.file.mime)) return '';
  const text = ocrText_(DriveApp.getFileById(o.file.id)).replace(/\s+/g, ' ').trim().slice(0, 8000);
  return text || ' ';   // ว่าง = ใส่ช่องว่างไว้ ไม่ต้องอ่านซ้ำ
}
function inboxOcrSave_(id, text) {
  const row = inboxRow_(id);
  if (!row) return null;
  const o = inboxAll_().find(x => x.id === id);
  o.ocr = text;
  inboxWrite_(o, row);
  return o;
}
