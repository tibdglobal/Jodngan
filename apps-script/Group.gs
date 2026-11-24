/**
 * จดครบ — 👥 หารกันในกลุ่ม LINE (แบบขุนทอง ในแบบของเรา)
 *
 * ใช้งานหลัก = แอปเล็กในไลน์ (LIFF, หน้า hk.html):
 *   ในกลุ่มพิมพ์ "หาร" หรือแท็กบอท → การ์ดมีปุ่ม สร้างบิลใหม่ / ยอดของฉัน
 *   โหมดคนจ่ายก่อน: ตั้งยอดทุกคน (เท่ากัน/ตามชั่วโมง/ตามเมนู/ใส่เอง) + คนนอกกลุ่ม + ใครจ่ายแทน → ส่งการ์ดบิลเข้ากลุ่ม → ติดตาม ยืนยันได้เงิน ทวง
 *   โหมดคนที่ต้องจ่าย: เห็นเฉพาะยอดของตัวเอง + QR ใส่ยอด + แนบสลิป + ฉันโอนแล้ว
 * คำสั่งพิมพ์ยังใช้ได้เป็นทางลัด: หาร 1200 ชาบู @เอ @บี +ต้น@เอ · ค้าง · ทวง · จ่ายแล้ว · ลบบิล · พร้อมเพย์ 08… · ชื่อ เอ็ม
 *
 * ความเป็นส่วนตัว
 *   - เปิดทีละกลุ่ม: เจ้าของพิมพ์ "เปิดหาร" · กลุ่มที่ยังไม่เปิด บอทเงียบ
 *   - เก็บเฉพาะ userId + ชื่อของคนที่พิมพ์ในกลุ่ม/เปิดแอป (ไว้ให้เลือกตอนหาร) ไม่เก็บข้อความแชท
 *   - ในกลุ่มไม่โชว์ยอดของใคร (การ์ด/ทวง โชว์แค่ชื่อและสถานะ) ยอดดูในแอปได้เฉพาะของตัวเอง คนจ่ายก่อนเห็นทุกคน
 *   - แอปยืนยันตัวตนด้วย ID token ของ LINE (ตรวจกับ LINE แคช ≤50 นาที) ไม่มี key ใดอยู่ในหน้าเว็บ
 * ตอบด้วย reply (ไม่กินโควตา) · การ์ดบิล/ข้อความโอนแล้ว ส่งจากแอปในชื่อผู้ใช้เอง (liff.sendMessages ไม่กินโควตา)
 * เตือนทุกวัน 10:00 เปิดเองต่อกลุ่ม (push = นับโควตาตามจำนวนคนในกลุ่ม)
 *
 * Script Properties: LIFF_ID, LIFF_CHANNEL (Channel ID ของ LINE Login ใน provider เดียวกับบอท), LINE_GROUPS, HK_FOLDER_ID, GRP_DAILY_SENT
 * แท็บ: Group (id, gid, token, data, updated) · HkUsers (uid, name, nick, pp, qr, qrFile, updated)
 */

const GRP_SHEET = 'Group';
const GRP_HEADERS = ['id', 'gid', 'token', 'data', 'updated'];
const HKU_SHEET = 'HkUsers';
const HKU_HEADERS = ['uid', 'name', 'nick', 'pp', 'qr', 'qrFile', 'updated'];
const HK_WEB = 'https://tibdglobal.github.io/Jodngan/';
const HK_FOLDER = 'จดครบ - หารกลุ่ม';
const GRP_CMD = /^(หาร|หารกัน|ค้าง|ใครค้าง|ใครยังไม่จ่าย|ยังไม่จ่าย|ทวง|#ทวง|ทวงหน่อย|จ่ายแล้ว|โอนแล้ว|ลบบิล|ยกเลิกบิล|พร้อมเพย์|พร้อมเพ|ชื่อ|วิธีใช้|ช่วย|help|เตือนทุกวัน|เปิดหาร|ปิดหาร)/i;

const GRP_HELP = [
  '👥 หารกันในกลุ่ม',
  'พิมพ์ หาร (หรือแท็กบอท) แล้วกดปุ่มในการ์ด',
  '• สร้างบิลใหม่ = เราจ่ายก่อน ตั้งยอดให้ทุกคน',
  '• ยอดของฉัน = ดูว่าต้องจ่ายใคร / รอรับคืนจากใคร',
  '',
  'ทางลัดแบบพิมพ์',
  '• หาร 1200 ชาบู @เอ @บี (+ชื่อ = คนนอกกลุ่ม, +ต้น@เอ = เอจ่ายแทนต้น)',
  '• ค้าง · ทวง · จ่ายแล้ว · ลบบิล',
  '• ชื่อ เอ็ม = ตั้งชื่อที่เพื่อนเห็น',
  '• พร้อมเพย์ 08xxxxxxxx = เบอร์รับเงินของเรา',
].join('\n');

/* ===================== ที่เก็บ ===================== */
function grpSS_() { const id = props.getProperty('SHEET_ID'); return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet(); }
function grpTab_(name, headers) {
  const ss = grpSS_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function grpSheet_() { return grpTab_(GRP_SHEET, GRP_HEADERS); }

function grpRows_() {
  const sh = grpSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GRP_HEADERS.length).getDisplayValues().map(r => {
    if (!r[0]) return null;
    try { return grpUp_(Object.assign(JSON.parse(r[3] || '{}'), { id: r[0], gid: r[1], token: r[2] })); } catch (e) { return null; }
  }).filter(Boolean);
}
/** บิลรุ่นแรก (paid true/false) → สถานะ wait/told/ok */
function grpUp_(b) {
  (b.members || []).forEach(m => {
    if (!m.st) m.st = m.paid ? 'told' : 'wait';
    if (!m.k) m.k = m.uid || 'o:' + m.name;
  });
  if (b.payer && b.payer.shareS == null) b.payer.shareS = 0;
  return b;
}
function grpBills_(gid, all) { return grpRows_().filter(b => b.gid === gid && (all || b.status === 'open')); }
function grpBill_(id) { return grpRows_().find(b => b.id === id); }
function grpSave_(b) {
  const sh = grpSheet_();
  const doc = Object.assign({}, b); delete doc.id; delete doc.gid; delete doc.token;
  (doc.members || []).forEach(m => { delete m.paid; });
  const json = JSON.stringify(doc);
  if (json.length > 45000) throw new Error('บิลยาวเกินไป');
  let row = 0;
  const last = sh.getLastRow();
  if (last >= 2) { const i = sh.getRange(2, 1, last - 1, 1).getDisplayValues().map(r => r[0]).indexOf(b.id); if (i > -1) row = i + 2; }
  sh.getRange(row || last + 1, 1, 1, GRP_HEADERS.length).setNumberFormat('@').setValues([[b.id, b.gid, b.token, json, stamp_()]]);
  return b;
}

function grpCfg_() { try { return JSON.parse(props.getProperty('LINE_GROUPS') || '{}'); } catch (e) { return {}; } }
function grpCfgSave_(c) {
  Object.keys(c).forEach(g => { const s = c[g].seen || {}; const k = Object.keys(s); if (k.length > 40) k.slice(0, k.length - 40).forEach(x => delete s[x]); });
  const json = JSON.stringify(c);
  if (json.length > 9000) throw new Error('ตั้งค่ากลุ่มเต็มแล้ว');
  props.setProperty('LINE_GROUPS', json);
}

/* ---------- ผู้ใช้ (ชื่อเล่น, พร้อมเพย์, QR) ---------- */
function hkuSheet_() { return grpTab_(HKU_SHEET, HKU_HEADERS); }
function hkUsers_() {
  const sh = hkuSheet_(), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, HKU_HEADERS.length).getDisplayValues().forEach((r, i) => {
    if (r[0]) out[r[0]] = { uid: r[0], name: r[1], nick: r[2], pp: r[3], qr: r[4], qrFile: r[5], _row: i + 2 };
  });
  return out;
}
function hkUser_(uid) { return hkUsers_()[uid] || { uid: uid, name: '', nick: '', pp: '', qr: '', qrFile: '' }; }
function hkUserSave_(uid, patch) {
  const sh = hkuSheet_(), all = hkUsers_(), cur = Object.assign({ uid: uid, name: '', nick: '', pp: '', qr: '', qrFile: '' }, all[uid] || {}, patch);
  const row = (all[uid] && all[uid]._row) || sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, HKU_HEADERS.length).setNumberFormat('@').setValues([[uid, cur.name, cur.nick, cur.pp, cur.qr, cur.qrFile, stamp_()]]);
  CacheService.getScriptCache().remove('gn:' + uid);
  return cur;
}

/* ===================== ช่วยเหลือ ===================== */
const grpS_ = v => Math.round(Number(String(v == null ? '' : v).replace(/[,\s฿]/g, '')) * 100) || 0;
const grpB_ = s => fmtBaht_(s / 100);
const grpTok_ = () => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
const grpResp_ = m => (m.by && m.by.uid) || m.uid || '';
const grpMask_ = id => id ? String(id).replace(/^(\d{3})\d+(\d{4})$/, '$1-xxx-$2') : '';
const grpSum_ = list => list.reduce((s, m) => s + m.amtS, 0);

/** ชื่อที่เพื่อนเห็น: ชื่อเล่นที่ตั้งไว้ > ชื่อ LINE (แคช 6 ชม.) */
function grpName_(src, uid) {
  if (!uid) return '';
  const cache = CacheService.getScriptCache(), key = 'gn:' + uid;
  const hit = cache.get(key);
  if (hit) return hit;
  let name = '';
  try { const u = hkUsers_()[uid]; if (u && u.nick) name = u.nick; } catch (e) {}
  if (!name && src) {
    const p = grpProfile_(src.groupId || src.roomId, src.groupId ? 'group' : 'room', uid);
    if (p) name = p.displayName;
  }
  if (name) cache.put(key, name, 21600);
  return name || 'เพื่อน';
}
/** โปรไฟล์ในกลุ่ม (null = ไม่ได้อยู่ในกลุ่ม) */
function grpProfile_(gid, kind, uid) {
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/' + (kind || 'group') + '/' + gid + '/member/' + uid, { headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return { displayName: String(JSON.parse(res.getContentText()).displayName || '').slice(0, 40) };
  } catch (e) { return null; }
}
function grpSummary_(gid) {
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/group/' + gid + '/summary', { headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return String(JSON.parse(res.getContentText()).groupName || '').slice(0, 50);
  } catch (e) {}
  return '';
}

function grpPP_(uid) {
  const u = hkUsers_()[uid];
  if (u && u.pp) return u.pp;
  if (uid && uid === props.getProperty('LINE_USER_ID')) { try { return moneyCfg_().pp || ''; } catch (e) {} }
  return '';
}
function hkPayInfo_(uid) {
  const u = hkUsers_()[uid] || {};
  let pp = u.pp || '';
  if (!pp && !u.qr && !u.qrFile && uid === props.getProperty('LINE_USER_ID')) { try { pp = moneyCfg_().pp || ''; } catch (e) {} }
  return { qr: u.qr || '', pp: pp, qrImg: !!u.qrFile };
}

function hkUrl_(gtok, bid, extra) {
  const id = props.getProperty('LIFF_ID');
  const q = [gtok ? 'g=' + gtok : '', bid ? 'b=' + bid : '', extra || ''].filter(Boolean).join('&');
  return (id ? 'https://liff.line.me/' + id : HK_WEB + 'hk.html') + (q ? '?' + q : '');
}
function grpEnsureTok_(gid) {
  const c = grpCfg_();
  if (!c[gid]) return '';
  if (!c[gid].tok) { c[gid].tok = grpTok_(); grpCfgSave_(c); }
  return c[gid].tok;
}

function grpReplyMsgs_(token, msgs) { line_('reply', { replyToken: token, messages: [].concat(msgs).slice(0, 5) }); }
function grpText_(t, items) { const m = { type: 'text', text: String(t).slice(0, 4900) }; if (items && items.length) m.quickReply = { items: items.slice(0, 13) }; return m; }
/** ข้อความที่แท็กคนได้ (textV2) · parts = [string | {uid, name}] */
function grpMention_(parts) {
  let text = '', n = 0;
  const sub = {};
  parts.forEach(p => {
    if (typeof p === 'string') { text += p.replace(/[{}]/g, ''); return; }
    if (p.uid && n < 20) { const k = 'm' + (n++); sub[k] = { type: 'mention', mentionee: { type: 'user', userId: p.uid } }; text += '{' + k + '}'; }
    else text += '@' + String(p.name || 'เพื่อน').replace(/[{}]/g, '');
  });
  return n ? { type: 'textV2', text: text.slice(0, 4900), substitution: sub } : { type: 'text', text: text.slice(0, 4900) };
}

/* ===================== การ์ด ===================== */
const HK_INK = '#1c1f1c', HK_MUTE = '#5f645e';
function hkMascot_(size) { return { type: 'image', url: HK_WEB + 'jod.png', size: size || '40px', aspectRatio: '1:1', flex: 0 }; }

/** การ์ดเรียกใช้ (ตอบเมื่อพิมพ์ หาร / แท็กบอท) */
function hkSummonFlex_(gid) {
  const tok = grpEnsureTok_(gid);
  return { type: 'flex', altText: 'หารกันในกลุ่มนี้ แตะเพื่อเปิด',
    contents: { type: 'bubble', size: 'kilo',
      body: { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', contents: [hkMascot_('44px'),
        { type: 'box', layout: 'vertical', contents: [
          { type: 'text', text: 'หารกันในกลุ่มนี้', weight: 'bold', size: 'md', color: HK_INK },
          { type: 'text', text: 'แตะเพื่อเปิด ไม่ต้องพิมพ์คำสั่ง', size: 'xs', color: HK_MUTE, wrap: true }] }] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'button', style: 'primary', color: HK_INK, height: 'sm', action: { type: 'uri', label: 'สร้างบิลใหม่ (ฉันจ่ายก่อน)', uri: hkUrl_(tok, '', 'v=new') } },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'ยอดของฉัน', uri: hkUrl_(tok) } }] } } };
}

/** การ์ดบิล: ชื่อ + สถานะ ไม่โชว์ยอดของใคร */
function hkCardFlex_(b, label) {
  const tok = grpEnsureTok_(b.gid) || '';
  const resp = {};
  b.members.forEach(m => {
    const k = grpResp_(m) || m.k;
    if (k === b.payer.uid) return;   // คนจ่ายก่อนจ่ายแทนเอง
    const r = resp[k] = resp[k] || { name: m.by ? m.by.name : m.name, extra: [], st: [] };
    if (m.by) r.extra.push(m.name);
    r.st.push(m.st);
  });
  const stTxt = a => a.every(s => s === 'ok') ? ['ได้รับแล้ว', '#2f6b3e'] : a.every(s => s !== 'wait') ? ['โอนแล้ว', '#2f6b3e'] : ['ยังไม่จ่าย', '#8a4b1f'];
  const rows = Object.keys(resp).slice(0, 25).map(k => {
    const r = resp[k], s = stTxt(r.st);
    return { type: 'box', layout: 'horizontal', contents: [
      { type: 'text', text: r.name + (r.extra.length ? ' + ' + r.extra.join(', ') : ''), size: 'sm', color: HK_INK, flex: 5, wrap: true },
      { type: 'text', text: s[0], size: 'xs', color: s[1], align: 'end', flex: 3 }] };
  });
  return { type: 'flex', altText: (label || 'บิล') + ': ' + cut_(b.title, 40) + ' · ' + b.payer.name + ' จ่ายก่อน',
    contents: { type: 'bubble', size: 'kilo',
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'box', layout: 'horizontal', alignItems: 'center', contents: [
          { type: 'text', text: label || 'บิล', size: 'xs', color: '#3a3f39', flex: 1 }, hkMascot_('30px')] },
        { type: 'text', text: b.title || 'หารกัน', weight: 'bold', size: 'lg', wrap: true, color: HK_INK },
        { type: 'text', text: b.payer.name + ' จ่ายก่อน · ยอดของแต่ละคนดูได้เฉพาะตัวเอง', size: 'xs', color: HK_MUTE, wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md', contents: rows.length ? rows : [{ type: 'text', text: 'ไม่มีใครต้องจ่าย', size: 'sm', color: HK_MUTE }] }] },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: HK_INK, height: 'sm', action: { type: 'uri', label: 'ดูยอดของฉัน และจ่าย', uri: hkUrl_(tok, b.id) } }] } } };
}

/* ===================== webhook ในกลุ่ม ===================== */
function grpHandle_(ev) {
  const src = ev.source || {}, gid = src.groupId || src.roomId, uid = src.userId || '';
  if (!gid) return;
  const owner = props.getProperty('LINE_USER_ID');
  const cfg = grpCfg_(), g = cfg[gid];

  if (ev.type === 'join') { reply_(ev.replyToken, '👋 สวัสดีครับ ช่วยหารบิลในกลุ่มนี้ได้\nเจ้าของบอทพิมพ์ เปิดหาร เพื่อเริ่มใช้'); return; }
  if (ev.type === 'leave') { if (g) { delete cfg[gid]; grpCfgSave_(cfg); } return; }

  if (ev.type === 'postback') {   // ปุ่มจากการ์ดรุ่นแรก
    if (!g || !g.on || !/^gp\|/.test(String(ev.postback && ev.postback.data))) return;
    const name = grpName_(src, uid);
    return grpLocked_(ev.replyToken, () => grpPaidBtn_(ev, gid, uid, name, String(ev.postback.data).split('|')[1]));
  }
  if (ev.type !== 'message' || !ev.message) return;
  const text = ev.message.type === 'text' ? String(ev.message.text || '').trim() : '';
  const tagBot = ((ev.message.mention || {}).mentionees || []).some(m => m.isSelf);

  if (/^เปิดหาร$/.test(text)) {
    if (uid !== owner) return reply_(ev.replyToken, 'เฉพาะเจ้าของบอทเปิดใช้ในกลุ่มได้ครับ');
    const nm = src.groupId ? grpSummary_(gid) : '';
    cfg[gid] = Object.assign({ seen: {}, daily: false, tok: grpTok_() }, g || {}, { on: true, type: src.type, name: nm || (g && g.name) || '' });
    grpCfgSave_(cfg);
    return grpReplyMsgs_(ev.replyToken, [grpText_('✅ เปิดหารกันในกลุ่มนี้แล้ว\nทุกคนแตะ "ยอดของฉัน" สักครั้ง ชื่อจะขึ้นให้เลือกตอนหาร\nบอทไม่เก็บข้อความแชท'), hkSummonFlex_(gid)]);
  }
  if (!g || !g.on) return;   // กลุ่มที่ยังไม่เปิด เงียบ

  // จำว่าใครอยู่ในกลุ่ม (userId + ชื่อ ไม่เก็บข้อความ) ไว้ให้เลือกตอนหาร
  if (uid && !(g.seen || {})[uid]) {
    const nm = grpName_(src, uid);
    try { grpLocked_(null, () => { const c2 = grpCfg_(); if (c2[gid]) { c2[gid].seen = c2[gid].seen || {}; c2[gid].seen[uid] = nm; grpCfgSave_(c2); } }); } catch (e) {}
  }
  if (!text || (!GRP_CMD.test(text) && !tagBot)) return;   // คุยกันทั่วไป = ไม่ยุ่ง

  if (/^ปิดหาร$/.test(text)) {
    if (uid !== owner) return reply_(ev.replyToken, 'เฉพาะเจ้าของบอทปิดได้ครับ');
    g.on = false; grpCfgSave_(cfg);
    return reply_(ev.replyToken, 'ปิดหารกันในกลุ่มนี้แล้ว บิลเดิมยังเก็บไว้ เปิดใหม่พิมพ์ เปิดหาร');
  }
  if (/^(วิธีใช้|ช่วย|help)$/i.test(text)) return grpReplyMsgs_(ev.replyToken, [grpText_(GRP_HELP), hkSummonFlex_(gid)]);
  if (/^(หาร|หารกัน)$/.test(text) || (tagBot && !GRP_CMD.test(text))) return grpReplyMsgs_(ev.replyToken, hkSummonFlex_(gid));

  const name = grpName_(src, uid);   // เรียก LINE นอกล็อก
  const ment = ((ev.message.mention || {}).mentionees || []).filter(m => m.type !== 'all' && !m.isSelf);
  const names = {};
  ment.forEach(m => { names[m.userId || ''] = m.userId ? grpName_(src, m.userId) : ''; });
  grpLocked_(ev.replyToken, () => {
    const c2 = grpCfg_(), g2 = c2[gid];
    if (!g2) return;
    g2.seen = g2.seen || {};
    if (uid) { delete g2.seen[uid]; g2.seen[uid] = name; }
    ment.forEach(m => { if (m.userId && names[m.userId] && names[m.userId] !== 'เพื่อน') { delete g2.seen[m.userId]; g2.seen[m.userId] = names[m.userId]; } });
    let out;
    if (/^หาร\s/.test(text)) out = grpSplit_(ev, gid, g2, uid, name, names);
    else if (/^(ค้าง|ใครค้าง|ใครยังไม่จ่าย|ยังไม่จ่าย)$/.test(text)) out = grpOpenText_(gid);
    else if (/^(ทวง|#ทวง|ทวงหน่อย)/.test(text)) out = grpNag_(gid, text.replace(/^#?ทวง(หน่อย)?\s*/, ''));
    else if (/^(จ่ายแล้ว|โอนแล้ว)/.test(text)) out = grpPaidText_(ev, gid, uid, name, ment);
    else if (/^(ลบบิล|ยกเลิกบิล)/.test(text)) out = grpVoid_(gid, uid, uid === owner);
    else if (/^พร้อมเพ/.test(text)) out = grpSetPP_(uid, name, text);
    else if (/^ชื่อ/.test(text)) out = grpSetNick_(ev, gid, g2, uid, name, ment, uid === owner);
    else if (/^เตือนทุกวัน/.test(text)) {
      if (uid !== owner) out = 'เฉพาะเจ้าของบอทตั้งได้ครับ';
      else { g2.daily = !/ปิด/.test(text); out = g2.daily ? '⏰ เปิดเตือนคนที่ยังไม่จ่ายทุกวัน 10:00 แล้ว (ส่งเฉพาะวันที่มีคนค้าง)\nเลิก: เตือนทุกวัน ปิด' : 'ปิดเตือนทุกวันแล้ว'; }
    }
    grpCfgSave_(c2);
    if (out) grpReplyMsgs_(ev.replyToken, typeof out === 'string' ? grpText_(out) : out);
  });
}

function grpLocked_(token, fn) {
  const lk = LockService.getScriptLock();
  if (!lk.tryLock(25000)) { if (token) reply_(token, 'ระบบกำลังยุ่ง ลองใหม่อีกครั้งครับ'); else throw new Error('ระบบกำลังยุ่ง ลองใหม่อีกครั้ง'); return; }
  try { return fn(); }
  catch (err) { console.error('group: ' + (err.stack || err)); if (token) reply_(token, 'ทำรายการไม่สำเร็จ: ' + (err.message || err)); else throw err; }
  finally { lk.releaseLock(); }
}

/* ===================== หารแบบพิมพ์ (ทางลัด) ===================== */
/** แยกข้อความ "หาร ..." → {title, totalS, people:[{uid,name,amtS,fixed,out,by}], excludeMe, everyone} */
function grpParse_(msg, names, seenNames) {
  const text = String(msg.text || '');
  const ms = ((msg.mention || {}).mentionees || []).filter(m => m.type !== 'all' && !m.isSelf).sort((a, b) => a.index - b.index);
  const everyoneTag = ((msg.mention || {}).mentionees || []).some(m => m.type === 'all');
  let plain = '', last = 0;
  const people = [];
  ms.forEach((m, i) => {
    let seg = text.slice(last, m.index);
    const end = m.index + m.length, next = i + 1 < ms.length ? ms[i + 1].index : text.length;
    const num = text.slice(end, next).match(/^\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:บาท|บ\.?))?(?=\s|$)/);
    const tagName = text.substr(m.index, m.length).replace(/^@/, '').trim();
    const who = { uid: m.userId || '', name: (m.userId && names[m.userId]) || tagName || 'เพื่อน' };
    const proxy = seg.match(/\+([^\s@+\d][^\s@+]*)\s*$/);   // +ต้น@เอ = เอจ่ายแทนต้น
    if (proxy) {
      seg = seg.slice(0, proxy.index);
      people.push({ uid: '', name: proxy[1].slice(0, 30), out: true, by: who, amtS: num ? grpS_(num[1]) : 0, fixed: !!num });
    } else people.push(Object.assign(who, { amtS: num ? grpS_(num[1]) : 0, fixed: !!num }));
    plain += seg + ' ';
    last = end + (num ? num[0].length : 0);
  });
  plain = (plain + text.slice(last)).replace(/^\s*หาร\s*/, ' ') + ' ';
  // +ชื่อ (คนนอกกลุ่ม) ที่ไม่มีแท็กตาม
  plain = plain.replace(/\s\+([^\s@+\d][^\s@+]*)(?:\s+([\d,]+(?:\.\d{1,2})?)(?:\s*(?:บาท|บ\.?))?)?(?=\s)/g, (all, nm, n) => {
    const known = seenNames && seenNames[nm];
    people.push(known ? { uid: known, name: nm, amtS: n ? grpS_(n) : 0, fixed: !!n } : { uid: '', name: nm.slice(0, 30), out: true, by: null, amtS: n ? grpS_(n) : 0, fixed: !!n });
    return ' ';
  });
  const excludeMe = /ไม่รวม(ฉัน|ผม|เรา|ตัวเอง|หนู)/.test(plain);
  const everyone = everyoneTag || /\sทุกคน\s/.test(plain);
  plain = plain.replace(/ไม่รวม(ฉัน|ผม|เรา|ตัวเอง|หนู)/g, ' ').replace(/\sทุกคน\s/g, ' ');
  let totalS = 0;
  const t = plain.match(/\s([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|บ\.?)?(?=\s)/);
  if (t) { totalS = grpS_(t[1]); plain = plain.slice(0, t.index) + ' ' + plain.slice(t.index + t[0].length); }
  const title = plain.replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  return { title: title, totalS: totalS, people: people, excludeMe: excludeMe, everyone: everyone };
}

function grpSplit_(ev, gid, g, uid, name, names) {
  if (!uid) return 'อ่านชื่อผู้ส่งไม่ได้ ลองใหม่อีกครั้งครับ';
  const seenNames = {};
  Object.keys(g.seen || {}).forEach(u => { seenNames[g.seen[u]] = u; });
  const p = grpParse_(ev.message, names, seenNames);
  if (p.everyone) Object.keys(g.seen || {}).forEach(u => { if (u !== uid && !p.people.some(x => x.uid === u)) p.people.push({ uid: u, name: g.seen[u], amtS: 0, fixed: false }); });
  const seenK = {};
  const people = p.people.filter(x => { const k = x.uid || ('o:' + x.name); if (x.uid === uid || seenK[k]) return false; seenK[k] = 1; return true; });
  if (!people.length) return grpReplyHelpSplit_(gid);
  if (people.length > 30) return 'หารได้สูงสุด 30 คนต่อบิลครับ';
  const payer = { amtS: 0, fixed: false };
  const all = p.excludeMe ? people : [payer].concat(people);
  const fixedS = all.filter(x => x.fixed).reduce((s, x) => s + x.amtS, 0);
  let totalS = p.totalS;
  const free = all.filter(x => !x.fixed);
  if (!totalS) {
    if (!fixedS) return grpReplyHelpSplit_(gid);
    totalS = fixedS; free.forEach(x => { x.amtS = 0; });
  } else {
    if (fixedS > totalS) return 'ยอดที่ระบุรายคน (' + grpB_(fixedS) + ') เกินยอดรวม ' + grpB_(totalS);
    const R = totalS - fixedS;
    if (R > 0 && !free.length) return 'ยอดที่ระบุรายคนรวม ' + grpB_(fixedS) + ' ไม่ตรงยอดรวม ' + grpB_(totalS);
    hkSpread_(R, free, free.indexOf(payer) > -1 ? payer : null, () => 1);
  }
  if (totalS > 100000000) return 'ยอดเยอะเกินไปครับ';
  const owes = people.filter(x => x.amtS > 0);
  if (!owes.length) return 'ไม่มีใครต้องจ่ายในบิลนี้ครับ';
  const b = {
    id: Utilities.getUuid().replace(/-/g, ''), gid: gid, token: grpTok_(), v: 2, via: 'text',
    title: p.title || 'หารกัน', date: todayStr_(), totalS: totalS, mode: 'equal', status: 'open', created: stamp_(),
    payer: { uid: uid, name: name, shareS: p.excludeMe ? 0 : payer.amtS }, payerIn: !p.excludeMe,
    members: owes.map(x => ({ k: x.uid || 'o:' + x.name, uid: x.uid, name: x.name, out: !!x.out, by: x.by && x.by.uid ? { uid: x.by.uid, name: x.by.name } : null, amtS: x.amtS, st: x.by && x.by.uid === uid ? 'ok' : 'wait', at: '' })),
  };
  try { b.owe = grpOweCreate_(b); } catch (e) { console.warn('grpOwe: ' + e); }
  grpSave_(b);
  return hkCardFlex_(b, 'บิลใหม่');
}
function grpReplyHelpSplit_(gid) {
  return [grpText_('แท็กคนที่หารด้วยครับ เช่น\nหาร 1200 ชาบู @เอ @บี\nหรือกดปุ่มด้านล่าง เลือกคนจากรายชื่อได้เลย'), hkSummonFlex_(gid)];
}

/** แบ่ง R ตามน้ำหนัก: คนอื่นปัดเป็นบาทลง คนจ่ายก่อน (ถ้ารวม) รับเศษ · ไม่รวม = เฉลี่ยทีละสตางค์ */
function hkSpread_(R, list, payer, w) {
  if (!list.length) return;
  const W = list.reduce((s, x) => s + w(x), 0) || 1;
  let sum = 0;
  if (payer && list.length > 1) {
    list.forEach(x => { if (x !== payer) { x.amtS = Math.floor(R * w(x) / W / 100) * 100; sum += x.amtS; } });
    payer.amtS = R - sum;
  } else {
    list.forEach(x => { x.amtS = Math.floor(R * w(x) / W); sum += x.amtS; });
    let extra = R - sum;
    for (let i = 0; extra > 0; i = (i + 1) % list.length) { list[i].amtS++; extra--; }
  }
}

/* ---------- จ่ายแล้ว / ทวง / ค้าง / ลบ ---------- */
function grpMine_(b, uid, name) {   // แถวที่คนนี้ต้องจ่าย (ของตัวเอง + ที่จ่ายแทน)
  return b.members.filter(m => (uid && grpResp_(m) === uid) || (!m.uid && !m.by && name && m.name === name));
}
function grpSetSt_(b, list, st) {
  list.forEach(m => {
    const was = m.st;
    m.st = st; m.at = stamp_();
    if (was === 'wait' && st !== 'wait') { try { grpOwePay_(b, m); } catch (e) { console.warn('grpOwePay: ' + e); } }
  });
  b.status = b.members.every(x => x.st === 'ok') ? 'done' : 'open';
  grpSave_(b);
}
function grpLeftNames_(b) {
  const left = {};
  b.members.filter(x => x.st === 'wait').forEach(m => { left[m.by ? m.by.name : m.name] = 1; });
  const k = Object.keys(left);
  return k.length ? 'ยังไม่จ่าย: ' + k.join(', ') : '🎉 ' + b.title + ' จ่ายครบทุกคนแล้ว';
}

function grpPaidBtn_(ev, gid, uid, name, id) {
  const b = grpBill_(id);
  if (!b || b.gid !== gid || b.status === 'void') return reply_(ev.replyToken, 'บิลนี้ถูกลบไปแล้วครับ');
  if (b.payer.uid === uid) return reply_(ev.replyToken, name + ' เป็นคนจ่ายบิลนี้ ยืนยันว่าได้เงินในแอปได้เลย');
  const mine = grpMine_(b, uid, name).filter(m => m.st === 'wait');
  if (!mine.length) return reply_(ev.replyToken, name + ' ไม่มียอดค้างในบิล ' + b.title + ' แล้วครับ');
  mine.forEach(m => { if (!m.uid && !m.by) { m.uid = uid; m.k = uid; } });
  grpSetSt_(b, mine, 'told');
  reply_(ev.replyToken, '✅ ' + name + ' โอนแล้ว (' + b.title + ' → ' + b.payer.name + ')\n' + grpLeftNames_(b));
}

/** "จ่ายแล้ว" = ของตัวเอง · "จ่ายแล้ว @เอ" = คนจ่ายก่อนยืนยันว่าได้เงินแล้ว */
function grpPaidText_(ev, gid, uid, name, ment) {
  const open = grpBills_(gid);
  if (ment.length) {
    const mine = open.filter(b => b.payer.uid === uid);
    if (!mine.length) return 'ยืนยันแทนเพื่อนได้เฉพาะบิลที่เราเป็นคนจ่ายก่อนครับ';
    const out = [];
    ment.forEach(t => {
      const tagName = String(ev.message.text).substr(t.index, t.length).replace(/^@/, '').trim();
      mine.forEach(b => {
        const list = grpMine_(b, t.userId || '', tagName).filter(m => m.st !== 'ok');
        if (list.length) { grpSetSt_(b, list, 'ok'); out.push('✅ ได้เงินจาก ' + (list[0].by ? list[0].by.name : list[0].name) + ' แล้ว (' + b.title + ')'); }
      });
    });
    return out.length ? out.join('\n') : 'ไม่พบยอดค้างของคนที่แท็กในบิลของเราครับ';
  }
  const list = open.filter(b => grpMine_(b, uid, name).some(m => m.st === 'wait'));
  if (!list.length) return name + ' ไม่มียอดค้างในกลุ่มนี้แล้วครับ 🎉';
  list.forEach(b => { const ms = grpMine_(b, uid, name).filter(m => m.st === 'wait'); ms.forEach(m => { if (!m.uid && !m.by) { m.uid = uid; m.k = uid; } }); grpSetSt_(b, ms, 'told'); });
  return '✅ ' + name + ' แจ้งโอนแล้ว ' + list.length + ' บิล (' + list.map(b => b.title).join(', ') + ')\nคนจ่ายก่อนกดยืนยันได้เงินในแอป';
}

function grpOpenText_(gid) {
  const open = grpBills_(gid).filter(b => b.members.some(m => m.st === 'wait'));
  if (!open.length) return '🎉 ไม่มีใครค้างในกลุ่มนี้แล้ว';
  const out = ['🧾 บิลที่ยังมีคนไม่จ่าย'];
  open.slice(-10).forEach(b => out.push('• ' + b.title + ' (' + b.payer.name + ' จ่ายก่อน) ' + grpLeftNames_(b).replace(/^ยังไม่จ่าย: /, 'รอ: ')));
  out.push('', 'ยอดของแต่ละคน แตะ "ยอดของฉัน" ดูได้เฉพาะตัวเอง');
  return [grpText_(out.join('\n')), hkSummonFlex_(gid)];
}

function grpNag_(gid, q) {
  let open = grpBills_(gid).filter(b => b.members.some(m => m.st === 'wait'));
  if (q) { const f = open.filter(b => String(b.title).indexOf(q.trim()) > -1); if (f.length) open = f; }
  if (!open.length) return '🎉 ไม่มีใครค้างในกลุ่มนี้แล้ว';
  const per = {};
  open.forEach(b => b.members.filter(m => m.st === 'wait').forEach(m => {
    const who = m.by ? m.by : { uid: m.uid, name: m.name };
    const k = who.uid || 'n:' + who.name;
    const p = per[k] = per[k] || { uid: who.uid, name: who.name, bills: {} };
    p.bills[b.title + ' → ' + b.payer.name] = 1;
  }));
  const parts = ['🔔 ทวงหน่อยนะ\n'];
  Object.values(per).forEach(p => { parts.push({ uid: p.uid, name: p.name }, ' ' + Object.keys(p.bills).join(', ') + '\n'); });
  parts.push('\nแตะ ยอดของฉัน ดูยอดและสแกนจ่าย');
  return [grpMention_(parts), hkSummonFlex_(gid)];
}

function grpVoid_(gid, uid, isOwner) {
  const open = grpBills_(gid).filter(b => b.payer.uid === uid || isOwner);
  if (!open.length) return 'ไม่มีบิลที่เราลบได้ (ลบได้เฉพาะบิลที่เราเป็นคนจ่ายก่อน)';
  const b = open.sort((x, y) => String(y.created).localeCompare(String(x.created)))[0];
  hkVoidBill_(b);
  return '🗑 ลบบิล ' + b.title + ' แล้ว' + (b.members.some(m => m.st !== 'wait') ? '\n⚠️ มีคนแจ้งโอนไปแล้ว คืนเงินกันเองนะครับ' : '');
}
function hkVoidBill_(b) {
  b.status = 'void';
  try { grpOweVoid_(b); } catch (e) { console.warn('grpOweVoid: ' + e); }
  grpSave_(b);
}

function grpSetPP_(uid, name, text) {
  if (!uid) return 'อ่านชื่อผู้ส่งไม่ได้ครับ';
  if (/ลบ|ยกเลิก/.test(text)) { hkUserSave_(uid, { pp: '' }); return 'ลบพร้อมเพย์ของ ' + name + ' แล้ว'; }
  const d = text.replace(/^พร้อมเพ(ย์)?/, '').replace(/\D/g, '');
  if (!d) { const cur = grpPP_(uid); return cur ? 'พร้อมเพย์ของ ' + name + ': ' + grpMask_(cur) : 'พิมพ์ พร้อมเพย์ ตามด้วยเบอร์ 10 หลัก หรือเลข 13 หลัก\nหรืออัปรูป QR รับเงินในแอป (ยอดของฉัน → รับเงิน)'; }
  if (!/^(0\d{9}|\d{13}|\d{15})$/.test(d)) return 'ต้องเป็นเบอร์ 10 หลัก หรือเลข 13 หลักครับ';
  hkUserSave_(uid, { pp: d, qr: '', qrFile: '' });
  return '💳 บันทึกพร้อมเพย์ของ ' + name + ' แล้ว (' + grpMask_(d) + ')';
}

/** ชื่อ เอ็ม = ตั้งชื่อตัวเอง · ชื่อ @ทีม เอ็ม = เจ้าของตั้งให้คนอื่น · ยอดของ "+เอ็ม" ที่ค้างในกลุ่มนี้ย้ายมาเป็นของคนนั้น */
function grpSetNick_(ev, gid, g, uid, name, ment, isOwner) {
  let target = uid, rest = String(ev.message.text).replace(/^ชื่อ\s*/, '');
  if (ment.length) {
    if (!isOwner && ment[0].userId !== uid) return 'ตั้งชื่อให้คนอื่นได้เฉพาะเจ้าของบอทครับ';
    target = ment[0].userId || '';
    const tag = String(ev.message.text).substr(ment[0].index, ment[0].length);
    rest = rest.replace(tag, '');
  }
  if (!target) return 'อ่านชื่อคนที่แท็กไม่ได้ครับ';
  const nick = rest.trim().slice(0, 30);
  if (!nick) return 'ชื่อที่เพื่อนเห็นตอนนี้: ' + name + '\nเปลี่ยน: ชื่อ ตามด้วยชื่อเล่น';
  if (/^(ลบ|ล้าง)$/.test(nick)) { hkUserSave_(target, { nick: '' }); return 'ใช้ชื่อ LINE ตามเดิมแล้วครับ'; }
  hkUserSave_(target, { nick: nick });
  g.seen = g.seen || {}; g.seen[target] = nick;
  return '👌 ต่อไปจะเรียก "' + nick + '" ทุกกลุ่ม' + hkClaim_(gid, target, nick);
}
/** ยอดของคนนอกกลุ่มชื่อเดียวกัน (ที่ยังไม่มีใครจ่ายแทน) ย้ายมาเป็นของบัญชีนี้ */
function hkClaim_(gid, uid, nick) {
  let moved = 0;
  grpBills_(gid).forEach(b => {
    let ch = false;
    b.members.forEach(m => { if (!m.uid && m.out && !m.by && m.name === nick && uid !== b.payer.uid && !b.members.some(x => x.k === uid)) { m.uid = uid; m.k = uid; m.out = false; ch = true; moved++; } });
    if (ch) grpSave_(b);
  });
  return moved ? '\nย้ายยอดของ +' + nick + ' มาเป็นของบัญชีนี้แล้ว ' + moved + ' บิล' : '';
}

/* ===================== ลงหน้าค้างกัน/รายจ่ายของเจ้าของ ===================== */
function grpOweCreate_(b) {
  const owner = props.getProperty('LINE_USER_ID');
  if (!owner) return null;
  const date = b.date, docs = oweAll_();
  const tag = m => m.by ? ' (ของ' + m.name + ')' : '';
  if (b.payer.uid === owner) {
    const sid = oweId_(), debts = {}, list = [];
    let selfS = b.payer.shareS || 0;
    const selfNote = [];
    b.members.forEach(m => {
      if (grpResp_(m) === owner) { selfS += m.amtS; selfNote.push(m.name); return; }   // เราจ่ายแทนคนนอกกลุ่ม = ค่าใช้จ่ายของเรา
      const d = { id: oweId_(), kind: 'debt', person: owePerson_(m.by ? m.by.name : m.name, docs), dir: 'they', amount: m.amtS / 100, date: date, title: b.title + tag(m), splitId: sid, gbill: b.id, payments: [], status: 'open', created: date };
      debts[m.k] = d.id; list.push(d);
    });
    const people = ['ฉัน'].concat([...new Set(list.map(d => d.person))]);
    const shares = { 'ฉัน': selfS / 100 };
    list.forEach(d => { shares[d.person] = Math.round(((shares[d.person] || 0) + d.amount) * 100) / 100; });
    const sp = { id: sid, kind: 'split', title: b.title, date: date, people: people, total: b.totalS / 100, via: 'line-group', gbill: b.id,
      bills: [{ id: oweId_(), title: '', payer: 'ฉัน', method: 'custom', total: String(b.totalS / 100), who: people.slice(), custom: shares, items: [], svc: false, vat: false, disc: '', shares: shares, sum: b.totalS / 100 }],
      transfers: list.map(d => ({ from: d.person, to: 'ฉัน', amount: d.amount, done: false })) };
    let mid = '';
    if (selfS) {
      const mm = moneySave_({ type: 'out', date: date, amount: selfS / 100, note: b.title + ' (กลุ่ม) · ส่วนของฉัน' + (selfNote.length ? ' + จ่ายแทน' + selfNote.join(', ') : ''), cat: moneyGuessCat_('out', b.title, moneyAll_()) || 'อาหาร' });
      mid = mm.id; sp.moneyId = mid;
    }
    oweSave_([sp].concat(list));
    return { split: sid, debts: debts, money: mid };
  }
  const mine = b.members.filter(m => grpResp_(m) === owner);
  if (!mine.length) return null;
  const amt = grpSum_(mine);
  const d = { id: oweId_(), kind: 'debt', person: owePerson_(b.payer.name, docs), dir: 'me', amount: amt / 100, date: date, title: b.title, gbill: b.id, payments: [], status: 'open', created: date };
  const mm = moneySave_({ type: 'out', date: date, amount: amt / 100, note: b.title + ' (กลุ่ม) · ส่วนของฉัน (' + b.payer.name + ' จ่ายก่อน)', cat: moneyGuessCat_('out', b.title, moneyAll_()) || 'อาหาร' });
  d.moneyId = mm.id;
  oweSave_([d]);
  const debts = {};
  mine.forEach(m => { debts[m.k] = d.id; });
  return { debts: debts, money: mm.id, mine: true };
}

function grpOwePay_(b, m) {
  if (!b.owe || !b.owe.debts) return;
  const id = b.owe.debts[m.k];
  if (!id) return;
  if (b.owe.mine && b.members.some(x => b.owe.debts[x.k] === id && x.st === 'wait')) return;   // เราค้างเขา: ปิดเมื่อแจ้งโอนครบทุกแถวของเรา
  const all = oweAll_(), d = all.find(x => x.id === id);
  if (!d || oweLeftS_(d) <= 0) return;
  d.payments = (d.payments || []).concat([{ id: oweId_(), date: todayStr_(), amount: oweLeftS_(d) / 100, via: 'โอน (แจ้งในกลุ่ม LINE)' }]);
  d.status = 'done';
  const docs = [d];
  if (b.owe.split) {
    const sp = all.find(x => x.id === b.owe.split);
    if (sp && sp.transfers) { const t = sp.transfers.find(x => x.from === d.person && !x.done && Math.abs(x.amount - d.amount) < 0.005) || sp.transfers.find(x => x.from === d.person && !x.done); if (t) { t.done = true; docs.push(sp); } }
  }
  oweSave_(docs);
}

function grpOweVoid_(b) {
  if (!b.owe) return;
  const ids = [...new Set(Object.values(b.owe.debts || {}))];
  if (b.owe.split) ids.push(b.owe.split);
  if (ids.length) oweDelete_(ids);
  if (b.owe.money) { try { moneyDelete_(b.owe.money); } catch (e) {} }
  b.owe = null;
}

/* ===================== แอปเล็ก (LIFF) API: hk_* ===================== */
/** ตรวจ ID token กับ LINE → {uid, name} */
function hkAuth_(idt) {
  idt = String(idt || '');
  if (props.getProperty('HK_DEV') === '1' && /^dev:U[0-9a-f]{4,32}$/.test(idt)) return { uid: idt.slice(4), name: 'ทดสอบ ' + idt.slice(-4) };
  if (!idt) throw new Error('เปิดจากในไลน์เท่านั้นครับ');
  const cache = CacheService.getScriptCache();
  const key = 'idt:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idt)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const ch = props.getProperty('LIFF_CHANNEL');
  if (!ch) throw new Error('ยังไม่ได้ตั้งค่าแอปหารกัน');
  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'post', payload: { id_token: idt, client_id: ch }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('เข้าสู่ระบบ LINE หมดอายุ ปิดแล้วเปิดใหม่อีกครั้ง');
  const j = JSON.parse(res.getContentText());
  const u = { uid: String(j.sub), name: String(j.name || '').slice(0, 40) };
  const ttl = Math.floor((Number(j.exp) * 1000 - Date.now()) / 1000) - 60;
  if (ttl > 60) cache.put(key, JSON.stringify(u), Math.min(3000, ttl));
  return u;
}

/** กลุ่มจาก token ในลิงก์ + เช็กว่าเป็นสมาชิกจริง */
function hkGroup_(tok, uid) {
  tok = String(tok || '');
  if (!/^[A-Za-z0-9]{16,40}$/.test(tok)) return null;
  const c = grpCfg_(), gid = Object.keys(c).find(k => c[k].tok === tok);
  if (!gid || !c[gid].on) throw new Error('กลุ่มนี้ปิดหารกันไว้ หรือลิงก์เก่าแล้ว พิมพ์ หาร ในกลุ่มเพื่อเปิดใหม่');
  const cache = CacheService.getScriptCache(), ck = 'gm:' + gid.slice(-12) + uid.slice(-12);
  let nm = cache.get(ck);
  if (!nm) {
    if (props.getProperty('HK_DEV') === '1' && (c[gid].seen || {})[uid]) nm = c[gid].seen[uid];
    else {
      const p = grpProfile_(gid, c[gid].type === 'room' ? 'room' : 'group', uid);
      if (!p) throw new Error('คุณไม่ได้อยู่ในกลุ่มนี้');
      nm = p.displayName || 'เพื่อน';
    }
    cache.put(ck, nm, 21600);
  }
  return { gid: gid, g: c[gid], lineName: nm };
}

/** เส้นทางหลักของแอปเล็ก (doPost เรียกก่อนเช็ก key) */
function hkApi_(body) {
  const me = hkAuth_(body.idt);
  const a = String(body.action);
  if (a === 'hk_read') return hkRead_(me, body);   // AI ช้า: นอกล็อก
  const grp = body.g ? hkGroup_(body.g, me.uid) : null;
  return grpLocked_(null, () => {
    const users = hkUsers_();
    const meU = users[me.uid] || {};
    const lineName = me.name || (grp && grp.lineName) || meU.name || '';
    if (!users[me.uid] || meU.name !== lineName) hkUserSave_(me.uid, { name: lineName });
    me.disp = meU.nick || lineName || 'เพื่อน';
    if (grp) {   // เปิดแอปจากกลุ่ม = ชื่อขึ้นให้เพื่อนเลือกตอนหาร
      const c = grpCfg_(), g = c[grp.gid];
      if (g && (g.seen || {})[me.uid] !== me.disp) { g.seen = g.seen || {}; g.seen[me.uid] = me.disp; grpCfgSave_(c); grp.g = g; }
    }
    switch (a) {
      case 'hk_home':   return hkHome_(me, grp);
      case 'hk_bill':   return { bill: hkView_(hkGet_(body.b, grp), me) };
      case 'hk_create': return hkCreate_(me, grp, body);
      case 'hk_edit':   return hkCreate_(me, grp, body, hkGet_(body.b, grp));
      case 'hk_paid':   return hkPaid_(me, hkGet_(body.b, grp), body);
      case 'hk_ok':     return hkOk_(me, hkGet_(body.b, grp), body);
      case 'hk_void':   { const b = hkGet_(body.b, grp); if (b.payer.uid !== me.uid) throw new Error('ลบได้เฉพาะคนจ่ายก่อน'); hkVoidBill_(b); return { done: true }; }
      case 'hk_slip':   return hkSlipGet_(me, hkGet_(body.b, grp), String(body.k || ''));
      case 'hk_qrimg':  return hkQrImg_(me, hkGet_(body.b, grp));
      case 'hk_me_set': return { me: hkMeSet_(me, body, grp) };
      case 'hk_card':   { const b = hkGet_(body.b, grp); if (b.payer.uid !== me.uid) throw new Error('เฉพาะคนจ่ายก่อน'); return { msg: hkCardFlex_(b, 'บิล') }; }
      default: throw new Error('unknown action');
    }
  });
}

function hkGet_(id, grp) {
  const b = grpBill_(String(id || ''));
  if (!b || b.status === 'void') throw new Error('ไม่พบบิลนี้ หรือบิลถูกลบไปแล้ว');
  if (grp && b.gid !== grp.gid) throw new Error('บิลนี้อยู่คนละกลุ่ม');
  return b;
}

/** มุมมองบิล: คนจ่ายก่อนเห็นทุกแถว · คนอื่นเห็นยอดเฉพาะแถวของตัวเอง */
function hkView_(b, me) {
  const isPayer = b.payer.uid === me.uid;
  const mine = isPayer ? [] : grpMine_(b, me.uid, '');
  if (!isPayer && !mine.length) throw new Error('คุณไม่ได้อยู่ในบิลนี้');
  const g = grpCfg_()[b.gid] || {};
  const row = m => ({ k: m.k, uid: m.uid || '', name: m.name, out: !!m.out, by: m.by ? m.by.name : '', byUid: m.by ? m.by.uid : '', byMe: !!(m.by && m.by.uid === me.uid), amtS: m.amtS, units: m.units || 0, items: m.items || [], st: m.st, at: m.at || '', slip: !!m.slip });
  const v = { id: b.id, title: b.title, date: b.date, mode: b.mode || 'equal', unit: b.unit || 'ชม.', status: b.status, group: g.name || '', payer: b.payer.name, isPayer: isPayer, created: b.created, totalS: b.totalS };
  if (isPayer) {
    Object.assign(v, { payerIn: b.payerIn !== false, payerShareS: b.payer.shareS || 0, payerUnits: b.payer.units || 0, payerItems: b.payer.items || [], rows: b.members.map(row), items: b.items || [] });
  } else {
    const others = {};
    b.members.filter(m => mine.indexOf(m) < 0).forEach(m => {
      const n = m.by ? m.by.name : m.name, cur = others[n];
      others[n] = !cur ? m.st : (cur === 'wait' || m.st === 'wait') ? 'wait' : (cur === 'ok' && m.st === 'ok') ? 'ok' : 'told';
    });
    delete v.totalS;   // ไม่บอกยอดรวมบิล คนอื่นจะคำนวณยอดเพื่อนได้
    Object.assign(v, { mine: mine.map(row), dueS: grpSum_(mine.filter(m => m.st === 'wait')), sumS: grpSum_(mine), others: Object.keys(others).map(n => ({ name: n, st: others[n] })), pay: hkPayInfo_(b.payer.uid) });
  }
  return v;
}

function hkHome_(me, grp) {
  const cfg = grpCfg_(), today = todayStr_();
  const owe = [], get = [];
  grpRows_().filter(b => b.status !== 'void').forEach(b => {
    const gname = (cfg[b.gid] || {}).name || '';
    const old = daysBetween_(b.date, today) > 14;
    if (b.payer.uid === me.uid) {
      const left = b.members.filter(m => m.st !== 'ok');
      if (!left.length && old) return;
      const by = {};   // นับเป็นคน (คนนอกกลุ่มที่มีคนจ่ายแทน รวมกับคนนั้น)
      b.members.forEach(m => { const k = grpResp_(m) || m.k; if (k === me.uid) return; const x = by[k] = by[k] || []; x.push(m.st); });
      const ps = Object.values(by), stOf = a => a.every(s => s === 'ok') ? 'ok' : a.some(s => s === 'wait') ? 'wait' : 'told';
      get.push({ id: b.id, title: b.title, group: gname, date: b.date, leftS: grpSum_(left), waitN: ps.filter(a => stOf(a) === 'wait').length, toldN: ps.filter(a => stOf(a) === 'told').length, okN: ps.filter(a => stOf(a) === 'ok').length, n: ps.length, here: !!(grp && grp.gid === b.gid) });
    } else {
      const mine = grpMine_(b, me.uid, '');
      if (!mine.length) return;
      const due = mine.filter(m => m.st === 'wait');
      if (!due.length && old) return;
      owe.push({ id: b.id, title: b.title, group: gname, date: b.date, payer: b.payer.name, dueS: grpSum_(due), sumS: grpSum_(mine), st: due.length ? 'wait' : mine.every(m => m.st === 'ok') ? 'ok' : 'told', here: !!(grp && grp.gid === b.gid) });
    }
  });
  const by = (x, y) => String(y.date).localeCompare(String(x.date)) || 0;
  const res = { me: hkMeView_(me), owe: owe.sort(by), get: get.sort(by) };
  if (grp) {
    const seen = grp.g.seen || {};
    res.group = { name: grp.g.name || '', members: Object.keys(seen).filter(u => u !== me.uid).map(u => ({ uid: u, name: seen[u] })) };
  }
  return res;
}

function hkMeView_(me) {
  const u = hkUser_(me.uid), owner = me.uid === props.getProperty('LINE_USER_ID');
  let pp = u.pp;
  if (!pp && owner && !u.qr && !u.qrFile) { try { pp = moneyCfg_().pp || ''; } catch (e) {} }
  return { name: me.name, nick: u.nick || '', disp: u.nick || me.name || me.disp, pp: pp ? grpMask_(pp) : '', ppSet: !!pp, qr: !!u.qr, qrImg: !!u.qrFile };
}

function hkMeSet_(me, p, grp) {
  const patch = {};
  let claim = '';
  if (p.nick != null) {
    patch.nick = String(p.nick).trim().slice(0, 30);
    if (grp && patch.nick) { grp.g.seen[me.uid] = patch.nick; const c = grpCfg_(); c[grp.gid] = grp.g; grpCfgSave_(c); }
  }
  if (p.pp != null) {
    const d = String(p.pp).replace(/\D/g, '');
    if (d && !/^(0\d{9}|\d{13}|\d{15})$/.test(d)) throw new Error('พร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลข 13 หลัก');
    patch.pp = d; if (d) { patch.qr = ''; patch.qrFile = ''; }
  }
  if (p.qr != null) {   // ข้อความใน QR ที่ถอดในเครื่องแล้ว (มาตรฐาน EMVCo)
    const q = String(p.qr).trim();
    if (q && (!/^000201/.test(q) || q.length > 512 || !hkCrcOk_(q))) throw new Error('QR นี้ไม่ใช่ QR รับเงินที่ระบบอ่านได้');
    patch.qr = q; if (q) { patch.pp = ''; patch.qrFile = ''; }
  }
  if (p.qrImg) {   // ถอด QR ในเครื่องไม่ได้ → เก็บรูปไว้ให้เพื่อนสแกนเอง
    const bytes = Utilities.base64Decode(String(p.qrImg));
    if (bytes.length > 1.5 * 1024 * 1024) throw new Error('รูปใหญ่เกินไป');
    const old = hkUser_(me.uid).qrFile;
    const f = hkFolder_('QR รับเงิน').createFile(Utilities.newBlob(bytes, 'image/jpeg', 'qr_' + me.uid.slice(-8) + '.jpg'));
    if (old) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) {} }
    patch.qrFile = f.getId(); patch.qr = ''; patch.pp = '';
  }
  if (p.clearPay) { patch.pp = ''; patch.qr = ''; patch.qrFile = ''; }
  hkUserSave_(me.uid, patch);
  if (grp && patch.nick) claim = hkClaim_(grp.gid, me.uid, patch.nick);
  return Object.assign(hkMeView_(me), { claimed: claim.replace(/^\n/, '') });
}
function hkCrcOk_(s) {
  const body = s.slice(0, -4), want = s.slice(-4).toUpperCase();
  if (!/6304$/.test(body)) return false;
  let crc = 0xFFFF;
  for (let i = 0; i < body.length; i++) { crc ^= body.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
  return ('000' + crc.toString(16).toUpperCase()).slice(-4) === want;
}
function hkFolder_(sub) {
  let root = null;
  const id = props.getProperty('HK_FOLDER_ID');
  if (id) { try { root = DriveApp.getFolderById(id); } catch (e) { root = null; } }
  if (!root) { root = DriveApp.createFolder(HK_FOLDER); props.setProperty('HK_FOLDER_ID', root.getId()); }
  if (!sub) return root;
  const it = root.getFoldersByName(sub);
  return it.hasNext() ? it.next() : root.createFolder(sub);
}

/** สร้าง/แก้บิลจากแอป (คนจ่ายก่อนตั้งยอดทุกคนเอง ระบบเช็กว่ารวมแล้วตรงยอดบิล) */
function hkCreate_(me, grp, p, old) {
  if (old && old.payer.uid !== me.uid) throw new Error('แก้ได้เฉพาะคนจ่ายก่อน');
  if (!grp && !old) throw new Error('สร้างบิลได้จากในกลุ่มเท่านั้น (พิมพ์ หาร ในกลุ่ม แล้วกดสร้างบิลใหม่)');
  const gid = old ? old.gid : grp.gid;
  const seen = (grpCfg_()[gid] || {}).seen || {};
  const totalS = Math.round(Number(p.totalS) || 0);
  if (totalS <= 0 || totalS > 100000000) throw new Error('ยอดรวมไม่ถูกต้อง');
  const mode = /^(equal|hours|items|custom)$/.test(p.mode) ? p.mode : 'custom';
  const keys = {};
  const members = (Array.isArray(p.members) ? p.members : []).slice(0, 40).map(x => {
    const uid = String(x.uid || '');
    if (uid && (uid === me.uid || !seen[uid])) return null;   // เลือกได้เฉพาะคนที่บอทรู้จักในกลุ่ม
    const name = uid ? seen[uid] : String(x.name || '').trim().replace(/^\+/, '').slice(0, 30);
    if (!name) return null;
    const k = uid || 'o:' + name;
    if (keys[k]) return null;
    keys[k] = 1;
    let by = null;
    if (!uid && x.byUid) {
      const bu = String(x.byUid);
      if (bu === me.uid || bu === 'me') by = { uid: me.uid, name: me.disp };
      else if (seen[bu]) by = { uid: bu, name: seen[bu] };
    }
    const amtS = Math.round(Number(x.amtS) || 0);
    if (amtS < 0) throw new Error('ยอดติดลบไม่ได้');
    const prev = old && old.members.find(m => m.k === k);
    const keep = prev && prev.amtS === amtS && (!!prev.by === !!by) && (!by || prev.by.uid === by.uid);
    const st = by && by.uid === me.uid ? 'ok' : keep ? prev.st : 'wait';
    return { k: k, uid: uid, name: name, out: !uid, by: by, amtS: amtS, units: Number(x.units) || 0, items: (x.items || []).map(String).slice(0, 30), st: st, at: keep ? prev.at || '' : '', slip: keep ? prev.slip || '' : '' };
  }).filter(m => m && m.amtS > 0);
  if (!members.length) throw new Error('เลือกคนที่ต้องจ่ายอย่างน้อย 1 คน');
  const payerIn = p.payerIn !== false;
  const shareS = payerIn ? Math.max(0, Math.round(Number(p.payerShareS) || 0)) : 0;
  const sum = shareS + grpSum_(members);
  if (sum !== totalS) throw new Error('ยอดของทุกคนรวมกัน (' + grpB_(sum) + ') ไม่ตรงยอดบิล ' + grpB_(totalS));
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 60).map(it => ({ name: String(it.name || '').slice(0, 60), priceS: Math.round(Number(it.priceS) || 0), who: (it.who || []).map(String).slice(0, 40) })).filter(it => it.name);
  const b = old || { id: Utilities.getUuid().replace(/-/g, ''), gid: gid, token: grpTok_(), v: 2, via: 'app', created: stamp_(), status: 'open' };
  if (old) { try { grpOweVoid_(b); } catch (e) {} }
  Object.assign(b, {
    title: String(p.title || '').trim().slice(0, 60) || 'หารกัน', date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? p.date : (old ? old.date : todayStr_()),
    totalS: totalS, mode: mode, unit: String(p.unit || 'ชม.').slice(0, 10), items: items, payerIn: payerIn,
    payer: { uid: me.uid, name: me.disp, shareS: shareS, units: Number(p.payerUnits) || 0, items: (p.payerItems || []).map(String).slice(0, 30) },
    members: members, edited: old ? stamp_() : '',
  });
  b.status = members.every(m => m.st === 'ok') ? 'done' : 'open';
  try { b.owe = grpOweCreate_(b); } catch (e) { console.warn('grpOwe: ' + e); }
  grpSave_(b);
  return { bill: hkView_(b, me), msg: hkCardFlex_(b, old ? 'แก้บิล' : 'บิลใหม่') };
}

/** คนที่ต้องจ่ายกด "ฉันโอนแล้ว" (+ สลิป) */
function hkPaid_(me, b, p) {
  if (b.payer.uid === me.uid) throw new Error('คุณเป็นคนจ่ายก่อนของบิลนี้');
  const mine = grpMine_(b, me.uid, '').filter(m => m.st === 'wait');
  if (!mine.length) return { bill: hkView_(b, me), already: true };
  let slip = '';
  if (p.slip) {
    const bytes = Utilities.base64Decode(String(p.slip));
    if (bytes.length > 2 * 1024 * 1024) throw new Error('รูปสลิปใหญ่เกินไป');
    slip = hkFolder_('สลิป').createFile(Utilities.newBlob(bytes, 'image/jpeg', b.date + '_' + cut_(b.title, 20) + '_' + me.disp + '.jpg')).getId();
  }
  mine.forEach(m => { m.slip = slip; });
  grpSetSt_(b, mine, 'told');
  return { bill: hkView_(b, me), text: me.disp + ' โอนแล้ว ✅ ' + b.title + ' → ' + b.payer.name };
}

/** คนจ่ายก่อนกด "ได้เงินแล้ว" (k = แถว หรือ r:<uid> = ทุกแถวที่คนนั้นต้องจ่าย) */
function hkOk_(me, b, p) {
  if (b.payer.uid !== me.uid) throw new Error('ยืนยันได้เฉพาะคนจ่ายก่อน');
  const k = String(p.k || '');
  const list = b.members.filter(m => m.k === k || ('r:' + grpResp_(m)) === k);
  if (!list.length) throw new Error('ไม่พบแถวนี้');
  grpSetSt_(b, list, p.undo ? 'wait' : 'ok');
  return { bill: hkView_(b, me) };
}

function hkSlipGet_(me, b, k) {
  if (b.payer.uid !== me.uid) throw new Error('ดูสลิปได้เฉพาะคนจ่ายก่อน');
  const m = b.members.find(x => (x.k === k || ('r:' + grpResp_(x)) === k) && x.slip);
  if (!m) throw new Error('ไม่มีสลิป');
  return { data: Utilities.base64Encode(DriveApp.getFileById(m.slip).getBlob().getBytes()) };
}
function hkQrImg_(me, b) {
  if (b.payer.uid !== me.uid && !grpMine_(b, me.uid, '').length) throw new Error('คุณไม่ได้อยู่ในบิลนี้');
  const f = hkUser_(b.payer.uid).qrFile;
  if (!f) throw new Error('ไม่มีรูป QR');
  return { data: Utilities.base64Encode(DriveApp.getFileById(f).getBlob().getBytes()) };
}

/** 📷 อ่านใบเสร็จด้วย AI (ไม่เก็บรูป) · จำกัดคนละ 30 รูป/วัน */
function hkRead_(me, p) {
  const cache = CacheService.getScriptCache(), ck = 'hkr:' + me.uid.slice(-16) + todayStr_();
  const n = Number(cache.get(ck) || 0);
  if (n >= 30) throw new Error('วันนี้อ่านใบเสร็จครบ 30 รูปแล้ว ใส่ยอดเองได้เลย');
  cache.put(ck, String(n + 1), 86400);
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 4 * 1024 * 1024) throw new Error('รูปใหญ่เกินไป');
  const o = aiRead_(Utilities.newBlob(bytes, 'image/jpeg', 'receipt.jpg'), { cats: [] });
  if (!o) throw new Error('ตอนนี้อ่านใบเสร็จไม่ได้ ใส่ยอดเองได้เลย');
  return { amount: Number(o.amount) || 0, vendor: o.vendor || '', items: (o.items || []).map(it => ({ name: it.name, price: Math.round((it.price - (it.disc || 0)) * 100) / 100, qty: it.qty })), service: o.service || 0, discount: o.discount || 0 };
}

/* ===================== เตือนทุกวัน 10:00 (เฉพาะกลุ่มที่เปิด และวันที่มีคนค้าง) ===================== */
function grpDaily_() {
  const now = new Date(), ymd = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  if (Number(Utilities.formatDate(now, TZ, 'H')) < 10 || props.getProperty('GRP_DAILY_SENT') === ymd) return;
  props.setProperty('GRP_DAILY_SENT', ymd);
  const cfg = grpCfg_();
  Object.keys(cfg).forEach(gid => {
    const g = cfg[gid];
    if (!g.on || !g.daily) return;
    try {
      if (!grpBills_(gid).some(b => b.members.some(m => m.st === 'wait'))) return;
      line_('push', { to: gid, messages: [].concat(grpNag_(gid, '')).slice(0, 2) });
    } catch (e) { console.warn('grpDaily ' + gid + ': ' + e); }
  });
  CacheService.getScriptCache().remove('quota');
}
