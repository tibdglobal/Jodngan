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
