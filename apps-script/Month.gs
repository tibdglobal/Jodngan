/* จดครบ — ภาพรวมประจำเดือน (งาน · เบิก) */

/* ===================== 📊 ภาพรวมประจำเดือน (งาน · เบิก) ===================== */
function monthOverview_(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) month = todayStr_().slice(0, 7);
  const today = todayStr_(), inM = s => String(s || '').slice(0, 7) === month;
  const sum = list => list.reduce((s, x) => s + Number(x.amount || 0), 0);
  // งาน (เสร็จ = ติ๊กเสร็จ + แก้ล่าสุดในเดือนนั้น)
  const tasks = readAll_();
  const done = tasks.filter(t => t.done === '1' && inM(t.updated || t.date));
  const open = tasks.filter(t => t.done !== '1');
  const overdue = open.filter(t => t.date && t.date < today);
  const dueM = open.filter(t => t.date && inM(t.date) && t.date >= today);
  const byProj = {};
  done.forEach(t => { const k = t.project || ''; if (k) byProj[k] = (byProj[k] || 0) + 1; });
  // เบิก
  const bills = billsAll_();
  const bm = bills.filter(b => inM(b.date));
  const st = s => bills.filter(b => b.status === s);
  return {
    month: month,
    tasks: { done: done.length, open: open.length, overdue: overdue.length, dueLeft: dueM.length,
      doneList: done.sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 8).map(t => ({ title: t.title, project: t.project, at: String(t.updated || '').slice(0, 10) })),
      overdueList: overdue.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6).map(t => ({ title: t.title, date: t.date })),
      projects: Object.entries(byProj).sort((a, b) => b[1] - a[1]).slice(0, 5) },
    bills: { month: sum(bm), monthN: bm.length, draft: sum(st('draft')), draftN: st('draft').length, ready: sum(st('ready')), readyN: st('ready').length,
      submitted: sum(st('submitted')), submittedN: st('submitted').length, paidM: sum(bills.filter(b => b.status === 'paid' && inM(b.paid))) },
  };
}

function monthOverviewText_(month) {
  const o = monthOverview_(month), T = o.tasks, B = o.bills;
  const th = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(o.month.slice(5, 7))];
  const out = ['📊 ภาพรวม ' + th + ' ' + (Number(o.month.slice(0, 4)) + 543),
    '', '✓ งาน: เสร็จ ' + T.done + ' · ค้าง ' + T.open + (T.overdue ? ' (เลยกำหนด ' + T.overdue + ')' : '') + (T.dueLeft ? ' · ครบกำหนดเดือนนี้อีก ' + T.dueLeft : ''),
  ];
  out.push('', '🧾 เบิก: บิลเดือนนี้ ' + fmtBaht_(B.month) + ' (' + B.monthN + ')' + (B.readyN ? ' · พร้อมเบิก ' + fmtBaht_(B.ready) : '') + (B.submittedN ? ' · รอเงินคืน ' + fmtBaht_(B.submitted) : '') + (B.paidM ? ' · ได้คืนแล้ว ' + fmtBaht_(B.paidM) : ''));
  out.push('', 'ดูละเอียดในแอป หน้า 📊 ภาพรวม');
  return out.join('\n');
}
