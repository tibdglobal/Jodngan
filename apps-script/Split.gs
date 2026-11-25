/**
 * จดครบ — แยก 2 บัญชี (โค้ดชุดเดียวกัน ต่างกันที่ Script Property ROLE)
 *  · ระบบงาน (pm01, ROLE ว่าง) + LINE EZP BOT: งาน, กล่องฝาก, บิลเบิก, ตู้รหัสงาน, คลังประชุม
 *  · ระบบเงิน "แมวกวัก" (nitithon.see, ROLE=money) + LINE OA แมวกวัก (แยกโควตา): รายรับรายจ่าย, ค้างกัน/หารกัน,
 *    หารในกลุ่ม, ตู้รหัสส่วนตัว, สรุปเงินตอนเช้า · LINE_TOKEN ของ OA แมวกวัก เจ้าของใส่เองใน Script Properties
 *    เจ้าของ = คนแรกที่ทักแชท OA แมวกวัก (LINE_USER_ID)
 * สองหลังบ้านคุยกันด้วย rx_() (ตอนย้ายข้อมูล): POST ไปที่ PEER_URL พร้อม PEER_KEY (= API_KEY ของอีกฝั่ง)
 * ตั้งค่าครั้งแรก: รัน setupMoney() ใน editor → ดีพลอย → ฝั่งงานเรียก split_pair {url} (ภายใน 60 นาที)
 */

function isMoney_() { return props.getProperty('ROLE') === 'money'; }
/** ฝั่งงานที่ย้ายเงินออกไปแล้ว (คำสั่งเงินส่งต่อไประบบเงิน) */
function splitOn_() { return !isMoney_() && props.getProperty('SPLIT_ON') === '1' && !!props.getProperty('PEER_URL'); }

const SPLIT_BOTH = /^(status|ai_debug|ai_status|ai_health|ai_flag|ai_regress|ai_compare|ai_bench|ai_read|ai_voice|backup_now)$/;
const SPLIT_MONEY = /^(money_|owe_|hk_setup$)/;
/** คำสั่งนี้ทำที่หลังบ้านนี้ได้ไหม (คืนข้อความ error หรือ '') */
function splitDeny_(a, body) {
  a = String(a || '');
  if (SPLIT_BOTH.test(a)) return '';
  const money = SPLIT_MONEY.test(a) || (/^vault_/.test(a) && body.space === 'personal');
  if (isMoney_()) return money ? '' : 'ระบบเงินไม่มีคำสั่งนี้ (เรื่องงานอยู่ในแอปจดครบ)';
  if (money && props.getProperty('SPLIT_ON') === '1') return 'ย้ายไปแอปเงินแล้ว เปิดแอปเงินแทน (พิมพ์ ลิงก์ ในแชท LINE แมวกวัก)';
  return '';
}

/** เรียกอีกฝั่ง */
function rx_(action, payload) {
  const url = props.getProperty('PEER_URL'), key = props.getProperty('PEER_KEY');
  if (!url || !key) throw new Error('ยังไม่ได้เชื่อม 2 ระบบ');
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify(Object.assign({}, payload || {}, { action: action, key: key })) });
  let j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('อีกระบบไม่ตอบ (' + r.getResponseCode() + ')'); }
  if (!j.ok) throw new Error(j.error || 'อีกระบบตอบผิดพลาด');
  return j;
}

/* ===================== ตั้งค่า + จับคู่ ===================== */
/** ⚙ รันครั้งเดียวใน editor ของโปรเจกต์ระบบเงิน (บัญชี nitithon.see) */
function setupMoney() {
  props.setProperty('ROLE', 'money');
  if (!props.getProperty('API_KEY')) props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  if (!props.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('จดครบ เงิน');
    props.setProperty('SHEET_ID', ss.getId());
  }
  props.setProperty('PAIR_OPEN', String(Date.now() + 60 * 60000));   // เปิดรับการจับคู่ 60 นาที
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(REMIND_EVERY_MIN).create();
  ScriptApp.newTrigger('morningSummary').timeBased().atHour(MORNING_HOUR).everyDays(1).inTimezone(TZ).create();
  try { UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true }); } catch (e) {}   // ขอสิทธิ์เรียกเว็บ
  try { DriveApp.getRootFolder(); } catch (e) {}
  Logger.log('ตั้งค่าระบบเงินแล้ว · ดีพลอยเป็นเว็บแอป แล้วจับคู่จากระบบงานภายใน 60 นาที');
}

/** ฝั่งเงิน: รับการจับคู่ (ไม่ใช้ key แต่เปิดเฉพาะ 60 นาทีหลัง setupMoney และครั้งเดียว) */
function pairAccept_(b) {
  if (!isMoney_()) throw new Error('ไม่ใช่ระบบเงิน');
  const until = Number(props.getProperty('PAIR_OPEN') || 0);
  if (!until || Date.now() > until) throw new Error('หมดเวลาจับคู่ รัน setupMoney ใหม่');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(b.url || ''))) throw new Error('URL ไม่ถูกต้อง');
  const set = { PEER_URL: b.url, PEER_KEY: String(b.peerKey || '') };
  if (b.gemini) set.GEMINI_API_KEY = String(b.gemini);
  if (b.geminiModel) set.GEMINI_MODEL = String(b.geminiModel);
  if (!set.PEER_KEY) throw new Error('ข้อมูลไม่ครบ');
  props.setProperties(set);
  props.deleteProperty('PAIR_OPEN');
  return { key: props.getProperty('API_KEY') };
}

/** ฝั่งงาน: จับคู่กับระบบเงินที่เพิ่งดีพลอย (ส่ง key ของกันและกัน + Gemini key ไปให้ตรงๆ ไม่ผ่านแชท) */
function splitPair_(p) {
  if (isMoney_()) throw new Error('สั่งจากระบบงานเท่านั้น');
  const url = String(p.url || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('URL ไม่ถูกต้อง');
  const me = ScriptApp.getService().getUrl() || '';
  const myUrl = String(p.self || '').trim() || me.replace(/\/dev$/, '/exec');
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify({ action: 'pair', url: myUrl, peerKey: props.getProperty('API_KEY'),
      gemini: p.gemini === false ? '' : props.getProperty('GEMINI_API_KEY'), geminiModel: props.getProperty('GEMINI_MODEL') || '' }) });
  let j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('ระบบเงินไม่ตอบ (' + r.getResponseCode() + ')'); }
  if (!j.ok) throw new Error(j.error || 'จับคู่ไม่สำเร็จ');
  props.setProperties({ PEER_URL: url, PEER_KEY: j.key });
  return { paired: true, peer: rx_('status', {}).ver };
}

/* ===================== ฝั่งเงิน: คำสั่งจากระบบงาน (rx_*) ===================== */
function rxHandle_(b) {
  if (!isMoney_()) throw new Error('ไม่ใช่ระบบเงิน');
  const a = b.action;
  if (a === 'rx_month') return { money: monthMoney_(String(b.month || '')) };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (a) {
      case 'rx_mig_props':  return { set: migProps_(b.props) };
      case 'rx_mig_file':   return migFilePut_(b);
      case 'rx_mig_put':    return { rows: migPut_(b.tab, b.values) };
      case 'rx_mig_count':  return { counts: migCounts_(b.tabs) };
    }
  } finally { lock.releaseLock(); }
  throw new Error('unknown rx');
}

/* ===================== LINE: แต่ละ OA ดูแลเรื่องของตัวเอง ===================== */
const MOVED_MONEY = '💰 เรื่องเงิน (จ่าย/รับ/สลิป/ค้างกัน/หาร) ย้ายไปจดที่ LINE "แมวกวัก" แล้วครับ';
const MOVED_WORK = '📝 แมวกวักจดเฉพาะเรื่องเงิน เรื่องงาน/ฝาก/บิลเบิก ส่งที่ LINE "EZP BOT" ครับ';
/** ข้อความเรื่องเงินที่พิมพ์มาหา EZP BOT */
function splitLineText_(text) {
  return /^(เงิน|สรุปเงิน|รายรับรายจ่าย|รายรับ-รายจ่าย)$/.test(text) ||
    /^(ใครค้าง|ค้าง|ค้างกัน|ใครติด|หนี้|🤝)$/.test(text) || /^หาร\s/.test(text) || /(ยืม|คืน)\s*[\d,]+/.test(text);
}

const MONEY_HELP = [
  '🐱 วิธีใช้ แมวกวัก (จดเงิน)',
  '• จ่าย 120 ข้าวมันไก่ / ข้าว 60 → รายจ่าย',
  '• รับ 5000 เงินเดือน → รายรับ',
  '• ส่งรูปสลิป/ใบเสร็จ → AI อ่านให้ แล้วเลือก จ่าย/รับ/คืนเงิน',
  '• เงิน → สรุปเดือนนี้ · สรุปเดือน → ภาพรวม',
  '• ใครค้าง · ต้นยืม 500 · ต้นคืน 200 · หาร 1200 ชาบู เอ็ม เจ',
  '• ลิงก์ → ลิงก์เข้าแอปเงิน',
  '👥 ในกลุ่ม: เชิญแมวกวักเข้ากลุ่ม แล้วพิมพ์ แมวกวัก',
].join('\n');

/** ข้อความในแชทส่วนตัวของ OA แมวกวัก (ระบบเงิน) */
function moneyLineText_(ev, text) {
  const tk = ev.replyToken, lock = LockService.getScriptLock();
  if (/^(id|ไอดี)$/i.test(text)) return reply_(tk, ev.source.userId);
  if (/^(ช่วย|help|วิธีใช้|\?)$/i.test(text)) return reply_(tk, MONEY_HELP);
  if (/^(ลิงก์|ลิ้งค์|ลิงค์|link|แอป|app)$/i.test(text)) return reply_(tk, magicMsg_());
  if (/^(โควตา|โควต้า|quota)$/i.test(text)) return reply_(tk, quotaText_(quota_()));
  if (/^(สรุปเดือน|ภาพรวม|สรุปเดือนนี้|📊)$/.test(text)) return reply_(tk, moneyMonthText_());
  if (/^(เงิน|สรุปเงิน|รายรับรายจ่าย|รายรับ-รายจ่าย)$/.test(text)) return reply_(tk, moneySummaryText_());
  if (/^(รอจัด|รูป|รูปรอจัด)$/.test(text)) return billNextPending_(tk, '');
  if (/^(จ่าย|รับ|รายจ่าย|รายรับ)\s*[\d,]+(\.\d+)?(\s|บ|$)/.test(text) || /^(จ่าย|รายจ่าย|รายรับ)\s+\S.*\s[\d,]+(\.\d+)?\s*(บาท|บ\.?)?$/.test(text) || /^รับ\s+\S.*\s[\d,]+(\.\d+)?\s*(บาท|บ\.?)$/.test(text) || /^[+-]\s*\d/.test(text))
    return withLock_(lock, tk, () => saveAs_(tk, /^(รับ|รายรับ|\+)/.test(text) ? 'mi' : 'mo', text));
  if (/^(ใครค้าง|ค้าง|ค้างกัน|ใครติด|หนี้|🤝)$/.test(text) || /^หาร\s/.test(text) || /(ยืม|คืน)\s*[\d,]+/.test(text)) {
    if (!lock.tryLock(25000)) return reply_(tk, 'ระบบกำลังยุ่ง ส่งข้อความเดิมอีกครั้งได้เลย');
    let out = '';
    try { out = oweLineText_(text); } catch (err) { out = 'จดค้างกันไม่สำเร็จ: ' + (err.message || err); } finally { lock.releaseLock(); }
    if (out) return reply_(tk, out);
  }
  if (hasAmount_(text)) return withLock_(lock, tk, () => saveAs_(tk, 'mo', text));
  return reply_(tk, MOVED_WORK + '\n\n' + MONEY_HELP);
}

/** สรุปเดือน (เฉพาะเงิน) สำหรับ OA แมวกวัก */
function moneyMonthText_() {
  const o = monthMoney_(''), M = o.money, W = o.owe, m = todayStr_().slice(0, 7);
  const th = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(m.slice(5, 7))];
  const out = ['📊 เงิน ' + th + ' ' + (Number(m.slice(0, 4)) + 543), '', '💰 รับ ' + fmtBaht_(M.inc) + ' · จ่าย ' + fmtBaht_(M.out) + ' · เหลือ ' + fmtBaht_(M.inc - M.out)];
  if (M.prevOut) out.push('   จ่าย' + (M.out >= M.prevOut ? 'มากกว่า' : 'น้อยกว่า') + 'เดือนก่อน ' + fmtBaht_(Math.abs(M.out - M.prevOut)));
  if (M.cats.length) out.push('   จ่ายมากสุด: ' + M.cats.slice(0, 3).map(([k, v]) => k + ' ' + fmtBaht_(v)).join(' · '));
  const over = M.budgets.filter(b => b.used > b.limit);
  if (over.length) out.push('   🔴 เกินงบ: ' + over.map(b => b.cat).join(', '));
  if (W.they || W.me) out.push('', '🤝 ค้างกัน: ใครค้างเรา ' + fmtBaht_(W.they) + ' · เราค้าง ' + fmtBaht_(W.me));
  return out.join('\n');
}

/** สรุปเช้าของ OA แมวกวัก (ส่งเฉพาะเมื่อมีเรื่อง) */
function moneyMorning_() {
  let money = '', owe = '';
  try { money = moneyDaily_(); } catch (e) { console.warn('moneyDaily: ' + e); }
  try { owe = oweDueLine_(); } catch (e) {}
  const q = quota_();
  const warn = q && q.limit && q.used >= q.limit * 0.8 ? quotaText_(q) : '';
  const msg = [money, owe, warn].filter(Boolean).join('\n\n');
  if (msg) push_(msg);
}

/* ===================== 📦 ย้ายข้อมูล (สั่งจากฝั่งงาน: split_migrate {step}) ===================== */
const MIG_TABS = ['Money', 'Owe', 'Group', 'HkUsers', 'Vault2', 'AiSamples'];
const MIG_PROPS = ['MONEY_CFG', 'LINE_GROUPS', 'LIFF_ID', 'LIFF_CHANNEL', 'GRP_DAILY_SENT', 'VAULT2_SALT', 'VAULT2_CHECK'];

function splitMigrate_(p) {
  if (isMoney_()) throw new Error('สั่งจากระบบงานเท่านั้น');
  const step = String(p.step || '');
  if (step === 'props') {
    const o = {};
    MIG_PROPS.forEach(k => { const v = props.getProperty(k); if (v != null) o[k] = v; });
    return rx_('rx_mig_props', { props: o });
  }
  if (step === 'scan') return { files: migScan_().length };
  if (step === 'files') return migFiles_();
  if (step === 'rows') {
    const map = migMap_(), out = {};
    const ss = grpSS_();
    MIG_TABS.forEach(t => {
      const sh = ss.getSheetByName(t);
      if (!sh || sh.getLastRow() < 1) return;
      const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues()
        .map(r => r.map(c => migSwap_(String(c), map)));
      out[t] = rx_('rx_mig_put', { tab: t, values: vals }).rows;
    });
    return { put: out };
  }
  if (step === 'check') {
    const ss = grpSS_(), mine = {};
    MIG_TABS.forEach(t => { const sh = ss.getSheetByName(t); mine[t] = sh ? Math.max(0, sh.getLastRow() - 1) : 0; });
    const theirs = rx_('rx_mig_count', { tabs: MIG_TABS }).counts;
    const map = migMap_(), want = migScan_().length;
    return { here: mine, there: theirs, same: MIG_TABS.every(t => mine[t] === theirs[t]), files: Object.keys(map).length, filesWanted: want };
  }
  if (step === 'sweep') return migSweep_();
  if (step === 'cleanup') return migCleanup_(p);
  if (step === 'on') { props.setProperty('SPLIT_ON', '1'); return { on: true }; }
  if (step === 'off') { props.deleteProperty('SPLIT_ON'); return { on: false }; }
  throw new Error('step ไม่ถูกต้อง');
}

/** ไฟล์ Drive ที่ข้อมูลเงินอ้างถึง (สลิป ใบเสร็จ QR ใบตัวอย่าง) */
function migScan_() {
  const ss = grpSS_(), seen = {}, ids = [];
  MIG_TABS.filter(t => t !== 'Vault2').forEach(t => {
    const sh = ss.getSheetByName(t);
    if (!sh || sh.getLastRow() < 2) return;
    const text = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues().map(r => r.join('\t')).join('\n')
      .replace(/data:[\w\/+.-]+;base64,[A-Za-z0-9+\/=]+/g, '');   // รูปย่อฝังในข้อมูล ไม่ใช่ไฟล์
    (text.match(/\b1[A-Za-z0-9_-]{24,60}\b/g) || []).forEach(id => { if (!seen[id]) { seen[id] = 1; ids.push(id); } });
  });
  return ids;
}
function migMapSheet_() { return grpTab_('_ย้ายไฟล์', ['old', 'new', 'url', 'note']); }
function migMap_() {
  const sh = migMapSheet_(), m = {};
  if (sh.getLastRow() < 2) return m;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(r => { if (r[0]) m[String(r[0])] = String(r[1] || ''); });
  return m;
}
function migSwap_(s, map) {
  if (!s || s.length < 25) return s;
  return s.replace(/\b1[A-Za-z0-9_-]{24,60}\b/g, id => map[id] || id);
}
/** คัดลอกไฟล์ไปอีกบัญชีทีละชุด (ไม่เกิน ~4 นาทีต่อครั้ง สั่งซ้ำจนเหลือ 0) */
function migFiles_() {
  const t0 = Date.now(), map = migMap_(), sh = migMapSheet_();
  const todo = migScan_().filter(id => !(id in map));
  let done = 0, skip = 0;
  const moneyRoot = props.getProperty('MONEY_FOLDER_ID'), hkRoot = props.getProperty('HK_FOLDER_ID'), smpRoot = props.getProperty('AI_SAMPLE_FOLDER_ID');
  for (const id of todo) {
    if (Date.now() - t0 > 240000) break;
    let f;
    try { f = DriveApp.getFileById(id); } catch (e) { sh.appendRow([id, '', '', 'ไม่ใช่ไฟล์']); skip++; continue; }
    try {
      const par = f.getParents().hasNext() ? f.getParents().next() : null;
      const gp = par && par.getParents().hasNext() ? par.getParents().next() : null;
      const pid = par ? par.getId() : '', gid = gp ? gp.getId() : '';
      const root = pid === smpRoot ? 'samples' : (pid === hkRoot || gid === hkRoot) ? 'hk' : 'money';
      const sub = (pid === moneyRoot || pid === hkRoot || pid === smpRoot || !par) ? '' : par.getName();
      const blob = f.getBlob();
      const r = rx_('rx_mig_file', { name: f.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), root: root, sub: sub });
      sh.appendRow([id, r.id, r.url, root + '/' + sub]);
      done++;
    } catch (e) { sh.appendRow([id, '', '', 'คัดลอกไม่ได้: ' + String(e.message || e).slice(0, 80)]); skip++; }
  }
  const left = migScan_().filter(id => !(id in migMap_())).length;
  return { done: done, skip: skip, left: left };
}

/* ฝั่งเงิน: รับข้อมูลที่ย้ายมา */
function migProps_(o) {
  const set = {};
  Object.keys(o || {}).forEach(k => { if (MIG_PROPS.indexOf(k) > -1) set[k] = String(o[k]); });
  props.setProperties(set);
  return Object.keys(set);
}
function migFilePut_(b) {
  const folder = b.root === 'hk' ? hkFolder_(b.sub || '') : b.root === 'samples' ? aiSampleFolder_() : moneyFolder_(b.sub || '');
  const f = folder.createFile(Utilities.newBlob(Utilities.base64Decode(String(b.data || '')), String(b.mime || 'application/octet-stream'), String(b.name || 'file')));
  return { id: f.getId(), url: f.getUrl() };
}
function migPut_(tab, values) {
  if (MIG_TABS.indexOf(tab) < 0) throw new Error('แท็บไม่ถูกต้อง');
  if (!Array.isArray(values) || !values.length) return 0;
  const ss = grpSS_();
  let sh = ss.getSheetByName(tab);
  if (!sh) sh = ss.insertSheet(tab);
  sh.clear();
  const w = Math.max.apply(null, values.map(r => r.length));
  const vals = values.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; });
  if (sh.getMaxRows() < vals.length + 50) sh.insertRowsAfter(sh.getMaxRows(), vals.length + 50 - sh.getMaxRows());
  if (sh.getMaxColumns() < w) sh.insertColumnsAfter(sh.getMaxColumns(), w - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), w).setNumberFormat('@');
  sh.getRange(1, 1, vals.length, w).setValues(vals);
  sh.getRange(1, 1, 1, w).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (tab === 'Vault2') sh.hideSheet();
  try { const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1'); if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1); } catch (e) {}
  return vals.length - 1;
}
function migCounts_(tabs) {
  const ss = grpSS_(), o = {};
  (tabs || []).forEach(t => { const sh = ss.getSheetByName(t); o[t] = sh ? Math.max(0, sh.getLastRow() - 1) : 0; });
  return o;
}

/** ไฟล์ที่ค้างอยู่ในโฟลเดอร์เงิน/หารกลุ่ม/ตัวอย่าง AI แต่ข้อมูลไม่ได้อ้างถึง → คัดลอกไปแมวกวักด้วย (ก่อนลบ) */
function migSweep_() {
  const t0 = Date.now(), map = migMap_(), sh = migMapSheet_();
  const roots = [['money', props.getProperty('MONEY_FOLDER_ID')], ['hk', props.getProperty('HK_FOLDER_ID')], ['samples', props.getProperty('AI_SAMPLE_FOLDER_ID')]];
  let done = 0, left = 0;
  const walk = (folder, root, sub) => {
    const fs = folder.getFiles();
    while (fs.hasNext()) {
      const f = fs.next(), id = f.getId();
      if (map[id]) continue;
      if (Date.now() - t0 > 240000) { left++; continue; }
      try {
        const blob = f.getBlob();
        const r = rx_('rx_mig_file', { name: f.getName(), mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()), root: root, sub: sub });
        sh.appendRow([id, r.id, r.url, root + '/' + sub + ' (กวาด)']); map[id] = r.id; done++;
      } catch (e) { sh.appendRow([id, '', '', 'กวาดไม่ได้: ' + String(e.message || e).slice(0, 80)]); left++; }
    }
    const ds = folder.getFolders();
    while (ds.hasNext()) { const d = ds.next(); walk(d, root, d.getName()); }
  };
  roots.forEach(([root, id]) => { if (!id) return; try { walk(DriveApp.getFolderById(id), root, ''); } catch (e) {} });
  return { done: done, left: left };
}

/** ลบข้อมูลเงินฝั่งงาน หลังตรวจว่าแมวกวักมีครบ (แท็บ → ลบ · โฟลเดอร์ → ถังขยะ 30 วัน · ค่าตั้งเงิน → ลบ) */
function migCleanup_(p) {
  if (!splitOn_()) throw new Error('ยังไม่ได้เปิดใช้การแยก');
  const ss = grpSS_(), mine = {};
  MIG_TABS.forEach(t => { const sh = ss.getSheetByName(t); mine[t] = sh ? Math.max(0, sh.getLastRow() - 1) : 0; });
  const theirs = rx_('rx_mig_count', { tabs: MIG_TABS }).counts;
  const bad = MIG_TABS.filter(t => mine[t] > theirs[t]);
  if (bad.length) throw new Error('แมวกวักมีข้อมูลน้อยกว่า: ' + bad.join(', ') + ' — ย้ายซ้ำก่อน');
  const map = migMap_(), missing = migScan_().filter(id => !(id in map));
  if (missing.length) throw new Error('ยังมีไฟล์ที่ยังไม่ได้คัดลอก ' + missing.length + ' ไฟล์');
  if (p.dry) return { ok: true, here: mine, there: theirs };
  const out = { tabs: [], folders: [], props: [] };
  MIG_TABS.forEach(t => { const sh = ss.getSheetByName(t); if (sh && ss.getSheets().length > 1) { ss.deleteSheet(sh); out.tabs.push(t); } });
  ['MONEY_FOLDER_ID', 'HK_FOLDER_ID', 'AI_SAMPLE_FOLDER_ID'].forEach(k => {
    const id = props.getProperty(k);
    if (!id) return;
    try { const f = DriveApp.getFolderById(id); f.setTrashed(true); out.folders.push(f.getName()); } catch (e) {}
    props.deleteProperty(k);
  });
  MIG_PROPS.concat(['GRP_MEMBERS_TRY', 'AI_SAMPLES']).forEach(k => { if (props.getProperty(k) != null) { props.deleteProperty(k); out.props.push(k); } });
  return out;
}
