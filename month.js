/* จดครบ — 📊 ภาพรวมประจำเดือน: งาน · เงิน · เบิก · ค้างกัน (ข้อมูลจาก month_overview ที่หลังบ้าน) */
let month = (location.hash.match(/^#(\d{4}-\d{2})$/) || [])[1] || today().slice(0, 7);
const cacheKey = m => 'monthOv:' + m;

function paintBar() {
  $('#mLabel').textContent = monthName(month);
  $('#mNext').disabled = month >= today().slice(0, 7);
}
$('#mPrev').onclick = () => go(addMonth(month, -1));
$('#mNext').onclick = () => go(addMonth(month, 1));
$('#mLabel').onclick = () => go(today().slice(0, 7));
$('#btnSync').onclick = () => load(true);
function go(m) { month = m; history.replaceState(null, '', '#' + m); load(); }

async function load(force) {
  paintBar();
  const c = LS.get(cacheKey(month), null);
  if (c) render(c); else $('#ov').innerHTML = '<p class="empty">กำลังรวบรวม…</p>';
  if (c && !force && Date.now() - (c._at || 0) < 60000) return;
  if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่อง เปิดลิงก์ส่วนตัวจาก LINE (พิมพ์ ลิงก์) ก่อนครับ'); return; }
  const want = month;
  try {
    const r = await api('month_overview', { month: want });
    r._at = Date.now();
    LS.set(cacheKey(want), r);
    if (want === month) { showStatus(''); render(r); }
  } catch (e) { showStatus('ดึงภาพรวมไม่สำเร็จ: ' + e.message); }
}

const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const fmtD = s => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

function render(o) {
  const T = o.tasks, M = o.money, B = o.bills, W = o.owe;
  const net = M.inc - M.out;
  const diff = M.prevOut ? M.out - M.prevOut : 0;
  const isNow = month === today().slice(0, 7);
  const catMax = M.cats.length ? M.cats[0][1] : 0;

  const tiles = `<section class="ov-tiles">
    <a href="./" class="ov-tile t-task"><b>${T.done}</b><span>งานเสร็จ</span><small>${T.overdue ? `เลยกำหนด ${T.overdue}` : `ค้าง ${T.open}`}</small></a>
    <a href="money.html" class="ov-tile t-out"><b>${baht(M.out)}</b><span>รายจ่าย</span><small>${M.prevOut ? (diff > 0 ? '▲ เพิ่ม ' : '▼ ลด ') + baht(Math.abs(diff)) : M.count + ' รายการ'}</small></a>
    <a href="money.html" class="ov-tile ${net < 0 ? 't-neg' : 't-in'}"><b>${net < 0 ? '−' + baht(-net) : baht(net)}</b><span>${net < 0 ? 'จ่ายเกินรับ' : 'คงเหลือ'}</span><small>รับ ${baht(M.inc)}</small></a>
  </section>`;

  const task = `<section class="s-card ov-card">
    <h3>✓ งาน <small>เสร็จ ${T.done} · ค้าง ${T.open}${isNow && T.dueLeft ? ` · ครบกำหนดเดือนนี้อีก ${T.dueLeft}` : ''}</small></h3>
    ${T.projects.length ? `<div class="ov-chips">${T.projects.map(([p, n]) => `<span>#${esc(p)} <b>${n}</b></span>`).join('')}</div>` : ''}
    ${T.overdueList.length ? `<h4 class="ov-sub warn">⚠️ เลยกำหนด</h4><ul class="ov-list">${T.overdueList.map(t => `<li><span>${esc(t.title)}</span><small>${fmtD(t.date)}</small></li>`).join('')}</ul>` : ''}
    ${T.doneList.length ? `<h4 class="ov-sub">เสร็จล่าสุด</h4><ul class="ov-list done">${T.doneList.map(t => `<li><span>${esc(t.title)}</span><small>${fmtD(t.at)}</small></li>`).join('')}</ul>` : '<p class="hint">ยังไม่มีงานที่ติ๊กเสร็จในเดือนนี้</p>'}
    <a class="ov-more" href="./">ไปหน้างาน ›</a>
  </section>`;

  const money = `<section class="s-card ov-card">
    <h3>💰 เงิน <small>รับ ${baht(M.inc)} · จ่าย ${baht(M.out)}</small></h3>
    ${M.cats.length ? `<div class="ov-bars">${M.cats.map(([k, v]) => `<div class="ov-bar"><span>${icon('out', k)} ${esc(k)}</span><b>${baht(v)}</b><i><em style="width:${pct(v, catMax)}%"></em></i></div>`).join('')}</div>` : '<p class="hint">ยังไม่มีรายจ่ายในเดือนนี้</p>'}
    ${M.budgets.length ? `<h4 class="ov-sub">🎯 งบ</h4><div class="ov-bars">${M.budgets.sort((a, b) => b.used / b.limit - a.used / a.limit).map(b => `<div class="ov-bar ${b.used > b.limit ? 'over' : b.used >= b.limit * .8 ? 'near' : 'ok'}"><span>${icon('out', b.cat)} ${esc(b.cat)}</span><b>${baht(b.used)} <small>/ ${baht(b.limit)}</small></b><i><em style="width:${pct(b.used, b.limit)}%"></em></i></div>`).join('')}</div>` : ''}
    <a class="ov-more" href="money.html">ไปหน้าเงิน ›</a>
  </section>`;

  const row = (label, v, n, cls) => n ? `<li class="${cls || ''}"><span>${label} <small>${n} รายการ</small></span><b>${baht(v)}</b></li>` : '';
  const bills = `<section class="s-card ov-card">
    <h3>🧾 เบิกบริษัท <small>บิลเดือนนี้ ${baht(B.month)} (${B.monthN})</small></h3>
    <ul class="ov-rows">
      ${row('📝 ขาดหลักฐาน', B.draft, B.draftN, 'warn')}
      ${row('📎 พร้อมเบิก', B.ready, B.readyN)}
      ${row('📤 รอเงินคืน', B.submitted, B.submittedN)}
      ${B.paidM ? `<li class="good"><span>✅ ได้เงินคืนในเดือนนี้</span><b>${baht(B.paidM)}</b></li>` : ''}
    </ul>
    ${!B.draftN && !B.readyN && !B.submittedN && !B.paidM ? '<p class="hint">ไม่มีบิลค้างเบิก 👍</p>' : ''}
    <a class="ov-more" href="bills.html">ไปหน้าเบิก ›</a>
  </section>`;

  const owe = `<section class="s-card ov-card">
    <h3>🤝 ค้างกัน <small>ยอดตอนนี้</small></h3>
    <div class="ov-owe"><div class="in"><small>ใครค้างเรา</small><b>${baht(W.they)}</b></div><div class="out"><small>เราค้างเขา</small><b>${baht(W.me)}</b></div></div>
    ${W.people.length ? `<ul class="ov-rows">${W.people.map(p => `<li class="${p.net > 0 ? 'good' : 'warn'}"><span>${esc(p.name)} <small>${p.net > 0 ? 'ค้างเรา' : 'เราค้าง'}</small></span><b>${baht(Math.abs(p.net))}</b></li>`).join('')}</ul>` : '<p class="hint">ไม่มีใครค้างกัน 🎉</p>'}
    <a class="ov-more" href="money.html#owe">ไปหน้าค้างกัน ›</a>
  </section>`;

  $('#ov').innerHTML = tiles + task + money + bills + owe;
}

window.addEventListener('hashchange', () => { const m = (location.hash.match(/^#(\d{4}-\d{2})$/) || [])[1]; if (m && m !== month) { month = m; load(); } });
load();
