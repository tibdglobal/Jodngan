/* จดครบ — 📌 กล่องฝาก: 📇 การ์ดข้อมูล (หลายช่อง) + 📋 บันทึกประชุม / ดูงาน
 * โหลดหลัง inbox.js (ใช้ $, LS, api, esc, items, upsert, drop, render, toast, busy, busyEnd, showStatus, prepare, when) */

const TPL = {
  contact: { ic: '👤', name: 'ผู้ติดต่อ', ph: 'ชื่อคน', fields: ['บริษัท', 'ตำแหน่ง', 'เบอร์', 'อีเมล', 'LINE'] },
  place:   { ic: '📍', name: 'สถานที่', ph: 'ชื่อร้าน / สถานที่', fields: ['ที่อยู่', 'ลิงก์แผนที่', 'เวลาเปิด', 'เบอร์'] },
  company: { ic: '🏢', name: 'บริษัท/ผู้ขาย', ph: 'ชื่อบริษัท', fields: ['เลขผู้เสียภาษี', 'ที่อยู่ออกใบกำกับ', 'ผู้ติดต่อ', 'เบอร์', 'อีเมล'] },
  product: { ic: '🛒', name: 'สินค้า/ราคา', ph: 'ชื่อสินค้า', fields: ['ร้าน', 'ราคา', 'ลิงก์', 'สเปก'] },
  asset:   { ic: '🚗', name: 'ทรัพย์สิน/อุปกรณ์', ph: 'ชื่อ เช่น รถ / โน้ตบุ๊ก', fields: ['รุ่น', 'เลขเครื่อง/ทะเบียน', 'วันซื้อ', 'ประกันหมด'] },
  custom:  { ic: '✏️', name: 'กำหนดเอง', ph: 'ชื่อการ์ด', fields: [] },
};
const MTYPE = { meet: ['🤝', 'ประชุม'], visit: ['🏭', 'ดูงาน'], talk: ['🎤', 'คุยลูกค้า'], train: ['🎓', 'อบรม'] };
/* ข้อความในหน้าจดที่เปลี่ยนตามแบบบันทึก (ข้อมูลเก็บช่องเดิม: people / sections / todos / asks / decs) */
const MCFG = {
  meet:  { title: 'ชื่อเรื่อง เช่น ประชุมทีมขาย ประจำสัปดาห์', people: '👥 ผู้เข้าร่วม', sec: 'เช่น วาระ 1 · ฝ่ายขาย · งบประมาณ', quick: 'จดเร็ว: ประเด็นที่คุย',
           todos: '☐ งานต่อ', asks: '❓ คำถามที่ยังค้าง', decs: '✅ สิ่งที่ตกลงกัน', todoPh: '＋ งาน เช่น ส่งสรุปให้ทีม ศุกร์นี้', decPh: '＋ ข้อตกลง', arc: true, agenda: true, slides: true },
  visit: { title: 'ชื่อเรื่อง เช่น ดูงานโรงบด บ.เอบีซี', people: '👥 ผู้เข้าร่วม', sec: 'เช่น ชั้น 1 · เครื่องบด A · โกดัง', quick: 'จดเร็ว: บด 2 ตัน/วัน',
           todos: '☐ งานต่อ', asks: '❓ คำถามที่ยังค้าง', decs: '✅ สิ่งที่ตกลงกัน', todoPh: '＋ งาน เช่น ขอใบเสนอราคา ศุกร์นี้', decPh: '＋ ข้อตกลง', arc: true, plate: true },
  talk:  { title: 'ชื่อลูกค้า / เรื่อง เช่น คุณสมชาย บ.เอบีซี สนใจเครื่องบด', people: '👥 ลูกค้า / ผู้ร่วมคุย', sec: 'เช่น ความต้องการ · งบ · สินค้าที่สนใจ', quick: 'จดเร็ว: ลูกค้าต้องการ…',
           todos: '☐ ติดตามลูกค้า', asks: '❓ ลูกค้าถาม / ต้องหาคำตอบ', decs: '✅ สิ่งที่รับปาก / ตกลงกัน', todoPh: '＋ เช่น ส่งใบเสนอราคา พรุ่งนี้', decPh: '＋ เช่น ให้ทดลองใช้ 7 วัน', arc: true, slides: true },
  train: { title: 'ชื่อหลักสูตร เช่น อบรม ISO 22000 รุ่น 3', people: '🎓 วิทยากร / ผู้เข้าอบรม', sec: 'เช่น บทที่ 1 · Workshop · กรณีศึกษา', quick: 'จดเร็ว: ประเด็นที่ได้เรียนรู้',
           todos: '🛠 นำไปใช้กับงาน', asks: '❓ ข้อสงสัย / ไว้ถามต่อ', decs: '💡 สิ่งที่ได้เรียนรู้', todoPh: '＋ เช่น ปรับแบบฟอร์มตรวจรับของ', decPh: '＋ สรุปเป็นข้อสั้นๆ', arc: false, agenda: true, slides: true },
};
const mcfg = t => MCFG[t] || MCFG.meet;
const UNIT_RE = /^(?:$|.*\/|ตัน|กก|กิโล|kg|g\b|กรัม|ลิตร|l\b|ml|มล|ซีซี|cc|ชม|ชั่วโมง|นาที|วิ|วัน|สัปดาห์|เดือน|ปี|คน|เครื่อง|ตัว|ชิ้น|ชุด|ไร่|งาน|ตร|ม\.|m\b|m2|m3|เมตร|ซม|cm|mm|มม|นิ้ว|kw|kva|w\b|วัตต์|hp|แรง|v\b|โวลต์|a\b|แอมป์|rpm|รอบ|บาท|฿|%|°|องศา|c\b|bar|psi|ถุง|กล่อง|ลัง|พาเลท|ไลน์|line|ห้อง|ชั้น|คัน|ลูก|กระสอบ|ตู้|เท่า|ล้าน|พัน|หมื่น|แสน|k\b|mb|gb|tb|ไมครอน|micron|mesh|เมช)/i;

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isPhone = v => /^\+?[\d][\d\s-]{7,}$/.test(String(v).trim()) && String(v).replace(/\D/g, '').length >= 9;
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const isUrl = v => /^(https?:\/\/|www\.)\S+$/i.test(String(v).trim());
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function copyText(t, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(msg || '📋 คัดลอกแล้ว'))
    .catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast(msg || '📋 คัดลอกแล้ว'); } catch {} a.remove(); });
}
function thumbOf(file, size = 200) {
  return new Promise(ok => {
    const u = URL.createObjectURL(file), i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(u);
      const r = Math.min(1, size / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(i.naturalWidth * r); c.height = Math.round(i.naturalHeight * r);
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.6));
    };
    i.onerror = () => { URL.revokeObjectURL(u); ok(''); };
    i.src = u;
  });
}
function pickFiles(multiple, accept = 'image/*') {
  return new Promise(ok => {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = accept; f.multiple = !!multiple;
    f.onchange = () => ok([...f.files]);
    f.click();
  });
}

/* ===================== ในรายการกล่องฝาก ===================== */
function valHtml(k, v) {
  const s = String(v).trim();
  const act = isPhone(s) ? `<a class="mini" href="tel:${esc(s.replace(/[^\d+]/g, ''))}">📞 โทร</a>`
    : isEmail(s) ? `<a class="mini" href="mailto:${esc(s)}">✉️</a>`
    : isUrl(s) ? `<a class="mini" href="${esc(/^http/i.test(s) ? s : 'https://' + s)}" target="_blank" rel="noopener">เปิด ↗</a>`
    : /^line$|ไลน์/i.test(k) && /^@?[\w.\-]{3,}$/.test(s) ? `<a class="mini" href="https://line.me/R/ti/p/${encodeURIComponent(s.startsWith('@') ? s : '~' + s)}" target="_blank" rel="noopener">💬 LINE</a>`
    : /ที่อยู่|แผนที่|สถานที่/.test(k) ? `<a class="mini" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s)}" target="_blank" rel="noopener">🗺</a>` : '';
  return `<div class="rf"><dt>${esc(k)}</dt><dd><button type="button" class="rf-v" data-copy="${esc(s)}" title="แตะเพื่อคัดลอก">${esc(s)}</button>${act}</dd></div>`;
}
function cardHtml(o) {
  const d = o.data || {}, t = TPL[d.tpl] || TPL.custom;
  const fs = (d.fields || []).filter(f => f.v);
  const sub = d.tpl === 'contact' ? ['บริษัท', 'ตำแหน่ง'].map(k => (fs.find(f => f.k === k) || {}).v).filter(Boolean).join(' · ') : '';
  const show = fs.filter(f => !(d.tpl === 'contact' && (f.k === 'บริษัท' || f.k === 'ตำแหน่ง')));
  return `<article class="in-card in-rec" data-id="${o.id}">
    <div class="rec-head" data-act="open">
      ${d.photo && d.photo.thumb ? `<img class="rec-ph" src="${d.photo.thumb}" alt="">` : `<span class="rec-ic">${t.ic}</span>`}
      <div><b>${esc(d.title || t.name)}</b>${sub ? `<small>${esc(sub)}</small>` : `<small>${t.ic} ${t.name}</small>`}</div>
    </div>
    ${show.length ? `<dl class="rec-f">${show.slice(0, 5).map(f => valHtml(f.k, f.v)).join('')}${show.length > 5 ? `<div class="rf more" data-act="open">+ อีก ${show.length - 5} ช่อง</div>` : ''}</dl>` : ''}
    ${d.note ? `<p class="in-text small">${textHtml(d.note)}</p>` : ''}
    <footer><small>${when(o.created)}</small><span class="spacer"></span>
      ${fs.some(f => isPhone(String(f.v)) || isEmail(String(f.v))) ? '<button class="mini" data-act="vcard" title="บันทึกลงรายชื่อในมือถือ">💾 บันทึกเบอร์</button>' : ''}
      <button class="mini" data-act="share" title="คัดลอกเป็นข้อความ">📤 ส่งต่อ</button>
      <button class="mini ghost" data-act="edit" aria-label="แก้ไข">✏️</button>
    </footer>
  </article>`;
}
/** 💾 การ์ด → ไฟล์ vCard (เปิดแล้วมือถือถามบันทึกลงรายชื่อ) */
function cardVcf(d) {
  const v = k => ((d.fields || []).find(f => f.k === k) || {}).v || '';
  const esc2 = x => String(x).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const L = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + esc2(d.title || 'ผู้ติดต่อ'), 'N:' + esc2(d.title || '') + ';;;;'];
  const org = v('บริษัท') || (d.tpl === 'company' ? d.title : '');
  if (org) L.push('ORG:' + esc2(org));
  if (v('ตำแหน่ง')) L.push('TITLE:' + esc2(v('ตำแหน่ง')));
  (d.fields || []).forEach(f => {
    const x = String(f.v || '').trim();
    if (!x) return;
    if (isPhone(x)) L.push('TEL;TYPE=CELL:' + x.replace(/[^\d+]/g, ''));
    else if (isEmail(x)) L.push('EMAIL:' + x);
    else if (/ที่อยู่/.test(f.k)) L.push('ADR:;;' + esc2(x) + ';;;;');
    else if (isUrl(x)) L.push('URL:' + x);
  });
  const note = [v('LINE') ? 'LINE: ' + v('LINE') : '', d.note || ''].filter(Boolean).join('\n');
  if (note) L.push('NOTE:' + esc2(note));
  L.push('END:VCARD');
  return L.join('\r\n');
}
function meetHtml(o) {
  const d = o.data || {}, ty = MTYPE[d.type] || MTYPE.meet;
  const secs = d.sections || [];
  const nRows = secs.reduce((s, x) => s + (x.rows || []).filter(r => r.k || r.v).length, 0);
  const nPh = secs.reduce((s, x) => s + (x.photos || []).length, 0);
  const open = (d.todos || []).filter(t => t.t && !t.done).length;
  const w = d.when ? new Date(d.when) : null;
  const meta = [w && !isNaN(w) ? w.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '', d.place].filter(Boolean).join(' · ');
  const ppl = (d.people || []);
  return `<article class="in-card in-meet${o._pending ? ' pending' : ''}" data-id="${o.id}">
    <div class="rec-head" data-act="open">
      <span class="rec-ic">${ty[0]}</span>
      <div><b>${esc(d.title || ty[1])}</b><small>${esc(meta || ty[1])}</small></div>
    </div>
    ${ppl.length ? `<p class="mt-ppl">👥 ${esc(ppl.slice(0, 3).join(', '))}${ppl.length > 3 ? ` +${ppl.length - 3}` : ''}</p>` : ''}
    <p class="mt-stat" data-act="open">${[secs.length ? secs.length + ' ส่วน' : '', nRows ? nRows + ' ข้อมูล' : '', nPh ? '📷 ' + nPh : '', (d.audio || []).length ? '🎙 ' + d.audio.length : '', open ? '☐ ' + open + ' งานต่อ' : '', d.summary ? '✨ มีสรุป' : ''].filter(Boolean).join(' · ') || 'แตะเพื่อจดต่อ'}</p>
    ${d.report ? `<a class="mt-rep" href="${esc(d.report.url || '#')}" target="_blank" rel="noopener">📋 รายงานที่ยืนยันแล้ว: ${esc(d.report.title)} ↗</a>` : ''}
    <footer><small>${o._pending ? '⏳ ยังไม่ได้ส่งขึ้น' : when(o.created)}</small><span class="spacer"></span>
      <button class="mini" data-act="share" title="คัดลอกเป็นข้อความ">📤 ส่งต่อ</button>
      <button class="mini" data-act="open">✏️ เปิด</button>
    </footer>
  </article>`;
}
function cardText(d) {
  const t = TPL[d.tpl] || TPL.custom;
  return [t.ic + ' ' + (d.title || t.name)].concat((d.fields || []).filter(f => f.v).map(f => f.k + ': ' + f.v), d.note ? [d.note] : []).join('\n');
}
function meetText(d) {
  const ty = MTYPE[d.type] || MTYPE.meet, out = [ty[0] + ' ' + (d.title || ty[1])];
  const w = d.when ? new Date(d.when) : null;
  const meta = [w && !isNaN(w) ? '🗓 ' + w.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '', d.place ? '📍 ' + d.place : ''].filter(Boolean).join(' · ');
  if (meta) out.push(meta);
  if ((d.people || []).length) out.push('👥 ' + d.people.join(', '));
  (d.sections || []).forEach(s => {
    const rows = (s.rows || []).filter(r => r.k || r.v);
    if (!rows.length && !s.notes && !(s.photos || []).length && !(s.files || []).length && !s.at) return;
    out.push('', '▸ ' + [s.at ? s.at + (s.end ? '–' + s.end : '') : '', s.name || 'ทั่วไป'].filter(Boolean).join(' ') + (s.who ? ' (' + s.who + ')' : ''));
    rows.forEach(r => out.push('• ' + [r.k, [r.v, r.u].filter(Boolean).join(' ')].filter(Boolean).join(': ')));
    if (s.notes) out.push(s.notes.trim());
    if ((s.photos || []).length) out.push('📷 รูป ' + s.photos.length + ' รูป');
    (s.files || []).forEach(f => out.push('📎 ' + f.name + (f.url ? ' ' + f.url : '')));
  });
  if ((d.audio || []).length) { const t = d.audio.reduce((s, a) => s + (a.dur || 0), 0); out.push('', '🎙 เสียงบันทึก ' + d.audio.length + ' ไฟล์' + (t ? ' รวม ' + Math.round(t / 60) + ' นาที' : '')); }
  const list = (title, arr, f) => { arr = (arr || []).filter(x => (x.t || x).toString().trim()); if (arr.length) out.push('', title, ...arr.map(f)); };
  const c = mcfg(d.type);
  if (d.type === 'train') list(c.decs, d.decs, x => '- ' + x.t);   // อบรม: สิ่งที่ได้เรียนรู้ขึ้นก่อน
  list(c.todos, d.todos, x => (x.done ? '✓ ' : '- ') + x.t);
  list(c.asks, d.asks, x => '- ' + x.t);
  if (d.type !== 'train') list(c.decs, d.decs, x => '- ' + x.t);
  return out.join('\n');
}

$('#iList').addEventListener('click', e => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { copyText(cp.dataset.copy, '📋 คัดลอก: ' + cp.dataset.copy.slice(0, 30)); return; }
  const b = e.target.closest('[data-act]');
  const card = e.target.closest('.in-card');
  if (!b || !card) return;
  const o = items.find(x => x.id === card.dataset.id);
  if (!o || (o.kind !== 'card' && o.kind !== 'meet')) return;
  if (b.dataset.act === 'rem' || b.dataset.act === 'remdone') return;   // ⏰ ให้ inbox.js จัดการ
  e.stopImmediatePropagation();
  if (b.dataset.act === 'vcard') {
    const d = o.data || {};
    const blob = new Blob([cardVcf(d)], { type: 'text/vcard' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (d.title || 'contact').replace(/[\\/:*?"<>|]/g, ' ') + '.vcf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return toast('💾 เปิดไฟล์ที่ได้ แล้วกดบันทึกลงรายชื่อ');
  }
  if (b.dataset.act === 'share') copyText(o.kind === 'card' ? cardText(o.data || {}) : ((o.data || {}).summary || meetText(o.data || {})), (o.data || {}).summary ? '📋 คัดลอกสรุปแล้ว วางใน LINE ได้เลย' : '📋 คัดลอกแล้ว วางใน LINE ได้เลย');
  else if (o.kind === 'card') openCard(o);
  else openMeet(o);
}, true);

/* ===================== ＋ สร้างใหม่ ===================== */
document.body.insertAdjacentHTML('beforeend', `
<dialog id="nDlg" class="sheet">
  <div class="n-wrap">
    <h2>สร้างใหม่</h2>
    <p class="n-h">📋 บันทึก ประชุม · ดูงาน · คุยลูกค้า · อบรม</p>
    <div class="n-grid n-grid4">${Object.entries(MTYPE).map(([k, v]) => `<button data-new="meet" data-v="${k}"><span>${v[0]}</span>${v[1]}</button>`).join('')}</div>
    <p class="n-h">📇 การ์ดข้อมูล</p>
    <div class="n-grid">${Object.entries(TPL).map(([k, v]) => `<button data-new="card" data-v="${k}"><span>${v.ic}</span>${v.name}</button>`).join('')}</div>
    <button class="n-ai" data-new="ai">📷 ถ่ายนามบัตร / ป้ายร้าน ให้ AI กรอกให้</button>
    <button class="n-close" data-new="x">ปิด</button>
  </div>
</dialog>

<dialog id="cDlg">
  <form id="cForm" method="dialog" autocomplete="off">
    <h2>📇 การ์ดข้อมูล</h2>
    <div class="c-tpl" id="cTpl"></div>
    <input id="cTitle" class="c-title" placeholder="ชื่อ">
    <div id="cFields" class="c-fields"></div>
    <div class="c-btns">
      <button type="button" class="mini" id="cAdd">＋ เพิ่มช่อง</button>
      <button type="button" class="mini" id="cAi">📷 อ่านจากรูป (AI)</button>
      <button type="button" class="mini" id="cPasteBtn">📋 วางข้อความ</button>
    </div>
    <div id="cPasteBox" hidden>
      <textarea id="cPaste" rows="4" placeholder="วางข้อความทั้งก้อน เช่น&#10;คุณสมชาย ใจดี&#10;เบอร์ 081-234-5678&#10;somchai@abc.co.th"></textarea>
      <button type="button" class="mini" id="cParse">✨ แยกเป็นช่อง</button>
    </div>
    <label>โน้ต <textarea id="cNote" rows="2" placeholder="รายละเอียดอื่นๆ #แท็ก"></textarea></label>
    <div class="dlg-actions">
      <button type="button" id="cDel" class="danger">ลบ</button>
      <span class="spacer"></span>
      <button type="button" id="cCancel">ยกเลิก</button>
      <button type="submit" class="primary">บันทึก</button>
    </div>
  </form>
</dialog>

<dialog id="mDlg" class="full">
  <div class="m-wrap">
    <header class="m-top">
      <button type="button" id="mBack" class="m-back">‹ เสร็จ</button>
      <span id="mState" class="m-state"></span>
      <span class="spacer"></span>
      <button type="button" id="mCopy" class="mini">📤 ส่งต่อ</button>
    </header>
    <div class="m-body" id="mBody">
      <input id="mTitle" class="m-title" placeholder="ชื่อเรื่อง เช่น ดูงานโรงบด บ.เอบีซี" enterkeyhint="next">
      <div class="m-types" id="mType">${Object.entries(MTYPE).map(([k, v]) => `<button type="button" class="chip" data-t="${k}">${v[0]} ${v[1]}</button>`).join('')}</div>
      <div id="mFromCal" class="m-cal"></div>
      <div class="m-meta">
        <input type="datetime-local" id="mWhen" aria-label="วันเวลา">
        <div class="m-place"><input id="mPlace" placeholder="สถานที่"><button type="button" id="mGeo" class="mini" title="ใช้ตำแหน่งตอนนี้">📍</button></div>
      </div>
      <section class="m-box">
        <h3 id="mPplH">👥 ผู้เข้าร่วม</h3>
        <div id="mPeople" class="m-chips"></div>
        <input id="mPerson" placeholder="พิมพ์ชื่อ แล้วกด Enter (คั่นหลายคนด้วย ,)" enterkeyhint="done">
        <div id="mSug" class="m-sug"></div>
      </section>
      <section class="m-box m-agenda" id="mAgBox">
        <h3>📅 กำหนดการ</h3>
        <p class="hint" id="mAgHint">อัปรูป/PDF กำหนดการ หรือวางข้อความ ให้ AI แยกเป็นช่วงเวลา แต่ละช่วงจะเป็นส่วนให้จด และตอนจดเร็วจะลงช่วงที่กำลังเป็นอยู่ให้เอง</p>
        <div class="c-btns">
          <button type="button" class="mini" id="mAgPic">📷 รูป / PDF กำหนดการ</button>
          <button type="button" class="mini" id="mAgTxt">📝 วางข้อความ</button>
          <a class="mini" id="mAgOpen" target="_blank" rel="noopener" hidden>🖼 ดูกำหนดการ ↗</a>
        </div>
        <div id="mAgPasteBox" hidden>
          <textarea id="mAgPaste" rows="6" placeholder="เช่น&#10;09:00–10:30 หลักการ HACCP (อ.สมชาย)&#10;10:30–10:45 พักเบรก&#10;10:45–12:00 Workshop ระบุอันตราย"></textarea>
          <div class="c-btns"><button type="button" class="mini" id="mAgGo">✨ แยกเป็นช่วง</button></div>
        </div>
      </section>
      <div id="mSecs"></div>
      <button type="button" id="mAddSec" class="m-add">＋ เพิ่มส่วน <small id="mSecHint">เช่น ชั้น 1 · เครื่องบด A · โกดัง</small></button>
      <section class="m-box" data-list="todos"><h3>☐ งานต่อ</h3><div class="m-list"></div><input class="m-new" data-list="todos" placeholder="＋ งาน เช่น ขอใบเสนอราคา ศุกร์นี้" enterkeyhint="done"></section>
      <section class="m-box" data-list="asks"><h3>❓ คำถามที่ยังค้าง</h3><div class="m-list"></div><input class="m-new" data-list="asks" placeholder="＋ คำถาม" enterkeyhint="done"></section>
      <section class="m-box" data-list="decs"><h3>✅ สิ่งที่ตกลงกัน</h3><div class="m-list"></div><input class="m-new" data-list="decs" placeholder="＋ ข้อตกลง" enterkeyhint="done"></section>
      <section class="m-box m-sum">
        <h3>✨ สรุปรายงาน</h3>
        <p class="hint" id="mSumHint">จดเสร็จแล้วกด ✨ ให้ AI เรียบเรียงเป็นรายงานสั้นๆ พร้อมส่งต่อใน LINE (บันทึกดิบยังอยู่ครบ)</p>
        <textarea id="mSum" rows="10" hidden aria-label="สรุปรายงาน"></textarea>
        <div class="c-btns">
          <button type="button" class="mini" id="mSumGo">✨ สรุปให้</button>
          <button type="button" class="mini" id="mSumCopy" hidden>📋 คัดลอกสรุป</button>
        </div>
      </section>
      <section class="m-box m-arc" id="mArcBox">
        <h3>🏢 ส่งเข้าคลังรายงาน TIBD</h3>
        <p class="hint" id="mArcHint">AI เรียบเรียงบันทึกเป็นรายงานตามแบบฟอร์มบริษัท (วาระ · ประเด็น · มติ · สิ่งที่ต้องทำ) แล้ววางไว้ที่ "1 รอยืนยัน" ของคลัง ให้ตรวจจุดสีเหลืองและกดยืนยันในเมนู ยืนยันรายงาน</p>
        <div id="mArcPrev" class="arc-prev"></div>
        <div class="c-btns">
          <button type="button" class="mini" id="mArcGo">🏢 ทำร่างรายงาน</button>
          <button type="button" class="mini arc-send" id="mArcSend" hidden>📤 ส่งเข้าคลัง</button>
          <a class="mini" id="mArcLink" target="_blank" rel="noopener" hidden>เปิดหน้ายืนยัน ↗</a>
          <button type="button" class="mini" id="mRepFind">🔗 ผูกรายงานที่ยืนยันแล้ว</button>
        </div>
        <div id="mRep" class="arc-rep"></div>
      </section>
      <button type="button" id="mDel" class="m-del">🗑 ลบบันทึกนี้</button>
    </div>
    <form id="mQuick" class="m-quick" autocomplete="off">
      <button type="button" id="mCam" class="icon-btn" aria-label="ถ่ายรูปใส่ส่วนนี้">📷</button>
      <input id="mIn" placeholder="จดเร็ว: บด 2 ตัน/วัน" enterkeyhint="send" aria-label="จดเร็ว">
      <button type="submit" class="add-btn" aria-label="จด">↵</button>
    </form>
    <p class="m-help" id="mHelp"><b id="mTo"></b> · <code># ชื่อ</code> ส่วนใหม่ · <code>☐</code> <span id="mHelpT">งาน</span> · <code>?</code> คำถาม · <code>!</code> <span id="mHelpD">ตกลง</span> · <code>@ชื่อ</code> <span id="mHelpP">คนเข้าประชุม</span></p>
  </div>
</dialog>`);

/* ปุ่ม ＋📋 ข้างช่องฝาก */
(() => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'icon-btn in-pic'; b.id = 'btnNew'; b.title = 'บันทึกประชุม / การ์ดข้อมูล'; b.setAttribute('aria-label', b.title);
  b.textContent = '📋';
  $('#btnPic').before(b);
  b.addEventListener('click', () => $('#nDlg').showModal());
})();
$('#nDlg').addEventListener('click', e => {
  if (e.target === $('#nDlg')) return $('#nDlg').close();
  const b = e.target.closest('[data-new]');
  if (!b) return;
  $('#nDlg').close();
  if (b.dataset.new === 'meet') openMeet(null, b.dataset.v);
  if (b.dataset.new === 'card') openCard(null, b.dataset.v);
  if (b.dataset.new === 'ai') { openCard(null, 'contact'); readCardPhoto(); }
});

/* ===================== 📇 การ์ดข้อมูล ===================== */
let cEdit = null, cData = null;
function openCard(o, tpl) {
  cEdit = o;
  cData = o ? JSON.parse(JSON.stringify(o.data || {})) : { tpl: tpl || 'custom', title: '', fields: (TPL[tpl] || TPL.custom).fields.map(k => ({ k, v: '' })), note: '' };
  if (!cData.fields) cData.fields = [];
  $('#cTitle').value = cData.title || '';
  $('#cNote').value = cData.note || '';
  $('#cPasteBox').hidden = true; $('#cPaste').value = '';
  $('#cDel').hidden = !o;
  cRender();
  $('#cDlg').showModal();
  if (!o) setTimeout(() => $('#cTitle').focus(), 50);
}
function cRender() {
  const t = TPL[cData.tpl] || TPL.custom;
  $('#cTpl').innerHTML = Object.entries(TPL).map(([k, v]) => `<button type="button" class="chip${k === cData.tpl ? ' on' : ''}" data-tpl="${k}">${v.ic} ${v.name}</button>`).join('');
  $('#cTitle').placeholder = t.ph;
  $('#cFields').innerHTML = cData.fields.map((f, i) => `<div class="c-f" data-i="${i}">
      <input class="c-k" value="${esc(f.k)}" placeholder="หัวข้อ" aria-label="หัวข้อ">
      <input class="c-v" value="${esc(f.v)}" placeholder="${esc(f.k || 'ข้อมูล')}" aria-label="${esc(f.k || 'ข้อมูล')}" ${/เบอร์|โทร/.test(f.k) ? 'inputmode="tel"' : /อีเมล/.test(f.k) ? 'inputmode="email"' : /ราคา|เลขผู้เสียภาษี/.test(f.k) ? 'inputmode="decimal"' : ''}>
      <button type="button" class="c-x" aria-label="ลบช่อง">✕</button></div>`).join('');
}
$('#cTpl').addEventListener('click', e => {
  const b = e.target.closest('[data-tpl]');
  if (!b) return;
  cSync();
  cData.tpl = b.dataset.tpl;
  // เพิ่มช่องของแบบใหม่ที่ยังไม่มี · ตัดช่องว่างที่ไม่ใช่ของแบบนี้
  const want = TPL[cData.tpl].fields;
  cData.fields = cData.fields.filter(f => f.v || want.includes(f.k));
  want.forEach(k => { if (!cData.fields.some(f => f.k === k)) cData.fields.push({ k, v: '' }); });
  cRender();
});
function cSync() {
  cData.title = $('#cTitle').value.trim();
  cData.note = $('#cNote').value.trim();
  cData.fields = [...$('#cFields').querySelectorAll('.c-f')].map(r => ({ k: r.querySelector('.c-k').value.trim(), v: r.querySelector('.c-v').value.trim() }));
}
$('#cFields').addEventListener('click', e => {
  const x = e.target.closest('.c-x');
  if (!x) return;
  cSync(); cData.fields.splice(+x.closest('.c-f').dataset.i, 1); cRender();
});
$('#cAdd').addEventListener('click', () => { cSync(); cData.fields.push({ k: '', v: '' }); cRender(); $('#cFields').lastElementChild.querySelector('.c-k').focus(); });
$('#cPasteBtn').addEventListener('click', () => { $('#cPasteBox').hidden = !$('#cPasteBox').hidden; if (!$('#cPasteBox').hidden) $('#cPaste').focus(); });
$('#cParse').addEventListener('click', () => {
  cSync();
  const r = parseFields($('#cPaste').value);
  if (!cData.title && r.title) cData.title = r.title;
  mergeFields(r.fields);
  if (r.extra.length) cData.note = [cData.note, ...r.extra].filter(Boolean).join('\n');
  $('#cTitle').value = cData.title; $('#cNote').value = cData.note;
  $('#cPaste').value = ''; $('#cPasteBox').hidden = true;
  cRender(); toast('✨ แยกได้ ' + r.fields.length + ' ช่อง');
});
function mergeFields(list) {
  list.forEach(f => {
    const same = cData.fields.find(x => x.k === f.k && !x.v);
    if (same) same.v = f.v;
    else if (!cData.fields.some(x => x.k === f.k && x.v === f.v)) cData.fields.push(f);
  });
}
const KEY_ALIAS = [
  [/^(เบอร์|เบอร์โทร|โทร|tel|phone|mobile|มือถือ|โทรศัพท์|t|m)$/i, 'เบอร์'], [/^(อีเมล|อีเมล์|email|e-mail|mail)$/i, 'อีเมล'],
  [/^(line|ไลน์|line id|ไอดีไลน์)$/i, 'LINE'], [/^(ชื่อ|name)$/i, '__title'], [/^(บริษัท|company|หน่วยงาน)$/i, 'บริษัท'],
  [/^(ตำแหน่ง|position|title)$/i, 'ตำแหน่ง'], [/^(ที่อยู่|address|addr)$/i, 'ที่อยู่'], [/^(เว็บ|website|web|เว็บไซต์)$/i, 'เว็บ'],
  [/^(เลขผู้เสียภาษี|เลขประจำตัวผู้เสียภาษี|tax id|taxid|เลขภาษี)$/i, 'เลขผู้เสียภาษี'], [/^(ราคา|price)$/i, 'ราคา'],
];
const normKey = k => { k = String(k).trim().replace(/[.\s]+$/, ''); for (const [re, n] of KEY_ALIAS) if (re.test(k)) return n; return k; };
/** วางข้อความทั้งก้อน → {title, fields:[{k,v}], extra:[บรรทัดที่ไม่รู้ว่าเป็นอะไร]} */
function parseFields(text) {
  const out = { title: '', fields: [], extra: [] };
  const parts = String(text).split(/\n|\s[\/|]\s|\s{3,}/).map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    let m = p.match(/^([^:：=]{1,30}?)\s*[:：=]\s*(.+)$/);
    if (m && !/^https?$/i.test(m[1])) {
      const k = normKey(m[1]);
      if (k === '__title') out.title = out.title || m[2].trim(); else out.fields.push({ k, v: m[2].trim() });
      continue;
    }
    m = p.match(/^(เบอร์โทร|เบอร์|โทร\.?|tel\.?|มือถือ|อีเมล|email|line|ไลน์|ตำแหน่ง|บริษัท|ที่อยู่)\s+(.+)$/i);
    if (m) { out.fields.push({ k: normKey(m[1]), v: m[2].trim() }); continue; }
    const v = p.replace(/^[-•·*]\s*/, '');
    if (isEmail(v)) out.fields.push({ k: 'อีเมล', v });
    else if (isUrl(v)) out.fields.push({ k: /maps\.(google|app)|goo\.gl\/maps/i.test(v) ? 'ลิงก์แผนที่' : 'เว็บ', v });
    else if (isPhone(v)) out.fields.push({ k: 'เบอร์', v });
    else if (/^\d[\d\s-]{12,16}$/.test(v) && v.replace(/\D/g, '').length === 13) out.fields.push({ k: 'เลขผู้เสียภาษี', v });
    else if (/^@\S+$/.test(v)) out.fields.push({ k: 'LINE', v });
    else if (!out.title && v.length <= 60) out.title = v;
    else out.extra.push(v);
  }
  return out;
}
$('#cAi').addEventListener('click', () => readCardPhoto());
async function readCardPhoto() {
  const [file] = await pickFiles(false);
  if (!file) return;
  busy('AI กำลังอ่านรูป…');
  try {
    const p = await prepare(file);
    const r = await api('ai_fields', { ...p, mode: 'card', keep: true, thumb: await thumbOf(file, 160) });
    cSync();
    if (r.tpl && TPL[r.tpl] && (!cEdit || cData.tpl === 'custom')) {
      cData.tpl = r.tpl;
      cData.fields = cData.fields.filter(f => f.v);
      TPL[r.tpl].fields.forEach(k => { if (!cData.fields.some(f => f.k === k)) cData.fields.push({ k, v: '' }); });
    }
    if (!cData.title && r.title) cData.title = r.title;
    mergeFields((r.fields || []).map(f => ({ k: normKey(f.k) === '__title' ? 'ชื่อ' : normKey(f.k), v: f.v })));
    if (r.photo) cData.photo = r.photo;
    $('#cTitle').value = cData.title;
    cRender(); toast('✨ AI กรอกให้ ' + (r.fields || []).length + ' ช่อง ตรวจดูก่อนบันทึกนะครับ');
  } catch (err) { showStatus('อ่านรูปไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
}
$('#cCancel').addEventListener('click', () => $('#cDlg').close());
$('#cForm').addEventListener('submit', async e => {
  e.preventDefault();
  cSync();
  cData.fields = cData.fields.filter(f => f.k || f.v);
  if (!cData.title && !cData.fields.some(f => f.v)) { $('#cTitle').focus(); return; }
  $('#cDlg').close();
  busy('กำลังบันทึก…');
  try {
    const r = await api('inbox_save', { item: { id: cEdit ? cEdit.id : uid('c'), kind: 'card', data: cData, text: cardText(cData) } });
    upsert(r.item); render(); toast('📇 บันทึกการ์ดแล้ว');
  } catch (err) { showStatus('บันทึกไม่สำเร็จ: ' + err.message); }
  finally { busyEnd(); }
});
$('#cDel').addEventListener('click', async () => {
  if (!cEdit || !confirm('ลบการ์ดนี้?')) return;
  const o = cEdit;
  $('#cDlg').close(); drop(o.id); render();
  try { await api('inbox_delete', { id: o.id }); toast('🗑 ลบแล้ว'); }
  catch (err) { upsert(o); render(); showStatus('ลบไม่สำเร็จ: ' + err.message); }
});

/* ===================== 📋 บันทึกประชุม / ดูงาน ===================== */
let m = null, mId = '', mCur = 0, mTimer = 0, mSaving = null;
let mPicked = 0, mLiveT = 0, mLiveTick = 0, mLiveLast = -2;   // 📅 ช่วงที่กำลังเป็นอยู่

/* ---------- 📅 กำหนดการ → ช่วงเวลา · ช่วงที่กำลังเป็นอยู่ ---------- */
const ymdLocal = d => d.toLocaleDateString('sv-SE');
/** ส่วนที่เวลาตอนนี้อยู่ในช่วง (เริ่ม ≤ ตอนนี้ < จบ หรือก่อนช่วงถัดไป) · ไม่มี = -1 */
function liveIdx() {
  if (!m || !m.sections) return -1;
  const now = Date.now(), base = (m.when || '').slice(0, 10) || ymdLocal(new Date());
  const ts = m.sections.map(s => s.at ? new Date((s.day || base) + 'T' + s.at).getTime() : NaN);
  for (let i = 0; i < m.sections.length; i++) {
    if (isNaN(ts[i]) || ts[i] > now) continue;
    const s = m.sections[i];
    let end = s.end ? new Date((s.day || base) + 'T' + s.end).getTime() : NaN;
    if (isNaN(end)) { const nx = ts.slice(i + 1).find(t => !isNaN(t) && t > ts[i]); end = nx || ts[i] + 90 * 60000; }
    if (now < end) return i;
  }
  return -1;
}
function followLive() {
  const L = liveIdx();
  if (L > -1 && L !== mCur && Date.now() - mPicked > 10 * 60000) { mCur = L; mRenderTo(); }
}
function agendaApply(r) {
  const items = (r.items || []).filter(x => x.title);
  if (!items.length) throw new Error('ไม่เจอรายการในกำหนดการ');
  const empty = m.sections.every(s => !s.notes && !(s.rows || []).some(x => x.k || x.v) && !(s.photos || []).length && !(s.files || []).length);
  if (empty) m.sections = [];
  items.forEach(x => m.sections.push({ name: x.title, at: x.at, end: x.end, day: x.day, who: x.who, brk: x.brk, rows: [], notes: '', photos: [], files: [] }));
  const base = (m.when || '').slice(0, 10) || ymdLocal(new Date());
  m.sections.sort((a, b) => ((a.day || base) + (a.at || '99')).localeCompare((b.day || base) + (b.at || '99')));
  if (!m.title && r.title) { m.title = r.title; $('#mTitle').value = m.title; }
  if (!m.place && r.place) { m.place = r.place; $('#mPlace').value = m.place; }
  const first = items.find(x => x.day);
  if (first && (!m.when || m.when.slice(0, 10) !== first.day)) { m.when = first.day + 'T' + (items[0].at || '09:00'); $('#mWhen').value = m.when; }
  if (r.photo) m.agenda = r.photo;
  mCur = Math.max(0, liveIdx()); mPicked = 0;
  mRenderAll(); mDirty(true);
  toast(`📅 ได้ ${items.length} ช่วง` + (items.some(x => !x.at) ? ' · บางช่วงไม่มีเวลา ใส่เองได้' : ''));
}
async function agendaFromFile() {
  const [file] = await pickFiles(false, 'image/*,application/pdf');
  if (!file) return;
  mState('📅 AI กำลังอ่านกำหนดการ…');
  try {
    const p = await prepare(file);
    const thumb = p.mime === 'application/pdf' ? '' : await thumbOf(file, 200);
    agendaApply(await api('ai_agenda', { ...p, keep: p.mime !== 'application/pdf', thumb }));
  } catch (err) { mState(''); showStatus('อ่านกำหนดการไม่สำเร็จ: ' + err.message); }
}
async function agendaFromText() {
  const t = $('#mAgPaste').value.trim();
  if (!t) return $('#mAgPaste').focus();
  mState('📅 AI กำลังแยกช่วง…');
  try { agendaApply(await api('ai_agenda', { text: t })); $('#mAgPaste').value = ''; $('#mAgPasteBox').hidden = true; }
  catch (err) { mState(''); showStatus('แยกกำหนดการไม่สำเร็จ: ' + err.message); }
}

/* ---------- 📎 ไฟล์สไลด์ (PDF / PowerPoint ฯลฯ) → Drive แบบ resumable ทีละ 4 MB ---------- */
const EXT_MIME = { pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', key: 'application/vnd.apple.keynote' };
async function uploadDoc(file, onPct) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mime = EXT_MIME[ext] || file.type || 'application/octet-stream';
  const { session } = await api('audio_start', { kind: 'slide', name: file.name, mime, size: file.size });
  const CH = 4 * 1024 * 1024;
  const b64 = blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => bad(new Error('อ่านไฟล์ไม่ได้')); r.readAsDataURL(blob); });
  let off = 0;
  for (let tries = 0; off < file.size;) {
    try {
      const r = await api('audio_chunk', { session, offset: off, total: file.size, mime, data: await b64(file.slice(off, off + CH)) });
      if (r.done) return r.file;
      off = r.next || off + CH; tries = 0;
      if (onPct) onPct(Math.round(off / file.size * 100));
    } catch (e) {
      if (++tries > 3) throw e;
      await new Promise(ok => setTimeout(ok, 1500 * tries));
      try { const q = await api('audio_chunk', { session, total: file.size, probe: 1 }); if (q.done) return q.file; off = q.next; } catch (e2) {}
    }
  }
  const q = await api('audio_chunk', { session, total: file.size, probe: 1 });
  if (q.done) return q.file;
  throw new Error('อัปไม่ครบ');
}
async function uploadSlides(i) {
  const files = await pickFiles(true, '.pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx,application/pdf');
  if (!files.length) return;
  const sec = m.sections[i];
  if (!Array.isArray(sec.files)) sec.files = [];
  let ok = 0;
  for (const [n, f] of files.entries()) {
    try {
      if (f.size > 300 * 1024 * 1024) throw new Error('ใหญ่เกิน 300 MB');
      mState(`📎 อัป ${n + 1}/${files.length}: ${f.name.slice(0, 24)}…`);
      const up = await uploadDoc(f, pct => mState(`📎 อัป ${n + 1}/${files.length} · ${pct}%`));
      sec.files.push({ id: up.id, name: up.name || f.name, size: up.size || f.size, url: up.url });
      ok++; mRenderSec(i); mDirty(true);
    } catch (err) { showStatus(`อัป ${f.name} ไม่สำเร็จ: ${err.message}`); }
  }
  mState(ok ? `📎 แนบไฟล์แล้ว ${ok} ไฟล์` : '');
}
const drafts = () => LS.get('meetDrafts', {});
function putDraft() { const d = drafts(); d[mId] = { data: m, at: Date.now() }; LS.set('meetDrafts', d); }
function dropDraft(id) { const d = drafts(); delete d[id]; LS.set('meetDrafts', d); }

function openMeet(o, type) {
  const dr = o ? drafts()[o.id] : null;
  mId = o ? o.id : uid('m');
  m = dr ? dr.data : o ? JSON.parse(JSON.stringify(o.data || {})) : { type: type || 'meet', title: '', when: nowLocal(), place: '', people: [], sections: [], todos: [], asks: [], decs: [] };
  ['people', 'sections', 'todos', 'asks', 'decs'].forEach(k => { if (!Array.isArray(m[k])) m[k] = []; });
  mCur = Math.max(0, m.sections.length - 1);
  mPicked = 0; { const L = liveIdx(); if (L > -1) mCur = L; }
  clearInterval(mLiveTick); mLiveTick = setInterval(() => { if ($('#mDlg').open) { const L = liveIdx(); if (L !== mLiveLast) { mLiveLast = L; mRenderSecs(); } } else clearInterval(mLiveTick); }, 60000);
  $('#mTitle').value = m.title || '';
  $('#mWhen').value = m.when || '';
  $('#mPlace').value = m.place || '';
  $('#mPerson').value = ''; $('#mIn').value = '';
  $('#mDel').hidden = !o;
  mRenderSum(); mRenderArc();
  mState(dr ? '⏳ มีส่วนที่ยังไม่ได้ส่งขึ้น' : o ? '' : 'ใหม่');
  mRenderAll();
  if (window.mAudioOpen) mAudioOpen();
  $('#mDlg').showModal();
  $('#mBody').scrollTop = 0;
  if (!o) setTimeout(() => $('#mTitle').focus(), 60);
}
function mState(t) { $('#mState').textContent = t; }
/** เปลี่ยนหัวข้อ/ตัวอย่างในหน้าจดตามแบบบันทึก (ประชุม ดูงาน คุยลูกค้า อบรม) */
function mApplyType() {
  const c = mcfg(m.type);
  $('#mTitle').placeholder = c.title;
  $('#mPplH').textContent = c.people;
  $('#mSecHint').textContent = c.sec;
  $('#mIn').placeholder = c.quick;
  ['todos', 'asks', 'decs'].forEach(k => { const box = $(`#mBody .m-box[data-list="${k}"]`); if (box) box.querySelector('h3').textContent = c[k]; });
  $('#mBody .m-new[data-list="todos"]').placeholder = c.todoPh;
  $('#mBody .m-new[data-list="decs"]').placeholder = c.decPh;
  // อบรม: เอา "สิ่งที่ได้เรียนรู้" ขึ้นก่อน "นำไปใช้" · แบบอื่นเรียง งานต่อ → คำถาม → ตกลง
  const decs = $('#mBody .m-box[data-list="decs"]'), todos = $('#mBody .m-box[data-list="todos"]');
  if (m.type === 'train') todos.before(decs); else $('#mBody .m-box[data-list="asks"]').after(decs);
  $('#mArcBox').hidden = !c.arc;
  $('#mAgBox').hidden = !c.agenda;
  $('#mAgOpen').hidden = !(m.agenda && m.agenda.url); if (m.agenda && m.agenda.url) $('#mAgOpen').href = m.agenda.url;
  // คำอธิบายจดเร็ว (# ส่วน · ☐ · ? · ! · @) ให้ตรงกับหัวข้อของแบบนี้
  $('#mHelpT').textContent = c.todos.replace(/^\S+\s/, '');
  $('#mHelpD').textContent = c.decs.replace(/^\S+\s/, '');
  $('#mHelpP').textContent = m.type === 'train' ? 'วิทยากร/ผู้อบรม' : m.type === 'talk' ? 'ลูกค้า' : 'คนเข้าประชุม';   // อบรมไม่ใช่รายงานการประชุม ไม่ส่งเข้าคลัง TIBD
}
function mRenderAll() {
  $('#mType').querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === m.type));
  mApplyType();
  mRenderCal(); mRenderPeople(); mRenderSecs(); ['todos', 'asks', 'decs'].forEach(mRenderList); mRenderTo();
}
function mRenderTo() {
  const s = m.sections[mCur];
  $('#mTo').textContent = (s ? 'จดลง: ' + (s.name || 'ทั่วไป') : 'จดลง: ทั่วไป') + (s && mCur === liveIdx() ? ' ▶' : '');
  $('#mSecs').querySelectorAll('.m-sec').forEach(el => el.classList.toggle('on', +el.dataset.i === mCur));
}
/* ดึงหัวเรื่อง/เวลาจากงานวันนี้ */
function mRenderCal() {
  const today = new Date().toLocaleDateString('sv-SE');
  const tasks = LS.get('tasks', []).filter(t => t.date === today && t.time && !t.done).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4);
  $('#mFromCal').innerHTML = !m.title && tasks.length ? `<small>จากงานวันนี้:</small> ` + tasks.map(t => `<button type="button" class="chip" data-task="${esc(t.id)}">📅 ${esc(t.time)} ${esc(String(t.title).slice(0, 30))}</button>`).join('') : '';
}
$('#mFromCal').addEventListener('click', e => {
  const b = e.target.closest('[data-task]');
  const t = b && LS.get('tasks', []).find(x => x.id === b.dataset.task);
  if (!t) return;
  m.title = t.title; m.when = t.date + 'T' + t.time;
  $('#mTitle').value = m.title; $('#mWhen').value = m.when;
  mRenderCal(); mDirty();
});
/* ผู้เข้าร่วม */
function knownPeople() {
  const c = {};
  items.forEach(o => {
    if (o.kind === 'meet') ((o.data || {}).people || []).forEach(p => { c[p] = (c[p] || 0) + 1; });
    if (o.kind === 'card' && (o.data || {}).tpl === 'contact' && o.data.title) c[o.data.title] = (c[o.data.title] || 0) + 1;
  });
  return Object.keys(c).sort((a, b) => c[b] - c[a]);
}
function mRenderPeople() {
  $('#mPeople').innerHTML = m.people.map((p, i) => `<span class="m-chip">${esc(p)}<button type="button" data-rm="${i}" aria-label="เอาออก">✕</button></span>`).join('');
  const q = $('#mPerson').value.trim().toLowerCase();
  $('#mSug').innerHTML = knownPeople().filter(p => !m.people.includes(p) && (!q || p.toLowerCase().includes(q))).slice(0, 8)
    .map(p => `<button type="button" class="chip" data-add="${esc(p)}">＋ ${esc(p)}</button>`).join('');
}
function addPeople(s) {
  String(s).split(/[,，、]|\sและ\s/).map(x => x.trim()).filter(Boolean).forEach(p => { if (!m.people.includes(p)) m.people.push(p); });
  mRenderPeople(); mDirty();
}
$('#mPerson').addEventListener('input', mRenderPeople);
$('#mPerson').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  addPeople($('#mPerson').value); $('#mPerson').value = ''; mRenderPeople();
});
$('#mPeople').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { m.people.splice(+b.dataset.rm, 1); mRenderPeople(); mDirty(); } });
$('#mSug').addEventListener('click', e => { const b = e.target.closest('[data-add]'); if (b) { addPeople(b.dataset.add); $('#mPerson').value = ''; mRenderPeople(); } });

/* ส่วนย่อย */
function newSec(name) { m.sections.push({ name: name || '', rows: [], notes: '', photos: [], files: [] }); mCur = m.sections.length - 1; }
function secHtml(s, i) {
  const c = mcfg(m.type), live = i === liveIdx(), timed = s.at || s.end || s.who || c.agenda;
  return `<section class="m-sec${i === mCur ? ' on' : ''}${live ? ' live' : ''}${s.brk ? ' brk' : ''}" data-i="${i}">
    <div class="m-sec-h"><span class="m-dot" aria-hidden="true"></span>
      <input class="m-sec-name" data-f="name" value="${esc(s.name)}" placeholder="ชื่อส่วน ${esc(c.sec.split(' · ')[0])}">
      <button type="button" class="mini ghost" data-sact="del" aria-label="ลบส่วนนี้">✕</button></div>
    ${timed ? `<div class="m-sec-t">🕘 <input type="time" data-f="at" value="${esc(s.at || '')}" aria-label="เวลาเริ่ม"> – <input type="time" data-f="end" value="${esc(s.end || '')}" aria-label="เวลาจบ">
      <input data-f="who" value="${esc(s.who || '')}" placeholder="${m.type === 'train' ? 'วิทยากร' : 'ผู้นำเสนอ'}" aria-label="วิทยากร">${s.day ? `<small>${esc(new Date(s.day + 'T00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }))}</small>` : ''}${live ? '<b class="m-live">▶ ตอนนี้</b>' : ''}</div>` : ''}
    <div class="m-rows">${(s.rows || []).map((r, j) => `<div class="m-row" data-r="${j}">
        <input data-f="k" value="${esc(r.k)}" placeholder="หัวข้อ"><input data-f="v" value="${esc(r.v)}" placeholder="ค่า" inputmode="text"><input data-f="u" value="${esc(r.u)}" placeholder="หน่วย">
        <button type="button" class="c-x" data-sact="rmrow" aria-label="ลบแถว">✕</button></div>`).join('')}</div>
    <div class="m-sec-btns">
      <button type="button" class="mini" data-sact="row">＋ แถวข้อมูล</button>
      ${c.plate ? '<button type="button" class="mini" data-sact="plate">📷 ป้ายเครื่อง (AI)</button>' : ''}
      <button type="button" class="mini" data-sact="photo">${c.slides ? '📷 รูปสไลด์' : '🖼 รูป'}</button>
      ${c.slides ? '<button type="button" class="mini" data-sact="slide">📎 ไฟล์สไลด์</button>' : ''}
    </div>
    ${(s.files || []).length ? `<div class="m-files">${s.files.map((f, k) => `<span class="m-file"><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}${f.size ? ` <small>${(f.size / 1048576).toFixed(1)} MB</small>` : ''}</a><button type="button" data-sact="rmfile" data-k="${k}" aria-label="เอาไฟล์ออก">✕</button></span>`).join('')}</div>` : ''}
    <textarea data-f="notes" rows="${Math.min(8, Math.max(2, String(s.notes || '').split('\n').length))}" placeholder="${m.type === 'train' ? 'โน้ต เช่น ประเด็นที่ได้จากช่วงนี้' : m.type === 'talk' ? 'โน้ต เช่น ลูกค้าเล่าว่า…' : m.type === 'meet' ? 'โน้ต เช่น สรุปวาระนี้' : 'โน้ต เช่น ชั้นนี้ทำอะไร'}">${esc(s.notes)}</textarea>
    ${(s.photos || []).length ? `<div class="m-photos">${s.photos.map((p, k) => `<span class="m-ph"><a href="${esc(p.url)}" target="_blank" rel="noopener" data-ph="${k}">${p.id ? thumbImg(p) : thumbOk(p.thumb) ? `<img src="${p.thumb}" alt="">` : '🖼'}</a><button type="button" data-sact="rmph" data-k="${k}" aria-label="เอารูปออก">✕</button></span>`).join('')}</div>` : ''}
  </section>`;
}
function mRenderSecs() { $('#mSecs').innerHTML = m.sections.map(secHtml).join(''); mRenderTo(); fillThumbs($('#mSecs')); }
function mRenderSec(i) {
  const el = $('#mSecs').querySelector(`.m-sec[data-i="${i}"]`);
  if (el) { el.outerHTML = secHtml(m.sections[i], i); fillThumbs($('#mSecs')); } else mRenderSecs();
}
$('#mAddSec').addEventListener('click', () => {
  newSec(''); mRenderSecs(); mDirty();
  const el = $('#mSecs').lastElementChild; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.querySelector('.m-sec-name').focus();
});
$('#mSecs').addEventListener('focusin', e => { const s = e.target.closest('.m-sec'); if (s && +s.dataset.i !== mCur) { mCur = +s.dataset.i; mPicked = Date.now(); mRenderTo(); } });
$('#mSecs').addEventListener('click', async e => {
  const ph = e.target.closest('a[data-ph]');
  if (ph && !e.ctrlKey && !e.metaKey) {   // 🔍 แตะรูป = ดูเต็มจอในแอป เลื่อนดูรูปอื่นในส่วนเดียวกันได้
    e.preventDefault();
    const sec = m.sections[+ph.closest('.m-sec').dataset.i];
    openViewer((sec.photos || []).filter(p => p.id), (sec.photos || []).filter(p => p.id).indexOf(sec.photos[+ph.dataset.ph]));
    return;
  }
  const s = e.target.closest('.m-sec');
  if (!s) return;
  const i = +s.dataset.i, sec = m.sections[i];
  if (mCur !== i) { mCur = i; mPicked = Date.now(); mRenderTo(); }
  const b = e.target.closest('[data-sact]');
  if (!b) return;
  const a = b.dataset.sact;
  if (a === 'del') {
    if ((sec.rows.length || sec.notes || sec.photos.length) && !confirm('ลบส่วน "' + (sec.name || 'ทั่วไป') + '" ทั้งหมด?')) return;
    m.sections.splice(i, 1); mCur = Math.max(0, Math.min(mCur, m.sections.length - 1)); mRenderSecs(); mDirty();
  }
  if (a === 'row') { sec.rows.push({ k: '', v: '', u: '' }); mRenderSec(i); mDirty(); $('#mSecs').querySelector(`.m-sec[data-i="${i}"] .m-row:last-child input`).focus(); }
  if (a === 'rmrow') { sec.rows.splice(+b.closest('.m-row').dataset.r, 1); mRenderSec(i); mDirty(); }
  if (a === 'slide') uploadSlides(i);
  if (a === 'rmfile') { if (confirm('เอาไฟล์นี้ออกจากบันทึก? (ไฟล์ยังอยู่ใน Drive)')) { sec.files.splice(+b.dataset.k, 1); mRenderSec(i); mDirty(); } }
  if (a === 'rmph') { if (confirm('เอารูปนี้ออกจากบันทึก?')) { sec.photos.splice(+b.dataset.k, 1); mRenderSec(i); mDirty(); } }
  if (a === 'photo') addPhotos(i);
  if (a === 'plate') readPlate(i);
});
$('#mSecs').addEventListener('input', e => {
  const f = e.target.dataset.f, s = e.target.closest('.m-sec');
  if (!f || !s) return;
  const sec = m.sections[+s.dataset.i];
  if (f === 'name') { sec.name = e.target.value; mRenderTo(); }
  else if (f === 'notes') sec.notes = e.target.value;
  else if (f === 'at' || f === 'end' || f === 'who') { sec[f] = e.target.value; if (f !== 'who') { clearTimeout(mLiveT); mLiveT = setTimeout(() => mRenderSec(+s.dataset.i), 800); } }
  else sec.rows[+e.target.closest('.m-row').dataset.r][f] = e.target.value;
  mDirty();
});

/* รูป */
async function uploadPhoto(file) {
  const [p, thumb] = await Promise.all([prepare(file), thumbOf(file, 320)]);
  const r = await api('inbox_photo', { ...p, name: m.title || 'บันทึก' });   // รูปย่อจำไว้ในเครื่อง ไม่ส่งไปเก็บในชีต
  if (r.photo && thumb) thumbPut(r.photo.id, thumb);
  return { p, photo: r.photo };
}
async function addPhotos(i) {
  const files = await pickFiles(true);
  if (!files.length) return;
  if (!m.sections.length) { newSec(''); i = 0; mRenderSecs(); }
  for (let n = 0; n < files.length; n++) {
    mState(`📷 กำลังส่งรูป ${n + 1}/${files.length}…`);
    try { const { photo } = await uploadPhoto(files[n]); m.sections[i].photos.push(photo); mRenderSec(i); mDirty(); }
    catch (err) { showStatus('ส่งรูปไม่สำเร็จ: ' + err.message); break; }
  }
  mState('📷 เพิ่มรูปแล้ว');
}
async function readPlate(i) {
  const [file] = await pickFiles(false);
  if (!file) return;
  mState('📷 AI กำลังอ่านป้าย…');
  try {
    const p = await prepare(file);
    const [ai, up] = await Promise.all([api('ai_fields', { ...p, mode: 'plate' }), uploadPhoto(file).catch(() => null)]);
    const sec = m.sections[i];
    if (ai.name && !sec.name) sec.name = ai.name;
    sec.rows = sec.rows.filter(r => r.k || r.v).concat((ai.rows || []).map(r => ({ k: r.k, v: r.v, u: r.u || '' })));
    if (up) sec.photos.push(up.photo);
    mRenderSec(i); mDirty();
    toast('✨ AI เติมให้ ' + (ai.rows || []).length + ' แถว ตรวจดูอีกทีนะครับ');
  } catch (err) { mState(''); showStatus('อ่านป้ายไม่สำเร็จ: ' + err.message); }
}
$('#mCam').addEventListener('click', () => addPhotos(m.sections.length ? mCur : 0));

/* งานต่อ / คำถาม / ข้อตกลง */
function mRenderList(k) {
  const box = $('#mBody').querySelector(`.m-box[data-list="${k}"] .m-list`);
  box.innerHTML = m[k].map((x, i) => `<div class="m-li" data-i="${i}">
    ${k === 'todos' ? `<input type="checkbox" data-lf="done" ${x.done ? 'checked' : ''} aria-label="เสร็จแล้ว">` : '<span class="m-bul">•</span>'}
    <input class="m-li-t" data-lf="t" value="${esc(x.t)}">
    ${k === 'todos' ? (x.task ? '<span class="m-sent" title="อยู่ในแท็บงานแล้ว">✓ ในงาน</span>' : `<button type="button" class="mini" data-lact="task">→ งาน</button>`) : ''}
    <button type="button" class="c-x" data-lact="rm" aria-label="ลบ">✕</button></div>`).join('');
}
$('#mBody').addEventListener('keydown', e => {
  const inp = e.target.closest('.m-new');
  if (!inp || e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const t = inp.value.trim();
  if (!t) return;
  m[inp.dataset.list].push({ t }); inp.value = '';
  mRenderList(inp.dataset.list); mDirty();
});
$('#mBody').addEventListener('input', e => {
  const f = e.target.dataset.lf, li = e.target.closest('.m-li');
  if (!f || !li) return;
  const k = li.closest('.m-box').dataset.list;
  m[k][+li.dataset.i][f] = f === 'done' ? e.target.checked : e.target.value;
  mDirty();
});
$('#mBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-lact]');
  if (!b) return;
  const li = b.closest('.m-li'), k = li.closest('.m-box').dataset.list, x = m[k][+li.dataset.i];
  if (b.dataset.lact === 'rm') { m[k].splice(+li.dataset.i, 1); mRenderList(k); mDirty(); return; }
  b.disabled = true; b.textContent = '…';
  try {
    const { task } = await api('inbox_todo', { text: x.t, note: '📋 จากบันทึก: ' + (m.title || '') + (m.when ? ' (' + m.when.replace('T', ' ') + ')' : '') });
    x.task = task.id;
    const tasks = LS.get('tasks', []); tasks.push(task); LS.set('tasks', tasks);
    mRenderList(k); mDirty(); toast('✓ ส่งเข้างานแล้ว: ' + task.title);
  } catch (err) { b.disabled = false; b.textContent = '→ งาน'; showStatus('ส่งเข้างานไม่สำเร็จ: ' + err.message); }
});

/* ✨ สรุปรายงาน */
function mRenderSum() {
  const has = !!(m.summary || '').trim();
  $('#mSum').value = m.summary || '';
  $('#mSum').hidden = !has; $('#mSumCopy').hidden = !has; $('#mSumHint').hidden = has;
  $('#mSumGo').textContent = has ? '🔄 สรุปใหม่' : '✨ สรุปให้';
}
$('#mSum').addEventListener('input', e => { m.summary = e.target.value; mDirty(); });
$('#mSumCopy').addEventListener('click', () => copyText(m.summary || '', '📋 คัดลอกสรุปแล้ว วางใน LINE ได้เลย'));
$('#mSumGo').addEventListener('click', async () => {
  const raw = meetText(m);
  if (raw.split('\n').length < 3) return toast('ยังจดน้อยไป จดเพิ่มอีกนิดก่อนนะครับ');
  if ((m.summary || '').trim() && !confirm('สรุปใหม่ทับของเดิม? (ถ้าแก้สรุปเองไว้จะหาย)')) return;
  const b = $('#mSumGo');
  b.disabled = true; b.textContent = '✨ กำลังสรุป…';
  try {
    const r = await api('ai_meet_sum', { text: raw, type: m.type });
    m.summary = r.summary; mRenderSum(); mDirty(true);
    $('#mSum').scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (err) { showStatus('สรุปไม่สำเร็จ: ' + err.message); mRenderSum(); }
  finally { b.disabled = false; }
});

/* 🔗 ผูกรายงานที่ยืนยันแล้วในคลัง (เช่น หลังส่งเสียงให้ TIBD ถอด) */
function mRenderRep() {
  const r = m.report;
  $('#mRep').innerHTML = r ? `<p class="arc-st">📋 รายงานที่ผูกไว้: <a href="${esc(r.url || '#')}" target="_blank" rel="noopener">${esc(r.title)} ↗</a> <small>${esc(r.date || '')}</small> <button type="button" class="mini ghost" data-rep="unlink">เอาออก</button></p>` : '';
  $('#mRepFind').textContent = r ? '🔗 เปลี่ยนรายงานที่ผูก' : '🔗 ผูกรายงานที่ยืนยันแล้ว';
}
$('#mRepFind').addEventListener('click', async () => {
  const b = $('#mRepFind'); b.disabled = true; b.textContent = '🔗 กำลังหาในคลัง…';
  try {
    const { list } = await api('meet_find', { date: (m.when || '').slice(0, 10), title: m.title || '' });
    if (!list.length) { $('#mRep').innerHTML = '<p class="hint">ยังไม่เจอรายงานในคลังที่วันใกล้กัน (±3 วัน) ถ้า TIBD ยังถอดไม่เสร็จ ลองใหม่ภายหลัง</p>'; return; }
    $('#mRep').innerHTML = '<p class="arc-h">เลือกรายงานที่ตรงกับบันทึกนี้</p>' + list.map((x, i) => `<button type="button" class="arc-pick" data-rep="${i}"><b>${esc(x.title)}</b><small>${esc(x.date)}</small></button>`).join('');
    $('#mRep').__list = list;
  } catch (err) { showStatus('หาในคลังไม่สำเร็จ: ' + err.message); }
  finally { b.disabled = false; if (!$('#mRep').__list) mRenderRep(); else b.textContent = '🔗 ผูกรายงานที่ยืนยันแล้ว'; }
});
$('#mRep').addEventListener('click', e => {
  const b = e.target.closest('[data-rep]');
  if (!b) return;
  if (b.dataset.rep === 'unlink') { delete m.report; }
  else { const x = ($('#mRep').__list || [])[+b.dataset.rep]; if (!x) return; m.report = { id: x.id, title: x.title, date: x.date, url: x.url }; toast('📋 ผูกรายงานแล้ว'); }
  $('#mRep').__list = null;
  mRenderRep(); mDirty(true);
});

/* 🏢 ส่งเข้าคลังรายงาน TIBD */
function mRenderArc() {
  mRenderRep();
  const a = m.arc || {}, d = a.minute;
  $('#mArcSend').hidden = !d;
  $('#mArcSend').textContent = a.fileId ? '📤 ส่งฉบับแก้ทับ' : '📤 ส่งเข้าคลัง';
  $('#mArcGo').textContent = d ? '🔄 ทำร่างใหม่' : '🏢 ทำร่างรายงาน';
  $('#mArcLink').hidden = !a.confirmUrl; if (a.confirmUrl) $('#mArcLink').href = a.confirmUrl;
  $('#mArcHint').hidden = !!d;
  if (!d) { $('#mArcPrev').innerHTML = ''; return; }
  const v = (d.verify_items || []).length;
  $('#mArcPrev').innerHTML = `
    <p class="arc-st">${a.fileId ? `✅ ส่งแล้ว ${esc(a.name || '')} · ${esc(new Date(a.sentAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }))}` : '📝 ร่าง (ยังไม่ได้ส่ง)'}</p>
    <b>${esc(d.meeting_name)}</b>
    <small>${esc([d.meeting_date, d.start_time && d.start_time + ' น.', d.location].filter(Boolean).join(' · '))}</small>
    ${(d.attendees || []).map(x => `<small>👥 ${esc(x.side)}: ${esc(x.people || '…')}</small>`).join('')}
    <ol>${(d.agenda || []).map(x => `<li><b>${esc(x.topic)}</b><br><small>${esc(x.summary)}</small><br><small>มติ: ${esc(x.decision)}</small></li>`).join('')}</ol>
    ${(d.actions || []).length ? `<p class="arc-h">สิ่งที่ต้องทำ</p><ul>${d.actions.map(x => `<li>${esc(x.task)} <small>— ${esc([x.owner, x.team && 'ฝ่าย ' + x.team].filter(Boolean).join(', ') || 'ยังไม่มีผู้รับผิดชอบ')}${x.due ? ' · ' + esc(x.due) : ''}</small></li>`).join('')}</ul>` : ''}
    ${v ? `<p class="arc-v">⚠ จุดที่ต้องตรวจในหน้ายืนยัน ${v} จุด: ${esc(d.verify_items.slice(0, 4).map(x => x.item).join(' · '))}</p>` : ''}`;
}
$('#mArcGo').addEventListener('click', async () => {
  const raw = meetText(m);
  if (raw.split('\n').length < 3) return toast('ยังจดน้อยไป จดเพิ่มอีกนิดก่อนนะครับ');
  if ((m.arc || {}).fileId && !confirm('ทำร่างใหม่จากบันทึกล่าสุด? (ต้องกดส่งอีกครั้ง ระบบจะเขียนทับไฟล์เดิมถ้ายังไม่ได้ยืนยัน)')) return;
  const b = $('#mArcGo'); b.disabled = true; b.textContent = '🏢 AI กำลังเรียบเรียง…';
  try {
    const r = await api('meet_draft', { text: raw, date: (m.when || '').slice(0, 10), time: (m.when || '').slice(11, 16) });
    m.arc = Object.assign({}, m.arc || {}, { minute: r.minute });
    mRenderArc(); mDirty(true);
    $('#mArcPrev').scrollIntoView({ block: 'start', behavior: 'smooth' });
  } catch (err) { showStatus('ทำร่างไม่สำเร็จ: ' + err.message); }
  finally { b.disabled = false; mRenderArc(); }
});
$('#mArcSend').addEventListener('click', async () => {
  const a = m.arc || {};
  if (!a.minute) return;
  const b = $('#mArcSend'); b.disabled = true; b.textContent = '📤 กำลังส่ง…';
  try {
    const key = (m.when || '').slice(0, 10).replace(/-/g, '') + '-' + mId.slice(-6);
    const r = await api('meet_send', { minute: a.minute, fileId: a.fileId || '', name: key });
    m.arc = Object.assign({}, a, { fileId: r.fileId, name: r.name, sentAt: Date.now(), confirmUrl: r.confirmUrl });
    mRenderArc(); mDirty(true);
    toast(r.updated ? '📤 ส่งฉบับแก้ทับแล้ว' : '📤 ส่งเข้า "1 รอยืนยัน" แล้ว เปิดหน้ายืนยันในคลังเพื่อตรวจและกดยืนยัน');
  } catch (err) { showStatus('ส่งไม่สำเร็จ: ' + err.message); }
  finally { b.disabled = false; mRenderArc(); }
});

/* ช่องจดเร็ว */
function quickParse(s) {
  s = s.trim();
  let r;
  if ((r = s.match(/^#\s*(.*)$/))) return { t: 'sec', name: r[1].trim() };
  if ((r = s.match(/^(?:☐|\[\s?\]|งาน\s*[:：]|todo\s*[:：]?)\s*(.+)$/i))) return { t: 'todos', v: r[1] };
  if ((r = s.match(/^(?:\?|？|ถาม\s*[:：])\s*(.+)$/))) return { t: 'asks', v: r[1] };
  if ((r = s.match(/^(?:!|！|ตกลง\s*[:：]|สรุป\s*[:：])\s*(.+)$/))) return { t: 'decs', v: r[1] };
  if ((r = s.match(/^@\s*(.+)$/))) return { t: 'people', v: r[1] };
  r = s.match(/^(.{1,30}?)\s*[:：=]?\s+(-?[\d,]*\.?\d+(?:\s*[-–~]\s*[\d,]*\.?\d+)?)\s*(.{0,20})$/);
  if (r && !/\d$/.test(r[1]) && UNIT_RE.test(r[3].trim())) return { t: 'row', k: r[1].trim(), v: r[2].replace(/\s/g, ''), u: r[3].trim() };
  r = s.match(/^([^:：]{1,25})[:：]\s*(.{1,60})$/);
  if (r) return { t: 'row', k: r[1].trim(), v: r[2].trim(), u: '' };
  return { t: 'note', v: s };
}
$('#mQuick').addEventListener('submit', e => {
  e.preventDefault();
  const s = $('#mIn').value.trim();
  if (!s) return;
  const q = quickParse(s);
  followLive();   // มีกำหนดการ: จดลงช่วงที่กำลังเป็นอยู่ (ถ้าไม่ได้เลือกส่วนเองใน 10 นาทีที่ผ่านมา)
  const ensure = () => { if (!m.sections.length) { newSec(''); mRenderSecs(); } return m.sections[mCur]; };
  let msg = '';
  if (q.t === 'sec') { newSec(q.name); mRenderSecs(); msg = '＋ ส่วน: ' + (q.name || 'ใหม่'); setTimeout(() => $('#mSecs').lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); }
  else if (q.t === 'people') { addPeople(q.v); msg = '👥 ' + q.v; }
  else if (q.t === 'todos' || q.t === 'asks' || q.t === 'decs') { m[q.t].push({ t: q.v }); mRenderList(q.t); msg = { todos: '☐ ', asks: '❓ ', decs: '✅ ' }[q.t] + q.v; }
  else if (q.t === 'row') { ensure().rows.push({ k: q.k, v: q.v, u: q.u }); mRenderSec(mCur); msg = '＋ ' + q.k + ' = ' + [q.v, q.u].filter(Boolean).join(' '); }
  else { const sec = ensure(); sec.notes = [sec.notes, q.v].filter(Boolean).join('\n'); mRenderSec(mCur); msg = '📝 ' + q.v.slice(0, 30); }
  $('#mIn').value = '';
  mState(msg); mDirty(true);
  const el = $('#mSecs').querySelector(`.m-sec[data-i="${mCur}"]`);
  if (q.t !== 'sec' && el && q.t !== 'people' && !['todos', 'asks', 'decs'].includes(q.t)) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

/* หัวบันทึก */
$('#mAgPic').addEventListener('click', agendaFromFile);
$('#mAgTxt').addEventListener('click', () => { $('#mAgPasteBox').hidden = !$('#mAgPasteBox').hidden; if (!$('#mAgPasteBox').hidden) $('#mAgPaste').focus(); });
$('#mAgGo').addEventListener('click', agendaFromText);
$('#mType').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { m.type = b.dataset.t; mRenderAll(); mDirty(); } });
$('#mTitle').addEventListener('input', e => { m.title = e.target.value; if (!m.title || $('#mFromCal').innerHTML) mRenderCal(); mDirty(); });
$('#mWhen').addEventListener('input', e => { m.when = e.target.value; mDirty(); });
$('#mPlace').addEventListener('input', e => { m.place = e.target.value; mDirty(); });
$('#mGeo').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('เครื่องนี้หาตำแหน่งไม่ได้');
  mState('📍 กำลังหาตำแหน่ง…');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    m.geo = { lat: +la.toFixed(6), lng: +lo.toFixed(6) };
    if (!m.place) { m.place = la.toFixed(5) + ', ' + lo.toFixed(5); $('#mPlace').value = m.place; }
    mState('📍 ได้ตำแหน่งแล้ว'); mDirty();
  }, () => mState('📍 หาตำแหน่งไม่ได้ (ยังไม่อนุญาต?)'), { enableHighAccuracy: true, timeout: 12000 });
});
$('#mCopy').addEventListener('click', () => copyText(meetText(m), '📋 คัดลอกแล้ว วางใน LINE ได้เลย'));

/* บันทึก: เก็บในเครื่องทันที แล้วส่งขึ้นหลังหยุดพิมพ์ 3 วิ (สัญญาณไม่ดีก็ไม่หาย) */
function mDirty(soon) {
  putDraft();
  localItem();
  clearTimeout(mTimer);
  mTimer = setTimeout(mSave, soon ? 1500 : 3000);
}
function localItem() {
  const cur = items.find(x => x.id === mId);
  upsert(Object.assign({}, cur || { created: new Date().toISOString().slice(0, 19), _pending: true }, { id: mId, kind: 'meet', title: m.title, text: meetText(m), data: JSON.parse(JSON.stringify(m)) }));
}
function compact(d) {
  // เกินที่ชีตเก็บได้ → ทิ้งรูปย่อของรูปเก่าก่อน (รูปจริงยังอยู่ใน Drive)
  const c = JSON.parse(JSON.stringify(d));
  // รูปย่อของรูปในส่วนไม่เก็บในชีตแล้ว (แอปขอจาก Drive + จำในเครื่อง) ช่องในชีตจะได้พอสำหรับรูปเยอะๆ
  c.sections.forEach(s => (s.photos || []).forEach(p => { if (p.id) delete p.thumb; }));
  return c;
}
async function mSave() {
  clearTimeout(mTimer);
  if (!m) return;
  if (mSaving) { await mSaving; }
  const id = mId, data = compact(m);
  if (!data.title && !data.sections.length && !data.people.length && !data.todos.length && !(data.audio || []).length) return;
  mState('⏳ กำลังบันทึก…');
  mSaving = api('inbox_save', { item: { id, kind: 'meet', data, text: meetText(data) } })
    .then(r => {
      const cur = drafts()[id];
      if (cur && JSON.stringify(cur.data) === JSON.stringify(m)) dropDraft(id);
      upsert(Object.assign(r.item, { _pending: false }));
      if (id === mId) mState('✓ บันทึกแล้ว');
    })
    .catch(err => { if (id === mId) mState('⚠️ ยังส่งไม่ได้ เก็บในเครื่องไว้ก่อน'); console.warn(err); })
    .finally(() => { mSaving = null; });
  return mSaving;
}
async function mClose() {
  if (window.mAudioBusy && mAudioBusy() && !confirm('กำลังอัดเสียงอยู่ ออกจากบันทึกแล้วจะหยุดอัด (เสียงที่อัดแล้วเก็บไว้ครบ) ออกเลยไหม?')) return;
  if ($('#mDlg').open) $('#mDlg').close();
}
$('#mBack').addEventListener('click', mClose);
$('#mDlg').addEventListener('close', async () => {
  if (window.mAudioBusy && mAudioBusy()) mAudioStop();
  const had = drafts()[mId];
  if (had) await mSave();
  render();
});
$('#mDlg').addEventListener('cancel', e => { /* ปุ่มย้อนกลับ/Esc = ปิดแล้วบันทึก · กำลังอัดเสียงอยู่ให้ถามก่อน */ if (window.mAudioBusy && mAudioBusy() && !confirm('กำลังอัดเสียงอยู่ ออกจากบันทึกแล้วจะหยุดอัด ออกเลยไหม?')) e.preventDefault(); });
$('#mDel').addEventListener('click', async () => {
  if (!confirm('ลบบันทึกนี้ทั้งหมด? (รูปยังอยู่ใน Drive โฟลเดอร์กล่องฝาก)')) return;
  const id = mId, o = items.find(x => x.id === id);
  clearTimeout(mTimer); dropDraft(id); m = null;
  $('#mDlg').close(); drop(id); render();
  try { await api('inbox_delete', { id }); toast('🗑 ลบแล้ว'); }
  catch (err) { if (o) { upsert(o); render(); } showStatus('ลบไม่สำเร็จ: ' + err.message); }
});

/* ร่างที่ค้างในเครื่อง (เช่น ตอนไม่มีสัญญาณ) → แสดงในรายการ + ส่งขึ้นเมื่อมีเน็ต */
function mergePending() {
  Object.entries(drafts()).forEach(([id, d]) => {
    if (items.some(x => x.id === id && JSON.stringify(x.data) === JSON.stringify(d.data))) { dropDraft(id); return; }
    const cur = items.find(x => x.id === id);
    upsert(Object.assign({}, cur || { created: new Date(d.at).toISOString().slice(0, 19) }, { id, kind: 'meet', title: d.data.title, text: meetText(d.data), data: d.data, _pending: true }));
  });
}
async function flushDrafts() {
  for (const [id, d] of Object.entries(drafts())) {
    if ($('#mDlg').open && id === mId) continue;
    try {
      const r = await api('inbox_save', { item: { id, kind: 'meet', data: compact(d.data), text: meetText(d.data) } });
      dropDraft(id); upsert(r.item);
    } catch (e) { return; }
  }
  render();
}
window.addEventListener('online', flushDrafts);
