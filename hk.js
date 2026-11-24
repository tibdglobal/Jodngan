/* จดครบ — หารกันในกลุ่ม LINE (แอปเล็กในไลน์ / LIFF)
 * โหมดคนจ่ายก่อน: สร้างบิล ตั้งยอดทุกคน ติดตาม ยืนยันได้เงิน ทวง
 * โหมดคนที่ต้องจ่าย: เห็นเฉพาะยอดของตัวเอง QR ใส่ยอด แนบสลิป ฉันโอนแล้ว
 * ยืนยันตัวตนด้วย ID token ของ LINE (ไม่มี key ในหน้านี้) · ?dev=Uxxxx = ทดสอบนอกไลน์ (หลังบ้านต้องเปิด HK_DEV)
 */
const API_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toS = v => Math.round(Number(String(v == null ? '' : v).replace(/[,\s฿]/g, '')) * 100) || 0;
const baht = s => '฿' + (s / 100).toLocaleString('th-TH', { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
const plain = s => (s / 100).toFixed(2).replace(/\.00$/, '');
const thDate = d => { try { return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); } catch (e) { return d; } };
const CHECK = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 7.3l2.6 2.6L11 4.2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

let Q = new URLSearchParams(location.search);
let IDT = '', LIFF = false, G = '';
let home = null, view = null, stack = [];

/* ---------- ต่อระบบ ---------- */
async function call(action, payload) {
  const res = await fetch(window.HK_API || API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, idt: IDT, g: G }, payload || {})), redirect: 'follow' });
  const d = await res.json();
  if (!d.ok) throw new Error(d.error || 'ทำรายการไม่สำเร็จ');
  return d;
}
function toast(t) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.t = btn.textContent; btn.textContent = 'กำลังส่ง…'; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; }
async function postToChat(msgs) {
  if (!LIFF || !liff.isInClient()) return false;
  const ctx = liff.getContext && liff.getContext();
  if (!ctx || !/^(group|room|utou)$/.test(ctx.type)) return false;
  try { await liff.sendMessages([].concat(msgs)); return true; } catch (e) { console.warn(e); return false; }
}

async function boot() {
  try {
    if (Q.get('dev')) IDT = 'dev:' + Q.get('dev');
    else {
      if (!window.liff) throw new Error('เปิดหน้านี้จากในไลน์ครับ');
      const cfg = await call('hk_cfg');
      if (!cfg.liffId) throw new Error('ยังไม่ได้ตั้งค่าแอปหารกัน');
      await liff.init({ liffId: cfg.liffId });
      LIFF = true;
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      IDT = liff.getIDToken();
      Q = new URLSearchParams(location.search);
    }
    G = Q.get('g') || '';
    await loadHome();
    if (Q.get('b')) await openBill(Q.get('b'), true);
    else if (Q.get('v') === 'new' && home.group) openCreate(null, true);
    else show('home', true);
  } catch (e) { $('#app').innerHTML = `<div class="sec msg">${esc(e.message)}</div>`; }
}
async function loadHome() { home = await call('hk_home'); }

/* ---------- เปลี่ยนหน้า ---------- */
function show(v, root) {
  if (root) stack = []; else if (view) stack.push(view);
  view = v; draw();
}
function back() { view = stack.pop() || { name: 'home' }; if (typeof view === 'string') view = { name: view }; draw(); }
$('#back').onclick = back;
$('#meBtn').onclick = () => openMe();
function draw() {
  if (typeof view === 'string') view = { name: view };
  $('#back').classList.toggle('hide', !stack.length);
  $('#foot').classList.add('hide');
  scrollTo(0, 0);
  ({ home: drawHome, create: drawCreate, track: drawTrack, pay: drawPay }[view.name] || drawHome)();
}
function foot(html) { $('#footIn').innerHTML = html; $('#foot').classList.remove('hide'); }

/* ===================== ยอดของฉัน ===================== */
function drawHome() {
  $('#ttl').textContent = home.group && home.group.name ? 'หารกัน · ' + home.group.name : 'หารกัน';
  const due = home.owe.reduce((s, x) => s + x.dueS, 0), get = home.get.reduce((s, x) => s + x.leftS, 0);
  const oweRows = home.owe.map(x => `<button class="row-btn item" type="button" data-bill="${esc(x.id)}">
      <div class="mid"><div class="nm">${esc(x.title)} → ${esc(x.payer)}</div><div class="lbl">${esc([x.group, thDate(x.date)].filter(Boolean).join(' · '))}</div></div>
      ${x.st === 'wait' ? `<div class="amt">${baht(x.dueS)}</div>` : `<span class="pill ${x.st === 'ok' ? 'ok' : 'soft'}">${x.st === 'ok' ? 'ได้รับแล้ว' : 'แจ้งโอนแล้ว'}</span>`}</button>`).join('');
  const getRows = home.get.map(x => `<button class="row-btn item" type="button" data-bill="${esc(x.id)}">
      <div class="mid"><div class="nm">${esc(x.title)}</div><div class="lbl">${esc([x.group, thDate(x.date)].filter(Boolean).join(' · '))} · ได้แล้ว ${x.okN}/${x.n}${x.toldN ? ' · แจ้งโอน ' + x.toldN + ' คน' : ''}</div></div>
      ${x.leftS ? `<div class="amt">${baht(x.leftS)}</div>` : '<span class="pill ok">ครบแล้ว</span>'}</button>`).join('');
  $('#app').innerHTML = `
    <h1>ยอดของฉัน</h1>
    <div class="hero">
      <div class="sec"><div class="lbl">ต้องจ่าย</div><div class="big">${baht(due)}</div><div class="lbl">${home.owe.filter(x => x.st === 'wait').length} บิล</div></div>
      <div class="dark"><div class="lbl">รอรับคืน</div><div class="big">${baht(get)}</div><div class="lbl">${home.get.filter(x => x.leftS).length} บิล · ฉันจ่ายก่อน</div></div>
    </div>
    <div class="sec list"><div class="sec-h">ต้องจ่าย</div>${oweRows || '<div class="empty">ไม่มียอดที่ต้องจ่าย</div>'}</div>
    <div class="sec list"><div class="sec-h">รอรับคืน (ฉันจ่ายก่อน)</div>${getRows || '<div class="empty">ยังไม่มีบิลที่คุณจ่ายก่อน</div>'}</div>
    ${home.me.ppSet || home.me.qr || home.me.qrImg ? '' : `<button class="row-btn sec item" type="button" id="setPay"><div class="mid"><div class="nm">ตั้งช่องทางรับเงิน</div><div class="lbl">อัปรูป QR รับเงิน หรือใส่พร้อมเพย์ เพื่อนจะได้สแกนจ่ายพร้อมยอด</div></div><span class="lnk">ตั้งเลย</span></button>`}`;
  $('#app').querySelectorAll('[data-bill]').forEach(b => b.onclick = () => openBill(b.dataset.bill));
  const sp = $('#setPay'); if (sp) sp.onclick = () => openMe();
  foot(home.group ? '<button class="btn ink" type="button" id="newBill">สร้างบิลใหม่ (ฉันจ่ายก่อน)</button>' : '<div class="lbl" style="text-align:center">สร้างบิลได้จากในกลุ่ม: พิมพ์ หาร แล้วกดสร้างบิลใหม่</div>');
  const nb = $('#newBill'); if (nb) nb.onclick = () => openCreate();
}

async function openBill(id, root) {
  $('#app').innerHTML = '<div class="msg"><div class="spin" role="status" aria-label="กำลังโหลด"></div></div>';
  try {
    const d = await call('hk_bill', { b: id });
    show({ name: d.bill.isPayer ? 'track' : 'pay', bill: d.bill }, root);
  } catch (e) { $('#app').innerHTML = `<div class="sec msg">${esc(e.message)}</div>`; if (!root) setTimeout(() => draw(), 1800); }
}

/* ===================== โหมดคนจ่ายก่อน: สร้าง / แก้บิล ===================== */
let cs = null;
const MODES = [['equal', 'เท่ากัน'], ['hours', 'ตามชั่วโมง'], ['items', 'ตามเมนู'], ['custom', 'ใส่ยอดเอง']];
function openCreate(bill, root) {
  const mem = (home.group && home.group.members) || [];
  const me = { key: 'me', uid: '', name: (home.me.disp || 'ฉัน'), me: true, on: true, units: 2, custom: '' };
  if (!bill) {
    cs = { edit: null, title: '', total: '', touched: false, mode: 'equal', unit: 'ชม.', items: [], people: [me].concat(mem.map(m => ({ key: m.uid, uid: m.uid, name: m.name, on: false, units: 2, custom: '' }))) };
  } else {
    const rows = bill.rows || [];
    cs = { edit: bill.id, title: bill.title, total: plain(bill.totalS), touched: true, mode: bill.mode, unit: bill.unit || 'ชม.',
      items: (bill.items || []).map(it => ({ name: it.name, price: plain(it.priceS), who: it.who.map(k => k) })), people: [] };
    me.on = bill.payerIn; me.units = bill.payerUnits || 2; me.custom = plain(bill.payerShareS);
    cs.people.push(me);
    rows.forEach(r => cs.people.push({ key: r.k, uid: r.uid, name: r.name, on: true, units: r.units || 2, custom: plain(r.amtS), out: r.out, byUid: r.byMe ? 'me' : r.byUid || '' }));
    mem.forEach(m => { if (!cs.people.some(p => p.uid === m.uid)) cs.people.push({ key: m.uid, uid: m.uid, name: m.name, on: false, units: 2, custom: '' }); });
  }
  show({ name: 'create' }, root);
}

function spread(R, list, payerKey, w, out) {
  if (!list.length) return;
  const W = list.reduce((s, p) => s + w(p), 0) || 1;
  let sum = 0;
  const payer = list.find(p => p.key === payerKey);
  if (payer && list.length > 1) {
    list.forEach(p => { if (p !== payer) { out[p.key] = Math.floor(R * w(p) / W / 100) * 100; sum += out[p.key]; } });
    out[payer.key] = R - sum;
  } else {
    list.forEach(p => { out[p.key] = Math.floor(R * w(p) / W); sum += out[p.key]; });
    let extra = R - sum;
    for (let i = 0; extra > 0; i = (i + 1) % list.length) { out[list[i].key]++; extra--; }
  }
}
function compute() {
  const on = cs.people.filter(p => p.on), amt = {}, sub = {};
  let T = toS(cs.total);
  if (cs.mode === 'items') {
    const keys = on.map(p => p.key);
    let itemsS = 0;
    cs.items.forEach(it => {
      const P = toS(it.price), who = it.who.filter(k => keys.indexOf(k) > -1);
      itemsS += P;
      if (!who.length) return;
      const o = {}; spread(P, who.map(k => ({ key: k })), null, () => 1, o);
      who.forEach(k => { sub[k] = (sub[k] || 0) + o[k]; });
    });
    if (!cs.touched) { T = itemsS; cs.total = itemsS ? plain(itemsS) : ''; }
    const got = Object.values(sub).reduce((s, x) => s + x, 0);
    if (got && T) spread(T, on.filter(p => sub[p.key]), null, p => sub[p.key], amt);
  } else if (cs.mode === 'custom') {
    on.forEach(p => { if (!p.me) amt[p.key] = toS(p.custom); });
    const others = Object.values(amt).reduce((s, x) => s + x, 0);
    const me = on.find(p => p.me);
    if (me) amt.me = Math.max(0, T - others);
  } else spread(T, on, 'me', p => cs.mode === 'hours' ? p.units : 1, amt);
  const sum = on.reduce((s, p) => s + (amt[p.key] || 0), 0);
  return { T, amt, sub, sum, diff: T - sum };
}
function itemsTotal() { return cs.items.reduce((s, it) => s + toS(it.price), 0); }
function byName(uid) { if (uid === 'me') return 'ฉัน'; const p = cs.people.find(x => x.uid === uid); return p ? p.name : ''; }

function drawCreate() {
  $('#ttl').textContent = cs.edit ? 'แก้บิล' : 'สร้างบิล';
  const mem = cs.people.filter(p => !p.me && !p.out);
  $('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between"><h1>${cs.edit ? 'แก้บิล' : 'สร้างบิล'}</h1><span class="pill ink">โหมดคนจ่ายก่อน</span></div>
    <div class="sec" style="padding:12px 14px;display:flex;gap:12px">
      <label class="field" style="flex:1.4"><span class="lbl">ค่าอะไร</span><input id="cTitle" type="text" maxlength="60" placeholder="เช่น ชาบู ค่าคอร์ต" value="${esc(cs.title)}"></label>
      <label class="field" style="flex:1"><span class="lbl">ยอดรวม (บาท)</span><input id="cTotal" class="num" type="text" inputmode="decimal" placeholder="0" value="${esc(cs.total)}"></label>
    </div>
    <div class="tabs" role="group" aria-label="วิธีหาร">${MODES.map(([k, l]) => `<button type="button" class="tab" data-mode="${k}" aria-pressed="${cs.mode === k}">${l}</button>`).join('')}</div>
    ${cs.mode === 'items' && cs.touched && itemsTotal() && itemsTotal() !== toS(cs.total) ? `<div class="lbl" style="margin:-4px 4px 0">เมนูรวม ${baht(itemsTotal())} ไม่เท่ายอดบิล ส่วนต่าง (ค่าบริการ/ส่วนลด) แบ่งตามสัดส่วนที่แต่ละคนกิน</div>` : ''}
    <div class="lbl" style="margin:-4px 4px 0">${{ equal: 'ทุกคนที่ติ๊กจ่ายเท่ากัน เศษอยู่กับคนจ่ายก่อน', hours: 'กด − + ปรับจำนวนชั่วโมงของแต่ละคน มาน้อยจ่ายน้อย', items: 'ใส่เมนู แล้วแตะชื่อคนที่กินเมนูนั้น เมนูที่กินด้วยกันหารเท่ากัน', custom: 'ใส่ยอดของแต่ละคนเอง ยอดที่เหลือเป็นของคุณ' }[cs.mode]}</div>
    ${cs.mode === 'items' ? itemsBlock() : ''}
    <div class="sec list" id="people">
      ${cs.people.map(personRow).join('')}
      <button type="button" class="row-btn item" id="addOut"><span class="lnk" style="padding:0">+ เพิ่มคนนอกกลุ่ม</span></button>
    </div>
    ${mem.length ? '' : '<div class="lbl" style="padding:0 4px">ยังไม่มีชื่อเพื่อนในกลุ่ม ให้เพื่อนแตะ "ยอดของฉัน" ในการ์ดของบอทสักครั้ง หรือพิมพ์อะไรก็ได้ในกลุ่ม แล้วกลับมาที่หน้านี้ใหม่</div>'}
    ${payBlock()}`;
  bindCreate();
  foot(`<div class="sum"><span class="lbl" id="fl"></span><span id="fr" style="font-weight:600"></span></div><button class="btn ink" type="button" id="send">${cs.edit ? 'บันทึกและส่งบิลเข้ากลุ่ม' : 'ส่งบิลเข้ากลุ่ม'}</button>`);
  $('#send').onclick = submitCreate;
  refresh();
}
function personRow(p) {
  const i = cs.people.indexOf(p);
  let sub = '';
  if (p.me) sub = 'คุณจ่ายก่อน' + (p.on ? '' : ' · ไม่ได้หารด้วย');
  else if (p.out) sub = `ไม่อยู่ในกลุ่ม · <button type="button" class="lnk" data-by="${i}" style="padding:0;font-size:12px">${p.byUid ? esc(byName(p.byUid)) + ' จ่ายแทน' : 'ตามเก็บเอง'} (เปลี่ยน)</button>`;
  return `<div class="item ${p.on ? '' : ''}">
    <button type="button" class="chk" data-on="${i}" aria-pressed="${p.on}" aria-label="${p.on ? 'เอาออก' : 'ใส่'} ${esc(p.name)}">${CHECK}</button>
    <div class="mid ${p.on ? '' : 'dim'}"><div class="nm">${esc(p.name)}${p.me ? ' (ฉัน)' : ''}</div><div class="lbl" data-sub="${i}">${sub}</div></div>
    ${cs.mode === 'hours' && p.on ? `<div class="step"><button type="button" data-dec="${i}" aria-label="ลดของ ${esc(p.name)}">−</button><span class="num">${p.units} ${esc(cs.unit)}</span><button type="button" data-inc="${i}" aria-label="เพิ่มของ ${esc(p.name)}">+</button></div>` : ''}
    ${cs.mode === 'custom' && p.on && !p.me ? `<label><span class="sr">ยอดของ ${esc(p.name)}</span><input class="amt-in num" type="text" inputmode="decimal" data-cus="${i}" value="${esc(p.custom)}" placeholder="0"></label>` : ''}
    <div class="amt ${p.on ? '' : 'dim'}" style="min-width:64px" data-amt="${esc(p.key)}">—</div>
  </div>`;
}
function itemsBlock() {
  const on = cs.people.filter(p => p.on);
  return `<div class="sec list" id="items">
    <div class="sec-h" style="display:flex;justify-content:space-between;align-items:center"><span>เมนู</span><button type="button" class="lnk" id="readRc" style="padding:4px 0">อ่านจากรูปใบเสร็จ</button></div>
    ${cs.items.map((it, j) => `<div>
      <div class="item" style="padding-bottom:6px">
        <label style="flex:1"><span class="sr">ชื่อเมนู</span><input type="text" data-iname="${j}" value="${esc(it.name)}" placeholder="ชื่อเมนู" style="width:100%;border:0;border-bottom:1px solid var(--line);padding:4px 0;font-weight:600;background:transparent"></label>
        <label><span class="sr">ราคา</span><input class="amt-in num" type="text" inputmode="decimal" data-iprice="${j}" value="${esc(it.price)}" placeholder="ราคา"></label>
        <button type="button" class="ib" data-idel="${j}" aria-label="ลบเมนู ${esc(it.name)}" style="min-width:36px;height:36px"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="chips">${on.map(p => `<button type="button" class="chip" data-iwho="${j}" data-k="${esc(p.key)}" aria-pressed="${it.who.indexOf(p.key) > -1}">${esc(p.me ? 'ฉัน' : p.name)}</button>`).join('')}
        <button type="button" class="chip" data-iall="${j}">ทุกคน</button></div>
    </div>`).join('')}
    <button type="button" class="row-btn item" id="addItem"><span class="lnk" style="padding:0">+ เพิ่มเมนู</span></button>
  </div>`;
}
function payBlock() {
  const m = home.me;
  const t = m.qr ? 'QR รับเงินที่อัปไว้ · ใส่ยอดให้แต่ละคนเอง' : m.qrImg ? 'รูป QR ที่อัปไว้ · เพื่อนต้องพิมพ์ยอดเอง' : m.ppSet ? 'พร้อมเพย์ ' + m.pp + ' · ใส่ยอดให้แต่ละคนเอง' : 'ยังไม่ได้ตั้ง เพื่อนจะไม่มี QR สแกนจ่าย';
  return `<div class="sec item"><div class="mid"><div class="nm">รับเงินด้วย</div><div class="lbl">${esc(t)}</div></div><button type="button" class="lnk" id="chgPay">${m.qr || m.qrImg || m.ppSet ? 'เปลี่ยน' : 'ตั้งเลย'}</button></div>`;
}
function bindCreate() {
  const A = $('#app');
  $('#cTitle').oninput = e => { cs.title = e.target.value; };
  $('#cTotal').oninput = e => { cs.total = e.target.value; cs.touched = true; refresh(); };
  A.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { cs.mode = b.dataset.mode; if (cs.mode === 'items' && !cs.items.length) { cs.items.push({ name: '', price: '', who: [] }); cs.touched = !!toS(cs.total); } drawCreate(); });
  A.querySelectorAll('[data-on]').forEach(b => b.onclick = () => { const p = cs.people[+b.dataset.on]; p.on = !p.on; if (!p.on) cs.items.forEach(it => { it.who = it.who.filter(k => k !== p.key); }); drawCreate(); });
  A.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => { const p = cs.people[+b.dataset.inc]; p.units = Math.min(24, p.units + 0.5); drawCreate(); });
  A.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const p = cs.people[+b.dataset.dec]; p.units = Math.max(0.5, p.units - 0.5); drawCreate(); });
  A.querySelectorAll('[data-cus]').forEach(i => i.oninput = () => { cs.people[+i.dataset.cus].custom = i.value; refresh(); });
  A.querySelectorAll('[data-by]').forEach(b => b.onclick = () => pickBy(cs.people[+b.dataset.by]));
  $('#addOut').onclick = addOutsider;
  $('#chgPay').onclick = () => openMe();
  if (cs.mode === 'items') {
    A.querySelectorAll('[data-iname]').forEach(i => i.oninput = () => { cs.items[+i.dataset.iname].name = i.value; });
    A.querySelectorAll('[data-iprice]').forEach(i => i.oninput = () => { cs.items[+i.dataset.iprice].price = i.value; refresh(); });
    A.querySelectorAll('[data-idel]').forEach(b => b.onclick = () => { cs.items.splice(+b.dataset.idel, 1); drawCreate(); });
    A.querySelectorAll('[data-iwho]').forEach(b => b.onclick = () => { const it = cs.items[+b.dataset.iwho], k = b.dataset.k, x = it.who.indexOf(k); if (x > -1) it.who.splice(x, 1); else it.who.push(k); b.setAttribute('aria-pressed', x < 0); refresh(); });
    A.querySelectorAll('[data-iall]').forEach(b => b.onclick = () => { const it = cs.items[+b.dataset.iall]; it.who = cs.people.filter(p => p.on).map(p => p.key); drawCreate(); });
    $('#addItem').onclick = () => { cs.items.push({ name: '', price: '', who: [] }); drawCreate(); const ins = A.querySelectorAll('[data-iname]'); ins[ins.length - 1].focus(); };
    $('#readRc').onclick = readReceipt;
  }
}
function refresh() {
  const r = compute();
  cs.people.forEach(p => { const el = $(`[data-amt="${CSS.escape(p.key)}"]`); if (el) el.textContent = p.on ? baht(r.amt[p.key] || 0) : '—'; });
  if (cs.mode === 'items' && !cs.touched) { const t = $('#cTotal'); if (t && document.activeElement !== t) t.value = cs.total; }
  // คนที่จ่ายแทนคนนอกกลุ่ม: บอกยอดที่ต้องโอนรวม
  cs.people.forEach((p, i) => {
    if (p.me || p.out || !p.on) return;
    const prox = cs.people.filter(o => o.out && o.on && o.byUid === p.uid);
    const el = $(`[data-sub="${i}"]`);
    if (el) el.textContent = prox.length ? 'โอนรวม ' + baht((r.amt[p.key] || 0) + prox.reduce((s, o) => s + (r.amt[o.key] || 0), 0)) + ' (รวมของ' + prox.map(o => o.name).join(', ') + ')' : '';
  });
  const others = cs.people.filter(p => p.on && !p.me && p.byUid !== 'me');
  const fl = $('#fl'), fr = $('#fr');
  if (fl) fl.textContent = others.length + ' คนต้องจ่ายให้คุณ · รวม ' + baht(others.reduce((s, p) => s + (r.amt[p.key] || 0), 0));
  if (fr) { fr.textContent = !r.T ? 'ใส่ยอดรวม' : r.diff === 0 ? 'ยอดครบ ' + baht(r.T) : r.diff > 0 ? 'ยังขาด ' + baht(r.diff) : 'เกิน ' + baht(-r.diff); fr.style.color = r.T && r.diff === 0 ? 'var(--ok)' : 'var(--bad)'; }
  const s = $('#send'); if (s) s.disabled = !(r.T && r.diff === 0 && others.some(p => (r.amt[p.key] || 0) > 0));
  return r;
}
function dlg(html, bind) { $('#dlgIn').innerHTML = html; const d = $('#dlg'); if (!d.open) d.showModal(); bind && bind(d); }
function byOptions(sel) {
  const mem = cs.people.filter(p => !p.me && !p.out);
  return `<option value="">ไม่มี (ฉันตามเก็บเอง)</option><option value="me" ${sel === 'me' ? 'selected' : ''}>ฉันจ่ายแทน</option>` + mem.map(p => `<option value="${esc(p.uid)}" ${sel === p.uid ? 'selected' : ''}>${esc(p.name)} จ่ายแทน</option>`).join('');
}
function addOutsider() {
  dlg(`<h1 style="font-size:18px">เพิ่มคนนอกกลุ่ม</h1>
    <label class="field"><span class="lbl">ชื่อ</span><input id="oName" type="text" maxlength="30" placeholder="เช่น ต้น"></label>
    <label class="field"><span class="lbl">ใครจ่ายแทน</span><select id="oBy">${byOptions('')}</select></label>
    <div class="lbl">ยอดของคนนี้จะไปรวมกับคนที่จ่ายแทน และตอนทวงจะแท็กคนนั้น</div>
    <div class="row2"><button class="btn" type="button" id="oX">ยกเลิก</button><button class="btn ink" type="button" id="oOk">เพิ่ม</button></div>`, d => {
    $('#oName').focus();
    $('#oX').onclick = () => d.close();
    $('#oOk').onclick = () => {
      const n = $('#oName').value.trim().replace(/^\+/, '');
      if (!n) return $('#oName').focus();
      if (cs.people.some(p => p.out && p.name === n)) { toast('มีชื่อนี้แล้ว'); return; }
      cs.people.push({ key: 'o:' + n, uid: '', name: n, on: true, units: 2, custom: '', out: true, byUid: $('#oBy').value });
      d.close(); drawCreate();
    };
  });
}
function pickBy(p) {
  dlg(`<h1 style="font-size:18px">ใครจ่ายแทน ${esc(p.name)}</h1>
    <label class="field"><span class="lbl">เลือก</span><select id="oBy">${byOptions(p.byUid)}</select></label>
    <div class="row2"><button class="btn" type="button" id="oDel">เอาออกจากบิล</button><button class="btn ink" type="button" id="oOk">ตกลง</button></div>`, d => {
    $('#oOk').onclick = () => { p.byUid = $('#oBy').value; d.close(); drawCreate(); };
    $('#oDel').onclick = () => { cs.people.splice(cs.people.indexOf(p), 1); d.close(); drawCreate(); };
  });
}

async function shrink(file, max, q) {
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', q || 0.82).split(',')[1];
}
function pickFile() {
  return new Promise(ok => { const f = $('#file'); f.value = ''; f.onchange = () => ok(f.files[0] || null); f.click(); });
}
async function readReceipt() {
  const file = await pickFile();
  if (!file) return;
  const b = $('#readRc'); b.textContent = 'กำลังอ่าน…'; b.disabled = true;
  try {
    const r = await call('hk_read', { data: await shrink(file, 1600, 0.85) });
    if (r.items && r.items.length) {
      cs.items = [];
      r.items.forEach(it => {   // 3 จาน = แยก 3 แถว ให้แตะคนกินทีละจาน
        const q = Math.round(it.qty || 1), P = toS(it.price);
        if (q > 1 && q <= 10 && Math.abs(q - (it.qty || 1)) < 0.01) {
          const o = {}; spread(P, Array.from({ length: q }, (x, i) => ({ key: i })), null, () => 1, o);
          for (let i = 0; i < q; i++) cs.items.push({ name: it.name + ' (' + (i + 1) + '/' + q + ')', price: plain(o[i]), who: [] });
        } else cs.items.push({ name: it.name + (it.qty > 1 ? ' x' + it.qty : ''), price: String(it.price), who: [] });
      });
      if (r.service) cs.items.push({ name: 'ค่าบริการ', price: String(r.service), who: cs.people.filter(p => p.on).map(p => p.key) });
    }
    if (r.amount) { cs.total = String(r.amount); cs.touched = true; }
    if (!cs.title && r.vendor) cs.title = r.vendor;
    toast(r.items && r.items.length ? 'อ่านได้ ' + r.items.length + ' เมนู แตะชื่อคนที่กินแต่ละเมนู' : 'อ่านได้แค่ยอดรวม');
  } catch (e) { toast(e.message); }
  drawCreate();
}

async function submitCreate() {
  const r = refresh(), btn = $('#send');
  if (!cs.title.trim()) { $('#cTitle').focus(); toast('ใส่ชื่อบิลก่อน เช่น ชาบู'); return; }
  const me = cs.people.find(p => p.me);
  const itemsFor = k => cs.mode === 'items' ? cs.items.filter(it => it.who.indexOf(k) > -1).map(it => it.name || 'เมนู') : [];
  const payload = {
    b: cs.edit || '', title: cs.title.trim(), totalS: r.T, mode: cs.mode, unit: cs.unit, payerIn: me.on, payerShareS: me.on ? r.amt.me || 0 : 0, payerUnits: me.units, payerItems: itemsFor('me'),
    members: cs.people.filter(p => p.on && !p.me).map(p => ({ uid: p.uid, name: p.name, byUid: p.out ? p.byUid : '', amtS: r.amt[p.key] || 0, units: cs.mode === 'hours' ? p.units : 0, items: itemsFor(p.key) })),
    items: cs.mode === 'items' ? cs.items.map(it => ({ name: it.name || 'เมนู', priceS: toS(it.price), who: it.who })) : [],
  };
  busy(btn, true);
  try {
    const d = await call(cs.edit ? 'hk_edit' : 'hk_create', payload);
    const sent = await postToChat(d.msg);
    toast(sent ? 'ส่งบิลเข้ากลุ่มแล้ว' : 'บันทึกบิลแล้ว');
    await loadHome();
    stack = [];
    view = { name: 'track', bill: d.bill, unsent: !sent ? d.msg : null };
    draw();
  } catch (e) { toast(e.message); busy(btn, false); }
}

/* ===================== โหมดคนจ่ายก่อน: ติดตาม ===================== */
function groupsOf(bill) {   // รวมแถวตามคนที่ต้องโอน (คนนอกกลุ่มที่มีคนจ่ายแทน ไปรวมกับคนนั้น)
  const g = {};
  bill.rows.forEach(r => {
    const k = r.byMe ? 'self' : r.byUid ? 'r:' + r.byUid : r.uid ? 'r:' + r.uid : r.k;
    const x = g[k] = g[k] || { k: k, name: r.byMe ? 'ฉันจ่ายแทน' : r.by || r.name, rows: [], sumS: 0 };
    x.rows.push(r); x.sumS += r.amtS;
  });
  return Object.values(g).map(x => Object.assign(x, { st: x.rows.every(r => r.st === 'ok') ? 'ok' : x.rows.some(r => r.st === 'wait') ? (x.rows.some(r => r.st === 'told') ? 'told' : 'wait') : 'told', slip: x.rows.some(r => r.slip), extra: x.rows.filter(r => r.by || r.byMe).map(r => r.name) }));
}
function drawTrack() {
  const b = view.bill;
  $('#ttl').textContent = b.title;
  const gs = groupsOf(b).filter(x => x.k !== 'self');
  const total = gs.reduce((s, x) => s + x.sumS, 0), got = gs.filter(x => x.st === 'ok').reduce((s, x) => s + x.sumS, 0);
  const row = x => `<div class="item">
    <div class="mid"><div class="nm">${esc(x.name)} <span class="num h">${baht(x.sumS)}</span></div>
      <div class="lbl">${x.extra.length ? 'รวมของ' + esc(x.extra.join(', ')) + ' · ' : ''}${x.st === 'ok' ? 'ยืนยันแล้ว' : x.st === 'told' ? 'แจ้งโอนแล้ว · เช็กยอดในแอปธนาคารก่อนกด' : 'ยังไม่จ่าย'}
      ${x.slip ? ` · <button type="button" class="lnk" data-slip="${esc(x.k)}" style="padding:0;font-size:12.5px">ดูสลิป</button>` : ''}</div></div>
    ${x.st === 'ok' ? `<button type="button" class="pill ok" data-undo="${esc(x.k)}" style="border:0;cursor:pointer" aria-label="ยกเลิกการยืนยันของ ${esc(x.name)}">ได้เงินแล้ว</button>` : `<button type="button" class="btn sm ${x.st === 'told' ? 'ink' : ''}" data-ok="${esc(x.k)}">ได้เงินแล้ว</button>`}
  </div>`;
  $('#app').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div><h1>${esc(b.title)} ${baht(b.totalS)}</h1><div class="sub">${esc([b.group, thDate(b.date)].filter(Boolean).join(' · '))} · คุณจ่ายก่อน</div></div><span class="pill ink">คนจ่ายก่อน</span></div>
    ${view.unsent ? `<div class="err">ยังไม่ได้ส่งการ์ดบิลเข้ากลุ่ม <button type="button" class="lnk" id="resend" style="padding:0">ส่งเข้ากลุ่ม</button></div>` : ''}
    <div class="sec" style="padding:14px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>ได้คืนแล้ว <b class="num">${baht(got)}</b> จาก ${baht(total)}</span><span class="lbl">${gs.filter(x => x.st === 'ok').length}/${gs.length} คน</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${total ? Math.round(got / total * 100) : 100}%"></i></div></div>
    <div class="sec list"><div class="sec-h">แต่ละคน</div>${gs.map(row).join('') || '<div class="empty">ไม่มีใครต้องจ่าย</div>'}</div>
    <div class="row2"><button class="btn" type="button" id="nag">ทวงในกลุ่ม</button><button class="btn" type="button" id="edit">แก้ยอด</button></div>
    <div class="row2"><button class="btn" type="button" id="card">ส่งการ์ดบิลอีกครั้ง</button><button class="btn" type="button" id="del">ลบบิล</button></div>
    <div class="lbl" style="padding:0 4px">ทวงในกลุ่มจะแท็กเฉพาะคนที่ยังไม่จ่าย และไม่โชว์ยอดของใคร</div>`;
  const A = $('#app');
  A.querySelectorAll('[data-ok]').forEach(x => x.onclick = () => setOk(x.dataset.ok, false, x));
  A.querySelectorAll('[data-undo]').forEach(x => x.onclick = () => { if (confirm('ยกเลิกการยืนยันว่าได้เงินแล้ว?')) setOk(x.dataset.undo, true, x); });
  A.querySelectorAll('[data-slip]').forEach(x => x.onclick = () => showSlip(x.dataset.slip));
  $('#nag').onclick = async () => {
    if (!gs.some(x => x.st === 'wait')) { toast('ทุกคนแจ้งโอนแล้ว'); return; }
    const ok = await postToChat({ type: 'text', text: 'ทวงหน่อย ' + b.title });
    toast(ok ? 'ส่งแล้ว บอทจะแท็กคนที่ยังไม่จ่าย' : 'เปิดจากในกลุ่มก่อน หรือพิมพ์ ทวง ในกลุ่ม');
  };
  $('#edit').onclick = () => openCreate(b);
  $('#card').onclick = async () => { try { const d = await call('hk_card', { b: b.id }); const ok = await postToChat(d.msg); toast(ok ? 'ส่งแล้ว' : 'เปิดจากในกลุ่มก่อนจึงส่งได้'); } catch (e) { toast(e.message); } };
  $('#del').onclick = async () => {
    if (!confirm('ลบบิล ' + b.title + '?\nถ้ามีคนโอนมาแล้ว ต้องคืนเงินกันเอง')) return;
    try { await call('hk_void', { b: b.id }); await loadHome(); toast('ลบบิลแล้ว'); show('home', true); } catch (e) { toast(e.message); }
  };
  const rs = $('#resend'); if (rs) rs.onclick = async () => { const ok = await postToChat(view.unsent); if (ok) { view.unsent = null; drawTrack(); } else toast('ส่งได้เมื่อเปิดจากในกลุ่ม'); };
}
async function setOk(k, undo, btn) {
  busy(btn, true);
  try { const d = await call('hk_ok', { b: view.bill.id, k: k, undo: !!undo }); view.bill = d.bill; loadHome().catch(() => {}); drawTrack(); }
  catch (e) { toast(e.message); busy(btn, false); }
}
async function showSlip(k) {
  dlg('<div class="spin" role="status" aria-label="กำลังโหลด"></div>');
  try {
    const d = await call('hk_slip', { b: view.bill.id, k: k });
    dlg(`<img alt="สลิปโอนเงิน" src="data:image/jpeg;base64,${d.data}" style="width:100%;border-radius:10px"><button class="btn" type="button" id="dX">ปิด</button>`, dd => { $('#dX').onclick = () => dd.close(); });
  } catch (e) { $('#dlg').close(); toast(e.message); }
}

/* ===================== โหมดคนที่ต้องจ่าย ===================== */
function crc16(s) { let c = 0xFFFF; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
function ppPayload(id, amountS) {
  const f = (t, v) => t + String(v.length).padStart(2, '0') + v;
  const acc = id.length === 10 ? f('01', '0066' + id.slice(1)) : id.length === 13 ? f('02', id) : f('03', id);
  const s = f('00', '01') + f('01', amountS ? '12' : '11') + f('29', f('00', 'A000000677010111') + acc) + f('58', 'TH') + f('53', '764') + (amountS ? f('54', (amountS / 100).toFixed(2)) : '') + '6304';
  return s + crc16(s);
}
/** QR รับเงินที่อัปไว้ (EMVCo) → ใส่ยอดเข้าไป */
function emvAmount(s, amountS) {
  const t = []; let i = 0;
  while (i < s.length) { const id = s.substr(i, 2), n = parseInt(s.substr(i + 2, 2), 10); if (!/^\d\d$/.test(id) || isNaN(n)) return ''; t.push([id, s.substr(i + 4, n)]); i += 4 + n; }
  if (i !== s.length) return '';
  const f = t.filter(x => x[0] !== '54' && x[0] !== '63');
  const p = f.find(x => x[0] === '01'); if (p) p[1] = '12'; else f.splice(1, 0, ['01', '12']);
  let at = f.findIndex(x => +x[0] > 54); if (at < 0) at = f.length;
  f.splice(at, 0, ['54', (amountS / 100).toFixed(2)]);
  const str = f.map(x => x[0] + String(x[1].length).padStart(2, '0') + x[1]).join('') + '6304';
  return str + crc16(str);
}
function qrCanvas(text, label, sub) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = 8, pad = 4 * cell, W = n * cell + pad * 2, H = W + 70;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#0b2c5f';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, pad + r * cell, cell, cell);
  g.textAlign = 'center'; g.font = 'bold 26px sans-serif'; g.fillText(label, W / 2, W + 18);
  g.font = '18px sans-serif'; g.fillStyle = '#555'; g.fillText(String(sub || '').slice(0, 32), W / 2, W + 48);
  return c;
}
let payCanvas = null;
function drawPay() {
  const b = view.bill, due = b.dueS, pay = b.pay || {};
  $('#ttl').textContent = b.title;
  $('#foot').classList.add('hide');
  const st = due ? 'wait' : b.mine.every(m => m.st === 'ok') ? 'ok' : 'told';
  const brk = b.mine.map(m => {
    const what = m.byMe ? `${esc(m.name)} <span class="lbl">ฉันจ่ายแทน</span>` : 'ของฉัน';
    const det = m.units ? ' · ' + m.units + ' ' + esc(b.unit) : m.items && m.items.length ? ' · ' + esc(m.items.join(', ')) : '';
    return `<div><span>${what}${det}</span><span class="num">${baht(m.amtS)}</span></div>`;
  }).join('');
  let qr = '', qrNote = '';
  payCanvas = null;
  if (st === 'wait') {
    const text = pay.qr ? emvAmount(pay.qr, due) : pay.pp ? ppPayload(pay.pp, due) : '';
    if (text) {
      try { payCanvas = qrCanvas(text, 'จ่าย ' + baht(due), b.title); qr = `<img alt="QR จ่าย ${baht(due)} ให้ ${esc(b.payer)}" src="${payCanvas.toDataURL('image/png')}">`; qrNote = (pay.qr ? 'QR ของ ' : 'พร้อมเพย์ของ ') + esc(b.payer) + ' · ใส่ยอด ' + baht(due) + ' ให้แล้ว'; } catch (e) {}
    } else if (pay.qrImg) { qr = '<div id="qrImg"><div class="spin" role="status" aria-label="กำลังโหลด QR"></div></div>'; qrNote = 'QR ของ ' + esc(b.payer) + ' · ตอนโอนพิมพ์ยอด ' + baht(due) + ' เอง'; }
    else qrNote = esc(b.payer) + ' ยังไม่ได้ตั้ง QR หรือพร้อมเพย์ ถามช่องทางโอนจากเจ้าตัวได้เลย';
  }
  const others = (b.others || []).map(o => `<div class="item" style="padding:8px 14px"><div class="mid">${esc(o.name)}</div><span class="pill ${o.st === 'wait' ? 'warn' : 'ok'}">${o.st === 'wait' ? 'ยังไม่จ่าย' : o.st === 'ok' ? 'ได้รับแล้ว' : 'โอนแล้ว'}</span></div>`).join('');
  $('#app').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div class="lbl">${esc([b.title, b.group].filter(Boolean).join(' · '))} · เห็นเฉพาะยอดของคุณ</div><span class="pill soft">คนที่ต้องจ่าย</span></div>
    <div class="sec qrbox">
      ${st !== 'wait' ? '<img src="jod-cheer.png?v=100" alt="" style="width:88px;height:88px;image-rendering:auto">' : ''}
      <div class="lbl">${st === 'wait' ? 'ต้องโอนให้ ' + esc(b.payer) : st === 'told' ? 'แจ้งโอนแล้ว รอ ' + esc(b.payer) + ' ยืนยัน' : esc(b.payer) + ' ได้รับเงินแล้ว'}</div>
      <div class="due">${baht(st === 'wait' ? due : b.sumS)}</div>
      <div class="brk">${brk}</div>
      ${qr ? `<div style="margin-top:10px">${qr}</div>` : ''}
      ${qrNote ? `<div class="lbl" style="text-align:center">${qrNote}</div>` : ''}
    </div>
    ${st === 'wait' ? `<div class="row2">${payCanvas ? '<button class="btn" type="button" id="saveQr">บันทึกรูป QR</button>' : ''}<button class="btn" type="button" id="slip">แนบสลิป</button></div>
      <div class="lbl hide" id="slipOk" style="text-align:center"></div>` : ''}
    ${others ? `<div class="sec list"><div class="sec-h">คนอื่นในบิล</div>${others}</div>` : ''}`;
  if (st === 'wait') {
    foot('<button class="btn ink" type="button" id="paid">ฉันโอนแล้ว</button>');
    $('#paid').onclick = markPaid;
    $('#slip').onclick = attachSlip;
    const sq = $('#saveQr'); if (sq) sq.onclick = saveQr;
    if (pay.qrImg && !pay.qr && !pay.pp) loadQrImg();
  }
}
async function loadQrImg() {
  try { const d = await call('hk_qrimg', { b: view.bill.id }); const el = $('#qrImg'); if (el) el.innerHTML = `<img class="photo" alt="QR รับเงินของ ${esc(view.bill.payer)}" src="data:image/jpeg;base64,${d.data}">`; }
  catch (e) { const el = $('#qrImg'); if (el) el.textContent = e.message; }
}
function saveQr() {
  payCanvas.toBlob(async blob => {
    const file = new File([blob], 'qr-' + plain(view.bill.dueS) + '.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('ถ้าบันทึกไม่ได้ ให้กดค้างที่รูป QR แล้วเลือกบันทึกรูป');
  });
}
let slipData = '';
async function attachSlip() {
  const f = await pickFile();
  if (!f) return;
  slipData = await shrink(f, 1200, 0.8);
  const el = $('#slipOk'); el.textContent = 'แนบสลิปแล้ว จะส่งให้ ' + view.bill.payer + ' ตอนกด ฉันโอนแล้ว'; el.classList.remove('hide');
  $('#slip').textContent = 'เปลี่ยนสลิป';
}
async function markPaid() {
  const btn = $('#paid'); busy(btn, true);
  try {
    const d = await call('hk_paid', { b: view.bill.id, slip: slipData || '' });
    slipData = '';
    view.bill = d.bill;
    if (d.text) await postToChat({ type: 'text', text: d.text });
    toast('แจ้ง ' + view.bill.payer + ' แล้ว');
    loadHome().catch(() => {});
    drawPay();
  } catch (e) { toast(e.message); busy(btn, false); }
}

/* ===================== ชื่อ + ช่องทางรับเงิน ===================== */
function openMe() {
  const m = home.me;
  const cur = m.qr ? 'QR รับเงิน (ใส่ยอดให้เพื่อนได้)' : m.qrImg ? 'รูป QR (เพื่อนต้องพิมพ์ยอดเอง)' : m.ppSet ? 'พร้อมเพย์ ' + m.pp : 'ยังไม่ได้ตั้ง';
  dlg(`<h1 style="font-size:18px">ชื่อและช่องทางรับเงิน</h1>
    <label class="field"><span class="lbl">ชื่อที่เพื่อนเห็น (ชื่อ LINE: ${esc(m.name || '-')})</span><input id="mNick" type="text" maxlength="30" value="${esc(m.nick)}" placeholder="${esc(m.name || 'ชื่อเล่น')}"></label>
    <div class="lbl">ถ้าเพื่อนเคยใส่ชื่อนี้เป็น "คนนอกกลุ่ม" ไว้ ยอดนั้นจะย้ายมาเป็นของบัญชีนี้</div>
    <div class="sec item" style="padding:10px 12px"><div class="mid"><div class="nm">รับเงินด้วย</div><div class="lbl">${esc(cur)}</div></div></div>
    <button class="btn" type="button" id="mQr">อัปรูป QR รับเงิน (จากแอปธนาคาร)</button>
    <label class="field"><span class="lbl">หรือใส่พร้อมเพย์ (เบอร์ 10 หลัก / เลข 13 หลัก)</span><input id="mPp" type="text" inputmode="numeric" placeholder="08xxxxxxxx"></label>
    <div class="row2"><button class="btn" type="button" id="mX">ปิด</button><button class="btn ink" type="button" id="mOk">บันทึก</button></div>`, d => {
    $('#mX').onclick = () => d.close();
    $('#mQr').onclick = async () => {
      const f = await pickFile(); if (!f) return;
      $('#mQr').textContent = 'กำลังอ่าน QR…';
      try {
        let text = '';
        if ('BarcodeDetector' in window) { try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(await createImageBitmap(f)); text = (r[0] && r[0].rawValue) || ''; } catch (e) {} }
        const res = text && /^000201/.test(text) ? await call('hk_me_set', { qr: text }) : await call('hk_me_set', { qrImg: await shrink(f, 900, 0.9) });
        home.me = res.me;
        toast(res.me.qr ? 'บันทึก QR แล้ว เพื่อนจะได้ QR พร้อมยอด' : 'บันทึกรูป QR แล้ว (เครื่องนี้อ่าน QR ไม่ได้ เพื่อนต้องพิมพ์ยอดเอง)');
        d.close(); draw();
      } catch (e) { toast(e.message); $('#mQr').textContent = 'อัปรูป QR รับเงิน (จากแอปธนาคาร)'; }
    };
    $('#mOk').onclick = async () => {
      const p = {}, nick = $('#mNick').value.trim(), pp = $('#mPp').value.trim();
      if (nick !== m.nick) p.nick = nick;
      if (pp) p.pp = pp;
      if (!Object.keys(p).length) return d.close();
      try { const res = await call('hk_me_set', p); home.me = res.me; d.close(); toast(res.me.claimed || 'บันทึกแล้ว'); await loadHome(); draw(); }
      catch (e) { toast(e.message); }
    };
  });
}

boot();
