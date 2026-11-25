/**
 * จดครบ — 🤝 ค้างกัน (ยืม / ให้ยืม / หารค่าใช้จ่าย)
 * เก็บเป็นเอกสาร JSON ต่อแถวในแท็บ "Owe" · คำนวณยอดหาร/หักลบที่ฝั่งแอป
 *   kind=debt  : รายการค้างระหว่างเรากับคนหนึ่ง {person, dir:'they'|'me', amount, payments[], status, splitId?}
 *   kind=split : บิลหารกัน/ทริป {title, people[], bills[], transfers[], moneyId}
 */

const OWE_SHEET = 'Owe';
const OWE_HEADERS = ['id', 'kind', 'data', 'updated'];

function oweSheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(OWE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OWE_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), OWE_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, OWE_HEADERS.length).setValues([OWE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function oweAll_() {
  const sh = oweSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, OWE_HEADERS.length).getDisplayValues().filter(r => r[0]).map(r => {
    try { return Object.assign(JSON.parse(r[2] || '{}'), { id: r[0], kind: r[1], updated: r[3] }); } catch (e) { return null; }
  }).filter(Boolean);
}

function oweRow_(id) {
  const sh = oweSheet_(), last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const i = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]).indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

/** บันทึกหลายเอกสารพร้อมกัน (สร้าง/แทนที่) */
function oweSave_(docs) {
  if (!Array.isArray(docs)) docs = [docs];
  const sh = oweSheet_(), now = stamp_(), out = [];
  docs.forEach(d => {
    if (!d || !/^(debt|split)$/.test(d.kind)) throw new Error('ข้อมูลไม่ถูกต้อง');
    const id = /^[A-Za-z0-9]{8,64}$/.test(String(d.id || '')) ? String(d.id) : Utilities.getUuid().replace(/-/g, '');
    const doc = Object.assign({}, d, { id: id });
    delete doc.updated;
    const json = JSON.stringify(doc);
    if (json.length > 45000) throw new Error('ข้อมูลยาวเกินไป');
    const row = oweRow_(id) || sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, OWE_HEADERS.length).setNumberFormat('@').setValues([[id, doc.kind, json, now]]);
    out.push(Object.assign(doc, { updated: now }));
  });
  return out;
}

function oweDelete_(ids) {
  if (!Array.isArray(ids)) ids = [ids];
  const sh = oweSheet_();
  ids.map(oweRow_).filter(Boolean).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  return true;
}

/** แนบสลิปการคืนเงิน → โฟลเดอร์รายรับรายจ่าย/เดือน */
function oweSlip_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : todayStr_();
  const name = [date, 'คืนเงิน', String(p.label || '').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 40).trim()].join('_') + (mime === 'application/pdf' ? '.pdf' : '.jpg');
  const file = moneyFolder_(date.slice(0, 7)).createFile(Utilities.newBlob(Utilities.base64Decode(String(p.data || '')), mime, name));
  return { id: file.getId(), url: file.getUrl(), mime: mime, thumb: String(p.thumb || '').slice(0, 12000) };
}

/* ===================== 💬 LINE: ค้างกัน ===================== */
/* ใครค้าง · ต้นยืม 500 · ยืมต้น 500 · ต้นคืน 200 · คืนต้น 200 · หาร 1200 เอ็ม เจ · หาร ชาบู 1200 เอ็ม เจ */
const oweS_ = v => Math.round(Number(String(v == null ? '' : v).replace(/[,\s฿]/g, '')) * 100) || 0;
const owePaidS_ = d => (d.payments || []).reduce((s, p) => s + oweS_(p.amount), 0);
const oweLeftS_ = d => d.status === 'forgiven' ? 0 : Math.max(0, oweS_(d.amount) - owePaidS_(d));
const oweB_ = s => fmtBaht_(s / 100);
const oweId_ = () => Utilities.getUuid().replace(/-/g, '');

/** ยอดสุทธิรายคน (+ = เขาค้างเรา) */
function oweNet_(docs) {
  const m = {};
  (docs || oweAll_()).filter(d => d.kind === 'debt').forEach(d => {
    const l = oweLeftS_(d);
    if (!l) return;
    const p = m[d.person] = m[d.person] || { name: d.person, net: 0, due: '' };
    p.net += d.dir === 'they' ? l : -l;
    if (d.due && (!p.due || d.due < p.due)) p.due = d.due;
  });
  return Object.values(m).filter(p => p.net);
}

function oweSummaryText_() {
  const ps = oweNet_();
  if (!ps.length) return '🤝 ไม่มีใครค้างกันแล้ว 🎉';
  const they = ps.filter(p => p.net > 0).sort((a, b) => b.net - a.net), me = ps.filter(p => p.net < 0).sort((a, b) => a.net - b.net);
  const line = p => '• ' + p.name + ' ' + oweB_(Math.abs(p.net)) + (p.due ? ' (นัด ' + fmt_(p.due, '') + ')' : '');
  const out = ['🤝 ค้างกัน (หักลบรายคนแล้ว)'];
  if (they.length) out.push('', '💰 ใครค้างเรา รวม ' + oweB_(they.reduce((s, p) => s + p.net, 0)), ...they.map(line));
  if (me.length) out.push('', '🙏 เราค้างใคร รวม ' + oweB_(-me.reduce((s, p) => s + p.net, 0)), ...me.map(line));
  out.push('', 'จดเพิ่ม: ต้นยืม 500 · ยืมต้น 500 · ต้นคืน 200 · คืนต้น 200 · หาร 1200 เอ็ม เจ');
  return out.join('\n');
}

/** ชื่อที่พิมพ์ → ชื่อที่มีอยู่แล้ว (ตรงกัน หรือขึ้นต้นเหมือนกันคนเดียว) */
function owePerson_(name, docs) {
  name = String(name || '').trim();
  const all = [...new Set(docs.filter(d => d.kind === 'debt').map(d => d.person))];
  if (all.indexOf(name) > -1) return name;
  const hit = all.filter(p => p.indexOf(name) === 0 || name.indexOf(p) === 0);
  return hit.length === 1 ? hit[0] : name;
}

function oweLoanLine_(person, dir, amount, title) {
  const docs = oweAll_();
  person = owePerson_(person, docs);
  const d = { id: oweId_(), kind: 'debt', person: person, dir: dir, amount: Math.round(amount * 100) / 100, date: todayStr_(), title: String(title || '').trim().slice(0, 80), payments: [], status: 'open', created: todayStr_() };
  oweSave_([d]);
  const net = (oweNet_(docs.concat([d])).find(p => p.name === person) || { net: 0 }).net;
  return (dir === 'they' ? '💸 ' + person + ' ยืม ' : '🙏 ยืม ' + person + ' ') + fmtBaht_(amount) + (d.title ? ' · ' + d.title : '') +
    '\n(ไม่นับเป็นรายจ่าย/รายรับ)\nตอนนี้ ' + (net > 0 ? person + ' ค้างเรา ' + oweB_(net) : net < 0 ? 'เราค้าง ' + person + ' ' + oweB_(-net) : 'ไม่มียอดค้างกับ ' + person);
}

/** รับ/จ่ายคืน ไล่จากรายการเก่าสุดก่อน · file = สลิป {id,url,mime} */
function owePayLine_(person, dir, amount, file, date) {
  const docs = oweAll_();
  person = owePerson_(person, docs);
  const open = docs.filter(d => d.kind === 'debt' && d.person === person && d.dir === dir && oweLeftS_(d) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!open.length) return { text: 'ไม่พบยอดที่' + (dir === 'they' ? ' ' + person + ' ค้างเรา' : 'เราค้าง ' + person) + '\nพิมพ์ ใครค้าง เพื่อดูรายชื่อ', ok: false };
  let rest = Math.round(amount * 100);
  const changed = [], lines = [];
  open.forEach(d => {
    if (rest <= 0) return;
    const take = Math.min(rest, oweLeftS_(d));
    d.payments = (d.payments || []).concat([{ id: oweId_(), date: date || todayStr_(), amount: take / 100, via: 'โอน', file: file || null }]);
    d.status = oweLeftS_(d) ? 'open' : 'done';
    rest -= take; changed.push(d);
    lines.push('• ' + (d.title || (d.splitId ? 'หารกัน' : 'ยืม')) + ' ' + oweB_(take) + (d.status === 'done' ? ' ✓ ครบ' : ' (เหลือ ' + oweB_(oweLeftS_(d)) + ')'));
  });
  oweSave_(changed);
  const left = open.reduce((s, d) => s + oweLeftS_(d), 0);
  return { ok: true, text: (dir === 'they' ? '💵 รับคืนจาก ' : '💸 จ่ายคืน ') + person + ' ' + oweB_(Math.round(amount * 100) - rest) + '\n' + lines.join('\n') +
    (rest > 0 ? '\n⚠️ เกินยอดค้าง ' + oweB_(rest) + ' (ไม่ได้จด)' : '') + '\n' + (left ? 'ยังเหลือ ' + oweB_(left) : '✅ เคลียร์ครบแล้ว') + '\n(ไม่นับเป็นรายจ่าย/รายรับ)' };
}

/** หารเท่ากัน: เราจ่ายไปก่อน คนอื่นค้างเราคนละส่วน · จดรายจ่ายเฉพาะส่วนของเรา */
function oweSplitLine_(total, names, title) {
  const docs = oweAll_();
  names = [...new Set(names.map(n => owePerson_(n, docs)).filter(n => n && n !== 'ฉัน'))];
  if (!names.length) return 'ใส่ชื่อคนหารด้วย เช่น หาร 1200 เอ็ม เจ';
  const people = ['ฉัน'].concat(names), T = Math.round(total * 100), n = people.length;
  const unit = T % (100 * n) === 0 ? 100 : 1, base = Math.floor(T / unit / n) * unit;
  let extra = T - base * n;
  const shares = {};
  people.forEach(p => { const add = extra > 0 ? unit : 0; extra -= add; shares[p] = base + add; });   // เศษไปที่เราก่อน
  title = String(title || '').trim().slice(0, 80) || 'หารกัน';
  const date = todayStr_(), sid = oweId_();
  const bill = { id: oweId_(), title: '', payer: 'ฉัน', method: 'equal', total: String(total), who: people.slice(), custom: {}, items: [], svc: false, vat: false, disc: '',
    shares: Object.fromEntries(people.map(p => [p, shares[p] / 100])), sum: T / 100 };
  const sp = { id: sid, kind: 'split', title: title, date: date, people: people, bills: [bill], total: T / 100, via: 'line',
    transfers: names.map(p => ({ from: p, to: 'ฉัน', amount: shares[p] / 100, done: false })) };
  const debts = names.map(p => ({ id: oweId_(), kind: 'debt', person: p, dir: 'they', amount: shares[p] / 100, date: date, title: title, splitId: sid, payments: [], status: 'open', created: date }));
  const mine = shares['ฉัน'] / 100;
  const m = moneySave_({ type: 'out', date: date, amount: mine, note: title + ' (หาร ' + n + ' คน · ส่วนของฉัน)', cat: moneyGuessCat_('out', title, moneyAll_()) || 'อาหาร' });
  sp.moneyId = m.id;
  oweSave_([sp].concat(debts));
  return '🍜 ' + title + ' ' + fmtBaht_(total) + ' หาร ' + n + ' คน\n' + names.map(p => '• ' + p + ' ค้างเรา ' + oweB_(shares[p])).join('\n') +
    '\n📒 จดรายจ่ายส่วนของเรา ' + fmtBaht_(mine) + '\nแก้/หารตามเมนู/แนบใบเสร็จ ได้ในแอป หน้า 🍜 หารกัน';
}

/** ข้อความ LINE ที่เป็นคำสั่งค้างกัน → ข้อความตอบ (ไม่ใช่ = '') ต้องเรียกในล็อก */
function oweLineText_(text) {
  let m;
  const num = s => Number(String(s).replace(/,/g, ''));
  if (/^(ใครค้าง|ค้าง|ค้างกัน|ใครติด|หนี้|🤝)$/.test(text)) return oweSummaryText_();
  if ((m = text.match(/^หาร\s+(?:(\S+?)\s+)?([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?\s+(.+)$/))) {
    const names = m[3].split(/[\s,]+|กับ|และ/).map(s => s.trim()).filter(Boolean);
    return oweSplitLine_(num(m[2]), names, m[1] || '');
  }
  if ((m = text.match(/^(?:ให้)?\s*(\S+?)\s*ยืม\s*([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?\s*(.*)$/)) && !/^(เรา|ฉัน|ผม)$/.test(m[1])) return oweLoanLine_(m[1], 'they', num(m[2]), m[3]);
  if ((m = text.match(/^ยืม\s*(\S+?)\s+([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?\s*(.*)$/))) return oweLoanLine_(m[1], 'me', num(m[2]), m[3]);
  // คืน: ใช้เฉพาะชื่อที่มีในค้างกันอยู่แล้ว (กัน "ภาษีคืน 5000" กลายเป็นการคืนเงิน)
  const known = n => { const docs = oweAll_(); return docs.some(d => d.kind === 'debt' && d.person === owePerson_(n, docs)); };
  if ((m = text.match(/^คืน\s*(\S+?)\s+([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?$/)) && known(m[1])) return owePayLine_(m[1], 'me', num(m[2])).text;
  if ((m = text.match(/^(\S+?)\s*คืน\s*([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?$/)) && known(m[1])) return owePayLine_(m[1], 'they', num(m[2])).text;
  return '';
}

/** ปุ่ม 💵 รับคืนจาก… ตอนส่งสลิปเข้า LINE (คนที่ค้างเรา ยอดตรง/ชื่อตรงขึ้นก่อน) */
function oweSlipButtons_(fid, amt, hint) {
  if (!amt) return [];
  let ps;
  try { ps = oweNet_().filter(p => p.net > 0); } catch (e) { return []; }
  const A = Math.round(amt * 100), h = String(hint || '');
  ps.sort((a, b) => (+(b.net === A) - +(a.net === A)) || (+(h.indexOf(b.name) > -1) - +(h.indexOf(a.name) > -1)) || b.net - a.net);
  return ps.slice(0, 3).map(p => qr_('💵 คืนจาก ' + p.name, 'orep|' + fid + '|' + p.name, 'รับคืนจาก ' + p.name + ' ' + fmtBaht_(amt)));
}

/** แตะ 💵 คืนจาก… → ย้ายสลิปเข้าโฟลเดอร์เงิน แล้วจดเป็นการคืน (ไม่นับรายรับ) */
function owePostback_(ev, p) {
  const fid = p[1], person = p[2], cache = CacheService.getScriptCache();
  let pend = {};
  try { pend = JSON.parse(cache.get('pend:' + fid) || '{}'); } catch (e) {}
  const o = pend.ocr || {}, amt = Number(o.amount || 0);
  let file;
  try { file = DriveApp.getFileById(fid); } catch (e) { reply_(ev.replyToken, 'ไม่พบรูปนี้แล้ว ลองส่งใหม่'); return; }
  if (file.isTrashed() || (file.getParents().hasNext() && file.getParents().next().getName() !== 'รอจัด')) { reply_(ev.replyToken, 'รูปนี้จัดไปแล้ว'); return; }
  if (!amt) { reply_(ev.replyToken, 'อ่านยอดในสลิปไม่ได้ พิมพ์แทนได้ เช่น ' + person + 'คืน 200'); return; }
  if (splitOn_()) return;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(o.date || '')) ? o.date : todayStr_();
  file.moveTo(moneyFolder_(date.slice(0, 7)));
  try { file.setName([date, 'คืนเงิน', person].join('_') + (/pdf/.test(file.getMimeType()) ? '.pdf' : '.jpg')); } catch (e) {}
  const r = owePayLine_(person, 'they', amt, { id: file.getId(), url: file.getUrl(), mime: file.getMimeType() }, date);
  cache.remove('pend:' + fid);
  billNextPending_(ev.replyToken, r.text);
}

/** สรุปตอนเช้า: ยอดที่ถึง/เลยวันนัดคืน */
function oweDueLine_() {
  const today = todayStr_();
  const due = oweAll_().filter(d => d.kind === 'debt' && d.due && d.due <= today && oweLeftS_(d) > 0)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  if (!due.length) return '';
  return '🤝 ถึงวันนัดคืน\n' + due.slice(0, 8).map(d => '• ' + (d.dir === 'they' ? d.person + ' ค้างเรา ' : 'เราค้าง ' + d.person + ' ') + oweB_(oweLeftS_(d)) +
    (d.due < today ? ' (เลยนัด ' + daysBetween_(d.due, today) + ' วัน)' : ' (วันนี้)') + (d.title ? ' · ' + d.title : '')).join('\n') +
    (due.some(d => d.dir === 'they') ? '\nทวงได้ในแอป หน้า 💰 → 🤝 ค้างกัน → 💬 ทวง' : '');
}
