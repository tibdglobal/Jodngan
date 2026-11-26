/* จดครบ — 🩺 สถานะระบบ: เว็บ · เครื่องนี้ · หลังบ้าน · LINE · AI · สำรอง · Gmail (ไม่โชว์ค่าลับ บอกแค่ตั้งแล้วหรือยัง) */
const ago = s => {
  if (!s) return '';
  if (String(s).length === 10) { const d = Math.round((Date.parse(today()) - Date.parse(s)) / 864e5); return d <= 0 ? 'วันนี้' : d === 1 ? 'เมื่อวาน' : d + ' วันก่อน'; }
  const t = Date.parse(String(s).length === 10 ? s + 'T00:00:00+07:00' : String(s).replace(' ', 'T') + (/[zZ+]/.test(String(s).slice(10)) ? '' : '+07:00'));
  if (isNaN(t)) return s;
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? m + ' นาทีก่อน' : m < 1440 ? Math.round(m / 60) + ' ชม.ก่อน' : Math.round(m / 1440) + ' วันก่อน';
};
const row = (ok, label, val, hint) => `<li class="st-${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}"><span>${ok === true ? '✅' : ok === false ? '❌' : '⚠️'} ${label}${hint ? `<small>${hint}</small>` : ''}</span><b>${val || ''}</b></li>`;

async function local() {
  let web = '';
  try { web = (await caches.keys()).filter(k => /^jodngan-v/.test(k)).sort().pop() || ''; } catch (e) {}
  const ob = LS.get('hubOutbox', []), fail = LS.get('hubOutboxFail', []);
  return `<section class="s-card ov-card"><h3>📱 เครื่องนี้</h3><ul class="ov-rows st">
    ${row(web ? true : null, 'เวอร์ชันแอปในเครื่อง', web ? web.replace('jodngan-', '') : 'ไม่ทราบ', 'ถ้าเลขเก่า ปิด-เปิดแอป 1–2 รอบ')}
    ${row(!!cfg.key, 'เชื่อมเครื่องแล้ว', cfg.key ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม', cfg.key ? '' : 'พิมพ์ ลิงก์ ใน LINE แล้วเปิดลิงก์')}
    ${row(navigator.onLine, 'อินเทอร์เน็ต', navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์')}
    ${row(ob.length ? null : true, 'รายการรอส่ง', ob.length ? ob.length + ' รายการ' : 'ไม่มี', ob.length ? 'จะส่งเองเมื่อออนไลน์' : '')}
    ${fail.length ? row(null, 'ส่งแล้วระบบไม่รับ', fail.length + ' รายการ', esc(fail.slice(-1)[0].error || '')) : ''}
  </ul>
  <div class="st-btns"><button type="button" class="mini" id="stCache">🔄 ล้างแคชแล้วโหลดใหม่</button>${fail.length ? '<button type="button" class="mini" id="stFail">ล้างรายการที่ไม่รับ</button>' : ''}</div></section>`;
}

function remote(r) {
  const tickM = r.lastTick ? (Date.now() - Date.parse(r.lastTick + '+07:00')) / 60000 : 1e9;
  const need = ['checkReminders', 'morningSummary'];
  const missT = need.filter(n => !(r.triggers || []).includes(n));
  const q = r.line.quota;
  const qTxt = q ? (q.limit ? `${q.used}/${q.limit}` : `${q.used} ข้อความ`) : '';
  const bk = r.backup ? (Date.now() - Date.parse(r.backup + 'T00:00:00+07:00')) / 864e5 : 99;
  const rows = Object.entries(r.rows || {}).filter(([k]) => /^(Tasks|Bills|Inbox)$/.test(k)).map(([k, n]) => `${{ Tasks: 'งาน', Bills: 'บิล', Inbox: 'ฝาก' }[k]} ${n}`).join(' · ');
  return `<section class="s-card ov-card"><h3>☁️ หลังบ้าน <small>v${r.ver} · ${esc(r.account || '')}</small></h3><ul class="ov-rows st">
    ${row(tickM < 40, 'รอบเตือนอัตโนมัติ (ทุก 15 นาที)', ago(r.lastTick) || 'ยังไม่เคยทำงาน', tickM < 40 ? '' : 'ถ้าเกิน 40 นาที ตัวตั้งเวลาอาจหยุด')}
    ${row(!missT.length, 'ตัวตั้งเวลา', missT.length ? 'ขาด ' + missT.join(', ') : (r.triggers || []).length + ' ตัว')}
    ${row(r.line.token && r.line.owner, 'LINE OA', r.line.token && r.line.owner ? 'เชื่อมแล้ว' : 'ยังไม่ครบ')}
    ${q ? row(!q.limit || q.used < q.limit * 0.8 ? true : null, 'โควตาข้อความ LINE เดือนนี้', qTxt) : ''}
    ${row(r.ai.key, 'AI อ่านใบเสร็จ / เสียง', r.ai.key ? esc(r.ai.model) : 'ยังไม่ใส่ key', '<button type="button" class="link-btn" id="stAi">ทดสอบ</button>')}
    ${aiHealthRow(r.ai)}
    ${row(bk <= 8 ? true : null, 'สำรองชีตรายสัปดาห์', r.backup ? ago(r.backup) : 'ยังไม่เคย', '<button type="button" class="link-btn" id="stBk">สำรองตอนนี้</button>')}
    ${row(r.weeklySent ? true : null, 'สรุปสัปดาห์ (ศุกร์ 17:00)', r.weeklySent ? 'ส่งล่าสุด ' + esc(r.weeklySent) : 'ยังไม่เคยส่ง')}
    ${row(r.mail ? true : null, '✉️ งานจากอีเมล (ป้าย จดงาน)', r.mail ? 'เปิดใช้' : 'ยังไม่เปิด')}
    ${row(r.meet ? true : null, '📋 คลังรายงานประชุม TIBD', r.meet ? 'เชื่อมแล้ว' : 'ยังไม่ตั้งค่า')}
    ${row(r.bridge ? true : null, '📅 ปฏิทิน (สะพาน)', r.bridge ? 'เชื่อมแล้ว' : 'ยังไม่ตั้งค่า')}
    ${row(r.vault.work ? true : null, '🔐 ตู้รหัสงาน', r.vault.work ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง')}
    ${(() => {   // 🧯 error ล่าสุดของคำขอจากแอป (หลังบ้านเก็บ 5 อัน) · เกิน 3 วันแล้วถือว่าเก่า
      const es = r.errors || [], recent = es.filter(x => (Date.now() - Date.parse(String(x.at).replace(' ', 'T') + '+07:00')) / 864e5 < 3);
      if (!es.length) return row(true, '🧯 error ล่าสุด', 'ไม่มี');
      const e = es[0];
      return row(recent.length ? null : true, '🧯 error ล่าสุด', recent.length ? `${recent.length} ครั้งใน 3 วัน` : 'ไม่มีใน 3 วัน',
        esc(`${ago(e.at) || e.at} · ${e.action || '-'} · ${e.msg}`));
    })()}
  </ul>${rows ? `<p class="hint">ข้อมูลในชีต: ${rows}</p>` : ''}<p class="hint" id="stMsg"></p></section>`;
}

/* 🩺 AI วันนี้: อ่านสำเร็จ/ไม่ตอบ · รุ่นที่ใช้อยู่ · error ล่าสุด */
function aiHealthRow(ai) {
  const h = ai && ai.health;
  if (!ai || !ai.key || !h) return '';
  const bad = h.fail >= 3 ? false : h.fail ? null : true;
  const sub = [h.switched ? `สลับไปใช้รุ่นสำรอง ${esc(h.use)} ชั่วคราว` : '', h.last && h.fail ? `ล่าสุด ${esc(h.last.model)}: ${esc(h.last.msg)}` : '', h.prev ? `เมื่อวาน สำเร็จ ${h.prev.ok} · ไม่ตอบ ${h.prev.fail}` : ''].filter(Boolean).join('<br>');
  return row(bad, 'AI วันนี้', `สำเร็จ ${h.ok} · ไม่ตอบ ${h.fail}`, sub);
}

async function load() {
  $('#st').innerHTML = await local() + '<p class="empty">กำลังเช็กหลังบ้าน…</p>';
  bind();
  if (!cfg.key) return;
  try {
    const r = await api('status');
    $('#st').innerHTML = await local() + remote(r);
    bind();
  } catch (e) {
    $('#st').innerHTML = await local() + `<section class="s-card ov-card"><h3>☁️ หลังบ้าน</h3><ul class="ov-rows st">${row(false, 'ติดต่อหลังบ้านไม่ได้', '', esc(e.message))}</ul></section>`;
    bind();
  }
}
function bind() {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
  on('stCache', async () => { try { (await caches.keys()).forEach(k => caches.delete(k)); const rs = await navigator.serviceWorker.getRegistrations(); rs.forEach(r => r.update()); } catch (e) {} location.reload(); });
  on('stFail', () => { LS.set('hubOutboxFail', []); load(); });
  on('stAi', async () => {
    $('#stMsg').textContent = 'กำลังทดสอบ AI…';
    try { const r = await api('ai_debug'); const ok = (r.tries || []).find(t => t.code === 200 || t.ok); $('#stMsg').textContent = ok ? `✅ AI ตอบได้ (${ok.model || ''}${ok.ms ? ' · ' + (ok.ms / 1000).toFixed(1) + ' วิ' : ''})` : '⚠️ ' + ((r.tries || [])[0] ? JSON.stringify(r.tries[0]).slice(0, 160) : (r.msg || r.listErr || 'ไม่มีผลทดสอบ')); }
    catch (e) { $('#stMsg').textContent = '❌ ' + e.message; }
  });
  on('stBk', async () => { $('#stMsg').textContent = 'กำลังสำรอง…'; try { await api('backup_now'); $('#stMsg').textContent = '✅ สำรองแล้ว'; setTimeout(load, 800); } catch (e) { $('#stMsg').textContent = '❌ ' + e.message; } });
}
$('#btnSync').onclick = load;
load();
