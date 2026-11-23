/* ===================== 🏢 เชื่อมกับ "คลังรายงานการประชุม TIBD" =====================
 * ระบบคลังเป็นของบัญชีอื่น (deploy ได้เฉพาะเจ้าของ) จดครบจึงไม่แก้ระบบนั้น แต่ใช้สิทธิ์ผู้แก้ไขของบัญชีนี้
 *   1 อ่าน Sheet ข้อมูลคลัง (Meetings / Actions / TaskMeta / Members / Contacts) → งานของฉัน + งานของทีม
 *   2 เปลี่ยนสถานะงาน = เขียนตาราง Actions แบบเดียวกับ setActionState_ ของคลัง + บันทึก TaskLog
 *      (คลังอ่านสองตารางนี้สดทุกครั้ง ไม่มีแคช จึงเห็นทันที)
 *   3 บันทึกประชุมในจดครบ → ร่าง <key>.minute.json ลงโฟลเดอร์ "1 รอยืนยัน"
 *      เจ้าของงานตรวจ/กดยืนยันในเมนู ยืนยันรายงาน ของคลัง (ระบบคลังสร้าง Google Doc ตามแบบฟอร์มเอง)
 * รหัสไฟล์/โฟลเดอร์อยู่ใน Script Properties (repo นี้เปิดสาธารณะ):
 *   MEET_SHEET_ID  MEET_PENDING_ID  MEET_SYS_ID (โฟลเดอร์ระบบยืนยัน มีชีตรายชื่อ)  MEET_URL (ลิงก์เว็บแอปคลัง)  MEET_ME (อีเมลของฉันในทะเบียนสมาชิก)
 */

const MEET_STATUSES = { open: 'ยังไม่เริ่ม', doing: 'อยู่ระหว่างดำเนินการ', blocked: 'ติดปัญหา', done: 'เสร็จแล้ว', dropped: 'ยกเลิก' };
const MEET_KIND_TO_STATUS = { ok: 'done', flag: 'blocked', warn: 'doing', wait: 'open' };
const MEET_SPLIT_RE = /\s*·\s*|\s*,\s*|\s*、\s*|\s+\/\s+|\s+และ\s+|\s*ร่วมกับ\s*/;
const MEET_TEAM_PREFIX_RE = /^(?:ฝ่าย|ฝั่ง|ทีมงาน|ทีม|บริษัท|คณะ)\s*/;
const MEET_TEAM_ALIASES = {
  bd: 'bd', 'businessdevelopment': 'bd', 'พัฒนาธุรกิจ': 'bd',
  pm: 'pm', 'projectmanager': 'pm', 'projectmanagement': 'pm', 'บริหารโครงการ': 'pm',
  rd: 'rd', 'r&d': 'rd', 'r/d': 'rd', 'พัฒนาสูตร': 'rd', 'วิจัยและพัฒนา': 'rd', 'วิจัย': 'rd',
};
const MEET_LISTS_NAME = 'รายชื่อ สถานที่ และฝ่าย (ระบบยืนยันรายงาน)';

function meetCfg_() {
  const c = { sheet: props.getProperty('MEET_SHEET_ID') || '', pending: props.getProperty('MEET_PENDING_ID') || '',
    sys: props.getProperty('MEET_SYS_ID') || '', url: props.getProperty('MEET_URL') || '' };
  c.on = !!(c.sheet && c.pending);
  return c;
}
/** ตั้งค่าครั้งแรก (เรียกจากหน้าเว็บ: api('meet_setup', {sheet, pending, sys, url})) */
function meetSetup_(p) {
  ['sheet', 'pending', 'sys', 'url', 'me', 'audio'].forEach(k => {
    if (p[k] !== undefined) props.setProperty('MEET_' + k.toUpperCase() + (k === 'url' || k === 'me' ? '' : '_ID'), String(p[k]).trim());
  });
  const c = meetCfg_();
  const out = { on: c.on };
  try { out.sheetName = SpreadsheetApp.openById(c.sheet).getName(); } catch (e) { out.sheetErr = String(e.message || e); }
  try { out.pendingName = DriveApp.getFolderById(c.pending).getName(); } catch (e) { out.pendingErr = String(e.message || e); }
  const au = props.getProperty('MEET_AUDIO_ID');
  if (au) { try { out.audioName = DriveApp.getFolderById(au).getName(); } catch (e) { out.audioErr = String(e.message || e); } }
  return out;
}

function meetBook_() {
  const c = meetCfg_();
  if (!c.sheet) throw new Error('ยังไม่ได้เชื่อมคลังรายงานการประชุม');
  return SpreadsheetApp.openById(c.sheet);
}
function meetRows_(book, name) {
  const sh = book.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getDisplayValues();
  const head = v.shift();
  return v.filter(r => r.some(x => x !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const meetKey_ = s => String(s || '').replace(/\s+/g, '').toLowerCase();
function meetList_(cell) { try { const v = JSON.parse(cell || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function meetTeamsOf_(core) {
  const k = meetKey_(core);
  if (!k) return [];
  if (MEET_TEAM_ALIASES[k]) return [MEET_TEAM_ALIASES[k]];
  const parts = k.split(/&|\+|,|และ/).filter(Boolean);
  if (parts.length < 2) return [];
  const out = parts.map(p => MEET_TEAM_ALIASES[p] || '');
  return out.every(Boolean) ? out : [];
}

/** ฉันคือใครในคลัง: ชื่อ ชื่อเล่น และฝ่าย จากตาราง Members + Contacts (ตามอีเมลของบัญชีนี้) */
function meetMe_(book) {
  const me = String(props.getProperty('MEET_ME') || '').toLowerCase();   // อีเมลของฉันในทะเบียนสมาชิกคลัง (ตั้งผ่าน meet_setup)
  if (!me) throw new Error('ยังไม่ได้ตั้งอีเมลของคุณสำหรับคลังรายงาน');
  const members = meetRows_(book, 'Members');
  const mine = members.filter(m => String(m.email).toLowerCase() === me);
  const cids = mine.map(m => m.contactId).filter(Boolean);
  members.forEach(m => { if (m.contactId && cids.indexOf(m.contactId) > -1 && mine.indexOf(m) < 0) mine.push(m); });
  const names = [], teams = {};
  mine.forEach(m => {
    names.push(m.name);
    String(m.aliases || '').split(/\s*[,،、;·]\s*/).forEach(a => names.push(a));
    String(m.teams || '').split(/\s*[,،、;·]\s*/).forEach(t => meetTeamsOf_(t).forEach(x => { teams[x] = 1; }));
  });
  meetRows_(book, 'Contacts').forEach(c => {
    const mails = meetList_(c.emails).map(e => String(e.address || e).toLowerCase());
    if (cids.indexOf(c.id) > -1 || mails.indexOf(me) > -1) { names.push(c.name); meetList_(c.aliases).forEach(a => names.push(a)); }
  });
  const keys = {};
  names.map(meetKey_).filter(Boolean).forEach(k => { keys[k] = 1; });
  const display = (mine.find(m => m.email.toLowerCase() === me) || mine[0] || {}).name || me;
  return { email: me, keys: keys, teams: Object.keys(teams), name: display, nick: String((mine[0] || {}).aliases || '').split(',')[0].trim() };
}
/** งานข้อนี้เป็นของฉัน (me) / ของฝ่ายฉัน (team) / ไม่ใช่ ('') */
function meetScope_(me, owner) {
  const o = String(owner || '').trim();
  if (!o) return '';
  const toks = [o].concat(o.split(MEET_SPLIT_RE).filter(t => t && t.trim() !== o)).map(t => t.trim());
  const person = t => {
    if (me.keys[meetKey_(t)]) return true;
    const parts = t.split(/\s+/);
    return parts.length > 1 && parts.some(p => me.keys[meetKey_(p)]);
  };
  if (toks.some(t => !MEET_TEAM_PREFIX_RE.test(t) && !meetTeamsOf_(t).length && person(t))) return 'me';
  if (toks.some(t => meetTeamsOf_(t.replace(MEET_TEAM_PREFIX_RE, '')).some(x => me.teams.indexOf(x) > -1))) return 'team';
  return '';
}
function meetDate_(m) {
  const y = Number(m.yBE) > 2400 ? Number(m.yBE) - 543 : Number(m.yBE);
  if (!y || m.d === undefined || m.m === undefined) return '';
  return y + '-' + ('0' + (Number(m.m) + 1)).slice(-2) + '-' + ('0' + Number(m.d)).slice(-2);
}
function meetDue_(v) {
  const s = String(v || '').replace(/^'/, '').trim();
  if (s === 'none') return 'none';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  return m[1].length === 4 ? m[1] + '-' + m[2] + '-' + m[3] : m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

/** งานจากคลังที่เป็นของฉัน/ฝ่ายฉัน · all = รวมงานที่ปิดแล้ว */
function meetTasks_(all) {
  const book = meetBook_();
  const me = meetMe_(book);
  const states = {};
  meetRows_(book, 'Actions').forEach(r => { states[r.meetingId + '#' + r.index] = r; });
  const meta = {};
  meetRows_(book, 'TaskMeta').forEach(r => { meta[r.meetingId + '#' + Number(r.index)] = r; });
  const out = [];
  meetRows_(book, 'Meetings').forEach(row => {
    let m;
    try { m = JSON.parse(row.json); } catch (e) { return; }
    if (!m || !m.id) return;
    (m.actions || []).forEach((a, i) => {
      const scope = meetScope_(me, a && a[1]);
      if (!scope) return;
      const k = m.id + '#' + i, st = states[k];
      const status = st && MEET_STATUSES[st.status] ? st.status : (MEET_KIND_TO_STATUS[a[3]] || 'open');
      const open = status !== 'done' && status !== 'dropped';
      if (!open && !all) return;
      const mt = meta[k] || {};
      out.push({ meetingId: String(m.id), index: i, task: String(a[0] || ''), owner: String(a[1] || ''), scope: scope,
        status: status, statusLabel: MEET_STATUSES[status], open: open, due: meetDue_(mt.due), note: String(mt.note || ''),
        title: String(m.title || ''), date: meetDate_(m), url: String(m.url || row.url || ''), set: String(m.set || row.set || '') });
    });
  });
  out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.index - b.index);
  return { tasks: out, me: { name: me.name, nick: me.nick, teams: me.teams.map(t => ({ bd: 'BD', pm: 'PM', rd: 'R&D' }[t])) },
    statuses: MEET_STATUSES, url: meetCfg_().url };
}

/** เปลี่ยนสถานะงานในคลัง (แบบเดียวกับ setActionState_ + logTask_ ของคลัง) */
function meetSetStatus_(meetingId, index, status, quiet) {
  if (!MEET_STATUSES[status]) throw new Error('สถานะไม่ถูกต้อง');
  const book = meetBook_();
  const me = meetMe_(book);
  const row = meetRows_(book, 'Meetings').find(r => String(r.id) === String(meetingId));
  let m = null;
  try { m = row && JSON.parse(row.json); } catch (e) { m = null; }
  const a = m && (m.actions || [])[Number(index)];
  if (!a) throw new Error('ไม่พบงานข้อนี้ในคลังแล้ว');
  if (!meetScope_(me, a[1])) throw new Error('งานข้อนี้ไม่ได้ระบุคุณหรือฝ่ายของคุณเป็นผู้รับผิดชอบ');
  const by = me.name, at = new Date().toISOString();
  const sh = book.getSheetByName('Actions');
  const last = sh.getLastRow();
  let before = MEET_KIND_TO_STATUS[a[3]] || 'open', done = false;
  if (last > 1) {
    const v = sh.getRange(2, 1, last - 1, 3).getDisplayValues();
    for (let i = 0; i < v.length; i++) {
      if (String(v[i][0]) === String(meetingId) && String(v[i][1]) === String(Number(index))) {
        before = v[i][2] || before;
        sh.getRange(i + 2, 1, 1, 5).setValues([[String(meetingId), Number(index), status, by, at]]);
        done = true;
        break;
      }
    }
  }
  if (!done) sh.appendRow([String(meetingId), Number(index), status, by, at]);
  if (before !== status) {
    const log = book.getSheetByName('TaskLog');
    if (log) log.appendRow([at, String(meetingId), Number(index), 'status', before, status, by + ' (จดครบ)']);
  }
  // งานที่ปักไว้ในจดครบ: ติ๊กเสร็จ/ยกเลิกตาม
  if (!quiet) {
    const id = 'meet:' + meetingId + ':' + Number(index);
    if (findRow_(id)) meetLocalDone_(id, status === 'done' || status === 'dropped');
  }
  return { status: status, label: MEET_STATUSES[status], by: by, at: at };
}
/** อัปเดตช่อง done ของงานในจดครบ โดยไม่วนกลับไปเขียนคลังซ้ำ */
function meetLocalDone_(id, done) {
  const r = findRow_(id);
  if (!r) return;
  sheet_().getRange(r, HEADERS.indexOf('done') + 1).setValue(done ? '1' : '');
}

/** ปักงานจากคลังเข้าเป็นงานในจดครบ (มีวัน = เตือนตามปกติ) */
function meetPin_(t) {
  const id = 'meet:' + t.meetingId + ':' + Number(t.index);
  const title = String(t.task || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const note = ['📋 จากประชุม: ' + (t.title || '') + (t.date ? ' (' + t.date + ')' : ''), t.owner ? 'ผู้รับผิดชอบ: ' + t.owner : '', t.note ? 'หมายเหตุ: ' + t.note : '', t.url || '']
    .filter(Boolean).join('\n');
  const due = t.due && t.due !== 'none' ? t.due : '';
  const cur = findRow_(id);
  if (cur) return updateTask_({ id: id, title: title, note: note, date: due || undefined, done: !t.open });
  return addTask_({ id: id, title: title, note: note, date: due, project: 'ประชุม', source: 'meet', pre: due ? '3' : '', done: !t.open });
}

/** ซิงก์อัตโนมัติ (เรียกจากรอบเตือน ห่างกันอย่างน้อย 1 ชม.): งานของฉันที่มีกำหนดส่ง → ปักเอง · งานที่ปักแล้ว → สถานะ/วันตามคลัง */
function meetSync_(force) {
  if (!meetCfg_().on) return null;
  const last = Number(props.getProperty('MEET_SYNC_AT') || 0);
  if (!force && Date.now() - last < 60 * 60000) return null;
  props.setProperty('MEET_SYNC_AT', String(Date.now()));
  const r = meetTasks_(true);
  const local = {};
  readAll_().filter(t => /^meet:/.test(t.id)).forEach(t => { local[t.id] = t; });
  let added = 0, updated = 0;
  r.tasks.forEach(t => {
    const id = 'meet:' + t.meetingId + ':' + t.index;
    const cur = local[id];
    if (!cur) {
      if (t.open && t.scope === 'me' && t.due && t.due !== 'none') { meetPin_(t); added++; }
      return;
    }
    const want = { id: id };
    if ((cur.done === '1') !== !t.open) want.done = !t.open;
    if (t.due && t.due !== 'none' && cur.date !== t.due) want.date = t.due;
    if (Object.keys(want).length > 1) { updateTask_(want); updated++; }
  });
  return { added: added, updated: updated, total: r.tasks.filter(t => t.open).length };
}

/** ติ๊กเสร็จ/ยกเลิกเสร็จงาน meet:... ในจดครบ → สถานะในคลัง */
function meetOnLocalDone_(id, done) {
  const m = String(id).match(/^meet:(.+):(\d+)$/);
  if (!m || !meetCfg_().on) return;
  try { meetSetStatus_(m[1], Number(m[2]), done ? 'done' : 'doing', true); } catch (e) { console.warn('meet sync: ' + e); }
}

/* ---------- 3) บันทึกประชุม → ร่างรายงานรูปแบบคลัง ---------- */

/** รายชื่อ สถานที่ ฝ่าย ที่คลังใช้ (ชีตของระบบยืนยัน) ให้ AI ใช้ชื่อแบบเดียวกัน */
function meetLists_() {
  const c = meetCfg_();
  const out = { people: [], places: [], sides: [] };
  try {
    const it = DriveApp.getFolderById(c.sys).getFilesByName(MEET_LISTS_NAME);
    if (!it.hasNext()) return out;
    const ss = SpreadsheetApp.openById(it.next().getId());
    const col = (name, n) => { const sh = ss.getSheetByName(name); return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, n).getDisplayValues().filter(r => r[0]) : []; };
    out.people = col('คน', 2).map(r => r[0] + (r[1] ? ' (' + r[1] + ')' : ''));
    out.places = col('สถานที่', 1).map(r => r[0]);
    out.sides = col('ฝ่าย', 1).map(r => r[0]);
  } catch (e) { console.warn('meetLists_: ' + e); }
  return out;
}

/** AI เรียบเรียงบันทึกดิบเป็น minute.json ตามแบบของคลัง (ยังไม่ส่ง) */
function meetDraft_(p) {
  const raw = String(p.text || '').trim().slice(0, 20000);
  if (!raw) throw new Error('บันทึกยังว่างอยู่');
  const L = meetLists_();
  if (!p.by) { try { p.by = meetMe_(meetBook_()).nick || ''; } catch (e) {} }
  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  const str = S('STRING');
  const j = aiJson_(null, null, [
    'นี่คือบันทึกที่จดระหว่างประชุม/ดูงาน (จดเร็วๆ ด้วยมือ ไม่ใช่ถอดเสียง):', '"""', raw, '"""', '',
    'แปลงเป็นรายงานการประชุมตามแบบฟอร์มของบริษัท TIBD (ภาษาไทยทางการ กระชับ ครบทุกประเด็นที่จด)',
    '- meeting_name: ชื่อการประชุมเต็ม · short_title: ชื่อสั้นสำหรับเรียก ไม่เกิน 40 ตัวอักษร',
    '- meeting_date: วว/ดด/ปปปป เป็น ค.ศ. · start_time / end_time: HH.MM (ถ้าไม่มีให้ "")',
    '- location: สถานที่/ช่องทาง ถ้าตรงกับรายการนี้ให้ใช้ตามรายการ: ' + (L.places.slice(0, 40).join(', ') || '-'),
    '- attendees: แยกตามฝ่าย {side, people} people คั่นด้วย ", " ใช้ชื่อแบบในรายการนี้ถ้าเป็นคนเดียวกัน: ' + (L.people.slice(0, 120).join(', ') || '-'),
    '  ฝ่ายที่มีอยู่: ' + (L.sides.slice(0, 40).join(', ') || 'TIBD'),
    '- objectives: วัตถุประสงค์ 1–3 ข้อ',
    '- agenda: วาระ {no, topic, summary, decision} แต่ละวาระมีประเด็น (summary) และมติ (decision) ถ้าไม่มีมติให้ "ยังไม่มีมติ" ใส่ข้อมูล/ตัวเลข/หน่วยที่จดไว้ให้ครบ',
    '- actions: สิ่งที่ต้องทำต่อ {no, task, owner, team, status, due} status = "อยู่ระหว่างดำเนินการ" เสมอ owner = ชื่อคน team = ฝ่าย (ถ้ามี) due = YYYY-MM-DD ถ้ามีกำหนด',
    '- verify_items: จุดที่ไม่แน่ใจหรือข้อมูลขาด {item: อธิบายสั้นๆ, field: "agenda.N.summary" | "agenda.N.decision" | "actions.N.task" | "actions.N.owner" | "location" | "attendees" | "meeting_date" | "", text: ข้อความในช่องนั้นที่ต้องระบายสี (ตรงทุกตัวอักษร) หรือ ""}',
    '- notes: ข้อมูลที่เจ้าของงานต้องเติมเอง',
    'ห้ามแต่งข้อมูล ชื่อ หรือตัวเลขที่ไม่มีในบันทึก ตอบเป็น JSON',
  ].join('\n'), S('OBJECT', { properties: {
    meeting_name: str, short_title: str, meeting_date: str, start_time: str, end_time: str, location: str,
    attendees: S('ARRAY', { items: S('OBJECT', { properties: { side: str, people: str }, required: ['side', 'people'] }) }),
    objectives: S('ARRAY', { items: str }),
    agenda: S('ARRAY', { items: S('OBJECT', { properties: { no: S('NUMBER'), topic: str, summary: str, decision: str }, required: ['no', 'topic', 'summary', 'decision'] }) }),
    actions: S('ARRAY', { items: S('OBJECT', { properties: { no: S('NUMBER'), task: str, owner: str, team: str, status: str, due: str }, required: ['no', 'task', 'owner', 'status'] }) }),
    verify_items: S('ARRAY', { items: S('OBJECT', { properties: { item: str, field: str, text: str }, required: ['item', 'field', 'text'] }) }),
    notes: S('ARRAY', { items: str }),
  }, required: ['meeting_name', 'short_title', 'meeting_date', 'attendees', 'objectives', 'agenda', 'actions', 'verify_items'] }));
  return meetFixMinute_(j, p);
}
/** เติมช่องตามกติกาของคลัง + ตรวจ verify_items ให้หน้ายืนยันใช้ได้ */
function meetFixMinute_(j, p) {
  const d = Object.assign({ template: 'tibd', org: 'บริษัท ทีไอบีดี จำกัด (TIBD Co., Ltd.)' }, j);
  d.source_note = 'จัดทำจากบันทึกที่จดในแอปจดครบ (จดด้วยมือ ไม่ได้ถอดจากไฟล์เสียง)' + (p.by ? ' โดย ' + p.by : '');
  d.recorder = d.recorder || p.by || '';
  d.next_meeting = d.next_meeting || '';
  if (p.date && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d.meeting_date || '')) {
    const m = String(p.date).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) d.meeting_date = m[3] + '/' + m[2] + '/' + m[1];
  }
  if (p.time && !d.start_time) d.start_time = String(p.time).replace(':', '.');
  d.doc_title = 'รายงานการประชุม ' + (d.short_title || d.meeting_name || '');
  d.agenda = (d.agenda || []).map((a, i) => Object.assign({}, a, { no: i + 1, decision: a.decision || 'ยังไม่มีมติ' }));
  d.actions = (d.actions || []).map((a, i) => Object.assign({}, a, { no: i + 1, status: 'อยู่ระหว่างดำเนินการ' }));
  // ข้อความที่ต้องระบายสีต้องเจอในช่องนั้นครั้งเดียว ไม่งั้นปล่อยว่าง (หน้ายืนยันยังแสดงหมายเหตุ)
  d.verify_items = (d.verify_items || []).map(v => {
    const o = { item: String(v.item || ''), at: '', kind: '', field: String(v.field || ''), text: String(v.text || ''), checked: false };
    const m = o.field.match(/^(agenda|actions)\.(\d+)\.(\w+)$/);
    const val = m ? ((d[m[1]] || [])[Number(m[2]) - 1] || {})[m[3]] : o.field && typeof d[o.field] === 'string' ? d[o.field] : '';
    if (!val || !o.text || String(val).split(o.text).length !== 2) o.text = '';
    if (m && !(d[m[1]] || [])[Number(m[2]) - 1]) o.field = '';
    return o;
  }).filter(v => v.item);
  d.notes = d.notes || [];
  return d;
}

/** ส่งร่างเข้าโฟลเดอร์ "1 รอยืนยัน" (ส่งซ้ำ = เขียนทับไฟล์เดิมถ้ายังรอยืนยันอยู่) */
function meetSend_(p) {
  const c = meetCfg_();
  if (!c.pending) throw new Error('ยังไม่ได้เชื่อมคลังรายงานการประชุม');
  const d = p.minute;
  if (!d || !d.meeting_name || !Array.isArray(d.agenda) || !d.agenda.length) throw new Error('ร่างรายงานยังไม่ครบ (ต้องมีชื่อการประชุมและวาระอย่างน้อย 1 วาระ)');
  const folder = DriveApp.getFolderById(c.pending);
  const text = JSON.stringify(d, null, 1);
  if (p.fileId) {
    try {
      const f = DriveApp.getFileById(p.fileId);
      const parents = f.getParents();
      let inPending = false;
      while (parents.hasNext()) if (parents.next().getId() === c.pending) inPending = true;
      if (inPending && !f.isTrashed()) { f.setContent(text); return { fileId: f.getId(), name: f.getName(), updated: true, confirmUrl: c.url ? c.url + '?page=confirm' : '' }; }
      if (!f.isTrashed()) throw new Error('รายงานนี้ถูกยืนยันไปแล้ว ถ้าจะแก้ให้กด "ดึงกลับมาแก้" ในหน้ายืนยันของคลัง');
    } catch (e) { if (/ยืนยันไปแล้ว/.test(e.message)) throw e; }
  }
  const key = 'jodkrob-' + String(p.name || Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmm')).replace(/[^\w-]/g, '').slice(0, 40);
  const f = folder.createFile(Utilities.newBlob(text, 'application/json', key + '.minute.json'));
  return { fileId: f.getId(), name: f.getName(), updated: false, confirmUrl: c.url ? c.url + '?page=confirm' : '' };
}

/** ข้อความสรุปทาง LINE: งานจากประชุมที่ค้าง/เลยกำหนด */
function meetLine_() {
  if (!meetCfg_().on) return '';
  const r = meetTasks_(false);
  const mine = r.tasks.filter(t => t.scope === 'me');
  if (!mine.length) return '';
  const today = todayStr_();
  const late = mine.filter(t => t.due && t.due !== 'none' && t.due < today);
  return '📋 งานจากประชุมค้าง ' + mine.length + ' งาน' + (late.length ? ' (เลยกำหนด ' + late.length + ')\n' + late.slice(0, 5).map(t => '• ' + cut_(t.task, 60) + ' · ' + fmt_(t.due, '')).join('\n') : '') +
    '\nดูในแอป แท็บงาน ปุ่ม 📋';
}


/** หารายงานในคลังที่น่าจะตรงกับบันทึกประชุม (วันเดียวกัน ±3 วัน) ให้ผูกกลับมาที่บันทึก */
function meetFind_(p) {
  const book = meetBook_();
  const d0 = String(p.date || '').slice(0, 10);
  const key = meetKey_(p.title || '');
  const out = [];
  meetRows_(book, 'Meetings').forEach(row => {
    let m; try { m = JSON.parse(row.json); } catch (e) { return; }
    if (!m || !m.id) return;
    const date = meetDate_(m);
    const gap = d0 && date ? Math.abs((Date.parse(date) - Date.parse(d0)) / 864e5) : 99;
    const t = String(m.title || '');
    const hit = key && meetKey_(t).indexOf(key.slice(0, 6)) >= 0;
    if (gap <= 3 || hit) out.push({ id: String(m.id), title: t, date: date, url: String(m.url || row.url || ''), score: (gap <= 3 ? 10 - gap : 0) + (hit ? 5 : 0) });
  });
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}
