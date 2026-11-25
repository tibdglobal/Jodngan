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
    const r = await api('month_overview', { month: want, work: true });
    r._at = Date.now();
    LS.set(cacheKey(want), r);
    if (want === month) { showStatus(''); render(r); }
  } catch (e) { showStatus('ดึงภาพรวมไม่สำเร็จ: ' + e.message); }
}

const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const fmtD = s => s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '';

function render(o) {
  const T = o.tasks, B = o.bills;
  const isNow = month === today().slice(0, 7);

  const tiles = `<section class="ov-tiles">
    <a href="./" class="ov-tile t-task"><b>${T.done}</b><span>งานเสร็จ</span><small>${T.overdue ? `เลยกำหนด ${T.overdue}` : `ค้าง ${T.open}`}</small></a>
    <a href="bills.html" class="ov-tile t-out"><b>${baht(B.ready + B.draft)}</b><span>รอเบิก</span><small>${B.readyN + B.draftN} บิล</small></a>
    <a href="bills.html" class="ov-tile t-in"><b>${baht(B.submitted)}</b><span>รอเงินคืน</span><small>${B.submittedN} บิล</small></a>
  </section>`;

  const task = `<section class="s-card ov-card">
    <h3>✓ งาน <small>เสร็จ ${T.done} · ค้าง ${T.open}${isNow && T.dueLeft ? ` · ครบกำหนดเดือนนี้อีก ${T.dueLeft}` : ''}</small></h3>
    ${T.projects.length ? `<div class="ov-chips">${T.projects.map(([p, n]) => `<span>#${esc(p)} <b>${n}</b></span>`).join('')}</div>` : ''}
    ${T.overdueList.length ? `<h4 class="ov-sub warn">⚠️ เลยกำหนด</h4><ul class="ov-list">${T.overdueList.map(t => `<li><span>${esc(t.title)}</span><small>${fmtD(t.date)}</small></li>`).join('')}</ul>` : ''}
    ${T.doneList.length ? `<h4 class="ov-sub">เสร็จล่าสุด</h4><ul class="ov-list done">${T.doneList.map(t => `<li><span>${esc(t.title)}</span><small>${fmtD(t.at)}</small></li>`).join('')}</ul>` : '<p class="hint">ยังไม่มีงานที่ติ๊กเสร็จในเดือนนี้</p>'}
    <a class="ov-more" href="./">ไปหน้างาน ›</a>
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

  $('#ov').innerHTML = tiles + task + bills;   // เงิน/ค้างกัน อยู่แอปเงิน
}

window.addEventListener('hashchange', () => { const m = (location.hash.match(/^#(\d{4}-\d{2})$/) || [])[1]; if (m && m !== month) { month = m; load(); } });
load();
