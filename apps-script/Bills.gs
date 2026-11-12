/**
 * จดครบ — จดบิล / เบิกเงิน
 * จดสั้นๆ ก่อน แล้วค่อยแนบหลักฐาน (ใบกำกับภาษี ใบเสร็จ รูปแคป) ทีหลัง
 * ข้อมูลอยู่แท็บ "Bills" ใน Sheet เดียวกัน ไฟล์หลักฐานอยู่ Google Drive โฟลเดอร์ "จดงาน - หลักฐานเบิกเงิน/ปี-เดือน"
 */

const BILL_SHEET = 'Bills';
const BILL_HEADERS = ['id', 'date', 'amount', 'desc', 'project', 'cat', 'pay', 'vendor', 'status', 'files', 'note', 'claim', 'submitted', 'paid', 'created', 'updated', 'vat', 'vatAmt'];
// vat: yes = มี VAT (ใบกำกับภาษี) | no = ไม่มี VAT | '' = ยังไม่ระบุ · vatAmt: ยอด VAT ในบิล (รวมอยู่ในยอดแล้ว)
const BILL_FOLDER = 'จดงาน - หลักฐานเบิกเงิน';
const BILL_STATUS = ['draft', 'ready', 'submitted', 'paid'];   // ขาดหลักฐาน / พร้อมเบิก / ยื่นแล้ว / ได้เงินแล้ว
const PROOF_KINDS = ['taxinv', 'receipt', 'cert', 'slip', 'other'];   // แนบไฟล์อะไรก็ได้ = มีหลักฐานแล้ว (รวมสลิป/รูปแคป)

/** กด Run ครั้งเดียวเพื่ออนุญาตสิทธิ์ Google Drive และสร้างแท็บ Bills */
function authorizeBills() {
  billSheet_();
  const f = billFolder_();
  Logger.log('พร้อมใช้งาน โฟลเดอร์หลักฐาน: ' + f.getUrl());
}

function billSheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(BILL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(BILL_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), BILL_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, BILL_HEADERS.length).setValues([BILL_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getRange(1, BILL_HEADERS.length).getDisplayValue() !== BILL_HEADERS[BILL_HEADERS.length - 1]) {
    sh.getRange(1, 1, 1, BILL_HEADERS.length).setValues([BILL_HEADERS]).setFontWeight('bold');   // เพิ่มหัวคอลัมน์ใหม่ (vat)
  }
  return sh;
}

function billFolder_(month) {
  let id = props.getProperty('BILL_FOLDER_ID');
  let root = null;
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder(BILL_FOLDER);
    props.setProperty('BILL_FOLDER_ID', root.getId());
  }
  if (!month) return root;
  const it = root.getFoldersByName(month);
  return it.hasNext() ? it.next() : root.createFolder(month);
}

function billsAll_() {
  const sh = billSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, BILL_HEADERS.length).getDisplayValues()
    .filter(r => r[0])
    .map(r => {
      const b = Object.fromEntries(BILL_HEADERS.map((h, i) => [h, r[i]]));
      try { b.files = JSON.parse(b.files || '[]'); } catch (e) { b.files = []; }
      return b;
    });
}

function billRow_(id) {
  const sh = billSheet_();
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

function billWrite_(b, row) {
  const sh = billSheet_();
  const out = Object.assign({}, b, { files: JSON.stringify(b.files || []) });
  const r = row || sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, BILL_HEADERS.length).setNumberFormat('@').setValues([BILL_HEADERS.map(h => String(out[h] == null ? '' : out[h]))]);
}

/** ครบหลักฐานแล้วเลื่อนจาก "ขาดหลักฐาน" เป็น "พร้อมเบิก" ให้เอง (หรือกลับ ถ้าลบหลักฐานออก) */
function billAutoStatus_(b) {
  const proof = (b.files || []).some(f => PROOF_KINDS.indexOf(f.kind) > -1);
  if (b.status === 'draft' && proof) b.status = 'ready';
  if (b.status === 'ready' && !proof) b.status = 'draft';
  return b;
}

function billSave_(t) {
  if (!t) throw new Error('ไม่มีข้อมูล');
  const row = billRow_(t.id);
  const cur = row ? billsAll_().find(x => x.id === t.id) : null;
  const now = stamp_();
  const b = cur || { id: t.id || Utilities.getUuid().replace(/-/g, ''), files: [], status: 'draft', created: now, amount: '0' };
  ['date', 'desc', 'project', 'cat', 'pay', 'vendor', 'note', 'claim', 'submitted', 'paid', 'vat', 'vatAmt'].forEach(k => {
    if (t[k] !== undefined) b[k] = String(t[k]).trim();
  });
  if (t.amount !== undefined) {   // ส่งมาเฉพาะบางช่องได้ (ไม่ส่งยอด = คงยอดเดิม)
    const amount = Number(String(t.amount === '' ? 0 : t.amount).replace(/,/g, ''));
    if (!(amount >= 0)) throw new Error('จำนวนเงินไม่ถูกต้อง');
    b.amount = String(Math.round(amount * 100) / 100);
  }
  if (!b.date) b.date = todayStr_();
  if (!String(b.desc || '').trim()) throw new Error('ใส่รายละเอียดก่อน');
  if (t.status !== undefined && BILL_STATUS.indexOf(t.status) > -1) b.status = t.status;
  else billAutoStatus_(b);
  b.updated = now;
  billWrite_(b, row);
  return b;
}

/** แนบหลักฐาน: รับไฟล์ base64 จากหน้าเว็บ เก็บใน Drive */
function billUpload_(p) {
  const row = billRow_(p.id);
  if (!row) throw new Error('ไม่พบรายการ');
  const b = billsAll_().find(x => x.id === p.id);
  const mime = String(p.mime || 'application/octet-stream');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const file = billFolder_(String(b.date).slice(0, 7)).createFile(Utilities.newBlob(bytes, mime, 'upload'));
  let ocr = null;
  try { ocr = readReceipt_(ocrText_(file)); } catch (e) { ocr = null; }
  const kind = p.kind === 'auto' ? ((ocr && ocr.kind) || 'receipt') : p.kind;   // 📷 = เดาชนิดจากเอกสาร
  const fill = billAutoFill_(b, ocr);
  billAttach_(b, row, file, kind, mime, p.thumb);   // บันทึกค่าที่เติม + ตั้งชื่อไฟล์ตามวันที่/ยอดใหม่
  return { bill: b, ocr: ocr, filled: fill.filled, prev: fill.prev };
}

/** 📷 ถ่ายใบเสร็จในแอป: สร้างบิล + เก็บไฟล์ + อ่านข้อมูล ในครั้งเดียว (เร็วกว่าเรียกหลายรอบ) */
function billSnap_(p) {
  const t = p.bill || {};
  const mime = String(p.mime || 'application/octet-stream');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const file = billInbox_().createFile(Utilities.newBlob(bytes, mime, 'upload'));
  let ocr = null;
  try { ocr = readReceipt_(ocrText_(file)); } catch (e) { ocr = null; }
  const o = ocr || {};
  const typedAmt = t.amount !== undefined && t.amount !== null && t.amount !== '';
  const b = billSave_({
    id: t.id,
    date: t.date || o.date || todayStr_(),
    amount: typedAmt ? t.amount : (o.amount || 0),
    desc: t.desc || o.vendor || 'รอใส่รายละเอียด',
    project: t.project || '',
    cat: t.cat || o.cat || '',
    vendor: o.vendor || '',
    vat: o.vat || '', vatAmt: o.vatAmt || '',
  });
  billAttach_(b, billRow_(b.id), file, o.kind || 'receipt', mime, p.thumb);
  return { bill: b, ocr: ocr };
}

const KIND_NAME = { taxinv: 'ใบกำกับภาษี', receipt: 'ใบเสร็จ', cert: 'ใบรับรองแทนใบเสร็จ', slip: 'สลิป', other: 'หลักฐานอื่น' };

function billFileName_(b, kind, mime) {
  const ext = mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : '.jpg';
  const safe = String(b.desc || '').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 40).trim();
  return [b.date, b.amount + 'บ', safe, KIND_NAME[kind] || 'อื่นๆ'].join('_') + ext;
}

/** ใส่ไฟล์ที่อยู่ใน Drive แล้วเข้าบิล: ย้ายไปโฟลเดอร์ตามเดือน ตั้งชื่อ และเลื่อนสถานะ */
function billAttach_(b, row, file, kind, mime, thumb) {
  kind = KIND_NAME[kind] ? kind : 'other';
  if (kind === 'taxinv' && b.vat !== 'yes') b.vat = 'yes';   // มีใบกำกับภาษี = มี VAT
  const name = billFileName_(b, kind, mime);
  file.setName(name);
  try { file.moveTo(billFolder_(String(b.date).slice(0, 7))); } catch (e) {}
  b.files = (b.files || []).concat([{
    id: file.getId(), name: name, kind: kind, mime: mime, url: file.getUrl(), thumb: String(thumb || '').slice(0, 12000),
  }]);
  billAutoStatus_(b);
  b.updated = stamp_();
  billWrite_(b, row);
  return b;
}

/* ===================== ส่งรูป/PDF ใบเสร็จผ่าน LINE ===================== */

const fmtBaht_ = n => '฿' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const cut_ = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** ปุ่ม quick reply (ป้ายยาวได้ไม่เกิน 20 ตัว) */
function qr_(label, data, display) {
  return { type: 'action', action: { type: 'postback', label: cut_(label, 20), data: data, displayText: cut_(display || label, 300) } };
}
function replyQR_(token, text, items) {
  const msg = { type: 'text', text: String(text).slice(0, 4900) };
  if (items && items.length) msg.quickReply = { items: items.slice(0, 13) };
  line_('reply', { replyToken: token, messages: [msg] });
}

function billInbox_() {
  const root = billFolder_();
  const it = root.getFoldersByName('รอจัด');
  return it.hasNext() ? it.next() : root.createFolder('รอจัด');
}

/** เดาชนิดหลักฐานจากข้อความในเอกสาร */
function guessKind_(t) {
  if (/ใบกำกับภาษี|tax\s*invoice/i.test(t)) return 'taxinv';
  if (/โอนเงิน|โอนสำเร็จ|รายการสำเร็จ|transfer|พร้อมเพย์|promptpay|เลขที่รายการ/i.test(t)) return 'slip';
  if (/ใบรับรองแทนใบเสร็จ/.test(t)) return 'cert';
  return 'receipt';
}

/** ชื่อร้าน = บรรทัดแรกที่เป็นชื่อ (ไม่ใช่วันที่/ตัวเลข/หัวเอกสาร) */
function guessVendor_(t) {
  const lines = String(t || '').replace(/\ufeff/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 15);
  // 1) บรรทัดที่ดูเป็นชื่อกิจการ
  const biz = /บริษัท|บจก|ห้างหุ้นส่วน|หจก|ร้าน|จำกัด|มหาชน|co\.?,?\s*ltd|limited|company|shop|store|cafe|café|coffee|hotel|โรงแรม|คลินิก|สถานี/i;
  const notName = /เลขประจำตัว|tax\s*id|ใบเสร็จ|ใบกำกับ|receipt|invoice|วันที่|ขอบคุณ|thank/i;
  let line = lines.find(s => s.length >= 3 && biz.test(s) && !notName.test(s));
  // 2) ไม่เจอ = บรรทัดแรกที่ไม่ใช่หัวเอกสาร/สาขา/ที่อยู่/ตัวเลข
  const skip = /ใบเสร็จ|ใบกำกับ|receipt|invoice|tax|เลขประจำตัว|วันที่|date|โทร|tel|สาขา|branch|pos|เลขที่|ที่อยู่|ถนน|แขวง|เขต|total|รวม|ยอด|เงินสด|cash|^[^0-9A-Za-z฀-๿]*$|^[\d\s\/:.,-]+$/i;
  // "7-ELEVEN สาขาสีลม" → "7-ELEVEN"
  if (!line) line = lines.map(s => s.replace(/\s*(สาขา|branch).*$/i, '').trim()).find(s => s.length >= 3 && !skip.test(s));
  return line ? cut_(line, 40) : '';
}

/** เดาหมวดจากข้อความในใบเสร็จ */
function guessCat_(t) {
  const rules = [
    ['ค่าห้องประชุม', /ห้องประชุม|meeting\s*room|conference|co-?working|เช่าห้อง|เช่าสถานที่/i],
    ['ที่พัก', /โรงแรม|hotel|resort|รีสอร์ท|ห้องพัก|agoda|booking\.com/i],
    ['เดินทาง', /grab|bolt|taxi|แท็กซี่|ทางด่วน|easy\s*pass|m-?pass|ค่าผ่านทาง|น้ำมัน|เชื้อเพลิง|แก๊สโซฮอล์|ดีเซล|ปตท|ptt|บางจาก|shell|caltex|ที่จอดรถ|parking|bts|mrt|สายการบิน|airasia|airways|ตั๋วเครื่องบิน/i],
    ['อาหาร/รับรอง', /อาหาร|กาแฟ|coffee|cafe|café|คาเฟ่|restaurant|ภัตตาคาร|เครื่องดื่ม|food|อเมริกาโน่|ลาเต้/i],
    ['อุปกรณ์/วัสดุ', /เครื่องเขียน|กระดาษ|หมึก|อุปกรณ์|วัสดุ|stationery|officemate|b2s/i],
  ];
  const r = rules.find(x => x[1].test(String(t || '')));
  return r ? r[0] : '';
}

/** รับรูป/ไฟล์จากแชท → เก็บใน Drive → อ่านใบเสร็จ → ให้แตะเลือกบิล */
function billFromLineMedia_(ev) {
  const msg = ev.message;
  let mime = 'image/jpeg', name = 'line-' + msg.id + '.jpg';
  if (msg.type === 'file') {
    if (!/\.pdf$/i.test(msg.fileName || '')) { reply_(ev.replyToken, 'รองรับเฉพาะรูปและไฟล์ PDF'); return; }
    mime = 'application/pdf';
    name = msg.fileName;
  }
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + msg.id + '/content', {
    headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('ดาวน์โหลดไฟล์จาก LINE ไม่ได้');
  const blob = res.getBlob().setName(name);
  if (msg.type === 'image' && /^image\//.test(blob.getContentType() || '')) mime = blob.getContentType();
  const file = billInbox_().createFile(blob);
  const fid = file.getId();

  let text = '';
  try { text = ocrText_(file); } catch (e) {}
  const ocr = readReceipt_(text);
  const kind = guessKind_(text);
  const vendor = guessVendor_(text);
  CacheService.getScriptCache().put('pend:' + fid, JSON.stringify({ mime: mime, ocr: ocr, kind: kind, vendor: vendor }), 21600);

  const n = billPendingIds_().length;
  line_('reply', { replyToken: ev.replyToken, messages: [billPendPrompt_(fid, n > 1 ? n : 0)] });
}

/** รูปที่ยังรอจัด = ไฟล์ในโฟลเดอร์ "รอจัด" (เก่าสุดก่อน) */
function billPendingIds_() {
  const out = [], it = billInbox_().getFiles();
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) out.push([f.getDateCreated().getTime(), f.getId()]); }
  return out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

/** ข้อความ + ปุ่มเลือกบิลของรูปหนึ่งรูป (LINE แสดงปุ่มได้เฉพาะข้อความล่าสุด) */
function billPendPrompt_(fid, waiting) {
  let pend = {};
  try { pend = JSON.parse(CacheService.getScriptCache().get('pend:' + fid) || '{}'); } catch (e) {}
  const ocr = pend.ocr || {}, kind = pend.kind || 'receipt', vendor = pend.vendor || '';
  const amt = Number(ocr.amount || 0);
  const drafts = billsAll_().filter(b => b.status === 'draft')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const match = drafts.filter(b => amt && Math.abs(Number(b.amount) - amt) < 0.01);
  const rest = drafts.filter(b => match.indexOf(b) < 0);
  const lbl = b => fmtBaht_(b.amount) + ' ' + b.desc;

  const items = [];
  if (waiting > 1) items.push(qr_('➕ สร้างทั้งหมด ' + waiting + ' บิล', 'newall', 'สร้างบิลใหม่จากทุกรูปที่รอจัด'));
  match.slice(0, 3).forEach(b => items.push(qr_('✅ ' + lbl(b), 'att|' + fid + '|' + b.id, 'แนบกับ ' + b.desc)));
  items.push(qr_('➕ บิลใหม่' + (amt ? ' ' + fmtBaht_(amt) : ''), 'new|' + fid, 'สร้างบิลใหม่จากรูปนี้'));
  items.push(qr_('💸 จ่ายส่วนตัว' + (amt ? ' ' + fmtBaht_(amt) : ''), 'mout|' + fid, 'จดเป็นรายจ่ายส่วนตัว'));
  items.push(qr_('💰 รายรับ' + (amt ? ' ' + fmtBaht_(amt) : ''), 'min|' + fid, 'จดเป็นรายรับ'));
  // อ่านวันที่/ยอดไม่ได้ = น่าจะไม่ใช่ใบเสร็จ → เสนอ "เก็บไว้เฉยๆ" ไว้ปุ่มแรก
  const keep = qr_('📌 เก็บไว้เฉยๆ', 'keep|' + fid, 'เก็บรูปไว้ในกล่องฝาก');
  if (!amt && !ocr.date) items.unshift(keep); else items.push(keep);
  rest.slice(0, 11 - items.length).forEach(b => items.push(qr_(lbl(b), 'att|' + fid + '|' + b.id, 'แนบกับ ' + b.desc)));
  items.push(qr_('🗑 ไม่ใช้', 'drop|' + fid, 'ไม่ใช้รูปนี้'));

  const got = [ocr.date ? fmt_(ocr.date, '') : '', amt ? fmtBaht_(amt) : '', vendor].filter(Boolean).join(' · ');
  const text = (got ? '🧾 ดูเหมือน' + KIND_NAME[kind] + '\nอ่านได้: ' + got : '📷 ได้รับรูปแล้ว (ไม่เจอวันที่/ยอดเงิน)') +
    '\n\nรูปนี้คืออะไร? แตะเลือกด้านล่าง\n• แนบบิลเบิก / ➕ บิลใหม่\n• 💸 จ่ายส่วนตัว / 💰 รายรับ\n• 📌 เก็บไว้เฉยๆ (ไม่ใช่บิล)' + (match.length ? '\n✅ = ยอดตรงกับบิลที่มี' : '') +
    (waiting > 1 ? '\n\n📥 มีรูปรอจัด ' + waiting + ' รูป แตะ "สร้างทั้งหมด" = ทำเป็นบิลใหม่ทุกรูปทีเดียว หรือจัดทีละรูป รูปถัดไปจะขึ้นเอง' : '');
  const msg = { type: 'text', text: text.slice(0, 4900) };
  msg.quickReply = { items: items.slice(0, 13) };
  return msg;
}

/** ตอบกลับ (ข้อความที่ทำเสร็จ) + ถ้ายังมีรูปรอจัด ให้เลือกบิลของรูปถัดไปต่อเลย */
function billNextPending_(token, doneText, doneItems) {
  const ids = billPendingIds_();
  const msgs = [];
  if (doneText) msgs.push({ type: 'text', text: String(doneText).slice(0, 4900) });
  if (ids.length) {
    msgs.push(billPendPrompt_(ids[0], ids.length));
  } else if (doneText) {
    if (doneItems && doneItems.length) msgs[0].quickReply = { items: doneItems.slice(0, 13) };
  } else {
    msgs.push({ type: 'text', text: '👍 ไม่มีรูปรอจัดแล้ว' });
  }
  line_('reply', { replyToken: token, messages: msgs });
}

/** ปุ่มที่แตะในแชท */
function billPostback_(ev) {
  const p = String(ev.postback && ev.postback.data || '').split('|');
  const cache = CacheService.getScriptCache();
  const all = () => billsAll_();

  // สร้างบิลใหม่จากทุกรูปที่รอจัด (ยอด/วันที่/ร้าน จากที่อ่านได้)
  // รูปนี้เป็นรายรับ/รายจ่ายส่วนตัว (ไม่ใช่บิลเบิก)
  if (p[0] === 'mout' || p[0] === 'min') {
    const fid = p[1];
    let pend = {};
    try { pend = JSON.parse(cache.get('pend:' + fid) || '{}'); } catch (e) {}
    let file;
    try { file = DriveApp.getFileById(fid); } catch (e) { reply_(ev.replyToken, 'ไม่พบรูปนี้แล้ว ลองส่งใหม่'); return; }
    if (file.isTrashed() || (file.getParents().hasNext() && file.getParents().next().getName() !== 'รอจัด')) { reply_(ev.replyToken, 'รูปนี้จัดไปแล้ว'); return; }
    const it = moneyFromPending_(fid, p[0] === 'min' ? 'in' : 'out', pend);
    cache.remove('pend:' + fid);
    billNextPending_(ev.replyToken, moneyLineAfter_(it) + (Number(it.amount) ? '' : '\n⚠️ อ่านยอดไม่ได้ ใส่ยอดได้ในแอป หน้า 💰'));
    return;
  }

  if (p[0] === 'newall') {
    const lines = [];
    let total = 0, noAmt = 0;
    billPendingIds_().forEach(fid => {
      let pend = {};
      try { pend = JSON.parse(cache.get('pend:' + fid) || '{}'); } catch (e) {}
      const ocr = pend.ocr || {};
      let file;
      try { file = DriveApp.getFileById(fid); } catch (e) { return; }
      let b = billSave_({ date: ocr.date || todayStr_(), amount: ocr.amount || 0, desc: pend.vendor || 'ใบเสร็จจาก LINE', vendor: pend.vendor || '', cat: ocr.cat || '', vat: ocr.vat || '', vatAmt: ocr.vatAmt || '' });
      b = billAttach_(b, billRow_(b.id), file, pend.kind || 'receipt', pend.mime || file.getMimeType(), '');
      cache.remove('pend:' + fid);
      total += Number(b.amount || 0);
      if (!Number(b.amount)) noAmt++;
      lines.push('• ' + fmt_(b.date, '') + ' · ' + fmtBaht_(b.amount) + ' · ' + cut_(b.desc, 30));
    });
    reply_(ev.replyToken, lines.length
      ? '➕ สร้างบิลใหม่ ' + lines.length + ' รายการ รวม ' + fmtBaht_(total) + '\n' + lines.join('\n') +
        (noAmt ? '\n⚠️ ' + noAmt + ' รายการอ่านยอดไม่ได้ ใส่ยอดได้ในแอป' : '') + '\nตรวจ/แก้ได้ในแอป หน้า 🧾'
      : 'ไม่มีรูปรอจัดแล้ว');
    return;
  }

  if (p[0] === 'drop') {
    try { DriveApp.getFileById(p[1]).setTrashed(true); } catch (e) {}
    billNextPending_(ev.replyToken, '🗑 ไม่ใช้รูปนี้แล้ว');
    return;
  }

  if (p[0] === 'att' || p[0] === 'new') {
    const fid = p[1];
    let pend = {};
    try { pend = JSON.parse(cache.get('pend:' + fid) || '{}'); } catch (e) {}
    const ocr = pend.ocr || {};
    let file;
    try { file = DriveApp.getFileById(fid); } catch (e) { reply_(ev.replyToken, 'ไม่พบรูปนี้แล้ว ลองส่งใหม่'); return; }
    if (file.isTrashed()) { reply_(ev.replyToken, 'รูปนี้ถูกทิ้งไปแล้ว ลองส่งใหม่'); return; }
    if (file.getParents().hasNext() && file.getParents().next().getName() !== 'รอจัด') { reply_(ev.replyToken, 'รูปนี้แนบไปแล้ว'); return; }

    let b;
    if (p[0] === 'new') {
      b = billSave_({ date: ocr.date || todayStr_(), amount: ocr.amount || 0, desc: pend.vendor || 'ใบเสร็จจาก LINE', vendor: pend.vendor || '', cat: ocr.cat || '', vat: ocr.vat || '', vatAmt: ocr.vatAmt || '' });
    } else {
      b = all().find(x => x.id === p[2]);
      if (!b) { reply_(ev.replyToken, 'ไม่พบบิลนี้แล้ว'); return; }
    }
    const kind = pend.kind || 'receipt';
    const fill = p[0] === 'att' ? billAutoFill_(b, ocr) : { filled: {} };
    b = billAttach_(b, billRow_(b.id), file, kind, pend.mime || file.getMimeType(), '');
    cache.remove('pend:' + fid);

    const items = [];
    if (p[0] === 'att') {
      if (ocr.date && ocr.date !== b.date) items.push(qr_('ใช้วันที่ ' + fmt_(ocr.date, ''), 'setd|' + b.id + '|' + ocr.date));
      if (ocr.amount && Number(ocr.amount) !== Number(b.amount)) items.push(qr_('ใช้ยอด ' + fmtBaht_(ocr.amount), 'seta|' + b.id + '|' + ocr.amount));
    }
    Object.keys(KIND_NAME).filter(k => k !== kind && k !== 'other').forEach(k =>
      items.push(qr_('↔ ' + KIND_NAME[k], 'kind|' + b.id + '|' + fid + '|' + k, 'เปลี่ยนเป็น' + KIND_NAME[k])));
    if (!b.project) {
      const projs = [...new Set(all().map(x => x.project).filter(Boolean))].slice(0, 5);
      projs.forEach(pr => items.push(qr_('#' + pr, 'proj|' + b.id + '|' + pr, 'ใส่โปรเจ็ค ' + pr)));
    }
    const st = { draft: '📝 ยังขาดหลักฐาน', ready: '📎 พร้อมเบิก' }[b.status] || b.status;
    billNextPending_(ev.replyToken,
      (p[0] === 'new' ? '➕ สร้างบิลใหม่แล้ว\n' : '📎 แนบแล้ว\n') +
      fmt_(b.date, '') + ' · ' + fmtBaht_(b.amount) + ' · ' + b.desc +
      '\nหลักฐาน: ' + KIND_NAME[kind] + ' · สถานะ: ' + st +
      (Object.keys(fill.filled).length ? '\n🔎 เติมจากหลักฐานให้: ' + Object.keys(fill.filled).map(k => ({ date: 'วันที่', amount: 'ยอด', vendor: 'ร้าน', cat: 'หมวด', desc: 'รายละเอียด', vat: 'VAT', vatAmt: 'ยอด VAT' })[k]).join(' ') : '') +
      (Number(b.amount) ? '' : '\n⚠️ ยังไม่มียอดเงิน ใส่ได้ในแอป') +
      (p[0] === 'new' ? '\nแก้รายละเอียดได้ในแอป หน้า 🧾' : ''), items);
    return;
  }

  const b = all().find(x => x.id === p[1]);
  if (!b) { reply_(ev.replyToken, 'ไม่พบบิลนี้แล้ว'); return; }

  if (p[0] === 'setd' || p[0] === 'seta' || p[0] === 'proj') {
    const t = { id: b.id };
    if (p[0] === 'setd') t.date = p[2];
    if (p[0] === 'seta') t.amount = p[2];
    if (p[0] === 'proj') t.project = p.slice(2).join('|');
    const nb = billSave_(t);
    reply_(ev.replyToken, '✏️ แก้แล้ว: ' + fmt_(nb.date, '') + ' · ' + fmtBaht_(nb.amount) + ' · ' + nb.desc + (nb.project ? ' [' + nb.project + ']' : ''));
    return;
  }

  if (p[0] === 'kind') {
    const f = (b.files || []).find(x => x.id === p[2]);
    if (!f || !KIND_NAME[p[3]]) { reply_(ev.replyToken, 'ไม่พบหลักฐานนี้'); return; }
    f.kind = p[3];
    f.name = billFileName_(b, f.kind, f.mime);
    try { DriveApp.getFileById(f.id).setName(f.name); } catch (e) {}
    if (b.status === 'ready' || b.status === 'draft') { b.status = 'draft'; billAutoStatus_(b); }
    b.updated = stamp_();
    billWrite_(b, billRow_(b.id));
    reply_(ev.replyToken, '✏️ เปลี่ยนเป็น' + KIND_NAME[f.kind] + 'แล้ว · สถานะ: ' + ({ draft: '📝 ยังขาดหลักฐาน', ready: '📎 พร้อมเบิก' }[b.status] || b.status));
  }
}

/* ===================== อ่านหลักฐาน (OCR ของ Google Drive) ===================== */

/** แปลงรูป/PDF เป็นข้อความชั่วคราวผ่าน Google Docs แล้วทิ้งเอกสารชั่วคราว */
function ocrText_(file) {
  const tmp = Drive.Files.create(
    { name: 'ocr-tmp-' + file.getId(), mimeType: 'application/vnd.google-apps.document' },
    file.getBlob(), { ocrLanguage: 'th', fields: 'id' });
  try {
    // ดึงเป็นข้อความตรงๆ (เร็วกว่าเปิดเป็น Google Doc)
    const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + tmp.id + '/export?mimeType=text/plain', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
    if (r.getResponseCode() === 200) return r.getContentText('UTF-8');
    return DocumentApp.openById(tmp.id).getBody().getText();
  } finally {
    try { DriveApp.getFileById(tmp.id).setTrashed(true); } catch (e) {}
  }
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** หา วันที่ และ ยอดรวม จากข้อความในใบเสร็จ { date:'yyyy-mm-dd', amount:'123.45' } */
function readReceipt_(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ');
  const amount = findAmount_(t), v = findVat_(t, amount);
  return { date: findDate_(t), amount: amount, vendor: guessVendor_(t), kind: t ? guessKind_(t) : '', cat: guessCat_(t), vat: v.vat, vatAmt: v.vatAmt };
}

function fixYear_(y) {
  y = Number(y);
  if (y > 2400) return y - 543;                 // พ.ศ. 4 หลัก
  if (y < 100) return y >= 50 ? 2500 + y - 543 : 2000 + y;   // 69 = 2569 = 2026, 26 = 2026
  return y;
}

function findDate_(t) {
  const today = todayStr_(), cands = [];
  const push = (y, m, d) => {
    y = fixYear_(y); m = Number(m); d = Number(d);
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const s = y + '-' + pad_(m) + '-' + pad_(d);
    const age = daysBetween_(s, today);
    if (age >= -1 && age <= 400) cands.push(s);   // ไม่อยู่อนาคต ไม่เก่าเกิน ~1 ปี
  };
  let m;
  const re1 = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/g;                          // 2026-10-28
  while ((m = re1.exec(t))) push(m[1], m[2], m[3]);
  const re2 = /(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/g;      // 28/10/2569, 28-10-26
  while ((m = re2.exec(t))) push(m[3], m[2], m[1]);
  const thAll = TH_MONTHS.map(x => x.replace(/\./g, '\\.?')).concat(TH_MONTHS_FULL).join('|');
  const re3 = new RegExp('(\\d{1,2})\\s*(' + thAll + ')\\s*(\\d{2,4})', 'g');    // 28 ต.ค. 69 / 28 ตุลาคม 2569
  while ((m = re3.exec(t))) {
    const key = m[2].replace(/\./g, '');
    let mi = TH_MONTHS.findIndex(x => x.replace(/\./g, '') === key);
    if (mi < 0) mi = TH_MONTHS_FULL.indexOf(m[2]);
    if (mi > -1) push(m[3], mi + 1, m[1]);
  }
  const re4 = /(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]*(\d{2,4})/gi;   // 28 Oct 2026
  while ((m = re4.exec(t))) push(m[3], EN_MONTHS.indexOf(m[2].toLowerCase()) + 1, m[1]);
  const re5 = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi;          // Oct 28, 2026
  while ((m = re5.exec(t))) push(m[3], EN_MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2]);
  return cands.length ? cands[0] : '';
}

function findAmount_(t) {
  const num = s => Number(String(s).replace(/[,\s]/g, ''));
  const lines = t.split(/\n+/);
  const KEY = /(รวมทั้งสิ้น|ยอดสุทธิ|ยอดรวม|จำนวนเงินรวม|รวมเงิน|ยอดชำระ|ยอดที่ชำระ|ชำระเงิน|จำนวนเงิน|grand\s*total|net\s*total|total|amount\s*paid|amount)/i;
  const MONEY = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2}|\d+)/g;
  let best = 0;
  lines.forEach((ln, i) => {
    if (!KEY.test(ln) || /vat|ภาษีมูลค่าเพิ่ม|ส่วนลด|discount|เงินทอน|change|รับเงิน|cash/i.test(ln)) return;
    const pick = (s) => (s.match(MONEY) || []).map(num).filter(v => v > 0 && v < 10000000);
    let vals = pick(ln);
    if (!vals.length && lines[i + 1]) vals = pick(lines[i + 1]);   // ตัวเลขอยู่บรรทัดถัดไป
    vals.forEach(v => { if (v > best) best = v; });
  });
  return best ? String(Math.round(best * 100) / 100) : '';
}

/** เอาหลักฐานออก (ย้ายไฟล์ไปถังขยะของ Drive กู้คืนได้ 30 วัน) */
function billUnfile_(id, fileId) {
  const row = billRow_(id);
  if (!row) throw new Error('ไม่พบรายการ');
  const b = billsAll_().find(x => x.id === id);
  b.files = (b.files || []).filter(f => f.id !== fileId);
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
  billAutoStatus_(b);
  b.updated = stamp_();
  billWrite_(b, row);
  return b;
}

function billDelete_(id) {
  const row = billRow_(id);
  if (!row) return;
  const b = billsAll_().find(x => x.id === id);
  (b.files || []).forEach(f => { try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {} });
  billSheet_().deleteRow(row);
}

/** ยื่นเบิก/ได้เงินแล้ว หลายรายการพร้อมกัน */
function billMark_(ids, status, claim) {
  if (BILL_STATUS.indexOf(status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  const all = billsAll_(), out = [];
  (ids || []).forEach(id => {
    const row = billRow_(id);
    const b = all.find(x => x.id === id);
    if (!row || !b) return;
    b.status = status;
    if (status === 'submitted') { b.submitted = todayStr_(); b.paid = ''; if (claim) b.claim = String(claim); }
    if (status === 'paid') b.paid = todayStr_();
    if (status === 'ready' || status === 'draft') { b.submitted = ''; b.paid = ''; b.claim = ''; billAutoStatus_(b); }
    b.updated = stamp_();
    billWrite_(b, row);
    out.push(b);
  });
  return out;
}

/** "เบิก 350 ค่าแท็กซี่ #ABC" หรือ "เบิก ค่าแท็กซี่ 350" จากแชท LINE */
function billFromChat_(text) {
  let s = String(text).trim(), project = '', amount = null, date = todayStr_(), m;
  s = s.replace(/(^|\s)#(\S+)/, (all, sp, name) => { project = name; return sp; }).trim();
  if ((m = s.match(/^(วันนี้|เมื่อวานซืน|เมื่อวาน)\s+/))) {
    date = addDays_(todayStr_(), -{ 'วันนี้': 0, 'เมื่อวาน': 1, 'เมื่อวานซืน': 2 }[m[1]]);
    s = s.slice(m[0].length);
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+/))) {
    const y = m[3] ? fixYear_(m[3]) : Number(todayStr_().slice(0, 4));
    let c = y + '-' + pad_(m[2]) + '-' + pad_(m[1]);
    if (!m[3] && c > todayStr_()) c = (y - 1) + '-' + pad_(m[2]) + '-' + pad_(m[1]);
    if (+m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) { date = c; s = s.slice(m[0].length); }
  }
  if ((m = s.match(/^([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)?\s+/))) { amount = m[1]; s = s.slice(m[0].length); }
  else if ((m = s.match(/\s+([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)?$/))) { amount = m[1]; s = s.slice(0, m.index); }
  if (amount === null || !s.trim()) return null;
  return billSave_({ amount: amount, desc: s.trim(), project: project, date: date });
}

/** บรรทัดสรุปบิลสำหรับข้อความตอนเช้า (เฉพาะวันจันทร์) */
function billLine_() {
  const dow = Number(Utilities.formatDate(new Date(), TZ, 'u'));   // 1 = จันทร์
  if (dow !== 1) return '';
  const open = billsAll_().filter(b => b.status === 'draft');
  if (!open.length) return '';
  const sum = open.reduce((s, b) => s + Number(b.amount || 0), 0);
  return '🧾 ขาดหลักฐานเบิกเงิน ' + open.length + ' รายการ (฿' + sum.toLocaleString('en-US') + ')';
}

function billSummaryText_() {
  const all = billsAll_();
  const by = st => all.filter(b => b.status === st);
  const sum = list => list.reduce((s, b) => s + Number(b.amount || 0), 0).toLocaleString('en-US');
  return ['🧾 สรุปเบิกเงิน',
    '• ขาดหลักฐาน ' + by('draft').length + ' รายการ ฿' + sum(by('draft')),
    '• พร้อมเบิก ' + by('ready').length + ' รายการ ฿' + sum(by('ready')),
    '• ยื่นแล้วรอเงิน ' + by('submitted').length + ' รายการ ฿' + sum(by('submitted'))].join('\n');
}

/** ทำรูปย่อให้ไฟล์ที่ยังไม่มี (PDF / รูปจาก LINE) ของเดือนนั้น โดยใช้รูปย่อของ Google Drive */
function billThumbs_(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('เดือนไม่ถูกต้อง');
  const token = ScriptApp.getOAuthToken(), out = [], start = Date.now();
  billsAll_().filter(b => String(b.date).slice(0, 7) === month).forEach(b => {
    let dirty = false;
    (b.files || []).forEach(f => {
      if (f.thumb || !f.id || Date.now() - start > 20000) return;
      try {
        const meta = Drive.Files.get(f.id, { fields: 'thumbnailLink' });
        if (!meta || !meta.thumbnailLink) return;
        for (const n of [220, 160, 110]) {
          const r = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+[^/]*$/, '=s' + n),
            { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
          if (r.getResponseCode() !== 200) break;
          const blob = r.getBlob();
          const d = 'data:' + (blob.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(blob.getBytes());
          if (d.length <= 12000) { f.thumb = d; dirty = true; break; }
        }
      } catch (e) {}
    });
    if (dirty) { billWrite_(b, billRow_(b.id)); out.push(b); }
  });
  return out;
}

/** เปลี่ยนชนิดหลักฐานของไฟล์หนึ่ง (จากหน้าเว็บ) */
function billFileKind_(id, fileId, kind) {
  const row = billRow_(id);
  if (!row) throw new Error('ไม่พบรายการ');
  if (!KIND_NAME[kind]) throw new Error('ชนิดไม่ถูกต้อง');
  const b = billsAll_().find(x => x.id === id);
  const f = (b.files || []).find(x => x.id === fileId);
  if (!f) throw new Error('ไม่พบหลักฐานนี้');
  f.kind = kind;
  f.name = billFileName_(b, kind, f.mime);
  try { DriveApp.getFileById(f.id).setName(f.name); } catch (e) {}
  if (b.status === 'ready' || b.status === 'draft') { b.status = 'draft'; billAutoStatus_(b); }
  b.updated = stamp_();
  billWrite_(b, row);
  return b;
}

/** รายการบิลทั้งหมด + ปรับสถานะบิลที่มีหลักฐานแล้วแต่ยังค้าง "ขาดหลักฐาน" (เช่น มีแต่สลิป) */
function billsListFixed_() {
  const all = billsAll_();
  all.forEach(b => {
    if (b.status !== 'draft' || !(b.files || []).length) return;
    billAutoStatus_(b);
    if (b.status !== 'draft') { b.updated = stamp_(); billWrite_(b, billRow_(b.id)); }
  });
  return all;
}

/** เติมข้อมูลจากหลักฐานที่อ่านได้ (ไม่ทับสิ่งที่ผู้ใช้ตั้งใจใส่ไว้)
 *  ยอด: เติมเมื่อยังไม่มียอด · วันที่: เติมเมื่อยังเป็นวันที่จด (ค่าเริ่มต้น) · ร้าน/หมวด: เติมเมื่อว่าง
 *  รายละเอียด: แทนข้อความชั่วคราว เช่น "รอใส่รายละเอียด" */
function billAutoFill_(b, ocr) {
  const filled = {}, prev = {};
  if (!ocr) return { filled, prev };
  const set = (k, v) => { prev[k] = b[k] || ''; b[k] = String(v); filled[k] = String(v); };
  const created = String(b.created || '').slice(0, 10);
  if (ocr.amount && !Number(b.amount)) set('amount', ocr.amount);
  if (ocr.date && ocr.date !== b.date && (!b.date || b.date === created)) set('date', ocr.date);
  if (ocr.vendor && !String(b.vendor || '').trim()) set('vendor', ocr.vendor);
  if (ocr.cat && !String(b.cat || '').trim()) set('cat', ocr.cat);
  if (ocr.vendor && /^(รอใส่รายละเอียด|ใบเสร็จจาก LINE)$/.test(String(b.desc || '').trim())) set('desc', ocr.vendor);
  if (ocr.vat && !b.vat) set('vat', ocr.vat);
  if (ocr.vatAmt && !Number(b.vatAmt) && b.vat === 'yes') set('vatAmt', ocr.vatAmt);
  return { filled, prev };
}

/** มี VAT ไหม และยอด VAT เท่าไหร่ (จากข้อความในเอกสาร) */
function findVat_(t, total) {
  t = String(t || '');
  if (!t.trim()) return { vat: '', vatAmt: '' };
  const has = /ภาษีมูลค่าเพิ่ม|\bvat\b|tax\s*invoice|ใบกำกับภาษี/i.test(t);
  if (!has) return { vat: total ? 'no' : '', vatAmt: '' };
  const num = s => Number(String(s).replace(/[,\s]/g, ''));
  const lines = t.split(/\n+/);
  let amt = 0;
  lines.forEach((ln, i) => {
    if (amt || !/ภาษีมูลค่าเพิ่ม|\bvat\b/i.test(ln) || /ไม่รวม|ก่อน|excl|before|รวมภาษี|incl/i.test(ln)) return;
    const pick = s => (s.replace(/\d+(\.\d+)?\s*%/g, ' ').match(/\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g) || []).map(num).filter(v => v > 0);
    let vals = pick(ln);
    if (!vals.length && lines[i + 1]) vals = pick(lines[i + 1]);
    const ok = vals.filter(v => !total || v < Number(total) * 0.2);   // VAT 7% ≈ 6.5% ของยอดรวม
    if (ok.length) amt = ok[ok.length - 1];
  });
  if (!amt && total) amt = Math.round(Number(total) * 7 / 107 * 100) / 100;   // คำนวณจากยอดรวม
  return { vat: 'yes', vatAmt: amt ? String(amt) : '' };
}

/** ไฟล์นี้มีเอกสารตัวจริงไหม (มี = ไม่ต้องแนบภาพท้ายใบเบิก) */
function billFileOrig_(id, fileId, orig) {
  const row = billRow_(id);
  if (!row) throw new Error('ไม่พบรายการ');
  const b = billsAll_().find(x => x.id === id);
  const f = (b.files || []).find(x => x.id === fileId);
  if (!f) throw new Error('ไม่พบหลักฐานนี้');
  f.orig = !!orig;
  b.updated = stamp_();
  billWrite_(b, row);
  return b;
}

/** ภาพหลักฐานขนาดพอพิมพ์ สำหรับแนบท้ายใบเบิก (รูป = ไฟล์จริง, PDF = ภาพหน้าแรกจาก Drive) */
function billImages_(fileIds, full) {
  const token = ScriptApp.getOAuthToken(), out = {}, start = Date.now();
  (fileIds || []).slice(0, 40).forEach(id => {
    if (Date.now() - start > 240000) return;
    try {
      const meta = Drive.Files.get(id, { fields: 'mimeType,thumbnailLink' });
      let blob = null;
      if (/^image\//.test(meta.mimeType)) blob = DriveApp.getFileById(id).getBlob();
      else if (meta.thumbnailLink) {
        const r = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+[^/]*$/, '=s1600'),
          { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
        if (r.getResponseCode() === 200) blob = r.getBlob();
      }
      if (blob) out[id] = { src: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()), pdf: meta.mimeType === 'application/pdf' };
      // เต็มหน้า: ส่งไฟล์ PDF ทั้งไฟล์ไปให้หน้าเว็บแปลงทุกหน้าเป็นภาพความละเอียดเต็ม
      if (full && meta.mimeType === 'application/pdf') {
        const pb = DriveApp.getFileById(id).getBlob();
        if (pb.getBytes().length < 8 * 1024 * 1024) { out[id] = out[id] || { pdf: true }; out[id].pdfData = Utilities.base64Encode(pb.getBytes()); }
      }
    } catch (e) {}
  });
  return out;
}

/** สำเนาบัตรประชาชนผู้รับเงิน (ใช้ในใบสำคัญรับเงิน) เก็บใน Drive โฟลเดอร์หลักฐาน · อ่านเลขบัตรให้ถ้าได้ */
function claimIdCard_(p) {
  const cfg = JSON.parse(props.getProperty('CLAIM_CFG') || '{}');
  if (cfg.idFile) { try { DriveApp.getFileById(cfg.idFile).setTrashed(true); } catch (e) {} }
  cfg.idFile = '';
  let idNo = '';
  if (!p.remove) {
    const mime = String(p.mime || 'image/jpeg');
    if (!/^image\//.test(mime)) throw new Error('รองรับเฉพาะรูป');
    const file = billFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(String(p.data || '')), mime, 'สำเนาบัตรประชาชน.jpg'));
    cfg.idFile = file.getId();
    try {
      const t = ocrText_(file).replace(/[Oo]/g, '0');
      const m = t.match(/(?:^|\D)(\d)[\s-]?(\d{4})[\s-]?(\d{5})[\s-]?(\d{2})[\s-]?(\d)(?!\d)/);
      if (m) {
        const d = m.slice(1).join('');
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
        if ((11 - sum % 11) % 10 === Number(d[12])) idNo = d[0] + ' ' + d.slice(1, 5) + ' ' + d.slice(5, 10) + ' ' + d.slice(10, 12) + ' ' + d[12];   // ตรวจเลขหลักสุดท้ายแล้ว
      }
    } catch (e) {}
  }
  props.setProperty('CLAIM_CFG', JSON.stringify(cfg));
  return { cfg: { idFile: cfg.idFile }, idNo: idNo };
}
