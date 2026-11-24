/**
 * จดครบ — 👥 หารกันในกลุ่ม LINE (ใช้แทนขุนทอง)
 * เปิดทีละกลุ่ม: เจ้าของพิมพ์ "เปิดหาร" ในกลุ่มนั้น · กลุ่มที่ยังไม่เปิด บอทจะเงียบ ไม่อ่านและไม่เก็บแชท
 * ในกลุ่มที่เปิดแล้ว บอทตอบเฉพาะข้อความที่เป็นคำสั่งหารเงิน ข้อความคุยกันทั่วไปไม่ถูกเก็บ
 * คำสั่ง (ใครในกลุ่มก็พิมพ์ได้):
 *   หาร 1200 ชาบู @เอ @บี        หารเท่ากัน คนพิมพ์คือคนจ่ายก่อน (รวมตัวเองด้วย)
 *   หาร 1200 ชาบู @เอ 300 @บี    ระบุยอดบางคน ที่เหลือหารเท่ากัน · "ไม่รวมฉัน" = คนจ่ายไม่ได้หารด้วย · "ทุกคน" = ทุกคนที่บอทรู้จักในกลุ่ม
 *   ค้าง / ใครค้าง · ทวง · จ่ายแล้ว (ของตัวเอง) · จ่ายแล้ว @เอ (คนจ่ายยืนยันแทน) · ลบบิล · พร้อมเพย์ 08xxxxxxxx · วิธีใช้
 * ตอบด้วย reply ทั้งหมด (ไม่กินโควตา LINE) · เตือนทุกเช้าเปิดได้ต่อกลุ่ม (push = นับโควตาตามจำนวนคนในกลุ่ม)
 * บิลอยู่ในแท็บ "Group": id, gid, token, data(JSON), updated · ลิงก์ QR = pay.html?t=<token> (เห็นเฉพาะบิลนั้น)
 * ถ้าเจ้าของอยู่ในบิล จะลงหน้าค้างกัน + จดรายจ่ายเฉพาะส่วนของเจ้าของให้เอง
 */

const GRP_SHEET = 'Group';
const GRP_HEADERS = ['id', 'gid', 'token', 'data', 'updated'];
const PAY_URL = 'https://tibdglobal.github.io/Jodngan/pay.html';
const GRP_CMD = /^(หาร|ค้าง|ใครค้าง|ใครยังไม่จ่าย|ยังไม่จ่าย|บิล|ทวง|#ทวง|ทวงหน่อย|จ่ายแล้ว|โอนแล้ว|ลบบิล|ยกเลิกบิล|พร้อมเพย์|พร้อมเพ|วิธีใช้|ช่วย|help|เตือนทุกวัน|เปิดหาร|ปิดหาร)/i;

const GRP_HELP = [
  '👥 หารกันในกลุ่ม',
  '• หาร 1200 ชาบู @เอ @บี',
  '   คนพิมพ์ = คนจ่ายก่อน หารเท่ากันรวมตัวเอง',
  '• หาร 1200 ชาบู @เอ 300 @บี',
  '   ระบุยอดบางคน ที่เหลือหารเท่ากัน',
  '• เติม "ไม่รวมฉัน" ถ้าคนจ่ายไม่ได้กินด้วย · "ทุกคน" แทนการแท็ก',
  '• ค้าง = ดูว่าใครยังไม่จ่าย',
  '• ทวง = แท็กคนที่ยังไม่จ่าย',
  '• จ่ายแล้ว = แจ้งว่าเราโอนแล้ว (หรือกดปุ่มใต้บิล)',
  '• จ่ายแล้ว @เอ = คนจ่ายก่อนยืนยันว่าได้เงินแล้ว',
  '• ลบบิล = ลบบิลล่าสุดของเรา',
  '• พร้อมเพย์ 08xxxxxxxx = ตั้งเบอร์รับเงินของเรา ให้บิลมี QR พร้อมยอด',
].join('\n');

/* ---------- ที่เก็บ ---------- */
function grpSheet_() {
  const id = props.getProperty('SHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GRP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GRP_SHEET);
    sh.getRange(1, 1, sh.getMaxRows(), GRP_HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, GRP_HEADERS.length).setValues([GRP_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function grpRows_() {
  const sh = grpSheet_(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, GRP_HEADERS.length).getDisplayValues().map((r, i) => {
    if (!r[0]) return null;
    try { return Object.assign(JSON.parse(r[3] || '{}'), { id: r[0], gid: r[1], token: r[2], _row: i + 2 }); } catch (e) { return null; }
  }).filter(Boolean);
}
function grpBills_(gid, all) { return grpRows_().filter(b => b.gid === gid && (all || b.status === 'open')); }
function grpSave_(b) {
  const sh = grpSheet_();
  const doc = Object.assign({}, b); delete doc._row; delete doc.id; delete doc.gid; delete doc.token;
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
  // จำกัดขนาด (Script Property ได้ ~9KB): คนที่รู้จักต่อกลุ่ม 40 คนล่าสุด
  Object.keys(c).forEach(g => { const s = c[g].seen || {}; const k = Object.keys(s); if (k.length > 40) k.slice(0, k.length - 40).forEach(x => delete s[x]); });
  const json = JSON.stringify(c);
  if (json.length > 9000) throw new Error('ตั้งค่ากลุ่มเต็มแล้ว');
  props.setProperty('LINE_GROUPS', json);
}

/* ---------- ช่วยเหลือ ---------- */
const grpS_ = v => Math.round(Number(String(v == null ? '' : v).replace(/[,\s฿]/g, '')) * 100) || 0;
const grpB_ = s => fmtBaht_(s / 100);
const grpTok_ = () => Utilities.getUuid().replace(/-/g, '') .slice(0, 12) + Utilities.getUuid().replace(/-/g, '').slice(0, 12);

/** ชื่อในกลุ่มของคนนั้น (แคช 6 ชม.) */
function grpName_(src, uid) {
  if (!uid) return '';
  const cache = CacheService.getScriptCache(), key = 'gn:' + uid;
  const hit = cache.get(key);
  if (hit) return hit;
  let name = '';
  try {
    const kind = src.groupId ? 'group/' + src.groupId : 'room/' + src.roomId;
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/' + kind + '/member/' + uid, { headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) name = String(JSON.parse(res.getContentText()).displayName || '').slice(0, 40);
  } catch (e) {}
  if (name) cache.put(key, name, 21600);
  return name || 'เพื่อน';
}

function grpPP_(g, uid) {
  if (g.pp && g.pp[uid]) return g.pp[uid];
  if (uid && uid === props.getProperty('LINE_USER_ID')) { try { return moneyCfg_().pp || ''; } catch (e) {} }
  return '';
}
const grpMask_ = id => id ? String(id).replace(/^(\d{3})\d+(\d{4})$/, '$1-xxx-$2') : '';

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

/* ---------- ทางเข้าจาก webhook ---------- */
function grpHandle_(ev) {
  const src = ev.source || {}, gid = src.groupId || src.roomId, uid = src.userId || '';
  if (!gid) return;
  const owner = props.getProperty('LINE_USER_ID');
  const cfg = grpCfg_(), g = cfg[gid];

  if (ev.type === 'join') { reply_(ev.replyToken, '👋 สวัสดีครับ ช่วยหารบิลในกลุ่มนี้ได้\nเจ้าของบอทพิมพ์ เปิดหาร เพื่อเริ่มใช้'); return; }
  if (ev.type === 'leave') { if (g) { delete cfg[gid]; grpCfgSave_(cfg); } return; }

  if (ev.type === 'postback') {
    if (!g || !g.on || !/^gp\|/.test(String(ev.postback && ev.postback.data))) return;
    const name = grpName_(src, uid);
    return grpLocked_(ev.replyToken, () => grpPaidBtn_(ev, gid, uid, name, String(ev.postback.data).split('|')[1]));
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const text = String(ev.message.text || '').trim();
  if (!GRP_CMD.test(text)) return;   // คุยกันทั่วไป = ไม่ยุ่ง ไม่เก็บ

  if (/^เปิดหาร$/.test(text)) {
    if (uid !== owner) return reply_(ev.replyToken, 'เฉพาะเจ้าของบอทเปิดใช้ในกลุ่มได้ครับ');
    cfg[gid] = Object.assign({ pp: {}, seen: {}, daily: false }, g || {}, { on: true, type: src.type });
    grpCfgSave_(cfg);
    return reply_(ev.replyToken, '✅ เปิดหารกันในกลุ่มนี้แล้ว\n\n' + GRP_HELP + '\n\nบอทอ่านเฉพาะคำสั่งข้างบน แชทอื่นไม่ถูกเก็บ');
  }
  if (!g || !g.on) return;   // กลุ่มที่ยังไม่เปิด เงียบ
  if (/^ปิดหาร$/.test(text)) {
    if (uid !== owner) return reply_(ev.replyToken, 'เฉพาะเจ้าของบอทปิดได้ครับ');
    g.on = false; grpCfgSave_(cfg);
    return reply_(ev.replyToken, 'ปิดหารกันในกลุ่มนี้แล้ว บิลเดิมยังเก็บไว้ เปิดใหม่พิมพ์ เปิดหาร');
  }
  if (/^(วิธีใช้|ช่วย|help)$/i.test(text)) return reply_(ev.replyToken, GRP_HELP);

  const name = grpName_(src, uid);   // เรียก LINE นอกล็อก
  const ment = ((ev.message.mention || {}).mentionees || []).filter(m => m.type !== 'all' && !m.isSelf);
  const names = {};
  ment.forEach(m => { names[m.userId || ''] = m.userId ? grpName_(src, m.userId) : ''; });
  grpLocked_(ev.replyToken, () => {
    const c2 = grpCfg_(), g2 = c2[gid];
    if (!g2) return;
    if (uid) { g2.seen = g2.seen || {}; delete g2.seen[uid]; g2.seen[uid] = name; }
    ment.forEach(m => { if (m.userId && names[m.userId] && names[m.userId] !== 'เพื่อน') { delete g2.seen[m.userId]; g2.seen[m.userId] = names[m.userId]; } });
    let out;
    if (/^หาร/.test(text)) out = grpSplit_(ev, gid, g2, uid, name, names);
    else if (/^(ค้าง|ใครค้าง|ใครยังไม่จ่าย|ยังไม่จ่าย|บิล)$/.test(text)) out = grpOpenText_(gid);
    else if (/^(ทวง|#ทวง|ทวงหน่อย)$/.test(text)) out = grpNag_(gid);
    else if (/^(จ่ายแล้ว|โอนแล้ว)/.test(text)) out = grpPaidText_(ev, gid, uid, name, ment);
    else if (/^(ลบบิล|ยกเลิกบิล)/.test(text)) out = grpVoid_(gid, uid, uid === owner);
    else if (/^พร้อมเพ/.test(text)) out = grpSetPP_(g2, uid, name, text);
    else if (/^เตือนทุกวัน/.test(text)) {
      if (uid !== owner) out = 'เฉพาะเจ้าของบอทตั้งได้ครับ';
      else { g2.daily = !/ปิด/.test(text); out = g2.daily ? '⏰ เปิดเตือนคนที่ยังไม่จ่ายทุกเช้าแล้ว (ส่งเฉพาะวันที่มีคนค้าง)\nเลิก: เตือนทุกวัน ปิด' : 'ปิดเตือนทุกเช้าแล้ว'; }
    }
    grpCfgSave_(c2);
    if (out) grpReplyMsgs_(ev.replyToken, typeof out === 'string' ? grpText_(out) : out);
  });
}

function grpLocked_(token, fn) {
  const lk = LockService.getScriptLock();
  if (!lk.tryLock(25000)) { reply_(token, 'ระบบกำลังยุ่ง ลองใหม่อีกครั้งครับ'); return; }
  try { fn(); }
  catch (err) { console.error('group: ' + (err.stack || err)); reply_(token, 'ทำรายการไม่สำเร็จ: ' + (err.message || err)); }
  finally { lk.releaseLock(); }
}

/* ---------- หาร ---------- */
/** แยกข้อความ "หาร ..." พร้อมแท็ก → {title, totalS, people:[{uid,name,amtS}], excludeMe, everyone} */
function grpParse_(msg, names) {
  const text = String(msg.text || '');
  const ms = ((msg.mention || {}).mentionees || []).filter(m => m.type !== 'all' && !m.isSelf).sort((a, b) => a.index - b.index);
  const everyoneTag = ((msg.mention || {}).mentionees || []).some(m => m.type === 'all');
  let plain = '', last = 0;
  const people = [];
  ms.forEach((m, i) => {
    plain += text.slice(last, m.index) + ' ';
    const end = m.index + m.length, next = i + 1 < ms.length ? ms[i + 1].index : text.length;
    const num = text.slice(end, next).match(/^\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:บาท|บ\.?))?/);
    const tagName = text.substr(m.index, m.length).replace(/^@/, '').trim();
    people.push({ uid: m.userId || '', name: (m.userId && names[m.userId]) || tagName || 'เพื่อน', amtS: num ? grpS_(num[1]) : 0, fixed: !!num });
    last = end + (num ? num[0].length : 0);
  });
  plain = (plain + text.slice(last)).replace(/^\s*หาร\s*/, ' ') + ' ';
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
  const p = grpParse_(ev.message, names);
  if (p.everyone) Object.keys(g.seen || {}).forEach(u => { if (u !== uid && !p.people.some(x => x.uid === u)) p.people.push({ uid: u, name: g.seen[u], amtS: 0, fixed: false }); });
  // ไม่ให้ซ้ำ และไม่ให้แท็กตัวเอง
  const seenU = {};
  let people = p.people.filter(x => { const k = x.uid || ('n:' + x.name); if (x.uid === uid || seenU[k]) return false; seenU[k] = 1; return true; });
  if (!people.length) return 'แท็กคนที่หารด้วยครับ เช่น\nหาร 1200 ชาบู @เอ @บี\n(หรือ หาร 1200 ชาบู ทุกคน)';
  if (people.length > 30) return 'หารได้สูงสุด 30 คนต่อบิลครับ';
  const payer = { uid: uid, name: name, amtS: 0, fixed: false, payer: true };
  const all = p.excludeMe ? people : [payer].concat(people);
  const fixedS = all.filter(x => x.fixed).reduce((s, x) => s + x.amtS, 0);
  let totalS = p.totalS;
  const free = all.filter(x => !x.fixed);
  if (!totalS) {
    if (!fixedS) return 'ใส่ยอดรวมด้วยครับ เช่น หาร 1200 ชาบู @เอ @บี';
    totalS = fixedS;   // ระบุครบทุกคน
    free.forEach(x => { x.amtS = 0; });
  } else {
    if (fixedS > totalS) return 'ยอดที่ระบุรายคน (' + grpB_(fixedS) + ') เกินยอดรวม ' + grpB_(totalS);
    const R = totalS - fixedS;
    if (R > 0 && !free.length) return 'ยอดที่ระบุรายคนรวม ' + grpB_(fixedS) + ' ไม่ตรงยอดรวม ' + grpB_(totalS);
    if (free.length) {
      const payerFree = free.indexOf(payer) > -1;
      if (payerFree && free.length > 1) {   // คนอื่นปัดเป็นบาทลง คนจ่ายรับเศษ
        const each = Math.floor(R / free.length / 100) * 100;
        free.forEach(x => { x.amtS = each; });
        payer.amtS = R - each * (free.length - 1);
      } else {
        const base = Math.floor(R / free.length);
        let extra = R - base * free.length;
        free.forEach(x => { x.amtS = base + (extra > 0 ? 1 : 0); if (extra > 0) extra--; });
      }
    }
  }
  if (totalS > 100000000) return 'ยอดเยอะเกินไปครับ';
  const owes = people.filter(x => x.amtS > 0);
  if (!owes.length) return 'ไม่มีใครต้องจ่ายในบิลนี้ครับ';
  const b = {
    id: Utilities.getUuid().replace(/-/g, ''), gid: gid, token: grpTok_(),
    title: p.title || 'หารกัน', date: todayStr_(), totalS: totalS, status: 'open', created: stamp_(),
    payer: { uid: uid, name: name, shareS: p.excludeMe ? 0 : payer.amtS },
    members: owes.map(x => ({ uid: x.uid, name: x.name, amtS: x.amtS, paid: false, at: '' })),
  };
  try { b.owe = grpOweCreate_(b); } catch (e) { console.warn('grpOwe: ' + e); }
  grpSave_(b);
  return grpFlex_(b, grpPP_(g, uid));
}

/** การ์ดบิล */
function grpFlex_(b, pp) {
  const paidN = b.members.filter(m => m.paid).length;
  const row = m => ({ type: 'box', layout: 'horizontal', spacing: 'md', contents: [
    { type: 'text', text: (m.paid ? '✅ ' : '⏳ ') + (m.name || 'เพื่อน'), size: 'sm', flex: 5, wrap: true, color: m.paid ? '#8a8a8a' : '#1f1f1f' },
    { type: 'text', text: grpB_(m.amtS), size: 'sm', flex: 3, align: 'end', weight: 'bold', color: m.paid ? '#8a8a8a' : '#1f1f1f', decoration: m.paid ? 'line-through' : 'none' },
  ] });
  const body = [
    { type: 'text', text: b.title || 'หารกัน', weight: 'bold', size: 'lg', wrap: true },
    { type: 'text', text: 'รวม ' + grpB_(b.totalS) + ' · ' + (b.payer.name || 'เพื่อน') + ' จ่ายก่อน' + (b.payer.shareS ? ' (ส่วนตัวเอง ' + grpB_(b.payer.shareS) + ')' : ''), size: 'xs', color: '#6b6b6b', wrap: true },
    { type: 'separator', margin: 'md' },
    { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: b.members.slice(0, 30).map(row) },
    { type: 'separator', margin: 'md' },
    { type: 'text', margin: 'md', size: 'xs', color: '#6b6b6b', wrap: true,
      text: (paidN === b.members.length ? '🎉 จ่ายครบแล้ว' : 'จ่ายแล้ว ' + paidN + '/' + b.members.length) +
        (pp ? ' · พร้อมเพย์ ' + grpMask_(pp) : ' · ' + (b.payer.name || 'คนจ่าย') + ' พิมพ์ พร้อมเพย์ 08… เพื่อให้มี QR') },
  ];
  const footer = [];
  if (pp) footer.push({ type: 'button', style: 'primary', color: '#1f1f1f', height: 'sm', action: { type: 'uri', label: '💳 สแกนจ่าย (QR พร้อมยอด)', uri: PAY_URL + '?t=' + b.token } });
  footer.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'postback', label: '✅ ฉันโอนแล้ว', data: 'gp|' + b.id, displayText: 'โอนแล้ว ✅ (' + cut_(b.title, 30) + ')' } });
  return { type: 'flex', altText: '🍜 ' + cut_(b.title, 40) + ' ' + grpB_(b.totalS) + ' หาร ' + (b.members.length + (b.payer.shareS ? 1 : 0)) + ' คน',
    contents: { type: 'bubble', size: 'kilo', body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body }, footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer } } };
}

/* ---------- จ่ายแล้ว ---------- */
function grpFindMember_(b, uid, name) {
  let m = b.members.find(x => x.uid && x.uid === uid);
  if (!m && name) m = b.members.find(x => !x.uid && x.name === name);   // แท็กที่ไม่มี userId
  return m;
}
function grpMarkPaid_(b, m) {
  m.paid = true; m.at = stamp_();
  try { grpOwePay_(b, m); } catch (e) { console.warn('grpOwePay: ' + e); }
  if (b.members.every(x => x.paid)) b.status = 'done';
  grpSave_(b);
}
function grpLeftLine_(b) {
  const left = b.members.filter(x => !x.paid);
  return left.length ? 'ยังไม่จ่าย: ' + left.map(x => x.name + ' ' + grpB_(x.amtS)).join(', ') : '🎉 ' + b.title + ' จ่ายครบทุกคนแล้ว';
}

function grpPaidBtn_(ev, gid, uid, name, id) {
  const b = grpRows_().find(x => x.id === id && x.gid === gid);
  if (!b || b.status === 'void') return reply_(ev.replyToken, 'บิลนี้ถูกลบไปแล้วครับ');
  if (b.payer.uid === uid) return reply_(ev.replyToken, name + ' เป็นคนจ่ายบิลนี้ ถ้าเพื่อนโอนแล้ว พิมพ์ จ่ายแล้ว @ชื่อเพื่อน');
  const m = grpFindMember_(b, uid, name);
  if (!m) return reply_(ev.replyToken, name + ' ไม่ได้อยู่ในบิล ' + b.title + ' ครับ');
  if (m.paid) return reply_(ev.replyToken, name + ' แจ้งโอนบิลนี้ไว้แล้วครับ');
  if (!m.uid) m.uid = uid;
  grpMarkPaid_(b, m);
  reply_(ev.replyToken, '✅ ' + name + ' โอนแล้ว ' + grpB_(m.amtS) + ' (' + b.title + ' → ' + b.payer.name + ')\n' + grpLeftLine_(b));
}

/** พิมพ์ "จ่ายแล้ว" = ของตัวเอง · "จ่ายแล้ว @เอ" = คนจ่ายก่อนยืนยันแทนเพื่อน */
function grpPaidText_(ev, gid, uid, name, ment) {
  const open = grpBills_(gid);
  if (ment.length) {
    const mine = open.filter(b => b.payer.uid === uid);
    if (!mine.length) return 'ยืนยันแทนเพื่อนได้เฉพาะบิลที่เราเป็นคนจ่ายก่อนครับ';
    const out = [];
    ment.forEach(t => {
      const tagName = String(ev.message.text).substr(t.index, t.length).replace(/^@/, '').trim();
      mine.forEach(b => {
        const m = grpFindMember_(b, t.userId || '', tagName);
        if (m && !m.paid) { grpMarkPaid_(b, m); out.push('✅ ' + m.name + ' ' + grpB_(m.amtS) + ' (' + b.title + ')'); }
      });
    });
    return out.length ? out.join('\n') + '\n' + mine.map(grpLeftLine_).join('\n') : 'ไม่พบยอดค้างของคนที่แท็กในบิลของเราครับ';
  }
  const list = open.filter(b => { const m = grpFindMember_(b, uid, name); return m && !m.paid; });
  if (!list.length) return name + ' ไม่มียอดค้างในกลุ่มนี้แล้วครับ 🎉';
  if (list.length === 1) {
    const b = list[0], m = grpFindMember_(b, uid, name);
    if (!m.uid) m.uid = uid;
    grpMarkPaid_(b, m);
    return '✅ ' + name + ' โอนแล้ว ' + grpB_(m.amtS) + ' (' + b.title + ' → ' + b.payer.name + ')\n' + grpLeftLine_(b);
  }
  return grpText_(name + ' ค้างอยู่ ' + list.length + ' บิล แตะบิลที่โอนแล้ว', list.slice(0, 13).map(b =>
    qr_(cut_(b.title, 12) + ' ' + grpB_(grpFindMember_(b, uid, name).amtS), 'gp|' + b.id, 'โอนแล้ว ✅ (' + cut_(b.title, 30) + ')')));
}

/* ---------- ดูยอด / ทวง / ลบ ---------- */
function grpOpenText_(gid) {
  const open = grpBills_(gid);
  if (!open.length) return '🎉 ไม่มีใครค้างในกลุ่มนี้แล้ว';
  const pair = {};
  open.forEach(b => b.members.filter(m => !m.paid).forEach(m => {
    const k = m.name + ' → ' + b.payer.name;
    pair[k] = (pair[k] || 0) + m.amtS;
  }));
  const out = ['💰 ยังไม่จ่าย (รวมทุกบิล)'].concat(Object.keys(pair).sort((a, b) => pair[b] - pair[a]).map(k => '• ' + k + ' ' + grpB_(pair[k])));
  out.push('', '🧾 บิลที่ยังเปิด');
  open.slice(-10).forEach(b => out.push('• ' + b.title + ' ' + grpB_(b.totalS) + ' (' + fmt_(b.date, '') + ') จ่ายแล้ว ' + b.members.filter(m => m.paid).length + '/' + b.members.length));
  out.push('', 'ทวง = แท็กคนที่ยังไม่จ่าย · จ่ายแล้ว = แจ้งว่าโอนแล้ว');
  return out.join('\n');
}

function grpNag_(gid) {
  const open = grpBills_(gid);
  if (!open.length) return '🎉 ไม่มีใครค้างในกลุ่มนี้แล้ว';
  const per = {};
  open.forEach(b => b.members.filter(m => !m.paid).forEach(m => {
    const k = m.uid || 'n:' + m.name;
    const p = per[k] = per[k] || { uid: m.uid, name: m.name, lines: [], sum: 0 };
    p.sum += m.amtS; p.lines.push(b.title + ' ' + grpB_(m.amtS) + ' → ' + b.payer.name);
  }));
  const parts = ['🔔 ทวงหน่อยนะ\n'];
  Object.values(per).forEach(p => { parts.push(p, ' ' + grpB_(p.sum) + '\n   ' + p.lines.join('\n   ') + '\n'); });
  const msgs = [grpMention_(parts.concat(['\nโอนแล้วกด ✅ ใต้บิล หรือพิมพ์ จ่ายแล้ว']))];
  const g = grpCfg_()[gid] || {};
  const links = open.filter(b => grpPP_(g, b.payer.uid) && b.members.some(m => !m.paid)).slice(-3);
  if (links.length) msgs.push(grpText_('💳 สแกนจ่าย (QR พร้อมยอดของแต่ละคน)\n' + links.map(b => '• ' + b.title + ': ' + PAY_URL + '?t=' + b.token).join('\n')));
  return msgs;
}

function grpVoid_(gid, uid, isOwner) {
  const open = grpBills_(gid).filter(b => b.payer.uid === uid || isOwner);
  if (!open.length) return 'ไม่มีบิลที่เราลบได้ (ลบได้เฉพาะบิลที่เราเป็นคนจ่ายก่อน)';
  const b = open.sort((x, y) => String(y.created).localeCompare(String(x.created)))[0];
  b.status = 'void';
  try { grpOweVoid_(b); } catch (e) { console.warn('grpOweVoid: ' + e); }
  grpSave_(b);
  return '🗑 ลบบิล ' + b.title + ' ' + grpB_(b.totalS) + ' แล้ว' + (b.members.some(m => m.paid) ? '\n⚠️ มีคนแจ้งโอนไปแล้ว คืนเงินกันเองนะครับ' : '');
}

function grpSetPP_(g, uid, name, text) {
  if (!uid) return 'อ่านชื่อผู้ส่งไม่ได้ครับ';
  g.pp = g.pp || {};
  if (/ลบ|ยกเลิก/.test(text)) { delete g.pp[uid]; return 'ลบพร้อมเพย์ของ ' + name + ' ออกจากกลุ่มนี้แล้ว'; }
  const d = text.replace(/^พร้อมเพ(ย์)?/, '').replace(/\D/g, '');
  if (!d) { const cur = grpPP_(g, uid); return cur ? 'พร้อมเพย์ของ ' + name + ': ' + grpMask_(cur) + '\nเปลี่ยน: พร้อมเพย์ 08xxxxxxxx · ลบ: พร้อมเพย์ ลบ' : 'พิมพ์ พร้อมเพย์ ตามด้วยเบอร์ 10 หลัก หรือเลข 13 หลักที่ผูกพร้อมเพย์'; }
  if (!/^(0\d{9}|\d{13}|\d{15})$/.test(d)) return 'ต้องเป็นเบอร์ 10 หลัก หรือเลข 13 หลักครับ';
  g.pp[uid] = d;
  return '💳 บันทึกพร้อมเพย์ของ ' + name + ' แล้ว (' + grpMask_(d) + ')\nบิลที่ ' + name + ' จ่ายก่อนจะมีปุ่มสแกนจ่ายพร้อมยอด';
}

/* ---------- ลงหน้าค้างกัน/รายจ่ายของเจ้าของ ---------- */
function grpOweCreate_(b) {
  const owner = props.getProperty('LINE_USER_ID');
  if (!owner) return null;
  const date = b.date, title = b.title + ' (กลุ่ม)';
  const docs = oweAll_();
  if (b.payer.uid === owner) {
    const sid = oweId_(), debts = {}, list = [];
    b.members.forEach(m => {
      const d = { id: oweId_(), kind: 'debt', person: owePerson_(m.name, docs), dir: 'they', amount: m.amtS / 100, date: date, title: b.title, splitId: sid, gbill: b.id, payments: [], status: 'open', created: date };
      debts[m.uid || 'n:' + m.name] = d.id; list.push(d);
    });
    const people = ['ฉัน'].concat(list.map(d => d.person));
    const shares = { 'ฉัน': b.payer.shareS / 100 };
    list.forEach(d => { shares[d.person] = (shares[d.person] || 0) + d.amount; });
    const sp = { id: sid, kind: 'split', title: b.title, date: date, people: people, total: b.totalS / 100, via: 'line-group', gbill: b.id,
      bills: [{ id: oweId_(), title: '', payer: 'ฉัน', method: 'custom', total: String(b.totalS / 100), who: people.slice(), custom: shares, items: [], svc: false, vat: false, disc: '', shares: shares, sum: b.totalS / 100 }],
      transfers: list.map(d => ({ from: d.person, to: 'ฉัน', amount: d.amount, done: false })) };
    let mid = '';
    if (b.payer.shareS) {
      const mm = moneySave_({ type: 'out', date: date, amount: b.payer.shareS / 100, note: title + ' · ส่วนของฉัน', cat: moneyGuessCat_('out', b.title, moneyAll_()) || 'อาหาร' });
      mid = mm.id; sp.moneyId = mid;
    }
    oweSave_([sp].concat(list));
    return { split: sid, debts: debts, money: mid };
  }
  const me = b.members.find(m => m.uid === owner);
  if (!me) return null;
  const d = { id: oweId_(), kind: 'debt', person: owePerson_(b.payer.name, docs), dir: 'me', amount: me.amtS / 100, date: date, title: b.title, gbill: b.id, payments: [], status: 'open', created: date };
  const mm = moneySave_({ type: 'out', date: date, amount: me.amtS / 100, note: title + ' · ส่วนของฉัน (' + b.payer.name + ' จ่ายก่อน)', cat: moneyGuessCat_('out', b.title, moneyAll_()) || 'อาหาร' });
  d.moneyId = mm.id;
  oweSave_([d]);
  return { debts: { [owner]: d.id }, money: mm.id };
}

function grpOwePay_(b, m) {
  if (!b.owe || !b.owe.debts) return;
  const id = b.owe.debts[m.uid] || b.owe.debts['n:' + m.name];
  if (!id) return;
  const d = oweAll_().find(x => x.id === id);
  if (!d || oweLeftS_(d) <= 0) return;
  d.payments = (d.payments || []).concat([{ id: oweId_(), date: todayStr_(), amount: oweLeftS_(d) / 100, via: 'โอน (แจ้งในกลุ่ม LINE)' }]);
  d.status = 'done';
  const docs = [d];
  if (b.owe.split) {
    const sp = oweAll_().find(x => x.id === b.owe.split);
    if (sp && sp.transfers) { const t = sp.transfers.find(x => x.from === d.person && !x.done); if (t) { t.done = true; docs.push(sp); } }
  }
  oweSave_(docs);
}

function grpOweVoid_(b) {
  if (!b.owe) return;
  const ids = Object.values(b.owe.debts || {});
  if (b.owe.split) ids.push(b.owe.split);
  if (ids.length) oweDelete_(ids);
  if (b.owe.money) { try { moneyDelete_(b.owe.money); } catch (e) {} }
}

/* ---------- หน้า QR สาธารณะ (ไม่ต้องมี key เห็นเฉพาะบิลของ token นั้น) ---------- */
function grpPublic_(t) {
  t = String(t || '');
  if (!/^[A-Za-z0-9]{16,40}$/.test(t)) throw new Error('ลิงก์ไม่ถูกต้อง');
  const b = grpRows_().find(x => x.token === t);
  if (!b || b.status === 'void') throw new Error('ไม่พบบิลนี้ หรือบิลถูกลบไปแล้ว');
  const g = grpCfg_()[b.gid] || {};
  return { title: b.title, date: b.date, totalS: b.totalS, status: b.status, payer: b.payer.name, payerShareS: b.payer.shareS || 0,
    pp: grpPP_(g, b.payer.uid), members: b.members.map(m => ({ name: m.name, amtS: m.amtS, paid: !!m.paid })) };
}

/* ---------- เตือนทุกเช้า (เฉพาะกลุ่มที่เปิด และวันที่มีคนค้าง) ---------- */
function grpDaily_() {
  const cfg = grpCfg_();
  Object.keys(cfg).forEach(gid => {
    const g = cfg[gid];
    if (!g.on || !g.daily) return;
    try {
      const open = grpBills_(gid).filter(b => b.members.some(m => !m.paid));
      if (!open.length) return;
      const msgs = [].concat(grpNag_(gid)).slice(0, 2);
      line_('push', { to: gid, messages: msgs });
    } catch (e) { console.warn('grpDaily ' + gid + ': ' + e); }
  });
  CacheService.getScriptCache().remove('quota');
}
