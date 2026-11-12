/* จดครบ — 🤝 ค้างกัน: ให้ยืม / ยืมเขา / หารกัน (เท่ากัน · ระบุเอง · ตามเมนู · ทริปหลายบิล) + ทยอยคืน
 * ใช้ตัวช่วยจาก money.js: $, api, baht, esc, uid, today, toast, showStatus, items, upsert, guessCat, prepare
 * หลักบัญชี: ให้ยืม/รับคืน ไม่นับเป็นรายจ่าย/รายรับ · หารกัน = จดรายจ่ายเฉพาะส่วนของเรา · "ไม่ทวงแล้ว" = ย้ายยอดที่เหลือไปเป็นรายจ่าย
 */
const ME = 'ฉัน';
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
  try { owe = (await api('owe_list')).docs; LS.set('owe', owe); oweLoaded = true; if (view === 'owe') renderOwe(); }
  catch (e) { showStatus('ดึงข้อมูลค้างกันไม่สำเร็จ: ' + e.message); }
}
function putLocal(docs) { docs.forEach(d => { const i = owe.findIndex(x => x.id === d.id); if (i > -1) owe[i] = d; else owe.push(d); }); LS.set('owe', owe); }
async function saveDocs(docs) {
  putLocal(docs); renderOwe();
  try { const r = await api('owe_save', { docs }); putLocal(r.docs); }
  catch (e) { showStatus('บันทึกไม่สำเร็จ: ' + e.message); }
}
async function delDocs(ids) {
  owe = owe.filter(d => !ids.includes(d.id)); LS.set('owe', owe); renderOwe();
  try { await api('owe_delete', { ids }); } catch (e) { showStatus('ลบไม่สำเร็จ: ' + e.message); }
}
/* รายจ่ายในหน้าเงิน (ส่วนของเราในบิลหาร / ยอดที่ไม่ทวงแล้ว) */
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
    box.innerHTML = `<p class="empty">${debts().length ? 'ไม่มีใครค้างแล้ว 🎉' : 'ยังไม่มีรายการ<br>แตะ 💸 ให้ยืม · 🙏 ยืมเขา · 🍜 หารกัน ด้านบนเพื่อเริ่มจด'}</p>`;
  } else box.innerHTML = '';
  open.forEach(p => box.appendChild(personCard(p)));
  $('#owClosed').hidden = !closed.length;
  $('#owClosed summary').textContent = `▾ ปิดบัญชีแล้ว ${closed.length} คน`;
  $('#owClosedList').innerHTML = '';
  closed.forEach(p => $('#owClosedList').appendChild(personCard(p, true)));
  // บิลหาร/ทริปที่มีการโอนระหว่างคนอื่นยังไม่ครบ
  const sp = splits().filter(s => (s.transfers || []).some(t => t.from !== ME && t.to !== ME && !t.done));
  $('#owSplits').innerHTML = sp.length ? '<h3 class="p-h">โอนกันเองในกลุ่ม (ยังไม่ครบ)</h3>' : '';
  sp.forEach(s => {
    const el = document.createElement('div');
    el.className = 'ow-card';
    el.innerHTML = `<b>${esc(s.title)}</b><div class="meta">${esc(fmtD(s.date))}</div>` + s.transfers.map((t, i) => t.from === ME || t.to === ME ? '' :
      `<label class="ow-tr"><input type="checkbox" data-i="${i}" ${t.done ? 'checked' : ''}><span>${esc(t.from)} → ${esc(t.to)}</span><b>${bahtS(toS(t.amount))}</b></label>`).join('') +
      `<button type="button" class="mini ow-edit">✏️ ดู / แก้บิล</button>`;
    el.querySelectorAll('input[data-i]').forEach(cb => cb.onchange = () => { s.transfers[+cb.dataset.i].done = cb.checked; saveDocs([s]); });
    el.querySelector('.ow-edit').onclick = () => openSplit(s);
    $('#owSplits').appendChild(el);
  });
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
  $('#oTitle').textContent = d ? 'แก้รายการ' : v === 'they' ? '💸 ให้ยืม' : '🙏 ยืมเขา';
  $('#oDlg').showModal();
}
function paintDir() { $('#oDir').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === $('#oForm').dataset.dir)); }
$('#oDir').onclick = e => { const b = e.target.closest('button'); if (b) { $('#oForm').dataset.dir = b.dataset.v; paintDir(); } };
$('#oCancel').onclick = () => $('#oDlg').close();
$('#oForm').addEventListener('submit', e => {
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
$('#oDel').onclick = () => {
  if (!oEditing) return;
  if (oEditing.splitId) { alert('รายการนี้มาจากบิลหารกัน ให้ลบหรือแก้ที่บิลแทน'); return; }
  if (!confirm('ลบรายการนี้ (รวมประวัติการคืน)?')) return;
  const d = oEditing; $('#oDlg').close(); moneyDel(d.moneyId); delDocs([d.id]);
  if ($('#pDlg').open) $('#pDlg').close();
};
document.querySelectorAll('.ow-new').forEach(b => b.onclick = () => b.dataset.k === 'split' ? openSplit() : openLoan(b.dataset.k));

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
    el.querySelector('.e').onclick = () => d.splitId ? openSplit(splits().find(s => s.id === d.splitId)) : openLoan(null, d);
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
  const f = $('#sForm').elements;
  f.title.value = sp.title; f.date.value = sp.date;
  $('#sDel').hidden = !s;
  paintSplit();
  $('#sDlg').showModal();
}
$('#sCancel').onclick = () => $('#sDlg').close();
$('#sAddP').onclick = () => addPerson($('#sNewP').value);
$('#sNewP').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson($('#sNewP').value); } });
function addPerson(n) {
  n = String(n || '').trim();
  $('#sNewP').value = '';
  if (!n || sp.people.includes(n)) return;
  sp.people.push(n);
  sp.bills.forEach(b => { if (b.method !== 'custom') b.who.push(n); b.items.forEach(it => it.all && it.who.push(n)); });
  paintSplit();
}
$('#sAddBill').onclick = () => { sp.bills.push(blankBill(sp.people.find(p => p !== ME) || ME)); paintSplit(); };

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
function billShares(b) {
  const sh = {};
  if (b.method === 'custom') {
    sp.people.forEach(p => { const v = toS(b.custom[p]); if (v) sh[p] = v; });
    return { shares: sh, total: Object.values(sh).reduce((s, v) => s + v, 0) };
  }
  if (b.method === 'menu') {
    const sub = {};
    b.items.forEach(it => { const w = it.who.filter(p => sp.people.includes(p)); const parts = apportion(toS(it.price), w.map(() => 1)); w.forEach((p, i) => { sub[p] = (sub[p] || 0) + parts[i]; }); });
    const subT = Object.values(sub).reduce((s, v) => s + v, 0);
    let tot = subT * (b.svc ? 1.1 : 1) * (b.vat ? 1.07 : 1) - toS(b.disc);
    const whole = b.items.every(it => toS(it.price) % 100 === 0) && toS(b.disc) % 100 === 0;
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
  return sp.people.map(p => `<button type="button" class="${cls || ''}${sel.includes(p) ? ' on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('');
}
function paintSplit() {
  $('#sPeople').innerHTML = sp.people.map(p => `<button type="button" class="on" data-p="${esc(p)}">${esc(p)}${p === ME ? '' : ' ✕'}</button>`).join('');
  $('#sPeople').onclick = e => {
    const b = e.target.closest('button'); if (!b || b.dataset.p === ME) return;
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
      <label>ใครจ่ายไปก่อน <select class="s-payer">${sp.people.map(p => `<option ${p === b.payer ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <div class="seg s-method">${[['equal', 'หารเท่ากัน'], ['custom', 'ระบุเอง'], ['menu', 'ตามเมนู']].map(([v, t]) => `<button type="button" data-v="${v}" class="${b.method === v ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="s-body"></div>`;
    const body = el.querySelector('.s-body');
    if (b.method === 'equal') {
      body.innerHTML = `<label>ยอดรวม <input class="s-total" inputmode="decimal" placeholder="0" value="${esc(b.total)}"></label><span class="lbl">หารกับใคร</span><div class="when-chips wrap s-who">${chipsHtml(b.who)}</div>`;
      body.querySelector('.s-total').oninput = e => { b.total = e.target.value; paintSum(); };
      body.querySelector('.s-who').onclick = e => { const c = e.target.closest('button'); if (!c) return; const p = c.dataset.p; b.who = b.who.includes(p) ? b.who.filter(x => x !== p) : [...b.who, p]; c.classList.toggle('on'); paintSum(); };
    } else if (b.method === 'custom') {
      body.innerHTML = sp.people.map(p => `<label class="s-cust"><span>${esc(p)}</span><input inputmode="decimal" data-p="${esc(p)}" placeholder="0" value="${esc(b.custom[p] || '')}"></label>`).join('');
      body.querySelectorAll('input').forEach(i => i.oninput = () => { b.custom[i.dataset.p] = i.value; paintSum(); });
    } else {
      body.innerHTML = b.items.map((it, ii) => `<div class="s-item" data-i="${ii}">
          <div class="s-ih"><input class="s-iname" placeholder="ชื่อเมนู" value="${esc(it.name)}"><input class="s-iprice" inputmode="decimal" placeholder="ราคา" value="${esc(it.price)}"><button type="button" class="mini s-irm" aria-label="ลบเมนู">✕</button></div>
          <div class="when-chips wrap s-iwho">${chipsHtml(it.who)}</div></div>`).join('') +
        `<button type="button" class="ghost s-iadd">＋ เพิ่มเมนู</button>
         <div class="when-chips wrap s-extra"><button type="button" data-x="svc" class="${b.svc ? 'on' : ''}">Service 10%</button><button type="button" data-x="vat" class="${b.vat ? 'on' : ''}">VAT 7%</button></div>
         <label>ส่วนลด (บาท) <input class="s-disc" inputmode="decimal" placeholder="0" value="${esc(b.disc)}"></label>`;
      body.querySelectorAll('.s-item').forEach(row => {
        const it = b.items[+row.dataset.i];
        row.querySelector('.s-iname').oninput = e => { it.name = e.target.value; };
        row.querySelector('.s-iprice').oninput = e => { it.price = e.target.value; paintSum(); };
        row.querySelector('.s-irm').onclick = () => { b.items.splice(+row.dataset.i, 1); paintSplit(); };
        row.querySelector('.s-iwho').onclick = e => { const c = e.target.closest('button'); if (!c) return; const p = c.dataset.p; it.who = it.who.includes(p) ? it.who.filter(x => x !== p) : [...it.who, p]; it.all = it.who.length === sp.people.length; c.classList.toggle('on'); paintSum(); };
      });
      body.querySelector('.s-iadd').onclick = () => { b.items.push({ name: '', price: '', who: [...sp.people], all: true }); paintSplit(); setTimeout(() => { const ins = el.querySelectorAll('.s-iname'); ins[ins.length - 1]?.focus(); }, 30); };
      body.querySelector('.s-extra').onclick = e => { const c = e.target.closest('button'); if (!c) return; b[c.dataset.x] = !b[c.dataset.x]; c.classList.toggle('on'); paintSum(); };
      body.querySelector('.s-disc').oninput = e => { b.disc = e.target.value; paintSum(); };
    }
    el.querySelector('.s-payer').onchange = e => { b.payer = e.target.value; paintSum(); };
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
function paintSum() {
  const r = calcSplit();
  const rows = sp.people.map(p => `<div><span>${esc(p)}</span><b>${bahtS(r.share[p] || 0)}</b></div>`).join('');
  const tr = r.transfers.length ? '<h4>สรุปโอนให้จบ</h4>' + r.transfers.map(t => `<div><span>${esc(t.from)} → ${esc(t.to)}</span><b>${bahtS(t.amountS)}</b></div>`).join('') : '';
  const mine = r.share[ME] || 0;
  $('#sSum').innerHTML = `<h4>ส่วนของแต่ละคน</h4>${rows}<div class="tot"><span>รวม</span><b>${bahtS(r.total)}</b></div>${tr}
    <p class="note">📒 จดลงรายจ่ายเฉพาะส่วนของเรา <b>${bahtS(mine)}</b> · ที่เหลือเป็น "ค้างกัน" ไม่ทำให้ยอดใช้จ่ายเพี้ยน</p>`;
}

$('#sForm').addEventListener('submit', async e => {
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
});
$('#sDel').onclick = async () => {
  if (!sp || !confirm(`ลบบิล "${sp.title}" และยอดค้างที่มาจากบิลนี้ทั้งหมด?`)) return;
  const ids = [sp.id, ...debts().filter(d => d.splitId === sp.id).map(d => d.id)];
  moneyDel(sp.moneyId);
  $('#sDlg').close();
  if ($('#pDlg').open) $('#pDlg').close();
  await delDocs(ids);
};

if (view === 'owe') renderOwe();
syncOwe();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncOwe(); });
