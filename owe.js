/* จดครบ — 🤝 ค้างกัน: ให้ยืม / ยืมเขา / หารกัน (เท่ากัน · ระบุเอง · ตามเมนู · ทริปหลายบิล) + ทยอยคืน
 * ใช้ตัวช่วยจาก money.js: $, api, baht, esc, uid, today, toast, showStatus, items, upsert, guessCat, prepare
 * หลักบัญชี: ให้ยืม/รับคืน ไม่นับเป็นรายจ่าย/รายรับ · หารกัน = จดรายจ่ายเฉพาะส่วนของเรา · "ไม่ทวงแล้ว" = ย้ายยอดที่เหลือไปเป็นรายจ่าย
 */
const ME = 'ฉัน';   // ค่าภายใน (ห้ามเปลี่ยน) ชื่อที่แสดงตั้งได้ที่ myName()
const myName = () => { try { return (localStorage.getItem('myName') || '').trim(); } catch (e) { return ''; } };
const who = p => p === ME ? (myName() || ME) : p;                 // ชื่อที่แสดงในหน้าจอ
const whoMsg = p => p === ME ? (myName() || 'ผม') : p;           // ชื่อในข้อความที่ส่งเพื่อน
let owe = LS.get('owe', []);
let oweLoaded = false;

/* ---------- เงินเป็นสตางค์ (กันเศษทศนิยมเพี้ยน) ---------- */
const toS = v => Math.round(Number(String(v ?? '').replace(/[,\s฿]/g, '')) * 100) || 0;
const fromS = s => s / 100;
const bahtS = s => baht(fromS(s));

const debts = () => owe.filter(d => d.kind === 'debt');
const splits = () => owe.filter(d => d.kind === 'split');
const paidS = d => (d.payments || []).reduce((s, p) => s + toS(p.amount), 0);
const leftS = d => d.status === 'forgiven' ? 0 : Math.max(0, toS(d.amount) - paidS(d));
const isOpen = d => d.status !== 'forgiven' && leftS(d) > 0;
const peopleAll = () => [...new Set(owe.flatMap(d => d.kind === 'debt' ? [d.person] : (d.people || [])).filter(p => p && p !== ME))].sort((a, b) => a.localeCompare(b, 'th'));
const initial = n => (String(n || '?').trim().replace(/^[เแโใไ]/, '') || '?').charAt(0);
const fmtD = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

async function syncOwe() {
  if (!cfg.key) return;
  try { owe = (await api('owe_list')).docs; LS.set('owe', owe); oweLoaded = true; rerender(); }
  catch (e) { showStatus('ดึงข้อมูลค้างกันไม่สำเร็จ: ' + e.message); }
}
function putLocal(docs) { docs.forEach(d => { const i = owe.findIndex(x => x.id === d.id); if (i > -1) owe[i] = d; else owe.push(d); }); LS.set('owe', owe); }
async function saveDocs(docs) {
  putLocal(docs); rerender();
  try { const r = await api('owe_save', { docs }); putLocal(r.docs); }
  catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
}
async function delDocs(ids) {
  owe = owe.filter(d => !ids.includes(d.id)); LS.set('owe', owe); rerender();
  try { await api('owe_delete', { ids }); } catch (e) { showStatus('ลบไม่สำเร็จ: ' + e.message); }
}
/* รายจ่ายในหน้าเงิน (ส่วนของเราในบิลหาร / ยอดที่ไม่ทวงแล้ว) */
function rerender() { if ($('#vOwe') && view === 'owe') renderOwe(); if ($('#spList')) renderSplits(); }
async function moneyPut(id, data) {
  const m = { id: id || uid(), type: 'out', pay: '', ...data };
  upsert(m);
  try { const r = await api('money_save', { item: m }); upsert(r.item); } catch (e) { showStatus('จดรายจ่ายไม่สำเร็จ: ' + e.message); }
  return m.id;
}
async function moneyDel(id) {
  if (!id) return;
  items = items.filter(x => x.id !== id); LS.set('money', items);
  try { await api('money_delete', { id }); } catch (e) {}
}

/* ---------- ภาพรวม ---------- */
function byPerson() {
  const map = {};
  debts().forEach(d => {
    const p = map[d.person] = map[d.person] || { name: d.person, they: 0, me: 0, all: [], open: [], total: 0, paid: 0, due: '' };
    p.all.push(d);
    if (isOpen(d)) {
      p.open.push(d);
      p[d.dir] += leftS(d);
      p.total += toS(d.amount); p.paid += paidS(d);
      if (d.due && (!p.due || d.due < p.due)) p.due = d.due;
    }
  });
  return Object.values(map);
}

function renderOwe() {
  const ps = byPerson();
  const T = ps.reduce((s, p) => s + p.they, 0), M = ps.reduce((s, p) => s + p.me, 0);
  $('#owThey').textContent = bahtS(T);
  $('#owMe').textContent = bahtS(M);
  $('#owThey').classList.toggle('zero', !T); $('#owMe').classList.toggle('zero', !M);
  $('#owPeople').innerHTML = peopleAll().map(p => `<option value="${esc(p)}">`).join('');
  const open = ps.filter(p => p.open.length).sort((a, b) => (b.they + b.me) - (a.they + a.me));
  const closed = ps.filter(p => !p.open.length);
  const box = $('#owList');
  if (!open.length) {
    box.innerHTML = `<p class="empty">${debts().length ? 'ไม่มีใครค้างแล้ว 🎉' : 'ยังไม่มีรายการ<br>แตะ 💸 ให้ยืม · 🙏 ยืมเขา ด้านบนเพื่อเริ่มจด<br><small>หารค่าใช้จ่ายกับเพื่อน ไปที่เมนู 🍜 หาร ด้านล่าง</small>'}</p>`;
  } else box.innerHTML = '';
  open.forEach(p => box.appendChild(personCard(p)));
  $('#owClosed').hidden = !closed.length;
  $('#owClosed summary').textContent = `▾ ปิดบัญชีแล้ว ${closed.length} คน`;
  $('#owClosedList').innerHTML = '';
  closed.forEach(p => $('#owClosedList').appendChild(personCard(p, true)));
  const hint = $('#owSplitHint'); if (hint) hint.hidden = !splits().length;
}

function personCard(p, closed) {
  const el = document.createElement('div');
  el.className = 'ow-card' + (closed ? ' closed' : '');
  const net = p.they - p.me;
  const sub = p.open.map(d => d.title || (d.splitId ? 'หารกัน' : d.dir === 'they' ? 'ยืม' : 'เรายืม')).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3).join(' · ');
  const pct = p.total ? Math.round(p.paid / p.total * 100) : 0;
  const tag = closed ? '<span class="tag ok">ครบแล้ว</span>' : p.paid ? '<span class="tag">ทยอยคืน</span>' : p.me && !p.they ? '<span class="tag">เราค้าง</span>' : '';
  el.innerHTML = `<div class="ow-row"><span class="av${net < 0 ? ' neg' : ''}">${esc(initial(p.name))}</span>
    <div class="ow-mid"><b>${esc(p.name)}</b> ${tag}<div class="meta">${closed ? 'ไม่มียอดค้าง' : esc(sub)}${p.due && !closed ? ' · นัดคืน ' + fmtD(p.due) : ''}</div></div>
    ${closed ? '' : `<b class="${net >= 0 ? 'in' : 'out'}">${bahtS(Math.abs(net))}</b>`}</div>
    ${closed ? '' : `<div class="ow-bar"><i style="width:${pct}%"></i></div>
    <div class="btns"><button type="button" class="mini p">💵 ${net >= 0 ? 'รับคืน' : 'จ่ายคืน'}</button><button type="button" class="mini d">✅ ครบแล้ว</button><button type="button" class="mini n">💬 ทวง</button></div>`}`;
  el.querySelector('.ow-row').onclick = () => openPerson(p.name);
  if (!closed) {
    el.querySelector('.p').onclick = () => openPerson(p.name, true);
    el.querySelector('.d').onclick = () => settleAll(p.name);
    el.querySelector('.n').onclick = () => openPerson(p.name, false, true);
  }
  return el;
}

/* ---------- ให้ยืม / ยืมเขา ---------- */
let oEditing = null;
function openLoan(dir, d) {
  oEditing = d || null;
  const f = $('#oForm').elements;
  const v = d ? d.dir : dir;
  $('#oForm').dataset.dir = v;
  paintDir();
  f.person.value = d ? d.person : '';
  f.amount.value = d ? d.amount : '';
  f.date.value = d ? d.date : today();
  f.title.value = d ? d.title || '' : '';
  f.due.value = d ? d.due || '' : '';
  f.note.value = d ? d.note || '' : '';
  $('#oDel').hidden = !d;
  paintLoanPick();
  $('#oTitle').textContent = d ? 'แก้รายการ' : v === 'they' ? '💸 ให้ยืม' : '🙏 ยืมเขา';
  $('#oDlg').showModal();
}
function paintLoanPick() {
  const f = $('#oForm').elements, box = $('#oPick');
  if (!box) return;
  const cur = f.person.value.trim();
  quickPick(box, peopleStats().filter(s => s.name !== cur).map(s => ({ key: s.name, label: s.name, n: s.n, last: s.last })),
    n => { f.person.value = n; paintLoanPick(); f.amount.focus(); }, { plus: false });
}
if ($('#oDlg')) $('#oForm').elements.person.addEventListener('input', () => paintLoanPick());
function paintDir() { $('#oDir').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === $('#oForm').dataset.dir)); }
if ($('#oDlg')) $('#oDir').onclick = e => { const b = e.target.closest('button'); if (b) { $('#oForm').dataset.dir = b.dataset.v; paintDir(); } };
if ($('#oDlg')) $('#oCancel').onclick = () => $('#oDlg').close();
if ($('#oDlg')) $('#oForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target.elements;
  const a = toS(f.amount.value);
  if (!(a > 0)) { alert('ใส่จำนวนเงินด้วยครับ'); return; }
  const d = Object.assign(oEditing || { id: uid(), kind: 'debt', payments: [], status: 'open', created: today() }, {
    person: f.person.value.trim(), dir: e.target.dataset.dir, amount: fromS(a), date: f.date.value || today(),
    title: f.title.value.trim(), due: f.due.value, note: f.note.value.trim(),
  });
  if (!d.person) return;
  d.status = d.status === 'forgiven' ? 'forgiven' : leftS(d) ? 'open' : 'done';
  $('#oDlg').close();
  saveDocs([d]);
  toast(`${d.dir === 'they' ? '💸 ' + d.person + ' ยืม' : '🙏 ยืม ' + d.person} ${bahtS(a)}`, () => delDocs([d.id]));
});
if ($('#oDlg')) $('#oDel').onclick = () => {
  if (!oEditing) return;
  if (oEditing.splitId) { alert('รายการนี้มาจากบิลหารกัน ให้ลบหรือแก้ที่บิลแทน'); return; }
  if (!confirm('ลบรายการนี้ (รวมประวัติการคืน)?')) return;
  const d = oEditing; $('#oDlg').close(); moneyDel(d.moneyId); delDocs([d.id]);
  if ($('#pDlg').open) $('#pDlg').close();
};
document.querySelectorAll('.ow-new').forEach(b => b.onclick = () => b.dataset.k === 'split' ? (location.href = 'split.html') : openLoan(b.dataset.k));

/* ---------- รายละเอียดคน + ทยอยคืน ---------- */
let pName = '', pSlip = null;
function openPerson(name, focusPay, focusNudge) {
  pName = name; pSlip = null;
  $('#pSlipBtn').textContent = '📷 แนบ';
  paintPerson();
  $('#pDlg').showModal();
  if (focusPay) setTimeout(() => $('#pAmt').focus(), 80);
  if (focusNudge) setTimeout(() => $('#pNudge').scrollIntoView({ block: 'center' }), 80);
}
function paintPerson() {
  const p = byPerson().find(x => x.name === pName) || { name: pName, they: 0, me: 0, all: [], open: [], total: 0, paid: 0 };
  const net = p.they - p.me, dir = net >= 0 ? 'they' : 'me';
  $('#pAv').textContent = initial(pName);
  $('#pAv').classList.toggle('neg', net < 0);
  $('#pName').textContent = pName;
  $('#pBal').innerHTML = !p.open.length ? 'ไม่มียอดค้าง ✓' : `${net >= 0 ? 'ค้างเราอยู่' : 'เราค้างอยู่'} <b class="${net >= 0 ? 'in' : 'out'}">${bahtS(Math.abs(net))}</b> จาก ${bahtS(p.total)}`;
  $('#pBar').style.width = (p.total ? Math.round(p.paid / p.total * 100) : 0) + '%';
  $('#pPay').hidden = !p.open.length;
  $('#pPayTitle').textContent = dir === 'they' ? '💵 รับคืนเงิน' : '💵 เราจ่ายคืน';
  const left = Math.abs(net);
  const opts = [...new Set([left, ...[100, 200, 500, 1000].map(x => x * 100).filter(x => x < left)].slice(0, 4))];
  $('#pAmts').innerHTML = opts.map(s => `<button type="button" data-s="${s}">${s === left ? 'ทั้งหมด ' : ''}${bahtS(s)}</button>`).join('');
  $('#pAmts').onclick = e => { const b = e.target.closest('button'); if (b) { $('#pAmt').value = fromS(+b.dataset.s); $('#pAmts').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); } };
  $('#pAmt').value = ''; $('#pDate').value = today();
  // ที่ยังค้าง
  $('#pOpen').innerHTML = p.open.length ? '' : '<p class="hint">—</p>';
  p.open.sort((a, b) => a.date.localeCompare(b.date)).forEach(d => {
    const el = document.createElement('div');
    el.className = 'p-debt';
    el.innerHTML = `<div class="grow"><b>${esc(d.title || (d.dir === 'they' ? 'ยืม' : 'เรายืม'))}</b><div class="meta">${fmtD(d.date)} · ${d.dir === 'they' ? 'เขาค้าง' : 'เราค้าง'} ${bahtS(leftS(d))} จาก ${bahtS(toS(d.amount))}${d.due ? ' · นัดคืน ' + fmtD(d.due) : ''}</div></div>
      <button type="button" class="mini e" aria-label="แก้">✏️</button><button type="button" class="mini f">${d.dir === 'they' ? 'ไม่ทวงแล้ว' : 'เขายกให้'}</button>`;
    el.querySelector('.e').onclick = () => d.splitId ? ($('#sDlg') ? openSplit(splits().find(s => s.id === d.splitId)) : (location.href = 'split.html#' + d.splitId)) : ($('#oDlg') ? openLoan(null, d) : (location.href = 'money.html'));
    el.querySelector('.f').onclick = () => forgive(d);
    $('#pOpen').appendChild(el);
  });
  // ประวัติ
  const ev = [];
  p.all.forEach(d => {
    ev.push({ date: d.date, html: `${d.dir === 'they' ? (d.splitId ? 'หาร' : 'ยืม') : (d.splitId ? 'เราค้าง (หาร)' : 'เรายืม')} <b>${bahtS(toS(d.amount))}</b> <span class="meta">${esc(d.title || '')}${d.status === 'forgiven' ? ' · ไม่ทวงแล้ว' : ''}</span>` });
    (d.payments || []).forEach(x => ev.push({ date: x.date, pay: 1, d, x, html: `${d.dir === 'they' ? 'คืน' : 'เราจ่ายคืน'} <b class="in">${bahtS(toS(x.amount))}</b> <span class="meta">${esc(x.via || '')}</span>${x.file ? ` <a class="tag ok" href="${esc(x.file.url)}" target="_blank" rel="noopener">สลิป</a>` : ''}` }));
  });
  ev.sort((a, b) => b.date.localeCompare(a.date));
  $('#pTl').innerHTML = '';
  ev.forEach(e => {
    const el = document.createElement('p');
    if (e.pay) el.className = 'pay';
    el.innerHTML = `${fmtD(e.date)} · ${e.html}` + (e.pay ? ' <button type="button" class="link-btn">ลบ</button>' : '');
    if (e.pay) el.querySelector('.link-btn').onclick = () => { if (confirm('ลบการคืนเงินครั้งนี้?')) { e.d.payments = e.d.payments.filter(y => y !== e.x); e.d.status = leftS(e.d) ? 'open' : 'done'; saveDocs([e.d]); paintPerson(); } };
    $('#pTl').appendChild(el);
  });
  // ข้อความทวง
  const msg = net > 0
    ? `${pName} ยอดค้าง${p.open.filter(d => d.dir === 'they').map(d => d.title).filter(Boolean).slice(0, 3).join(', ') ? ' (' + p.open.filter(d => d.dir === 'they').map(d => d.title).filter(Boolean).slice(0, 3).join(', ') + ')' : ''} เหลือ ${fromS(net).toLocaleString('th-TH')} บาทนะ สะดวกโอนเมื่อไหร่บอกได้เลย 🙏`
    : '';
  $('#pNudge').hidden = !msg;
  $('#pMsg').textContent = msg;
  $('#pLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(msg);
}
$('#pCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#pMsg').textContent); $('#pCopy').textContent = '✓ ก็อปแล้ว'; setTimeout(() => $('#pCopy').textContent = '📋 ก็อป', 1500); } catch {} };
$('#pClose').onclick = () => $('#pDlg').close();
$('#pSlipBtn').onclick = () => $('#pSlip').click();
$('#pSlip').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { pSlip = await prepare(file); $('#pSlipBtn').textContent = '📎 แนบแล้ว'; } catch (err) { alert(err.message); }
});

/* จ่ายคืน: ตัดรายการเก่าสุดก่อน (FIFO) */
function applyPay(name, amountS, date, via, file) {
  const p = byPerson().find(x => x.name === name);
  if (!p) return [];
  const net = p.they - p.me, dir = net >= 0 ? 'they' : 'me';
  let rest = amountS;
  const changed = [];
  p.open.filter(d => d.dir === dir).sort((a, b) => a.date.localeCompare(b.date)).forEach(d => {
    if (rest <= 0) return;
    const take = Math.min(rest, leftS(d));
    d.payments = [...(d.payments || []), { id: uid(), date, amount: fromS(take), via, file: file || null }];
    d.status = leftS(d) ? 'open' : 'done';
    rest -= take;
    changed.push(d);
  });
  return changed;
}
$('#pSave').onclick = async () => {
  const a = toS($('#pAmt').value);
  if (!(a > 0)) { alert('ใส่ยอดที่คืนครับ'); return; }
  const p = byPerson().find(x => x.name === pName);
  const left = Math.abs(p.they - p.me);
  if (a > left && !confirm(`ยอดเกินที่ค้าง (${bahtS(left)}) จะบันทึกแค่ ${bahtS(left)} ต่อไหม?`)) return;
  const btn = $('#pSave'); btn.disabled = true;
  let file = null;
  try {
    if (pSlip) { btn.textContent = 'กำลังส่งสลิป…'; file = (await api('owe_slip', { ...pSlip, date: $('#pDate').value, label: pName })).file; }
  } catch (e) { showStatus('ส่งสลิปไม่สำเร็จ: ' + e.message); }
  const changed = applyPay(pName, Math.min(a, left), $('#pDate').value || today(), $('#pVia').value, file);
  btn.disabled = false; btn.textContent = 'บันทึก';
  pSlip = null; $('#pSlipBtn').textContent = '📷 แนบ';
  await saveDocs(changed);
  paintPerson();
  toast(`💵 ${pName} ${p.they >= p.me ? 'คืน' : 'รับเงินจากเรา'} ${bahtS(Math.min(a, left))}`);
};
function settleAll(name) {
  const p = byPerson().find(x => x.name === name);
  if (!p) return;
  const net = p.they - p.me;
  if (!confirm(`${name} ${net >= 0 ? 'คืนเงิน' : 'ได้รับเงินจากเรา'}ครบ ${bahtS(Math.abs(net))} แล้วใช่ไหม?`)) return;
  // ปิดทั้งสองฝั่ง (หักกลบ) แล้วบันทึกยอดสุทธิที่จ่ายจริง
  const changed = p.open.map(d => { d.payments = [...(d.payments || []), { id: uid(), date: today(), amount: fromS(leftS(d)), via: 'ครบ' }]; d.status = 'done'; return d; });
  saveDocs(changed);
  toast(`✅ ${name} ครบแล้ว`, () => { changed.forEach(d => { d.payments.pop(); d.status = 'open'; }); saveDocs(changed); });
}
async function forgive(d) {
  const left = leftS(d);
  const q = d.dir === 'they'
    ? `ไม่ทวง ${d.person} แล้ว?\nยอดที่เหลือ ${bahtS(left)} จะจดเป็นรายจ่ายของเรา (หมวด อื่นๆ)`
    : `${d.person} ยกยอด ${bahtS(left)} ให้เราแล้ว?`;
  if (!confirm(q)) return;
  if (d.dir === 'they') d.moneyId = await moneyPut(d.moneyId, { date: today(), amount: fromS(left), cat: 'อื่นๆ', note: `ยกให้ ${d.person}${d.title ? ': ' + d.title : ''}` });
  d.status = 'forgiven';
  d.forgiven = fromS(left);
  await saveDocs([d]);
  paintPerson();
}

/* ---------- 🍜 หารกัน ---------- */
let sp = null;     // บิลหารที่กำลังแก้
const blankBill = payer => ({ id: uid(), title: '', payer: payer || ME, method: 'equal', total: '', who: [...sp.people], custom: {}, items: [], svc: false, vat: false, disc: '' });
function openSplit(s) {
  if (s) {
    const ds = debts().filter(d => d.splitId === s.id);
    if (ds.some(d => (d.payments || []).length || d.status === 'forgiven')) {
      if (!confirm('บิลนี้มีคนคืนเงินแล้ว ถ้าแก้ยอด ประวัติการคืนจะยังอยู่ แต่ยอดค้างจะคำนวณใหม่ ต่อไหม?')) return;
    }
  }
  sp = s ? JSON.parse(JSON.stringify(s)) : { id: uid(), kind: 'split', title: '', date: today(), people: [ME], bills: [], transfers: [] };
  if (!sp.bills.length) sp.bills.push(blankBill(ME));
  // บิลเก่า: บรรทัดส่วนลดที่ AI อ่านเป็นเมนู (ไม่มีใครกิน) + ส่วนลดท้ายบิลยอดเดียวกัน = ส่วนลดซ้ำ
  // → ย้ายไปเป็นส่วนลดของเมนูก่อนหน้า แล้วลดส่วนลดท้ายบิลลง (มีผลเมื่อกดบันทึก)
  let fixed = 0;
  sp.bills.forEach(b => {
    if (b.method !== 'menu') return;
    const out = [];
    let bd = toS(b.disc);
    b.items.forEach(it => {
      const old = DISC_RE.test(it.name || '') && !(it.who || []).filter(p => sp.people.includes(p)).length;
      const prev = old ? discTarget(it.name, b.items.filter(x => x !== it && !DISC_RE.test(x.name || ''))) : null;   // ต้องชื่อตรงกันเท่านั้น
      if (old && prev && bd >= toS(it.price)) { prev.disc = String(fromS(toS(prev.disc) + toS(it.price))); prev.discNote = prev.discNote || it.name; bd -= toS(it.price); fixed++; return; }
      out.push(it);
    });
    b.items = out; b.disc = bd ? String(fromS(bd)) : '';
  });
  if (fixed) setTimeout(() => toast(`🏷 ย้ายส่วนลด ${fixed} บรรทัดไปไว้ที่เมนูของมันแล้ว ตรวจแล้วกดบันทึก`), 300);
  const f = $('#sForm').elements;
  f.title.value = sp.title; f.date.value = sp.date;
  f.date.oninput = () => { sp.dateTouched = true; };
  $('#sDel').hidden = !s;
  paintSplit();
  $('#sDlg').showModal();
}
if ($('#sDlg')) $('#sCancel').onclick = () => $('#sDlg').close();
if ($('#sDlg')) $('#sAddP').onclick = () => addPerson($('#sNewP').value);
if ($('#sDlg')) $('#sNewP').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson($('#sNewP').value); } });
/** ชื่อของฉัน (แสดงแทน "ฉัน" ในหน้าจอ และแทน "ผม" ในข้อความที่ส่งเพื่อน) — จำไว้ในเครื่อง */
function setMyName() {
  const cur = myName();
  const n = prompt('ชื่อของคุณ (แสดงแทน "ฉัน" และใช้ในข้อความที่ส่งเพื่อน)\nเว้นว่าง = ใช้ "ฉัน" / "ผม" เหมือนเดิม', cur);
  if (n === null) return;
  const v = n.trim().slice(0, 30);
  if (v && v !== ME && peopleAll().includes(v) && !confirm(`มีเพื่อนชื่อ "${v}" อยู่แล้ว ใช้ชื่อนี้เป็นชื่อคุณเองใช่ไหม?`)) return;
  try { v ? localStorage.setItem('myName', v) : localStorage.removeItem('myName'); } catch (e) {}
  if ($('#sDlg') && $('#sDlg').open) paintSplit();
  rerender();
  if (typeof paintDetail === 'function' && $('#dDlg') && $('#dDlg').open) paintDetail();
}
/** ชื่อที่เคยใส่: นับจากบิลหาร + รายการค้างกัน → { name, n (ใช้กี่ครั้ง), last (วันล่าสุด) } */
function peopleStats() {
  const m = {};
  owe.forEach(d => {
    const names = d.kind === 'debt' ? [d.person] : (d.people || []);
    const dt = String(d.date || d.created || '');
    names.forEach(p => {
      if (!p || p === ME || p === myName()) return;
      const s = m[p] || (m[p] = { name: p, n: 0, last: '' });
      s.n++; if (dt > s.last) s.last = dt;
    });
  });
  return Object.values(m);
}
/** ชื่อที่เคยใส่เป็นปุ่ม 2 บรรทัด (ใช้บ่อย / ล่าสุด) ที่เหลืออยู่ใน ＋ ดูเพิ่มเติม */
function paintPick() {
  quickPick($('#sPick'), peopleStats().filter(s => !sp.people.includes(s.name)).map(s => ({ key: s.name, label: s.name, n: s.n, last: s.last })), n => addPerson(n));
}
function addPerson(n) {
  n = String(n || '').trim();
  $('#sNewP').value = '';
  if (n && (n === myName() || n === 'ผม')) n = ME;   // พิมพ์ชื่อตัวเอง = ฉัน
  if (!n || sp.people.includes(n)) { paintSplit(); return; }
  sp.people.push(n);
  sp.bills.forEach(b => { if (b.method !== 'custom') b.who.push(n); b.items.forEach(it => it.all && it.who.push(n)); });
  paintSplit();
}
if ($('#sDlg')) $('#sAddBill').onclick = () => { sp.bills.push(blankBill(sp.people.find(p => p !== ME) || ME)); paintSplit(); };

/* แบ่งสตางค์ให้ลงตัวพอดียอดรวม (เศษไปที่ยอดที่ตัดทิ้งมากสุด) */
function apportion(totalS, weights, unit) {
  const W = weights.reduce((s, w) => s + w, 0);
  if (!W) return weights.map(() => 0);
  const u = unit || 1;
  const raw = weights.map(w => totalS * w / W / u);
  const base = raw.map(Math.floor);
  let rest = Math.round(totalS / u) - base.reduce((s, x) => s + x, 0);
  raw.map((r, i) => [r - base[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { base[i]++; rest--; } });
  return base.map(x => x * u);
}
const DISC_RE = /^\s*(ส่วนลด|ลด\s|discount|disc\.?\s|โปรโมชั่น|คูปอง|coupon)/i;
/* หาเมนูที่บรรทัดส่วนลดพูดถึง เช่น "ส่วนลดน้ำแร่เพอร์ร่า 1500" → "2× น้ำแร่เพอร์ร่า 1500" */
function discTarget(discName, list) {
  const norm = t => String(t || '').toLowerCase().replace(DISC_RE, '').replace(/^\s*\d+\s*[×x]\s*/, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const k = norm(discName);
  if (k.length < 2) return null;
  return list.find(it => { const n = norm(it.name); return n && (n.includes(k) || k.includes(n)); }) || null;
}
const itemNetS = it => Math.max(0, toS(it.price) - toS(it.disc));
/* ส่วนของคนหนึ่งในเมนูหนึ่ง: ราคา และส่วนลด (สตางค์) เช่น น้ำ 40 ลด 8 หาร 2 → [2000, 400] */
function itemPartS(it, p, people) {
  const w = (it.who || []).filter(x => people.includes(x));
  const i = w.indexOf(p);
  if (i < 0) return null;
  return [apportion(toS(it.price), w.map(() => 1))[i], apportion(toS(it.disc), w.map(() => 1))[i]];
}
const num = sS => fromS(sS).toLocaleString('th-TH', { maximumFractionDigits: 2 });
/* ส่วนลดทั้งหมดของบิลหาร: ส่วนลดรายเมนู + ส่วนลดท้ายบิล → กล่องกดดูได้ว่าลดจากอะไรบ้าง */
function discBox(bills, people, key) {
  const rows = [];
  (bills || []).forEach(b => {
    const tag = bills.length > 1 && b.title ? ` · ${b.title}` : '';
    if (b.method === 'menu') (b.items || []).forEach(it => {
      if (DISC_RE.test(it.name || '') && !(it.who || []).filter(p => people.includes(p)).length) return;   // บรรทัดส่วนลดแบบเก่า = แค่ชื่อของส่วนลดท้ายบิล ไม่นับซ้ำ
      if (!toS(it.disc)) return;
      const w = (it.who || []).filter(p => people.includes(p));
      rows.push({ t: (it.name || 'เมนู') + tag, n: it.discNote || '', s: toS(it.disc), w: w.length > 1 ? `คนละ −${num(apportion(toS(it.disc), w.map(() => 1))[0])}` : (w[0] ? who(w[0]) : '') });
    });
    if (toS(b.disc)) rows.push({ t: (oldDiscNames(b, people) || 'ส่วนลดท้ายบิล') + tag, n: '', s: toS(b.disc), w: 'หารตามสัดส่วนที่กิน' });
  });
  if (!rows.length) return '';
  const tot = rows.reduce((x, r) => x + r.s, 0);
  return `<details class="disc-box"${discOpen[key] ? ' open' : ''} data-key="${key}"><summary><span>🏷 ส่วนลดรวม <small>${rows.length} รายการ · แตะดู</small></span><b>−${bahtS(tot)}</b></summary>
    ${rows.map(r => `<div class="disc-r"><span>${esc(r.t)}<small>${esc([r.n, r.w].filter(Boolean).join(' · '))}</small></span><b>−${num(r.s)}</b></div>`).join('')}</details>`;
}
const discOpen = {};
/* ชื่อบรรทัดส่วนลดแบบเก่า (AI เคยอ่านเป็นเมนูที่ไม่มีใครกิน) ใช้เป็นชื่อของส่วนลดท้ายบิล */
const oldDiscNames = (b, people) => (b.items || []).filter(it => DISC_RE.test(it.name || '') && !(it.who || []).filter(p => people.includes(p)).length).map(it => it.name).join(', ');
document.addEventListener('toggle', e => { const d = e.target; if (d.classList && d.classList.contains('disc-box')) discOpen[d.dataset.key] = d.open; }, true);
function billShares(b) {
  const sh = {};
  if (b.method === 'custom') {
    sp.people.forEach(p => { const v = toS(b.custom[p]); if (v) sh[p] = v; });
    return { shares: sh, total: Object.values(sh).reduce((s, v) => s + v, 0) };
  }
  if (b.method === 'menu') {
    const sub = {};
    // ราคาเมนูหักส่วนลดของเมนูนั้นก่อน แล้วค่อยหารกับคนกิน
    b.items.forEach(it => { const w = it.who.filter(p => sp.people.includes(p)); const parts = apportion(itemNetS(it), w.map(() => 1)); w.forEach((p, i) => { sub[p] = (sub[p] || 0) + parts[i]; }); });
    const subT = Object.values(sub).reduce((s, v) => s + v, 0);
    let tot = subT * (b.svc ? 1.1 : 1) * (b.vat ? 1.07 : 1) - toS(b.disc);
    const whole = b.items.every(it => toS(it.price) % 100 === 0 && toS(it.disc) % 100 === 0) && toS(b.disc) % 100 === 0;
    tot = whole ? Math.round(tot / 100) * 100 : Math.round(tot);
    const names = Object.keys(sub);
    const parts = apportion(Math.max(0, tot), names.map(p => sub[p]), whole ? 100 : 1);
    names.forEach((p, i) => { sh[p] = parts[i]; });
    return { shares: sh, total: Math.max(0, tot) };
  }
  const who = b.who.filter(p => sp.people.includes(p));
  const T = toS(b.total);
  const parts = apportion(T, who.map(() => 1), T % (100 * who.length) === 0 ? 100 : 1);
  who.forEach((p, i) => { sh[p] = parts[i]; });
  return { shares: sh, total: T };
}
/* หักลบให้โอนน้อยครั้งที่สุด */
function settle(net) {
  const cr = Object.entries(net).filter(([, v]) => v > 0).map(([p, v]) => ({ p, v })).sort((a, b) => b.v - a.v);
  const db = Object.entries(net).filter(([, v]) => v < 0).map(([p, v]) => ({ p, v: -v })).sort((a, b) => b.v - a.v);
  const out = [];
  while (cr.length && db.length) {
    const c = cr[0], d = db[0], x = Math.min(c.v, d.v);
    if (x > 0) out.push({ from: d.p, to: c.p, amountS: x });
    c.v -= x; d.v -= x;
    if (!c.v) cr.shift();
    if (!d.v) db.shift();
    cr.sort((a, b) => b.v - a.v); db.sort((a, b) => b.v - a.v);
  }
  return out;
}
function calcSplit() {
  const share = {}, paid = {};
  let total = 0;
  sp.bills.forEach(b => {
    const r = billShares(b);
    b._total = r.total; b._shares = r.shares;
    total += r.total;
    paid[b.payer] = (paid[b.payer] || 0) + r.total;
    Object.entries(r.shares).forEach(([p, v]) => { share[p] = (share[p] || 0) + v; });
  });
  const net = {};
  sp.people.forEach(p => { net[p] = (paid[p] || 0) - (share[p] || 0); });
  return { share, paid, total, transfers: settle(net) };
}

function chipsHtml(sel, cls) {
  return sp.people.map(p => `<button type="button" class="${cls || ''}${sel.includes(p) ? ' on' : ''}" data-p="${esc(p)}">${esc(who(p))}</button>`).join('');
}
function paintSplit() {
  $('#sPeople').innerHTML = sp.people.map(p => `<button type="button" class="on${p === ME ? ' me' : ''}" data-p="${esc(p)}">${esc(who(p))}${p === ME ? ' ✏️' : ' ✕'}</button>`).join('');
  paintPick();
  $('#sPeople').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p === ME) { setMyName(); return; }
    const n = b.dataset.p;
    sp.people = sp.people.filter(x => x !== n);
    sp.bills.forEach(bl => { bl.who = bl.who.filter(x => x !== n); bl.items.forEach(it => { it.who = it.who.filter(x => x !== n); }); delete bl.custom[n]; if (bl.payer === n) bl.payer = ME; });
    paintSplit();
  };
  const box = $('#sBills');
  box.innerHTML = '';
  const many = sp.bills.length > 1;
  sp.bills.forEach((b, bi) => {
    const el = document.createElement('div');
    el.className = 's-bill';
    el.innerHTML = `
      ${many ? `<div class="s-bh"><input class="s-btitle" placeholder="บิลที่ ${bi + 1} เช่น ที่พัก" value="${esc(b.title)}"><button type="button" class="mini s-rm" aria-label="ลบบิล">🗑</button></div>` : ''}
      <div class="s-rcpt">${b.file ? `<a href="${esc(b.file.url)}" target="_blank" rel="noopener" class="s-rthumb">${b.file.thumb ? `<img src="${b.file.thumb}" alt="">` : '🧾'}</a>` : ''}
        <button type="button" class="s-read">${b.file ? '📷 อ่านใบเสร็จใหม่' : '📷 ถ่าย/อัปใบเสร็จ ให้ AI อ่านเมนู'}</button>
        ${b.rTotal ? `<small>ยอดในใบเสร็จ ${bahtS(toS(b.rTotal))}</small>` : ''}</div>
      <label>ใครจ่ายไปก่อน <select class="s-payer">${sp.people.map(p => `<option value="${esc(p)}" ${p === b.payer ? 'selected' : ''}>${esc(who(p))}</option>`).join('')}</select></label>
      <div class="seg s-method">${[['equal', 'หารเท่ากัน'], ['custom', 'ระบุเอง'], ['menu', 'ตามเมนู']].map(([v, t]) => `<button type="button" data-v="${v}" class="${b.method === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="s-body"></div>`;
    const body = el.querySelector('.s-body');
    if (b.method === 'equal') {
      body.innerHTML = `<label>ยอดรวม <input class="s-total" inputmode="decimal" placeholder="0" value="${esc(b.total)}"></label><span class="lbl">หารกับใคร</span><div class="when-chips wrap s-who">${chipsHtml(b.who)}</div>`;
      body.querySelector('.s-total').oninput = e => { b.total = e.target.value; paintSum(); };
      body.querySelector('.s-who').onclick = e => { const c = e.target.closest('button'); if (!c) return; const p = c.dataset.p; b.who = b.who.includes(p) ? b.who.filter(x => x !== p) : [...b.who, p]; c.classList.toggle('on'); paintSum(); };
    } else if (b.method === 'custom') {
      body.innerHTML = sp.people.map(p => `<label class="s-cust"><span>${esc(who(p))}</span><input inputmode="decimal" data-p="${esc(p)}" placeholder="0" value="${esc(b.custom[p] || '')}"></label>`).join('');
      body.querySelectorAll('input').forEach(i => i.oninput = () => { b.custom[i.dataset.p] = i.value; paintSum(); });
    } else {
      body.innerHTML = b.items.map((it, ii) => `<div class="s-item" data-i="${ii}">
          <div class="s-ih"><input class="s-iname" placeholder="ชื่อเมนู" value="${esc(it.name)}"><input class="s-iprice" inputmode="decimal" placeholder="ราคา" value="${esc(it.price)}"><label class="s-dl${toS(it.disc) ? ' on' : ''}" title="ส่วนลดของเมนูนี้ (บาท)"><small>ลด</small><input class="s-idisc" inputmode="decimal" placeholder="0" value="${esc(it.disc || '')}"></label><button type="button" class="mini s-irm" aria-label="ลบเมนู">✕</button></div>
          <div class="when-chips wrap s-iwho">${chipsHtml(it.who)}</div></div>`).join('') +
        `<button type="button" class="ghost s-iadd">＋ เพิ่มเมนู</button>
         <div class="when-chips wrap s-extra"><button type="button" data-x="svc" class="${b.svc ? 'on' : ''}">Service 10%</button><button type="button" data-x="vat" class="${b.vat ? 'on' : ''}">VAT 7%</button></div>
         <label>ส่วนลด (บาท) <input class="s-disc" inputmode="decimal" placeholder="0" value="${esc(b.disc)}"></label>`;
      body.querySelectorAll('.s-item').forEach(row => {
        const it = b.items[+row.dataset.i];
        row.querySelector('.s-iname').oninput = e => { it.name = e.target.value; };
        row.querySelector('.s-iprice').oninput = e => { it.price = e.target.value; paintSum(); };
        row.querySelector('.s-idisc').oninput = e => { it.disc = e.target.value; e.target.parentNode.classList.toggle('on', !!toS(it.disc)); paintSum(); };
        row.querySelector('.s-irm').onclick = () => { b.items.splice(+row.dataset.i, 1); paintSplit(); };
        row.querySelector('.s-iwho').onclick = e => { const c = e.target.closest('button'); if (!c) return; const p = c.dataset.p; it.who = it.who.includes(p) ? it.who.filter(x => x !== p) : [...it.who, p]; it.all = it.who.length === sp.people.length; c.classList.toggle('on'); paintSum(); };
      });
      body.querySelector('.s-iadd').onclick = () => { b.items.push({ name: '', price: '', who: [...sp.people], all: true }); paintSplit(); setTimeout(() => { const ins = el.querySelectorAll('.s-iname'); ins[ins.length - 1]?.focus(); }, 30); };
      body.querySelector('.s-extra').onclick = e => { const c = e.target.closest('button'); if (!c) return; b[c.dataset.x] = !b[c.dataset.x]; c.classList.toggle('on'); paintSum(); };
      body.querySelector('.s-disc').oninput = e => { b.disc = e.target.value; paintSum(); };
    }
    el.querySelector('.s-payer').onchange = e => { b.payer = e.target.value; paintSum(); };
    el.querySelector('.s-read').onclick = () => readReceiptFor(b);
    el.querySelector('.s-method').onclick = e => {
      const c = e.target.closest('button'); if (!c) return;
      b.method = c.dataset.v;
      if (b.method === 'menu' && !b.items.length) b.items.push({ name: '', price: '', who: [...sp.people], all: true });
      if (b.method === 'custom' && b.total && !Object.keys(b.custom).length) { const r = billShares({ ...b, method: 'equal' }); Object.entries(r.shares).forEach(([p, v]) => { b.custom[p] = fromS(v); }); }
      paintSplit();
    };
    const t = el.querySelector('.s-btitle'); if (t) t.oninput = e => { b.title = e.target.value; };
    const rm = el.querySelector('.s-rm'); if (rm) rm.onclick = () => { sp.bills.splice(bi, 1); paintSplit(); };
    box.appendChild(el);
  });
  paintSum();
}
/* 📷 อ่านใบเสร็จด้วย AI → เติมชื่อร้าน ยอด และรายการเมนู */
let readTarget = null;
function readReceiptFor(b) {
  readTarget = b;
  let inp = $('#sFile');
  if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.id = 'sFile'; inp.hidden = true; document.body.appendChild(inp); inp.addEventListener('change', onReceiptFile); }
  inp.click();
}
async function onReceiptFile(e) {
  const file = e.target.files[0]; e.target.value = '';
  const b = readTarget;
  if (!file || !b) return;
  let p;
  try { p = await prepare(file); } catch (err) { alert(err.message); return; }
  busyStart(p.thumb);
  $('#busyMsg').textContent = 'AI กำลังอ่านใบเสร็จ…';
  try {
    const r = await api('ai_read', { data: p.data, mime: p.mime, thumb: p.thumb, for: 'split' });
    const o = r.ocr || {};
    b.file = r.file;
    if (o.amount) b.rTotal = Number(o.amount);
    if (!b.title && o.vendor && sp.bills.length > 1) b.title = o.vendor;
    if (!$('#sForm').elements.title.value.trim() && (o.vendor || o.desc)) $('#sForm').elements.title.value = o.vendor || o.desc;
    if (o.date && !sp.dateTouched) $('#sForm').elements.date.value = o.date;
    const items = (o.items || []).filter(it => it.price > 0);
    if (items.length >= 2) {
      b.method = 'menu';
      b.items = [];
      let extraDisc = 0;
      items.forEach(it => {
        // บรรทัดส่วนลดที่ AI แยกมาเป็นเมนู → ย้ายไปเป็นส่วนลดของเมนูก่อนหน้า (ไม่มีให้เป็นส่วนลดท้ายบิล)
        if (DISC_RE.test(it.name)) { const prev = discTarget(it.name, b.items) || b.items[b.items.length - 1]; if (prev) { prev.disc = String(fromS(toS(prev.disc) + toS(it.price))); prev.discNote = prev.discNote || it.name; } else extraDisc += it.price; return; }
        b.items.push({ name: (it.qty > 1 ? it.qty + '× ' : '') + it.name, price: String(it.price), disc: it.disc ? String(it.disc) : '', discNote: it.discNote || '', who: [...sp.people], all: true });
      });
      // ค่าบริการ / VAT ที่ยังไม่รวมในราคาเมนู
      const itemSum = items.reduce((s2, it) => s2 + it.price, 0);
      b.svc = !!o.service && Math.abs(o.service - itemSum * 0.1) <= Math.max(2, itemSum * 0.01);
      b.vat = o.vat === 'yes' && o.pricesIncVat === false;
      if (o.discount || extraDisc) b.disc = String((o.discount || 0) + extraDisc);
    } else if (o.amount) { b.method = 'equal'; b.total = String(o.amount); }
    paintSplit();
    const msg = !r.ai ? '⚠️ ยังไม่ได้ตั้งค่า AI (อ่านแบบเดิม) ตรวจรายการอีกครั้ง'
      : items.length >= 2 ? `🧾 AI อ่านได้ ${items.length} รายการ${items.some(it => it.disc) ? ` (มีส่วนลด ${items.filter(it => it.disc).length} รายการ)` : ''} แตะชื่อคนใต้แต่ละเมนูให้ตรงกับคนกิน`
      : o.amount ? `🧾 อ่านยอดได้ ${bahtS(toS(o.amount))} (ไม่เจอรายการเมนู)` : '📷 เก็บรูปแล้ว แต่อ่านไม่ได้ กรอกเองได้เลย';
    toast(msg);
  } catch (err) { showStatus('อ่านใบเสร็จไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
}

function paintSum() {
  const r = calcSplit();
  // ใต้ชื่อแต่ละคน: กินอะไรบ้าง คนละเท่าไหร่ (มีส่วนลดแสดงแบบ 20−4)
  const ate = {};
  sp.bills.filter(b => b.method === 'menu').forEach(b => b.items.forEach(it => {
    const w = it.who.filter(p => sp.people.includes(p));
    w.forEach(p => { const [pr, ds] = itemPartS(it, p, sp.people); if (pr || ds) (ate[p] = ate[p] || []).push(esc(`${it.name || 'เมนู'} ${num(pr)}`) + (ds ? `<i class="neg">−${num(ds)}</i>` : '')); });
  }));
  const rows = sp.people.map(p => `<div><span>${esc(who(p))}${ate[p] ? `<small>${ate[p].join(' · ')}</small>` : ''}</span><b>${bahtS(r.share[p] || 0)}</b></div>`).join('');
  const tr = r.transfers.length ? '<h4>สรุปโอนให้จบ</h4>' + r.transfers.map(t => `<div><span>${esc(who(t.from))} → ${esc(who(t.to))}</span><b>${bahtS(t.amountS)}</b></div>`).join('') : '';
  const mine = r.share[ME] || 0;
  const rcpt = sp.bills.reduce((s2, b) => s2 + toS(b.rTotal || 0), 0);
  const diff = rcpt && Math.abs(rcpt - r.total) >= 100 ? `<p class="note warn">⚠️ ยอดที่หาร ${bahtS(r.total)} ไม่ตรงกับยอดในใบเสร็จ ${bahtS(rcpt)} (ต่าง ${bahtS(Math.abs(rcpt - r.total))}) ลองเช็ก Service / VAT / ส่วนลด หรือเมนูที่ขาด</p>` : '';
  $('#sSum').innerHTML = `<h4>ส่วนของแต่ละคน</h4>${rows}<div class="tot"><span>รวม</span><b>${bahtS(r.total)}</b></div>${discBox(sp.bills, sp.people, 'edit')}${diff}${tr}
    <p class="note">📒 จดลงรายจ่ายเฉพาะส่วนของเรา <b>${bahtS(mine)}</b> · ที่เหลือเป็น "ค้างกัน" ไม่ทำให้ยอดใช้จ่ายเพี้ยน</p>`;
}

if ($('#sDlg')) $('#sForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements;
  sp.title = f.title.value.trim(); sp.date = f.date.value || today();
  if (!sp.title) { f.title.focus(); return; }
  if (sp.people.length < 2) { alert('เพิ่มชื่อเพื่อนที่หารด้วยก่อนครับ'); return; }
  const r = calcSplit();
  if (!r.total) { alert('ยังไม่มียอดเงินครับ'); return; }
  const old = debts().filter(d => d.splitId === sp.id);
  // รายการค้างที่เกี่ยวกับเรา (เก็บประวัติการคืนเดิมถ้าคนเดิม ทิศเดิม)
  const newDebts = r.transfers.filter(t => t.from === ME || t.to === ME).map(t => {
    const person = t.from === ME ? t.to : t.from, dir = t.from === ME ? 'me' : 'they';
    const prev = old.find(d => d.person === person && d.dir === dir);
    const d = Object.assign(prev || { id: uid(), kind: 'debt', payments: [], created: today() }, { person, dir, amount: fromS(t.amountS), date: sp.date, title: sp.title, splitId: sp.id });
    d.status = prev && prev.status === 'forgiven' ? 'forgiven' : leftS(d) ? 'open' : 'done';
    return d;
  });
  const gone = old.filter(d => !newDebts.includes(d)).map(d => d.id);
  const prevTr = sp.transfers || [];
  sp.transfers = r.transfers.map(t => ({ from: t.from, to: t.to, amount: fromS(t.amountS), done: !!(prevTr.find(x => x.from === t.from && x.to === t.to && x.done)) }));
  sp.bills.forEach(b => { b.shares = Object.fromEntries(Object.entries(b._shares).map(([p, v]) => [p, fromS(v)])); b.sum = fromS(b._total); delete b._shares; delete b._total; });
  sp.total = fromS(r.total);
  const mine = r.share[ME] || 0;
  if (mine) sp.moneyId = await moneyPut(sp.moneyId, { date: sp.date, amount: fromS(mine), cat: guessCat('out', sp.title) || 'อาหาร', note: `${sp.title} (หาร ${sp.people.length} คน · ส่วนของฉัน)` });
  else if (sp.moneyId) { moneyDel(sp.moneyId); sp.moneyId = ''; }
  $('#sDlg').close();
  if (gone.length) await delDocs(gone);
  await saveDocs([sp, ...newDebts]);
  toast(`🍜 ${sp.title} · จดรายจ่ายส่วนของเรา ${bahtS(mine)}`);
  if ($('#pDlg').open) paintPerson();
  if ($('#dDlg')) openDetail(sp.id);
});
if ($('#sDlg')) $('#sDel').onclick = async () => {
  if (!sp || !confirm(`ลบบิล "${sp.title}" และยอดค้างที่มาจากบิลนี้ทั้งหมด?`)) return;
  const ids = [sp.id, ...debts().filter(d => d.splitId === sp.id).map(d => d.id)];
  moneyDel(sp.moneyId);
  $('#sDlg').close();
  if ($('#pDlg').open) $('#pDlg').close();
  await delDocs(ids);
};


/* ===================== 🍜 หน้า "หาร" (split.html) ===================== */
function payDebt(d, amountS, date, via, file) {
  const take = Math.min(amountS, leftS(d));
  if (take <= 0) return null;
  d.payments = [...(d.payments || []), { id: uid(), date: date || today(), amount: fromS(take), via: via || 'โอน', file: file || null }];
  d.status = leftS(d) ? 'open' : 'done';
  return d;
}
function splitDebt(s, t) { return debts().find(d => d.splitId === s.id && d.person === (t.from === ME ? t.to : t.from) && d.dir === (t.from === ME ? 'me' : 'they')); }
function splitProgress(s) {
  const tr = s.transfers || [];
  const done = tr.filter(t => (t.from === ME || t.to === ME) ? (() => { const d = splitDebt(s, t); return !d || !isOpen(d); })() : t.done).length;
  return { done, all: tr.length };
}

function renderSplits() {
  const q = ($('#spQ') ? $('#spQ').value : '').trim().toLowerCase();
  const all = splits();
  const list = all.filter(s => !q || [s.title, ...(s.people || []), ...(s.bills || []).map(b => b.title || '')].join(' ').toLowerCase().includes(q)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  // ยอดหลังหักลบกันรายคน (อ๊อก ค้างเรา 50 แต่เราค้างอ๊อก 30 → นับเป็นอ๊อกค้างเรา 20)
  const nets = balances().me.map(p => p.they - p.me);
  const T = nets.filter(n => n > 0).reduce((s, n) => s + n, 0);
  const M = -nets.filter(n => n < 0).reduce((s, n) => s + n, 0);
  $('#spThey').textContent = bahtS(T); $('#spMe').textContent = bahtS(M);
  $('#spThey').classList.toggle('zero', !T); $('#spMe').classList.toggle('zero', !M);
  renderBalances();
  if ($('#owPeople')) $('#owPeople').innerHTML = peopleAll().map(p => `<option value="${esc(p)}">`).join('');
  const box = $('#spList');
  if ($('#spCount')) $('#spCount').textContent = all.length ? `${q ? list.length + '/' : ''}${all.length} บิล` : '';
  box.innerHTML = list.length ? '' : q ? '<p class="empty">ไม่พบบิลที่ค้นหา</p>' : '<p class="empty">ยังไม่มีบิลหาร<br>แตะ 🍜 หารบิลใหม่ หรือ 📷 ถ่ายใบเสร็จ ด้านบน</p>';
  const open = [], closed = [];
  list.forEach(s => { const pg = splitProgress(s); (pg.done < pg.all ? open : closed).push([s, pg]); });
  const card = ([s, pg]) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ow-card sp-card' + (pg.done >= pg.all ? ' closed' : '');
    const mine = toS((s.bills || []).reduce((x, b) => x + Number((b.shares || {})[ME] || 0), 0));
    const pics = (s.bills || []).filter(b => b.file && b.file.thumb).slice(0, 1).map(b => `<img src="${b.file.thumb}" alt="">`).join('');
    el.innerHTML = `<div class="ow-row">${pics ? `<span class="sp-pic">${pics}</span>` : '<span class="av">🍜</span>'}
      <div class="ow-mid"><b>${esc(s.title)}</b> ${pg.all ? (pg.done >= pg.all ? '<span class="tag ok">โอนครบ</span>' : `<span class="tag">รอโอน ${pg.all - pg.done}</span>`) : ''}
      <div class="meta">${fmtD(s.date)} · ${(s.people || []).length} คน${(s.bills || []).length > 1 ? ' · ' + s.bills.length + ' บิล' : ''} · ส่วนเรา ${bahtS(mine)}</div></div>
      <b>${bahtS(toS(s.total))}</b></div>
      ${pg.all ? `<div class="ow-bar"><i style="width:${Math.round(pg.done / pg.all * 100)}%"></i></div>` : ''}`;
    el.onclick = () => openDetail(s.id);
    return el;
  };
  open.forEach(x => box.appendChild(card(x)));
  if (closed.length) {
    const det = document.createElement('details');
    det.className = 'ow-closed';
    if (q || !open.length) det.open = true;
    det.innerHTML = `<summary>▾ โอนครบแล้ว ${closed.length} บิล</summary><div></div>`;
    closed.forEach(x => det.lastElementChild.appendChild(card(x)));
    box.appendChild(det);
  }
}

if ($('#spQ')) $('#spQ').addEventListener('input', () => renderSplits());

/* ---------- 🤝 ยอดค้างจากบิลหาร: ใครค้างเรา · เราค้างใคร · เพื่อนค้างกันเอง (หักลบกันให้) ---------- */
const balOpen = {};
function balances() {
  const me = {}, pairs = {};
  debts().filter(d => d.splitId && isOpen(d)).forEach(d => {
    const p = me[d.person] = me[d.person] || { name: d.person, they: 0, me: 0, rows: [] };
    p[d.dir] += leftS(d);
    p.rows.push({ kind: 'debt', d, dir: d.dir, s: leftS(d), title: d.title || 'หารกัน', date: d.date });
  });
  splits().forEach(sp0 => (sp0.transfers || []).forEach(t => {
    if (t.from === ME || t.to === ME || t.done || !toS(t.amount)) return;
    const [a, b] = [t.from, t.to].sort((x, y) => x.localeCompare(y, 'th'));
    const k = a + '|' + b;
    const g = pairs[k] = pairs[k] || { a, b, ab: 0, ba: 0, rows: [] };
    if (t.from === a) g.ab += toS(t.amount); else g.ba += toS(t.amount);
    g.rows.push({ kind: 'tr', s: sp0, t, from: t.from, to: t.to, amt: toS(t.amount), title: sp0.title || 'หารกัน', date: sp0.date });
  }));
  return { me: Object.values(me), pairs: Object.values(pairs) };
}
function renderBalances() {
  const box = $('#spBal');
  if (!box) return;
  const { me, pairs } = balances();
  if (!me.length) { box.innerHTML = ''; return; }
  const W = who(ME);
  const card = (key, name, cls, amtTxt, sub, rows, btn) => `<details class="bal ${cls}" data-key="${esc(key)}"${balOpen[key] ? ' open' : ''}>
      <summary><span class="av">${esc(initial(name))}</span><div class="bal-mid"><b>${esc(name)}</b><small>${sub}</small></div><b class="bal-amt">${amtTxt}</b></summary>
      <div class="bal-rows">${rows}</div>${btn}</details>`;
  const row = (title, date, txt, txtCls, act) => `<div class="bal-r"><span>${esc(title)}<small>${fmtD(date)}</small></span><b class="${txtCls}">${txt}</b>${act}</div>`;
  const theyOwe = me.filter(p => p.they - p.me > 0).sort((x, y) => (y.they - y.me) - (x.they - x.me));
  const iOwe = me.filter(p => p.they - p.me < 0).sort((x, y) => (x.they - x.me) - (y.they - y.me));
  const even = me.filter(p => p.they === p.me);
  const meCard = p => {
    const net = p.they - p.me, both = p.they && p.me;
    const sub = both ? `ค้างเรา ${num(p.they)} · เราค้าง ${num(p.me)} → หักลบกันแล้ว` : `${p.rows.length} บิล`;
    const amt = net > 0 ? `ค้างเรา ${bahtS(net)}` : net < 0 ? `เราค้าง ${bahtS(-net)}` : 'หักลบกันพอดี';
    const rows = p.rows.sort((a, b) => String(a.date).localeCompare(String(b.date))).map(r => row(r.title, r.date, (r.dir === 'they' ? '+' : '−') + num(r.s), r.dir === 'they' ? 'in' : 'out',
      `<button type="button" class="mini" data-pay="${esc(r.d.id)}">✓ ${r.dir === 'they' ? 'ได้แล้ว' : 'จ่ายแล้ว'}</button>`)).join('');
    const how = net > 0 ? `${p.name} โอนให้${W} ${bahtS(net)}` : net < 0 ? `${W}โอนให้ ${p.name} ${bahtS(-net)}` : 'หักลบกันพอดี ไม่ต้องโอน';
    return card('me:' + p.name, p.name, net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero', amt, sub, rows,
      `<div class="bal-foot">${both ? `<p class="bal-net">${num(p.they)} − ${num(p.me)} = <b>${bahtS(Math.abs(net))}</b> · ${esc(how)}</p>` : ''}<button type="button" class="mini bal-clear" data-clear="${esc(p.name)}">✅ เคลียร์กันแล้ว${net ? ' (' + esc(how) + ')' : ''}</button></div>`);
  };
  const pairCard = g => {
    const net = g.ab - g.ba, [from, to] = net >= 0 ? [g.a, g.b] : [g.b, g.a];
    const both = g.ab && g.ba;
    const rows = g.rows.sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) => row(r.title, r.date, `${esc(r.from)} → ${esc(r.to)} ${num(r.amt)}`, '',
      `<button type="button" class="mini" data-tr="${esc(g.a + '|' + g.b)}|${i}">✓ โอนแล้ว</button>`)).join('');
    return card('pair:' + g.a + '|' + g.b, `${g.a} ↔ ${g.b}`, 'pair', net ? `${esc(from)} → ${esc(to)} ${bahtS(Math.abs(net))}` : 'หักลบกันพอดี',
      both ? `${esc(g.a)}→${esc(g.b)} ${num(g.ab)} · ${esc(g.b)}→${esc(g.a)} ${num(g.ba)} → หักลบกันแล้ว` : `${g.rows.length} บิล`, rows,
      `<div class="bal-foot"><button type="button" class="mini bal-clear" data-clearpair="${esc(g.a + '|' + g.b)}">✅ เคลียร์กันแล้ว</button></div>`);
  };
  box.innerHTML = (theyOwe.length ? `<h3>💰 ใครค้าง${esc(W)} <small>${bahtS(theyOwe.reduce((s, p) => s + p.they - p.me, 0))}</small></h3>${theyOwe.map(meCard).join('')}` : '')
    + (iOwe.length ? `<h3>🙏 ${esc(W)}ค้างใคร <small>${bahtS(iOwe.reduce((s, p) => s + p.me - p.they, 0))}</small></h3>${iOwe.map(meCard).join('')}` : '')
    + (even.length ? even.map(meCard).join('') : '');   // เพื่อนค้างกันเอง: ไม่แสดง (เจ้าของขอเฉพาะยอดของเรา)
  box.__pairs = pairs;
}
if ($('#spBal')) {
  $('#spBal').addEventListener('toggle', e => { const d = e.target; if (d.classList && d.classList.contains('bal')) balOpen[d.dataset.key] = d.open; }, true);
  $('#spBal').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pay) {   // จ่าย/ได้รายบิล
      const d = debts().find(x => x.id === b.dataset.pay);
      if (!d) return;
      const amt = leftS(d);
      payDebt(d, amt, today(), 'ครบ');
      await saveDocs([d]);
      toast(`✓ ${d.title || 'หารกัน'} ${d.dir === 'they' ? d.person + ' จ่ายแล้ว' : 'เราจ่าย ' + d.person + ' แล้ว'} ${bahtS(amt)}`, async () => { d.payments.pop(); d.status = 'open'; await saveDocs([d]); });
    }
    if (b.dataset.clear) {   // เคลียร์ทุกบิลกับคนนี้ (หักลบกันแล้วจ่ายส่วนต่าง)
      const name = b.dataset.clear;
      const list = debts().filter(d => d.splitId && d.person === name && isOpen(d));
      const they = list.filter(d => d.dir === 'they').reduce((s, d) => s + leftS(d), 0), mine = list.filter(d => d.dir === 'me').reduce((s, d) => s + leftS(d), 0);
      const net = they - mine;
      if (!confirm(`เคลียร์กับ ${name} ทั้งหมด ${list.length} บิล?\n${they && mine ? `หักลบกัน ${num(they)} − ${num(mine)} แล้ว ` : ''}${net > 0 ? `${name} โอนให้เรา ${bahtS(net)}` : net < 0 ? `เราโอนให้ ${name} ${bahtS(-net)}` : 'ไม่ต้องโอน'} แล้วใช่ไหม?`)) return;
      const both = they && mine;
      list.forEach(d => payDebt(d, leftS(d), today(), both ? 'หักลบ' : 'ครบ'));
      await saveDocs(list);
      toast(`✅ เคลียร์กับ ${name} แล้ว`, async () => { list.forEach(d => { d.payments.pop(); d.status = 'open'; }); await saveDocs(list); });
    }
    if (b.dataset.tr || b.dataset.clearpair) {   // เพื่อนโอนกันเอง
      const pairs = $('#spBal').__pairs || [];
      const [a, c, i] = (b.dataset.tr || b.dataset.clearpair).split('|');
      const g = pairs.find(x => x.a === a && x.b === c);
      if (!g) return;
      const rows = b.dataset.tr ? [g.rows[+i]] : g.rows;
      if (b.dataset.clearpair && !confirm(`${a} กับ ${c} เคลียร์กันแล้ว (${rows.length} บิล)?`)) return;
      rows.forEach(r => { r.t.done = true; });
      const docs = [...new Set(rows.map(r => r.s))];
      await saveDocs(docs);
      toast(b.dataset.tr ? `✓ ${rows[0].from} → ${rows[0].to} โอนแล้ว` : `✅ ${a} กับ ${c} เคลียร์กันแล้ว`, async () => { rows.forEach(r => { r.t.done = false; }); await saveDocs(docs); });
    }
  });
}

let dId = '', dSlipFor = null;
function openDetail(id) {
  dId = id;
  paintDetail();
  if (!$('#dDlg').open) $('#dDlg').showModal();
}
function paintDetail() {
  const s = splits().find(x => x.id === dId);
  if (!s) { if ($('#dDlg').open) $('#dDlg').close(); return; }
  $('#dTitle').textContent = '🍜 ' + s.title;
  $('#dMeta').textContent = `${fmtD(s.date)} · รวม ${bahtS(toS(s.total))} · ${(s.people || []).length} คน`;
  // ใบเสร็จ
  const pics = (s.bills || []).filter(b => b.file);
  $('#dPics').innerHTML = pics.map(b => `<a href="${esc(b.file.url)}" target="_blank" rel="noopener" class="s-rthumb">${b.file.thumb ? `<img src="${b.file.thumb}" alt="">` : '🧾'}<small>${esc(b.title || 'ใบเสร็จ')}</small></a>`).join('');
  $('#dPics').hidden = !pics.length;
  // รายการ + ส่วนของแต่ละคน (พร้อมว่าแต่ละคนกินอะไร)
  const share = {}, eaten = {};
  const bills = s.bills || [];
  (s.bills || []).forEach(b => Object.entries(b.shares || {}).forEach(([p, v]) => { share[p] = (share[p] || 0) + toS(v); }));
  const whoList = (w, people) => !w || !w.length ? '-' : people && w.length === people.length ? 'ทุกคน' : w.map(who).join(', ');
  $('#dItems').innerHTML = bills.map(b => {
    const totS = toS(b.total) || Object.values(b.shares || {}).reduce((x, v) => x + toS(v), 0);
    const head = `<div class="di-h">${bills.length > 1 ? `<b>${esc(b.title || 'บิล')}</b>` : ''}<small>จ่ายไปก่อน: ${esc(who(b.payer || ME))}</small></div>`;
    let body = '';
    if (b.method === 'menu') {
      const items = (b.items || []).filter(it => it.name || toS(it.price));
      const isOldDisc = it => DISC_RE.test(it.name || '') && !(it.who || []).filter(p => (s.people || []).includes(p)).length;
      const subS = items.reduce((x, it) => x + (isOldDisc(it) ? 0 : itemNetS(it)), 0);
      items.forEach(it => {
        const w = (it.who || []).filter(p => (s.people || []).includes(p));
        // เช่น "น้ำเพอร่า 20−4" = ส่วนของคนนี้ 20 บาท ลด 4 บาท
        w.forEach(p => { const [pr, ds] = itemPartS(it, p, s.people || []); (eaten[p] = eaten[p] || []).push(esc(`${it.name || 'เมนู'} ${num(pr)}`) + (ds ? `<i class="neg">−${num(ds)}</i>` : '') + (w.length > 1 ? ` (หาร ${w.length})` : '')); });
      });
      const oldNames = oldDiscNames(b, s.people || []);
      body = items.map(it => isOldDisc(it)
        ? (toS(b.disc) ? '' : `<div class="di-r muted"><span>${esc(it.name)}<small>ยังไม่ได้หัก · กด แก้บิล แล้วใส่ในช่อง "ลด" ของเมนูนั้น</small></span><b>${bahtS(toS(it.price))}</b></div>`)
        : `<div class="di-r"><span>${esc(it.name || 'เมนู')}<small>${esc(whoList((it.who || []).filter(p => (s.people || []).includes(p)), s.people))}</small>${toS(it.disc) ? `<em class="di-off">🏷 ลด ${num(toS(it.disc))}${it.discNote ? ' · ' + esc(it.discNote) : ''}</em>` : ''}</span><b>${toS(it.disc) ? `<s>${num(toS(it.price))}</s> ` : ''}${bahtS(itemNetS(it))}</b></div>`).join('') +
        ((b.svc || b.vat || toS(b.disc)) ? `<div class="di-r sub sum"><span>รวมค่าอาหาร</span><b>${bahtS(subS)}</b></div>` : '') +
        (b.svc ? `<div class="di-r sub"><span>Service 10%</span><b>${bahtS(Math.round(subS * 0.1))}</b></div>` : '') +
        (b.vat ? `<div class="di-r sub"><span>VAT 7%</span><b>${bahtS(Math.round(subS * (b.svc ? 1.1 : 1) * 0.07))}</b></div>` : '') +
        (toS(b.disc) ? `<div class="di-r sub disc"><span>🏷 ${esc(oldNames || 'ส่วนลดท้ายบิล')}</span><b>−${bahtS(toS(b.disc))}</b></div>` : '');
    } else if (b.method === 'custom') {
      body = `<div class="di-r"><span>ระบุยอดเองรายคน</span><b></b></div>`;
      Object.keys(b.shares || {}).forEach(p => { (eaten[p] = eaten[p] || []).push(esc(bills.length > 1 ? (b.title || 'บิล') + ' (ระบุเอง)' : 'ระบุยอดเอง')); });
    } else {
      const w = (b.who || []).filter(p => (s.people || []).includes(p));
      body = `<div class="di-r"><span>หารเท่ากัน ${w.length} คน<small>${esc(whoList(w, s.people))}</small></span><b>คนละ ${bahtS(w.length ? Math.round(totS / w.length) : 0)}</b></div>`;
      w.forEach(p => { (eaten[p] = eaten[p] || []).push(esc(bills.length > 1 ? (b.title || 'บิล') + ` (หาร ${w.length})` : `หาร ${w.length} คน`)); });
    }
    return `<div class="di-bill">${head}${body}<div class="di-r tot"><span>ยอดเต็ม${bills.length > 1 ? 'บิลนี้' : ''}</span><b>${bahtS(totS)}</b></div></div>`;
  }).join('') + (bills.length > 1 ? `<div class="di-r tot all"><span>รวมทุกบิล</span><b>${bahtS(toS(s.total))}</b></div>` : '') + discBox(bills, s.people || [], 'detail');
  $('#dShares').innerHTML = (s.people || []).map(p => `<div><span>${esc(who(p))}${eaten[p] && eaten[p].length ? `<small>${eaten[p].join(' · ')}</small>` : ''}</span><b>${bahtS(share[p] || 0)}</b></div>`).join('') +
    `<div class="tot"><span>รวม</span><b>${bahtS(Object.values(share).reduce((x, v) => x + v, 0))}</b></div>`;
  // การโอน
  const box = $('#dTr');
  box.innerHTML = (s.transfers || []).length ? '' : '<p class="hint">ไม่มีใครต้องโอน (ทุกคนจ่ายส่วนตัวเองแล้ว)</p>';
  (s.transfers || []).forEach((t, i) => {
    const mine = t.from === ME || t.to === ME;
    const d = mine ? splitDebt(s, t) : null;
    const amtS = toS(t.amount);
    const leftT = d ? leftS(d) : (t.done ? 0 : amtS);
    const paid = amtS - leftT;
    const slips = d ? (d.payments || []).filter(x => x.file) .map(x => x.file) : (t.file ? [t.file] : []);
    const el = document.createElement('div');
    el.className = 'd-tr' + (leftT ? '' : ' ok');
    const verb = t.to === ME ? 'ได้รับแล้ว' : t.from === ME ? 'จ่ายแล้ว' : 'โอนแล้ว';
    el.innerHTML = `<div class="d-row"><span class="d-who">${esc(who(t.from))} <i>→</i> ${esc(who(t.to))}</span><b>${bahtS(amtS)}</b></div>
      <div class="meta">${leftT ? (paid ? `ได้แล้ว ${bahtS(paid)} · เหลือ ${bahtS(leftT)}` : 'ยังไม่ได้โอน') : '✓ ' + verb}${d && d.status === 'forgiven' ? ' · ไม่ทวงแล้ว' : ''}
        ${slips.map(f => ` <a class="tag ok" href="${esc(f.url)}" target="_blank" rel="noopener">สลิป</a>`).join('')}</div>
      ${leftT ? `<div class="btns"><button type="button" class="mini p">✓ ${verb}</button><button type="button" class="mini sl">📎 แนบสลิป</button>${d ? '<button type="button" class="mini pt">ทยอย…</button>' : ''}</div>`
        : (!d ? '<div class="btns"><button type="button" class="mini un">↩ ยังไม่ได้โอน</button></div>' : '')}`;
    const done = async file => {
      if (d) { payDebt(d, leftT, today(), file ? 'โอน' : 'ครบ', file); await saveDocs([d]); }
      else { t.done = true; if (file) t.file = file; await saveDocs([s]); }
      paintDetail();
      toast(`✓ ${t.from} → ${t.to} ${bahtS(leftT)}`);
    };
    const q = sel => el.querySelector(sel);
    if (q('.p')) q('.p').onclick = () => done(null);
    if (q('.sl')) q('.sl').onclick = () => { dSlipFor = done; $('#dSlip').click(); };
    if (q('.pt')) q('.pt').onclick = () => openPerson(t.from === ME ? t.to : t.from, true);
    if (q('.un')) q('.un').onclick = async () => { t.done = false; delete t.file; await saveDocs([s]); paintDetail(); };
    box.appendChild(el);
  });
  // ข้อความสรุปส่งเข้ากลุ่ม
  const menu = (s.bills || []).filter(b => b.method === 'menu').flatMap(b => (b.items || []).filter(it => it.name || toS(it.price)).map(it => `• ${it.name || 'เมนู'} ${num(toS(it.price))}${toS(it.disc) ? ' ลด ' + num(toS(it.disc)) : ''}${(it.who || []).length && (it.who || []).length < (s.people || []).length ? ' (' + it.who.map(whoMsg).join(', ') + ')' : ''}`));
  const lines = [`🍜 ${s.title} (${fmtD(s.date)}) รวม ${fromS(toS(s.total)).toLocaleString('th-TH')} บาท`]
    .concat(menu.length ? ['', 'รายการ:'].concat(menu) : [])
    .concat(['', 'ส่วนของแต่ละคน:'])
    .concat((s.people || []).map(p => `• ${whoMsg(p)} ${fromS(share[p] || 0).toLocaleString('th-TH')}`))
    .concat((s.transfers || []).length ? ['', 'โอนให้จบ:'].concat(s.transfers.map(t => `• ${whoMsg(t.from)} → ${whoMsg(t.to)} ${Number(t.amount).toLocaleString('th-TH')} บาท`)) : []);
  const msg = lines.join('\n');
  $('#dMsg').textContent = msg;
  $('#dLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(msg);
}
if ($('#dDlg')) {
  $('#dClose').onclick = () => { $('#dDlg').close(); history.replaceState(null, '', location.pathname); };
  $('#dEdit').onclick = () => { const s = splits().find(x => x.id === dId); if (s) { $('#dDlg').close(); openSplit(s); } };
  $('#dDel').onclick = async () => { const s = splits().find(x => x.id === dId); if (!s) return; sp = s; $('#sDel').onclick(); $('#dDlg').close(); };
  $('#dCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#dMsg').textContent); $('#dCopy').textContent = '✓ ก็อปแล้ว'; setTimeout(() => $('#dCopy').textContent = '📋 ก็อป', 1500); } catch {} };
  $('#dSlip').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || !dSlipFor) return;
    let p; try { p = await prepare(f); } catch (err) { alert(err.message); return; }
    busyStart(p.thumb); $('#busyMsg').textContent = 'กำลังเก็บสลิป…';
    try { const r = await api('owe_slip', { ...p, date: today(), label: 'หาร' }); await dSlipFor(r.file); }
    catch (err) { showStatus('แนบสลิปไม่สำเร็จ: ' + err.message); }
    finally { busyEnd(); dSlipFor = null; }
  });
  $('#spNew').onclick = () => openSplit();
  $('#spSnap').onclick = () => { openSplit(); setTimeout(() => readReceiptFor(sp.bills[0]), 60); };
  // เปิดจากลิงก์ split.html#<id>
  const h = location.hash.slice(1);
  if (h) setTimeout(() => { if (splits().some(x => x.id === h)) openDetail(h); }, 300);
}

// เริ่มทำงานหลังประกาศทุกฟังก์ชัน/ค่าคงที่แล้ว (เดิมเรียกกลางไฟล์ ทำให้ split.html พังทั้งหน้า: splitDebt ยังไม่ถูกประกาศ)
rerender();
syncOwe();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncOwe(); });
