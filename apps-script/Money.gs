/**
 * จดครบ — รายรับ-รายจ่ายส่วนตัว (แยกจากบิลเบิกเงินบริษัท)
 * ข้อมูลอยู่แท็บ "Money" ใน Sheet เดียวกัน · รูปสลิปอยู่ Google Drive โฟลเดอร์ "จดครบ - รายรับรายจ่าย/ปี-เดือน"
 */

const MONEY_SHEET = 'Money';
const MONEY_HEADERS = ['id', 'date', 'type', 'amount', 'cat', 'note', 'pay', 'file', 'created', 'updated'];
// type: out = รายจ่าย | in = รายรับ · file: JSON {id,url,thumb,mime} ของสลิป/ใบเสร็จ (ถ้ามี)
const MONEY_FOLDER = 'จดครบ - รายรับรายจ่าย';

const MONEY_CATS = {
  out: [
    ['อาหาร', /ข้าว|ก๋วยเตี๋ยว|อาหาร|กับข้าว|ส้มตำ|หมูกระทะ|ชาบู|บุฟเฟ่|ร้านอาหาร|line\s*man|grab\s*food|foodpanda|robinhood|ขนม|มื้อ|kfc|mcdonald|mk\b|เซเว่น|7-?eleven|ตลาด/i],
    ['เครื่องดื่ม/กาแฟ', /กาแฟ|ชานม|ชาไข่มุก|coffee|cafe|café|คาเฟ่|starbucks|amazon|อเมซอน|น้ำดื่ม|เครื่องดื่ม|เบียร์/i],
    ['เดินทาง', /grab|bolt|แท็กซี่|taxi|bts|mrt|รถไฟ|รถเมล์|วินมอไซ|มอเตอร์ไซค์รับจ้าง|น้ำมัน|เติมน้ำมัน|ปตท|ptt|บางจาก|shell|caltex|ทางด่วน|easy\s*pass|m-?pass|จอดรถ|ตั๋ว|เครื่องบิน|airasia/i],
    ['ค่าเช่าห้อง', /ค่าเช่า|ค่าห้อง|เช่าห้อง|คอนโด|หอพัก|อพาร์ท|ส่วนกลาง/i],
    ['เสื้อผ้า', /เสื้อ|กางเกง|กระโปรง|ชุด|รองเท้า|ถุงเท้า|uniqlo|h&m|zara|เสื้อผ้า/i],
    ['อุปกรณ์กีฬา', /อุปกรณ์กีฬา|ไม้แบด|ลูกแบด|ลูกขนไก่|ไม้เทนนิส|ลูกบอล|ฟุตบอล|ดัมเบล|เสื่อโยคะ|จักรยาน|decathlon|super\s*sports|กีฬา/i],
    ['ออกกำลังกาย', /ฟิตเนส|fitness|gym|ยิม|วิ่ง|ว่ายน้ำ|สระ|โยคะ|yoga|มวย|แบด|ค่าสนาม|ค่าคอร์ท|เทรนเนอร์|ปั่นจักรยาน|ออกกำลัง/i],
    ['ค่าน้ำไฟ/โทรศัพท์', /ค่าไฟ|การไฟฟ้า|ค่าน้ำ|การประปา|ค่าเน็ต|อินเทอร์เน็ต|internet|wifi|ais|true|dtac|ค่าโทร|มือถือ|รายเดือน/i],
    ['สุขภาพ', /ยา\b|ร้านยา|หมอ|คลินิก|โรงพยาบาล|ทันตกรรม|ทำฟัน|ประกันสุขภาพ/i],
    ['เติมเกม', /เติมเกม|เติมเพชร|เติมเงินเกม|top-?up|rov|free\s*fire|pubg|genshin|honkai|garena|steam|playstation|psn|nintendo|valorant|razer\s*gold|truemoney\s*game/i],
    ['การ์ด', /การ์ด|โปเกมอน|pokemon|pokémon|yu-?gi-?oh|ยูกิ|tcg|บูสเตอร์|booster|one\s*piece\s*card|magic\s*the\s*gathering|การ์ดเกม/i],
    ['บันเทิง/ท่องเที่ยว', /หนัง|โรงหนัง|major|netflix|spotify|youtube|disney|คอนเสิร์ต|เที่ยว|โรงแรม|hotel|agoda|ที่พัก/i],
    ['ซักผ้า', /ซักผ้า|ร้านซัก|เครื่องซัก|อบผ้า|ผงซักฟอก|น้ำยาซักผ้า|ปรับผ้านุ่ม|ซักรีด|รีดผ้า|otteri|หยอดเหรียญ/i],
    ['ของใช้', /ของใช้|สบู่|แชมพู|ยาสีฟัน|แปรงสีฟัน|ทิชชู่|ทิชชู|กระดาษชำระ|ถุงขยะ|โฟมล้างหน้า|ครีม|ผ้าอนามัย|มีดโกน|watsons|วัตสัน|boots|eveandboy|shopee|lazada|lotus|โลตัส|big\s*c|บิ๊กซี|makro|แม็คโคร|tops|ikea|เฟอร์นิเจอร์/i],
    ['การศึกษา', /หนังสือ|คอร์ส|course|เรียน|ค่าเทอม|udemy/i],
  ],
  in: [
    ['เงินเดือน', /เงินเดือน|salary|payroll/i],
    ['โบนัส', /โบนัส|bonus/i],
    ['งานเสริม/ฟรีแลนซ์', /ฟรีแลนซ์|freelance|งานเสริม|ค่าจ้าง|ค่าแรง|รับงาน/i],
    ['ขายของ', /ขาย|ขายของ|ออเดอร์/i],
    ['ดอกเบี้ย/ปันผล', /ดอกเบี้ย|ปันผล|dividend|interest/i],
    ['ได้เงินคืน', /คืน|refund|cashback|เบิกได้/i],
  ],
};

/** เดาหมวดจากข้อความ (ประวัติที่เคยจดก่อน แล้วค่อยคำสำคัญ) */
function moneyGuessCat_(type, text, all) {
  const t = String(text || '').trim();
  if (!t) return '';
  const hit = (all || []).slice().reverse().find(x => x.type === type && x.cat && String(x.note).trim() === t);
  if (hit) return hit.cat;
  const r = (MONEY_CATS[type] || []).find(x => x[1].test(t));
  return r ? r[0] : '';
}

function moneySheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(MONEY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MONEY_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), MONEY_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, MONEY_HEADERS.length).setValues([MONEY_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function moneyAll_() {
  const sh = moneySheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, MONEY_HEADERS.length).getDisplayValues()
    .filter(r => r[0])
    .map(r => {
      const m = Object.fromEntries(MONEY_HEADERS.map((h, i) => [h, r[i]]));
      try { m.file = m.file ? JSON.parse(m.file) : null; } catch (e) { m.file = null; }
      return m;
    });
}

function moneyRow_(id) {
  const sh = moneySheet_();
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const i = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]).indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

function moneyWrite_(m, row) {
  const sh = moneySheet_();
  const out = Object.assign({}, m, { file: m.file ? JSON.stringify(m.file) : '' });
  const r = row || sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, MONEY_HEADERS.length).setNumberFormat('@').setValues([MONEY_HEADERS.map(h => String(out[h] == null ? '' : out[h]))]);
}

/** บันทึก (ส่งมาเฉพาะบางช่องได้) */
function moneySave_(t) {
  if (!t) throw new Error('ไม่มีข้อมูล');
  const row = moneyRow_(t.id);
  const cur = row ? moneyAll_().find(x => x.id === t.id) : null;
  const now = stamp_();
  const m = cur || { id: t.id || Utilities.getUuid().replace(/-/g, ''), type: 'out', amount: '0', created: now, file: null };
  ['date', 'cat', 'note', 'pay'].forEach(k => { if (t[k] !== undefined) m[k] = String(t[k]).trim().slice(0, 300); });
  if (t.type !== undefined) m.type = t.type === 'in' ? 'in' : 'out';
  if (t.amount !== undefined) {
    const a = Number(String(t.amount).replace(/[,\s]/g, ''));
    if (!(a >= 0)) throw new Error('จำนวนเงินไม่ถูกต้อง');
    m.amount = String(Math.round(a * 100) / 100);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))) m.date = todayStr_();
  m.updated = now;
  moneyWrite_(m, row);
  return m;
}

function moneyDelete_(id) {
  const row = moneyRow_(id);
  if (!row) return;
  const m = moneyAll_().find(x => x.id === id);
  if (m && m.file && m.file.id) { try { DriveApp.getFileById(m.file.id).setTrashed(true); } catch (e) {} }
  moneySheet_().deleteRow(row);
}

function moneyFolder_(month) {
  let id = props.getProperty('MONEY_FOLDER_ID'), root = null;
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) { root = DriveApp.createFolder(MONEY_FOLDER); props.setProperty('MONEY_FOLDER_ID', root.getId()); }
  if (!month) return root;
  const it = root.getFoldersByName(month);
  return it.hasNext() ? it.next() : root.createFolder(month);
}

/** เก็บไฟล์ในโฟลเดอร์เดือน ตั้งชื่อ แล้วผูกกับรายการ */
function moneyAttach_(m, file, mime, thumb) {
  const name = [m.date, (m.type === 'in' ? '+' : '-') + m.amount + 'บ', String(m.note || m.cat || '').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 40).trim()].join('_') + (mime === 'application/pdf' ? '.pdf' : '.jpg');
  file.setName(name);
  try { file.moveTo(moneyFolder_(String(m.date).slice(0, 7))); } catch (e) {}
  m.file = { id: file.getId(), url: file.getUrl(), mime: mime, thumb: String(thumb || '').slice(0, 12000) };
  m.updated = stamp_();
  moneyWrite_(m, moneyRow_(m.id));
  return m;
}

/** 📷 สลิป/ใบเสร็จ → รายการใหม่ (อ่านยอด วันที่ ร้าน/ผู้รับเงิน) */
function moneySnap_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const file = moneyFolder_().createFile(Utilities.newBlob(bytes, mime, 'upload'));
  let text = '', o = {};
  try { text = ocrText_(file); o = readReceipt_(text); } catch (e) { o = {}; }
  const type = p.type === 'in' ? 'in' : 'out';
  const t = p.item || {};
  const note = t.note || o.vendor || (type === 'in' ? 'รายรับ' : 'รายจ่าย');
  const m = moneySave_({
    id: t.id, type: type, date: t.date || o.date || todayStr_(),
    amount: t.amount !== undefined && t.amount !== null && t.amount !== '' ? t.amount : (o.amount || 0),
    note: note, cat: t.cat || moneyGuessCat_(type, note + ' ' + text.slice(0, 400), moneyAll_()), pay: t.pay || (/โอน|พร้อมเพย์|promptpay|transfer/i.test(text) ? 'โอน' : ''),
  });
  moneyAttach_(m, file, mime, p.thumb);
  return { item: m, ocr: o };
}

/* ===================== LINE ===================== */

/** "จ่าย 120 ข้าว", "-120 ข้าว", "รับ 25000 เงินเดือน", "+500 ขายของ", "จ่าย ข้าว 80" */
function moneyFromChat_(text) {
  let s = String(text).trim(), type = 'out', m;
  if ((m = s.match(/^(รับ|รายรับ|\+)\s*/))) { type = 'in'; s = s.slice(m[0].length); }
  else if ((m = s.match(/^(จ่าย|รายจ่าย|-)\s*/))) { s = s.slice(m[0].length); }
  let date = todayStr_();
  if ((m = s.match(/^(เมื่อวาน|เมื่อวานนี้)\s*/))) { date = addDays_(date, -1); s = s.slice(m[0].length); }
  const am = s.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(บาท|บ\.?)?/);
  if (!am) return null;
  const amount = Number(am[1].replace(/,/g, ''));
  const note = (s.slice(0, am.index) + ' ' + s.slice(am.index + am[0].length)).replace(/\s+/g, ' ').trim();
  const all = moneyAll_();
  const it = moneySave_({ type: type, date: date, amount: amount, note: note || (type === 'in' ? 'รายรับ' : 'รายจ่าย'), cat: moneyGuessCat_(type, note, all) });
  return it;
}

function moneyMonth_(month) {
  const list = moneyAll_().filter(x => String(x.date).slice(0, 7) === month);
  const sum = t => list.filter(x => x.type === t).reduce((s, x) => s + Number(x.amount || 0), 0);
  return { list: list, inc: sum('in'), out: sum('out') };
}

function moneyLineAfter_(it) {
  const m = moneyMonth_(String(it.date).slice(0, 7));
  return (it.type === 'in' ? '💰 รับ ' : '💸 จ่าย ') + fmtBaht_(it.amount) + ' · ' + it.note + (it.cat ? ' [' + it.cat + ']' : '') +
    (it.date !== todayStr_() ? ' · ' + fmt_(it.date, '') : '') +
    '\nเดือนนี้ รับ ' + fmtBaht_(m.inc) + ' · จ่าย ' + fmtBaht_(m.out) + ' · เหลือ ' + fmtBaht_(m.inc - m.out);
}

function moneySummaryText_() {
  const month = todayStr_().slice(0, 7);
  const m = moneyMonth_(month);
  const by = {};
  m.list.filter(x => x.type === 'out').forEach(x => { const k = x.cat || 'อื่นๆ'; by[k] = (by[k] || 0) + Number(x.amount || 0); });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return '💰 เดือนนี้\nรายรับ ' + fmtBaht_(m.inc) + '\nรายจ่าย ' + fmtBaht_(m.out) + '\nคงเหลือ ' + fmtBaht_(m.inc - m.out) +
    (top.length ? '\n\nจ่ายมากสุด\n' + top.map(([k, v]) => '• ' + k + ' ' + fmtBaht_(v)).join('\n') : '') +
    '\n\nจด: จ่าย 120 ข้าว · รับ 25000 เงินเดือน';
}

/** รูปที่ส่งมาทาง LINE (รอจัด) → รายรับ/รายจ่ายส่วนตัว */
function moneyFromPending_(fid, type, pend) {
  const file = DriveApp.getFileById(fid);
  const o = (pend && pend.ocr) || {};
  const note = (pend && pend.vendor) || (type === 'in' ? 'รายรับ' : 'รายจ่าย');
  const m = moneySave_({ type: type, date: o.date || todayStr_(), amount: o.amount || 0, note: note,
    cat: moneyGuessCat_(type, note, moneyAll_()), pay: pend && pend.kind === 'slip' ? 'โอน' : '' });
  return moneyAttach_(m, file, (pend && pend.mime) || file.getMimeType(), '');
}
