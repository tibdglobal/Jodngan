/**
 * จดครบ — หลังบ้าน (Google Apps Script)
 * - เก็บงานใน Google Sheet
 * - เป็น API ให้หน้าเว็บ PWA
 * - รับข้อความจาก LINE OA (webhook) เพื่อจดงานผ่านแชท
 * - ส่งสรุปงานตอนเช้า + เตือนตามเวลา ผ่าน LINE (รวมหลายงานเป็นข้อความเดียวเพื่อประหยัดโควตา)
 */

const SHEET_NAME = 'Tasks';
// 'project' อยู่ท้ายสุด เพื่อให้ Sheet เดิมใช้ต่อได้โดยข้อมูลไม่เลื่อนคอลัมน์
// 'source' = คีย์นัดหมายจาก Google Calendar (กันดึงซ้ำ)
// 'due' = ชนิดกำหนดส่ง: '' วันแน่นอน | week ภายในสัปดาห์ | month ภายในเดือน | before ก่อนงานอื่น
// 'dep' = id ของงานที่ต้องเสร็จก่อน (ใช้กับ due = before)
// 'pre' = เตือนล่วงหน้ากี่วัน เช่น "7,3" | 'prenoted' = ระยะที่เตือนไปแล้ว
const HEADERS = ['id', 'title', 'note', 'date', 'time', 'remind', 'done', 'notified', 'created', 'updated', 'project', 'source', 'due', 'dep', 'pre', 'prenoted'];
const CAL_DAYS = 14;             // ดึงประชุมล่วงหน้ากี่วัน
// ปฏิทินเพิ่มเติมที่แชร์ให้บัญชีนี้โดยตรง — ปฏิทินหลักของบัญชีนี้ดึงเสมอ
const EXTRA_CALENDARS = [];
// ปฏิทินที่ดึงผ่านสะพาน (Bridge.gs ในบัญชีอื่น) ตั้งค่าใน Script properties: BRIDGE_URL, BRIDGE_KEY
const BRIDGE_LABEL = 'พี่วุฒิ';
const TZ = 'Asia/Bangkok';
const MORNING_HOUR = 7;          // ส่งสรุปงานวันนี้ตอน 7 โมงเช้า
const REMIND_EVERY_MIN = 15;     // ตรวจงานที่ต้องเตือนทุก 15 นาที
const props = PropertiesService.getScriptProperties();
const APP_URL = 'https://tibdglobal.github.io/Jodngan/';

const HELP = [
  '📝 วิธีใช้ จดครบ',
  'พิมพ์งานได้เลย เช่น',
  '• ซื้อของ',
  '• พรุ่งนี้ 10:00 ส่งรายงาน',
  '• 5/11 14:30 ประชุม',
  '• พรุ่งนี้ ส่งใบเสนอราคา #บริษัทA',
  '• สัปดาห์นี้ ทำสรุปยอด / เดือนหน้า ต่อทะเบียนรถ',
  '',
  'คำสั่ง',
  '• วันนี้ = ดูงานวันนี้',
  '• ทั้งหมด = ดูงานค้างทั้งหมด',
  '• โปรเจ็ค = ดูรายชื่อโปรเจ็ค',
  '• #ชื่อโปรเจ็ค = ดูงานค้างของโปรเจ็คนั้น',
  '• หา คำค้น = ค้นหางาน',
  '• ลิงก์ = ลิงก์เข้าแอป (ไม่ต้องใส่ API key)',
  '• โควตา = ดูโควตาข้อความ LINE เดือนนี้',
  '• เบิก 350 ค่าแท็กซี่ = จดบิลรอเบิก',
  '• บิล = สรุปยอดเบิกเงิน',
  '• ส่งรูป/PDF = เลือกได้: แนบบิล / จ่ายส่วนตัว / 📌 เก็บไว้เฉยๆ',
  '',
  'บอทเดาประเภทให้ ถ้าผิดแตะ ↔ เปลี่ยนได้ทันที',
  '• ส่งลิงก์ = 📌 ฝากไว้ (ไม่กลายเป็นงาน)',
  '• ฝาก ข้อความ = 📌 ฝากไว้ (โน้ต/ไอเดีย)',
  '• งาน ข้อความ = บังคับเป็นงาน',
  '• ฝาก = ดูของที่ฝากไว้ล่าสุด',
  '• ข้าว 60 (ไม่บอกจ่าย/รับ) = นับเป็นรายจ่าย',
  '',
  'รายรับ-รายจ่ายส่วนตัว',
  '• จ่าย 120 ข้าว (หรือ -120 ข้าว)',
  '• รับ 25000 เงินเดือน (หรือ +25000)',
  '• เงิน = สรุปรายรับรายจ่ายเดือนนี้',
].join('\n');

const APP_MSG = '📲 จดครบ\n' + APP_URL + '\n\nเปิดแล้วกด "เพิ่มไปยังหน้าจอโฮม" เพื่อใช้เหมือนแอป\nจดงานและบิลในแชทนี้ได้ด้วย พิมพ์ "ช่วย" ดูวิธีใช้';

/** ลิงก์ส่วนตัว: ฝัง API key ไว้หลัง # (ไม่ถูกส่งไปที่เซิร์ฟเวอร์) เปิดแล้วใช้ได้ทันที */
function magicMsg_() {
  return '🔑 ลิงก์เข้าใช้งาน จดครบ ของคุณ\n' + APP_URL + '#k=' + props.getProperty('API_KEY') +
    '\n\nเปิดลิงก์นี้ในเครื่องไหนก็ใช้ได้ทันที ไม่ต้องใส่ API key' +
    '\n• iPhone/iPad: ถ้าติดตั้งลงหน้าจอโฮมแล้ว ให้คัดลอกลิงก์นี้ไปวางในหน้า ⚙ ของแอป 1 ครั้ง' +
    '\n⚠️ อย่าส่งต่อลิงก์นี้ให้คนอื่น';
}

/** กด Run เพื่อให้ OA ส่งลิงก์แอปเข้าแชท (ผูกบัญชีแล้ว = ส่งลิงก์ส่วนตัว / ยังไม่ผูก = ลิงก์ธรรมดาถึงเพื่อนทุกคน) */
function sendAppLink() {
  if (props.getProperty('LINE_USER_ID')) { push_(magicMsg_()); Logger.log('ส่งลิงก์ส่วนตัวถึงเจ้าของระบบแล้ว'); return; }
  line_('broadcast', { messages: [{ type: 'text', text: APP_MSG }] });
  Logger.log('ส่งแบบ broadcast แล้ว (ยังไม่ผูกบัญชี)');
}

/** กด Run ถ้าลิงก์หลุดไปถึงคนอื่น: เปลี่ยนรหัสใหม่ ทุกเครื่องต้องเปิดลิงก์ใหม่จาก LINE */
function resetApiKey() {
  props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('เปลี่ยน API key แล้ว พิมพ์ "ลิงก์" ในแชท LINE เพื่อรับลิงก์ใหม่');
}

/* ===================== โควตาข้อความ LINE ===================== */

/** { limit, used } ของเดือนนี้ (limit 0 = ไม่จำกัด) เก็บแคช 10 นาที */
function quota_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('quota');
  if (hit) return JSON.parse(hit);
  const token = props.getProperty('LINE_TOKEN');
  if (!token || token.indexOf('ใส่') === 0) return null;
  const opt = { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  try {
    const q = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota', opt).getContentText());
    const u = JSON.parse(UrlFetchApp.fetch('https://api.line.me/v2/bot/message/quota/consumption', opt).getContentText());
    const out = { limit: q.type === 'limited' ? Number(q.value) || 0 : 0, used: Number(u.totalUsage) || 0 };
    cache.put('quota', JSON.stringify(out), 600);
    return out;
  } catch (e) {
    return null;
  }
}

function quotaText_(q) {
  if (!q) return 'ดูโควตาไม่ได้ (เช็ค LINE_TOKEN)';
  if (!q.limit) return '📊 โควตา LINE เดือนนี้: ใช้ไป ' + q.used + ' (ไม่จำกัด)';
  const pct = Math.round(q.used * 100 / q.limit);
  return (pct >= 80 ? '⚠️' : '📊') + ' โควตา LINE เดือนนี้: ' + q.used + '/' + q.limit + ' (' + pct + '%)' +
    (pct >= 80 ? '\nใกล้เต็มแล้ว ข้อความตอบกลับในแชทยังใช้ได้ไม่จำกัด' : '');
}

/* ===================== ติดตั้งครั้งแรก (กด Run) ===================== */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  props.setProperty('SHEET_ID', ss.getId());

  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);

  if (!props.getProperty('API_KEY')) {
    props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, ''));
  }
  if (!props.getProperty('LINE_TOKEN')) {
    props.setProperty('LINE_TOKEN', 'ใส่ Channel access token ตรงนี้');
  }

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('morningSummary').timeBased().atHour(MORNING_HOUR).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(REMIND_EVERY_MIN).create();

  Logger.log('ติดตั้งเสร็จแล้ว');
  Logger.log('API_KEY ของคุณ: ' + props.getProperty('API_KEY'));
}

/** กด Run เพื่อทดสอบส่งข้อความเข้า LINE */
function testPush() {
  push_('✅ ทดสอบระบบเตือนงาน สำเร็จ');
}

/* ===================== Web app ===================== */

function doGet() {
  return ContentService.createTextOutput('Task API ทำงานอยู่');
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }

  // ข้อความจาก LINE webhook (มี destination เสมอ)
  if (body.destination !== undefined && Array.isArray(body.events)) {
    handleLine_(body.events);
    return json_({ ok: true });
  }

  // คำขอจากหน้าเว็บ
  if (!body.key || body.key !== props.getProperty('API_KEY')) {
    return json_({ ok: false, error: 'API key ไม่ถูกต้อง' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    switch (body.action) {
      case 'list':   return json_({ ok: true, tasks: readAll_(), quota: quota_() });
      case 'add':    return json_({ ok: true, task: addTask_(body.task) });
      case 'update': return json_({ ok: true, task: updateTask_(body.task) });
      case 'delete': deleteTask_(body.id); return json_({ ok: true });
      case 'events': return json_({ ok: true, events: listEvents_(body.days || CAL_DAYS), missing: missingCalendars_() });
      case 'import': return json_({ ok: true, tasks: importEvents_(body.meetings || [], body.skip || [], body.project || '') });
      case 'vault_list':   return json_({ ok: true, ...vaultList_() });
      case 'vault_init':   vaultInit_(body.salt, body.check); return json_({ ok: true });
      case 'vault_save':   vaultSave_(body.item); return json_({ ok: true });
      case 'vault_save_many': return json_({ ok: true, saved: vaultSaveMany_(body.items) });
      case 'vault_delete': vaultDelete_(body.id); return json_({ ok: true });
      case 'vault_reset':  return json_({ ok: true, removed: vaultReset_() });
      case 'bills_list':   return json_({ ok: true, bills: billsListFixed_() });
      case 'bill_save':    return json_({ ok: true, bill: billSave_(body.bill) });
      case 'bill_upload':  return json_({ ok: true, ...billUpload_(body) });
      case 'bill_snap':    return json_({ ok: true, ...billSnap_(body) });
      case 'bill_unfile':  return json_({ ok: true, bill: billUnfile_(body.id, body.fileId) });
      case 'bill_delete':  billDelete_(body.id); return json_({ ok: true });
      case 'bill_folder':  if (!/^\d{4}-\d{2}$/.test(String(body.month))) throw new Error('เดือนไม่ถูกต้อง');
                           return json_({ ok: true, url: billFolder_(String(body.month)).getUrl() });
      case 'bill_thumbs':  return json_({ ok: true, bills: billThumbs_(String(body.month || '')) });
      case 'bill_filekind': return json_({ ok: true, bill: billFileKind_(body.id, body.fileId, body.kind) });
      case 'bill_fileorig': return json_({ ok: true, bill: billFileOrig_(body.id, body.fileId, body.orig) });
      case 'bill_images':  return json_({ ok: true, images: billImages_(body.fileIds, body.full) });
      case 'claim_cfg':    return json_({ ok: true, cfg: JSON.parse(props.getProperty('CLAIM_CFG') || '{}') });
      case 'claim_cfg_set': {   // idFile ตั้งได้จากการอัปโหลดบัตรเท่านั้น (กันเครื่องอื่นเขียนทับ)
        const old = JSON.parse(props.getProperty('CLAIM_CFG') || '{}');
        props.setProperty('CLAIM_CFG', JSON.stringify(Object.assign({}, body.cfg || {}, { idFile: old.idFile || '' })).slice(0, 8000));
        return json_({ ok: true });
      }
      case 'claim_idcard': return json_({ ok: true, ...claimIdCard_(body) });
      case 'money_list':   return json_({ ok: true, items: moneyAll_() });
      case 'money_save':   return json_({ ok: true, item: moneySave_(body.item) });
      case 'money_delete': moneyDelete_(body.id); return json_({ ok: true });
      case 'owe_list':     return json_({ ok: true, docs: oweAll_() });
      case 'owe_save':     return json_({ ok: true, docs: oweSave_(body.docs) });
      case 'owe_delete':   oweDelete_(body.ids); return json_({ ok: true });
      case 'owe_slip':     return json_({ ok: true, file: oweSlip_(body) });
      case 'money_snap':   return json_({ ok: true, ...moneySnap_(body) });
      case 'inbox_list':   return json_({ ok: true, items: inboxAll_() });
      case 'inbox_save':   return json_({ ok: true, item: inboxSave_(body.item) });
      case 'inbox_delete': inboxDelete_(body.id); return json_({ ok: true });
      case 'inbox_upload': return json_({ ok: true, item: inboxUpload_(body) });
      case 'inbox_task':   return json_({ ok: true, task: inboxToTask_(body.id) });
      case 'bill_mark':    return json_({ ok: true, bills: billMark_(body.ids, body.status, body.claim) });
      default:       return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ===================== LINE webhook ===================== */

function handleLine_(events) {
  events.forEach(ev => {
    if (ev.type !== 'postback' && (ev.type !== 'message' || !ev.message)) return;
    const uid = ev.source && ev.source.userId;
    if (!uid) return;

    // คนแรกที่ทักมา = เจ้าของระบบ
    let owner = props.getProperty('LINE_USER_ID');
    if (!owner) {
      props.setProperty('LINE_USER_ID', uid);
      owner = uid;
      reply_(ev.replyToken, ['🔗 เชื่อมบัญชีเรียบร้อย\n\n' + HELP, magicMsg_()]);
      return;
    }
    if (uid !== owner) {
      reply_(ev.replyToken, 'บัญชีนี้ไม่มีสิทธิ์ใช้งาน');
      return;
    }

    // รูป/ไฟล์ใบเสร็จ และการแตะปุ่มเลือกบิล
    if (ev.type !== 'postback' && (ev.message.type === 'image' || ev.message.type === 'file')) {
      // รับรูปหลายรูปพร้อมกันได้: ไม่ล็อกตอนอ่านรูป (อ่าน ~10 วิ/รูป) เพราะไม่ได้เขียนชีต
      try { billFromLineMedia_(ev); }
      catch (err) { reply_(ev.replyToken, 'รับรูปไม่สำเร็จ: ' + (err.message || err) + '\nลองส่งรูปนี้ใหม่อีกครั้ง'); }
      return;
    }
    if (ev.type === 'postback') {
      const lk = LockService.getScriptLock();
      if (!lk.tryLock(25000)) { reply_(ev.replyToken, 'ระบบกำลังยุ่ง แตะปุ่มเดิมอีกครั้งได้เลย'); return; }
      try {
        if (!routePostback_(ev)) billPostback_(ev);
      } catch (err) {
        reply_(ev.replyToken, 'ทำรายการไม่สำเร็จ: ' + (err.message || err));
      } finally {
        lk.releaseLock();
      }
      return;
    }
    if (ev.message.type !== 'text') return;

    const text = ev.message.text.trim();
    if (/^(id|ไอดี)$/i.test(text)) return reply_(ev.replyToken, uid);
    if (/^(ช่วย|help|วิธีใช้|\?)$/i.test(text)) return reply_(ev.replyToken, HELP);
    if (/^(ลิงก์|ลิ้งค์|ลิงค์|link|แอป|app)$/i.test(text)) return reply_(ev.replyToken, magicMsg_());
    if (/^(โควตา|โควต้า|quota)$/i.test(text)) return reply_(ev.replyToken, quotaText_(quota_()));
    if (/^(บิล|เบิก|เบิกเงิน)$/.test(text)) return reply_(ev.replyToken, billSummaryText_());
    if (/^(เงิน|สรุปเงิน|รายรับรายจ่าย|รายรับ-รายจ่าย)$/.test(text)) return reply_(ev.replyToken, moneySummaryText_());
    // จดเงิน: ต้องมีตัวเลขต่อจากคำสั่ง หรือจบด้วยจำนวนเงิน (กัน "รับลูก 5 โมง" กลายเป็นรายรับ)
    if (/^(จ่าย|รับ|รายจ่าย|รายรับ)\s*[\d,]+(\.\d+)?(\s|บ|$)/.test(text) || /^(จ่าย|รายจ่าย|รายรับ)\s+\S.*\s[\d,]+(\.\d+)?\s*(บาท|บ\.?)?$/.test(text) || /^รับ\s+\S.*\s[\d,]+(\.\d+)?\s*(บาท|บ\.?)$/.test(text) || /^[+-]\s*\d/.test(text)) {
      return withLock_(LockService.getScriptLock(), ev.replyToken, () => saveAs_(ev.replyToken, /^(รับ|รายรับ|\+)/.test(text) ? 'mi' : 'mo', text));
    }
    if (/^(ฝาก|กล่องฝาก|โน้ต|📌)$/.test(text)) return reply_(ev.replyToken, inboxSummaryText_());
    if (/^(รอจัด|รูป|รูปรอจัด)$/.test(text)) return billNextPending_(ev.replyToken, '');
    if (/^เบิก\s+/.test(text)) {
      const b = billFromChat_(text.replace(/^เบิก\s+/, ''));
      return reply_(ev.replyToken, b
        ? '🧾 จดแล้ว ฿' + Number(b.amount).toLocaleString('en-US') + ' ' + b.desc + (b.project ? ' [' + b.project + ']' : '') + '\nแนบใบเสร็จ/ใบกำกับภาษีได้ในแอป หน้า 🧾'
        : 'พิมพ์แบบนี้: เบิก 350 ค่าแท็กซี่');
    }
    if (/^(วันนี้|งาน|งานวันนี้)$/.test(text)) {
      return reply_(ev.replyToken, buildToday_(readAll_()) || 'วันนี้ไม่มีงาน 🎉');
    }
    if (/^(ทั้งหมด|งานทั้งหมด)$/.test(text)) {
      return reply_(ev.replyToken, buildUpcoming_(readAll_()) || 'ไม่มีงานค้าง 🎉');
    }
    if (/^(โปรเจ็ค|โปรเจค|โปรเจกต์|บริษัท|project)$/i.test(text)) {
      return reply_(ev.replyToken, buildProjects_(readAll_()) || 'ยังไม่มีโปรเจ็ค\nติดแท็กงานด้วย #ชื่อโปรเจ็ค');
    }
    let m;
    if ((m = text.match(/^(?:หา|ค้นหา|ค้น)\s+(.+)$/))) {
      return reply_(ev.replyToken, buildSearch_(readAll_(), m[1]));
    }
    if ((m = text.match(/^#(\S+)$/))) {
      const name = m[1];
      return reply_(ev.replyToken, buildUpcoming_(readAll_(), name) || 'ไม่มีงานค้างใน #' + name);
    }

    routeText_(ev.replyToken, text);
  });
}

/* ===================== แจ้งเตือน ===================== */

/** สรุปงานวันนี้ + งานค้าง + ใกล้กำหนด ส่ง 1 ข้อความตอนเช้า (ไม่มีอะไร = ไม่ส่ง) */
function morningSummary() {
  const tasks = readAll_();
  const pre = buildPre_(tasks);
  const q = quota_();
  const warn = q && q.limit && q.used >= q.limit * 0.8 ? quotaText_(q) : '';   // ใกล้เต็ม = เติมไว้ท้ายสรุป ไม่ส่งแยก
  let bills = '';
  try { bills = billLine_(); } catch (e) {}
  const msg = [buildToday_(tasks), pre.text, bills, warn].filter(Boolean).join('\n\n');
  if (!msg) return;
  push_(msg);
  const sh = sheet_(), col = HEADERS.indexOf('prenoted') + 1;
  pre.marks.forEach(m => { const r = findRow_(m.id); if (r) sh.getRange(r, col).setValue(m.prenoted); });
}

/** กำหนดส่งที่ใช้จริง (งาน "ก่อนงานอื่น" ใช้วันของงานนั้น) */
function effDate_(t, byId) {
  if (t.due === 'before' && !t.date) { const d = byId[t.dep]; return d ? d.date : ''; }
  return t.date;
}
function daysBetween_(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** งานที่ถึงระยะเตือนล่วงหน้า (7/3 วัน) และยังไม่เคยเตือนระยะนั้น */
function buildPre_(tasks) {
  const today = todayStr_(), byId = {};
  tasks.forEach(t => { byId[t.id] = t; });
  const rows = [], marks = [];
  tasks.forEach(t => {
    if (t.done || !t.pre) return;
    const d = effDate_(t, byId);
    if (!d) return;
    const left = daysBetween_(today, d);
    if (left <= 0) return;                                   // ถึงวันแล้วไปอยู่ในส่วน "วันนี้/ค้าง"
    const want = String(t.pre).split(',').filter(Boolean);
    const sent = String(t.prenoted || '').split(',').filter(Boolean);
    const hit = want.filter(n => left <= Number(n) && sent.indexOf(n) < 0);
    if (!hit.length) return;
    rows.push({ left: left, text: '• อีก ' + left + ' วัน (' + fmt_(d, '') + ') ' + t.title + tag_(t) });
    marks.push({ id: t.id, prenoted: sent.concat(hit).join(',') });
  });
  if (!rows.length) return { text: '', marks: marks };
  rows.sort((a, b) => a.left - b.left);
  return { text: '⏳ ใกล้กำหนด\n' + rows.map(r => r.text).join('\n'), marks: marks };
}

/** เตือนงานที่ถึงเวลาใน 15 นาทีข้างหน้า รวมเป็น 1 ข้อความ */
function checkReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const now = new Date();
    const from = Utilities.formatDate(new Date(now.getTime() - 60 * 60000), TZ, 'yyyy-MM-dd HH:mm');
    const to = Utilities.formatDate(new Date(now.getTime() + REMIND_EVERY_MIN * 60000), TZ, 'yyyy-MM-dd HH:mm');

    const due = readAll_().filter(t => {
      if (!t.remind || t.done || t.notified || !t.date || !t.time) return false;
      const at = t.date + ' ' + t.time;
      return at >= from && at <= to;
    }).sort(byWhen_);
    if (!due.length) return;

    push_('⏰ เตือน\n' + due.map(t => '• ' + t.time + ' ' + t.title + tag_(t)).join('\n'));

    const sh = sheet_();
    const col = HEADERS.indexOf('notified') + 1;
    due.forEach(t => {
      const r = findRow_(t.id);
      if (r) sh.getRange(r, col).setValue('1');
    });
  } finally {
    lock.releaseLock();
  }
}

function buildToday_(tasks) {
  const today = todayStr_();
  const open = tasks.filter(t => !t.done && t.date).sort(byWhen_);
  const now = open.filter(t => t.date === today);
  const late = open.filter(t => t.date < today);
  if (!now.length && !late.length) return '';

  const lines = ['📋 วันนี้ ' + fmt_(today, '')];
  now.forEach(t => lines.push('• ' + (t.time ? t.time + ' ' : '') + t.title + tag_(t)));
  if (!now.length) lines.push('• ไม่มีงานใหม่');
  if (late.length) {
    lines.push('⚠️ ค้าง');
    late.forEach(t => lines.push('• ' + fmt_(t.date, '') + ' ' + t.title + tag_(t)));
  }
  return lines.join('\n');
}

/** งานค้างทั้งหมด หรือเฉพาะโปรเจ็ค (ไม่สนตัวพิมพ์เล็ก/ใหญ่) */
function buildUpcoming_(tasks, project) {
  const key = project ? String(project).toLowerCase() : '';
  const open = tasks.filter(t => !t.done && (!key || String(t.project || '').toLowerCase() === key)).sort(byWhen_);
  if (!open.length) return '';
  const head = key ? '📁 #' + open[0].project + ' ค้าง ' + open.length : '📋 งานค้าง ' + open.length;
  const lines = [head];
  open.slice(0, 20).forEach(t => {
    lines.push('• ' + (key ? line1_({ ...t, project: '' }) : line1_(t)));
  });
  if (open.length > 20) lines.push('…และอีก ' + (open.length - 20) + ' งาน');
  return lines.join('\n');
}

/** รายชื่อโปรเจ็ค + จำนวนงานค้าง */
function buildProjects_(tasks) {
  const map = {};   // key ตัวเล็ก → { name: ตัวสะกดแรกที่เจอ, n: งานค้าง }
  tasks.forEach(t => {
    if (!t.project) return;
    const k = t.project.toLowerCase();
    if (!map[k]) map[k] = { name: t.project, n: 0 };
    if (!t.done) map[k].n++;
  });
  const list = Object.values(map).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'th'));
  if (!list.length) return '';
  return ['📁 โปรเจ็ค (งานค้าง)']
    .concat(list.map(p => '• #' + p.name + ' ' + p.n))
    .concat(['', 'พิมพ์ #ชื่อ เพื่อดูงาน'])
    .join('\n');
}

/** ค้นหาในชื่องาน/โน้ต/โปรเจ็ค งานค้างขึ้นก่อน */
function buildSearch_(tasks, q) {
  const k = String(q).trim().toLowerCase();
  const hit = tasks.filter(t => [t.title, t.note, t.project].join(' ').toLowerCase().indexOf(k) > -1);
  if (!hit.length) return '🔍 ไม่พบงานที่มีคำว่า "' + q + '"';
  hit.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || byWhen_(a, b));
  const lines = ['🔍 "' + q + '" พบ ' + hit.length];
  hit.slice(0, 15).forEach(t => lines.push((t.done ? '✓ ' : '• ') + line1_(t)));
  if (hit.length > 15) lines.push('…และอีก ' + (hit.length - 15) + ' งาน');
  return lines.join('\n');
}

/** "28/10 10:00 ส่งรายงาน [ABC]" */
function line1_(t) {
  let when = fmt_(t.date, t.time);
  if ((t.due === 'week' || t.due === 'month') && t.date) when = 'ภายใน ' + fmt_(t.date, '');
  let tail = '';
  if (t.due === 'before' && t.dep && !/^[0-9a-f]{32}$/.test(t.dep)) tail = ' (ก่อน' + t.dep + ')';   // dep เป็นชื่องานที่พิมพ์เอง
  return (when ? when + ' ' : '') + t.title + tail + tag_(t);
}
function tag_(t) { return t.project ? ' [' + t.project + ']' : ''; }

/* ===================== Google Calendar ===================== */

/** กด Run ครั้งเดียวเพื่อให้สิทธิ์เข้าถึงปฏิทิน + เช็คว่าเห็นปฏิทินไหนบ้าง */
function authorizeCalendar() {
  calendars_().forEach(c => Logger.log((c.cal ? '✅ ' : '❌ ยังไม่ได้รับแชร์: ') + c.label));
}

/** ปฏิทินหลัก + ปฏิทินเพิ่มเติม (ตัวที่ยังไม่ได้แชร์ cal = null) */
function calendars_() {
  const main = CalendarApp.getDefaultCalendar();
  const list = [{ cal: main, label: 'งาน' }];
  EXTRA_CALENDARS.forEach(id => {
    let cal = null;
    try { cal = CalendarApp.getCalendarById(id) || CalendarApp.subscribeToCalendar(id, { hidden: true }); } catch (e) {}
    list.push({ cal: cal, label: id.split('@')[0], id: id });
  });
  return list;
}

/** นัดหมายจากทุกปฏิทิน ตั้งแต่วันนี้ไป N วัน (ไม่รวมนัดทั้งวัน, นัดเดียวกันในหลายปฏิทินแสดงครั้งเดียว) */
function listEvents_(days) {
  const start = new Date(todayStr_() + 'T00:00:00+07:00');
  const end = new Date(start.getTime() + Math.min(Number(days) || CAL_DAYS, 60) * 86400000);
  const imported = new Set(readAll_().map(t => t.source).filter(Boolean));
  const skipped = new Set(skipped_());
  const seen = {};
  const out = [];

  calendars_().forEach(c => {
    if (!c.cal) return;
    c.cal.getEvents(start, end).forEach(e => {
      if (e.isAllDayEvent()) return;
      const s = e.getStartTime(), en = e.getEndTime();
      const key = 'cal:' + e.getId() + ':' + Utilities.formatDate(s, TZ, 'yyyyMMddHHmm');
      let status = '';
      try { status = String(e.getMyStatus()); } catch (err) {}
      if (seen[key]) {                    // เจอซ้ำในอีกปฏิทิน = รวมป้ายชื่อ
        if (seen[key].cal.indexOf(c.label) < 0) seen[key].cal += ', ' + c.label;
        if (status === 'YES' || status === 'OWNER') seen[key].status = status;
        return;
      }
      const ev = {
        key: key,
        title: e.getTitle() || '(ไม่มีชื่อ)',
        date: Utilities.formatDate(s, TZ, 'yyyy-MM-dd'),
        time: Utilities.formatDate(s, TZ, 'HH:mm'),
        end: Utilities.formatDate(en, TZ, 'HH:mm'),
        location: e.getLocation() || '',
        status: status,                   // YES / NO / MAYBE / INVITED / OWNER
        cal: c.label,
        imported: imported.has(key),
        skipped: skipped.has(key),
      };
      seen[key] = ev;
      out.push(ev);
    });
  });

  // นัดจากสะพาน (ปฏิทินที่แชร์ให้บัญชีอื่น) — ไม่ติ๊กไว้ก่อน ให้ผู้ใช้เลือกเอง
  bridgeEvents_(days).forEach(b => {
    const s = new Date(b.start), en = new Date(b.end);
    const key = 'cal:' + b.id + ':' + Utilities.formatDate(s, TZ, 'yyyyMMddHHmm');
    if (seen[key]) {                      // นัดเดียวกับที่อยู่ในปฏิทินงานแล้ว
      if (seen[key].cal.indexOf(BRIDGE_LABEL) < 0) seen[key].cal += ', ' + BRIDGE_LABEL;
      return;
    }
    const ev = {
      key: key,
      title: b.title,
      date: Utilities.formatDate(s, TZ, 'yyyy-MM-dd'),
      time: Utilities.formatDate(s, TZ, 'HH:mm'),
      end: Utilities.formatDate(en, TZ, 'HH:mm'),
      location: b.location || '',
      status: '',
      cal: BRIDGE_LABEL,
      imported: imported.has(key),
      skipped: skipped.has(key),
    };
    seen[key] = ev;
    out.push(ev);
  });

  return out
    .filter(e => e.status !== 'NO')       // ที่ปฏิเสธใน Calendar แล้วไม่ต้องแสดง
    .sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
}

/** ปฏิทินเพิ่มเติมที่ยังเข้าไม่ได้ (ให้หน้าแอปแจ้งเตือน) */
function missingCalendars_() {
  const miss = calendars_().filter(c => !c.cal).map(c => c.id);
  if (props.getProperty('BRIDGE_URL') && BRIDGE_ERROR) miss.push(BRIDGE_LABEL + ' (' + BRIDGE_ERROR + ')');
  return miss;
}

let BRIDGE_ERROR = '';
/** ขอรายการนัดจากสคริปต์สะพาน */
function bridgeEvents_(days) {
  const url = props.getProperty('BRIDGE_URL'), key = props.getProperty('BRIDGE_KEY');
  if (!url || !key) return [];
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'text/plain',
      payload: JSON.stringify({ key: key, days: days }),
      muteHttpExceptions: true, followRedirects: true,
    });
    const data = JSON.parse(res.getContentText());
    if (!data.ok) { BRIDGE_ERROR = data.error || 'ดึงไม่สำเร็จ'; return []; }
    return data.events || [];
  } catch (e) {
    BRIDGE_ERROR = 'เชื่อมต่อไม่ได้';
    return [];
  }
}

/** กด Run เพื่อทดสอบการเชื่อมสะพาน */
function testBridge() {
  const list = bridgeEvents_(14);
  Logger.log(BRIDGE_ERROR ? '❌ ' + BRIDGE_ERROR : '✅ ได้นัดจาก' + BRIDGE_LABEL + ' ' + list.length + ' นัด');
  list.slice(0, 5).forEach(b => Logger.log('• ' + b.start + ' ' + b.title));
}

/** เพิ่มประชุมที่เลือกเป็นงาน + จำอันที่ไม่เข้า */
function importEvents_(events, skip, project) {
  const have = new Set(readAll_().map(t => t.source).filter(Boolean));
  const added = [];
  events.forEach(ev => {
    if (!ev || !ev.key || have.has(ev.key)) return;
    const note = ['ประชุม ' + ev.time + (ev.end ? '–' + ev.end : ''), ev.location].filter(Boolean).join(' · ');
    const t = addTask_({
      title: ev.title, note: note, date: ev.date, time: ev.time,
      remind: '1', project: project, source: ev.key,
    });
    have.add(ev.key);
    added.push(t);
  });
  if (skip.length) {
    const keep = skipped_().concat(skip).slice(-300);   // เก็บแค่ 300 รายการล่าสุด
    props.setProperty('SKIPPED_EVENTS', JSON.stringify(keep));
  }
  return added;
}

function skipped_() {
  try { return JSON.parse(props.getProperty('SKIPPED_EVENTS') || '[]'); } catch (e) { return []; }
}

/* ===================== รหัสผ่าน (เก็บเฉพาะข้อมูลที่เข้ารหัสแล้ว) ===================== */
// ถอดรหัสได้เฉพาะในเครื่องที่รู้รหัสหลักเท่านั้น หลังบ้านอ่านไม่ได้ และไม่มีคำสั่ง LINE ที่แตะส่วนนี้

const VAULT_SHEET = 'Vault';
const VAULT_HEADERS = ['id', 'iv', 'ct', 'updated'];

function vaultSheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(VAULT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VAULT_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), VAULT_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, VAULT_HEADERS.length).setValues([VAULT_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function vaultList_() {
  const sh = vaultSheet_();
  const last = sh.getLastRow();
  const items = last < 2 ? [] : sh.getRange(2, 1, last - 1, VAULT_HEADERS.length).getDisplayValues()
    .filter(r => r[0]).map(r => ({ id: r[0], iv: r[1], ct: r[2], updated: r[3] }));
  return { salt: props.getProperty('VAULT_SALT') || '', check: props.getProperty('VAULT_CHECK') || '', items: items };
}

function vaultInit_(salt, check) {
  if (props.getProperty('VAULT_SALT')) throw new Error('ตั้งรหัสหลักไว้แล้ว');
  if (!/^[A-Za-z0-9+/=]{16,64}$/.test(String(salt || '')) || !check) throw new Error('ข้อมูลไม่ถูกต้อง');
  props.setProperties({ VAULT_SALT: salt, VAULT_CHECK: String(check) });
  vaultSheet_();
}

function vaultSave_(it) {
  if (!props.getProperty('VAULT_SALT')) throw new Error('ยังไม่ได้ตั้งรหัสหลัก');
  if (!it || !/^[A-Za-z0-9]{8,64}$/.test(String(it.id || '')) || !it.iv || !it.ct) throw new Error('ข้อมูลไม่ถูกต้อง');
  if (String(it.ct).length > 40000) throw new Error('ข้อมูลยาวเกินไป');
  const sh = vaultSheet_();
  const row = [String(it.id), String(it.iv), String(it.ct), stamp_()];
  const last = sh.getLastRow();
  const ids = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(it.id));
  const r = i < 0 ? last + 1 : i + 2;
  sh.getRange(r, 1, 1, VAULT_HEADERS.length).setNumberFormat('@').setValues([row]);
}

/** นำเข้าหลายรายการ (รายการใหม่ทั้งหมด เข้ารหัสมาจากเครื่องแล้ว) */
function vaultSaveMany_(list) {
  if (!props.getProperty('VAULT_SALT')) throw new Error('ยังไม่ได้ตั้งรหัสหลัก');
  if (!Array.isArray(list) || !list.length) return 0;
  if (list.length > 500) throw new Error('นำเข้าได้ครั้งละไม่เกิน 500 รายการ');
  const now = stamp_();
  const rows = list.map(it => {
    if (!it || !/^[A-Za-z0-9]{8,64}$/.test(String(it.id || '')) || !it.iv || !it.ct || String(it.ct).length > 40000) throw new Error('ข้อมูลไม่ถูกต้อง');
    return [String(it.id), String(it.iv), String(it.ct), now];
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = vaultSheet_();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, VAULT_HEADERS.length).setNumberFormat('@').setValues(rows);
  } finally { lock.releaseLock(); }
  return rows.length;
}

/** ลืมรหัสหลัก: ลบรหัสหลักและรายการที่เข้ารหัสไว้ทั้งหมด (ถอดรหัสไม่ได้อยู่แล้ว) แล้วตั้งใหม่ได้ */
function vaultReset_() {
  const sh = vaultSheet_();
  const last = sh.getLastRow();
  const n = last < 2 ? 0 : last - 1;
  if (n) sh.deleteRows(2, n);
  props.deleteProperty('VAULT_SALT');
  props.deleteProperty('VAULT_CHECK');
  return n;
}

function vaultDelete_(id) {
  const sh = vaultSheet_();
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(id));
  if (i > -1) sh.deleteRow(i + 2);
}

/* ===================== Sheet ===================== */

function sheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME);
}

function readAll_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues()
    .filter(r => r[0])
    .map(r => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]])));
}

function findRow_(id) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2 || !id) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(String(id));
  return i < 0 ? 0 : i + 2;
}

function addTask_(t) {
  if (!t) throw new Error('ไม่มีข้อมูลงาน');
  if (t.id && findRow_(t.id)) return updateTask_(t);
  const now = stamp_();
  const row = {
    id: t.id || Utilities.getUuid().replace(/-/g, ''),
    title: String(t.title || '').trim(),
    note: String(t.note || ''),
    date: String(t.date || ''),
    time: String(t.time || ''),
    remind: t.remind ? '1' : '',
    done: t.done ? '1' : '',
    notified: '',
    created: now,
    updated: now,
    project: String(t.project || '').trim(),
    source: String(t.source || ''),
    due: String(t.due || ''),
    dep: String(t.dep || ''),
    pre: String(t.pre || ''),
    prenoted: '',
  };
  if (!row.title) throw new Error('ไม่มีชื่องาน');
  const sh = sheet_();
  const r = sh.getLastRow() + 1;
  sh.getRange(r, 1, 1, HEADERS.length).setNumberFormat('@').setValues([HEADERS.map(h => row[h])]);
  return row;
}

function updateTask_(t) {
  if (!t || !t.id) throw new Error('ไม่มี id');
  const r = findRow_(t.id);
  if (!r) return addTask_(t);
  const sh = sheet_();
  const rng = sh.getRange(r, 1, 1, HEADERS.length);
  const vals = rng.getDisplayValues()[0];
  const cur = Object.fromEntries(HEADERS.map((h, i) => [h, vals[i]]));
  const before = [cur.date, cur.time, cur.due, cur.dep].join('|');
  const beforePre = cur.pre;

  ['title', 'note', 'date', 'time', 'project', 'due', 'dep', 'pre'].forEach(k => { if (t[k] !== undefined) cur[k] = String(t[k]).trim(); });
  ['remind', 'done'].forEach(k => { if (t[k] !== undefined) cur[k] = t[k] ? '1' : ''; });
  if ([cur.date, cur.time, cur.due, cur.dep].join('|') !== before) {   // เปลี่ยนกำหนด = เตือนใหม่ทั้งหมด
    cur.notified = '';
    cur.prenoted = '';
  } else if (cur.pre !== beforePre) cur.prenoted = '';
  cur.updated = stamp_();

  rng.setNumberFormat('@').setValues([HEADERS.map(h => cur[h])]);
  return cur;
}

function deleteTask_(id) {
  const r = findRow_(id);
  if (r) sheet_().deleteRow(r);
}

/* ===================== LINE API ===================== */

function line_(path, payload) {
  const token = props.getProperty('LINE_TOKEN');
  if (!token || token.indexOf('ใส่') === 0) {
    console.warn('ยังไม่ได้ตั้ง LINE_TOKEN');
    return;
  }
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) console.error('LINE ' + path + ': ' + res.getContentText());
}

/** push = นับโควตา */
function push_(text) {
  const to = props.getProperty('LINE_USER_ID');
  if (!to) { console.warn('ยังไม่มี LINE_USER_ID (ให้ทักแชท OA ก่อน)'); return; }
  line_('push', { to: to, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] });
  CacheService.getScriptCache().remove('quota');   // ให้ตัวนับโควตาอัปเดต
}

/** reply = ไม่นับโควตา (ส่งได้หลายข้อความในครั้งเดียว สูงสุด 5) */
function reply_(token, text) {
  const list = [].concat(text).slice(0, 5);
  line_('reply', { replyToken: token, messages: list.map(t => ({ type: 'text', text: String(t).slice(0, 4900) })) });
}

/* ===================== Helpers ===================== */

/** แปลงข้อความเช่น "พรุ่งนี้ 10:00 ส่งรายงาน", "5/11 ประชุม" */
function parseQuick_(text) {
  let s = ' ' + String(text).trim() + ' ', date = '', time = '', project = '', m;
  const today = todayStr_();
  const cut = re => { const mm = s.match(re); if (mm) s = s.slice(0, mm.index) + ' ' + s.slice(mm.index + mm[0].length); return mm; };
  const tidy = x => x.replace(/\s{2,}/g, ' ').trim();
  // #แท็ก ที่ไหนก็ได้ = โปรเจ็ค/บริษัท
  if ((m = cut(/\s#(\S+)(?=\s)/))) project = m[1];
  // ช่วงเวลาคร่าวๆ / ไม่แน่ใจ (อยู่ตรงไหนของประโยคก็ได้)
  if ((m = cut(/\s(?:ภายใน)?(สัปดาห์นี้|อาทิตย์นี้|สัปดาห์หน้า|อาทิตย์หน้า|เดือนนี้|เดือนหน้า)(?=\s)/))) {
    const r = softDate_(today, m[1]);
    return { title: tidy(s), date: r.date, time: '', project: project, due: r.due };
  }
  if (cut(/\s(ไม่แน่ใจ|ยังไม่รู้|สักวัน)(?=\s)/)) return { title: tidy(s), date: '', time: '', project: project, due: '' };
  // วัน
  if ((m = cut(/\s(วันนี้|พรุ่งนี้|มะรืน(?:นี้)?)(?=\s)/))) date = addDays_(today, m[1] === 'วันนี้' ? 0 : m[1] === 'พรุ่งนี้' ? 1 : 2);
  else if ((m = s.match(/\s(\d{1,2})\/(\d{1,2})(?=\s)/))) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      const y = +today.slice(0, 4);
      let c = y + '-' + pad_(mo) + '-' + pad_(d);
      if (c < today) c = (y + 1) + '-' + pad_(mo) + '-' + pad_(d);
      date = c; cut(/\s(\d{1,2})\/(\d{1,2})(?=\s)/);
    }
  }
  // เวลา: 10:00, 10.30 น., 10 โมง(เช้า), บ่าย 2 (โมง), เย็น 5 โมง, 2 ทุ่ม, เที่ยง(วัน)
  const set = (h, mi) => { mi = mi || 0; if (h >= 0 && h < 24 && mi >= 0 && mi < 60) time = pad_(h) + ':' + pad_(mi); };
  if ((m = cut(/\s(\d{1,2})[:.](\d{2})(?:\s*น\.?)?(?=\s)/))) set(+m[1], +m[2]);
  else if ((m = cut(/\s(?:บ่าย|เย็น)\s*(\d{1,2})(?:\s*โมง)?(?:ครึ่ง)?(?=\s)/))) set(+m[1] + (+m[1] < 12 ? 12 : 0), /ครึ่ง/.test(m[0]) ? 30 : 0);
  else if ((m = cut(/\s(\d{1,2})\s*ทุ่ม(ครึ่ง)?(?=\s)/))) set(+m[1] + 18, m[2] ? 30 : 0);
  else if ((m = cut(/\s(\d{1,2})\s*โมง(?:เช้า)?(ครึ่ง)?(?=\s)/))) set(+m[1], m[2] ? 30 : 0);
  else if (cut(/\sเที่ยง(?:วัน|ตรง)?(?=\s)/)) set(12);
  if (time && !date) date = today;
  return { title: tidy(s), date: date, time: time, project: project, due: '' };
}

/** วันสุดท้ายของสัปดาห์ (อาทิตย์) / เดือน นับจากวันนี้ */
function softDate_(today, word) {
  const p = today.split('-').map(Number);
  if (/สัปดาห์|อาทิตย์/.test(word)) {
    const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();   // 0 = อาทิตย์
    const toSun = (7 - dow) % 7 + (/หน้า/.test(word) ? 7 : 0);
    return { date: addDays_(today, toSun), due: 'week' };
  }
  const plus = /หน้า/.test(word) ? 1 : 0;
  const last = new Date(Date.UTC(p[0], p[1] + plus, 0));               // วันที่ 0 = วันสุดท้ายของเดือนก่อนหน้า
  return { date: Utilities.formatDate(last, 'UTC', 'yyyy-MM-dd'), due: 'month' };
}

/** วันที่แบบย่อ ไม่มีปี เช่น 28/10 10:00 */
function fmt_(date, time) {
  let out = '';
  if (date) {
    const p = date.split('-');
    out = (+p[2]) + '/' + (+p[1]);
  }
  if (time) out += (out ? ' ' : '') + time;
  return out;
}

function byWhen_(a, b) {
  const ka = (a.date || '9999-99-99') + (a.time || '99:99');
  const kb = (b.date || '9999-99-99') + (b.time || '99:99');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function todayStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function stamp_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function pad_(n) { return String(n).padStart(2, '0'); }
function addDays_(ymd, n) {
  const p = ymd.split('-').map(Number);
  return Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)), 'UTC', 'yyyy-MM-dd');
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
