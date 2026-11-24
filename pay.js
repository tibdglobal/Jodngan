/* หน้า สแกนจ่าย ของบิลหารกันในกลุ่ม LINE (เปิดได้โดยไม่ต้องล็อกอิน เห็นเฉพาะบิลของลิงก์นี้) */
const API_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = s => '฿' + (s / 100).toLocaleString('th-TH', { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
const mask = id => String(id).replace(/^(\d{3})\d+(\d{4})$/, '$1-xxx-$2');

function ppPayload(id, amountS) {
  const f = (t, v) => t + String(v.length).padStart(2, '0') + v;
  const acc = id.length === 10 ? f('01', '0066' + id.slice(1)) : id.length === 13 ? f('02', id) : f('03', id);
  let s = f('00', '01') + f('01', amountS ? '12' : '11') + f('29', f('00', 'A000000677010111') + acc) + f('58', 'TH') + f('53', '764') +
    (amountS ? f('54', (amountS / 100).toFixed(2)) : '') + '6304';
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) { crc ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
  return s + crc.toString(16).toUpperCase().padStart(4, '0');
}
function qrCanvas(id, amountS, title) {
  const q = qrcode(0, 'M'); q.addData(ppPayload(id, amountS)); q.make();
  const n = q.getModuleCount(), cell = 8, pad = 4 * cell, W = n * cell + pad * 2, H = W + 70;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0b2c5f';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(pad + k * cell, pad + r * cell, cell, cell);
  g.textAlign = 'center';
  g.font = 'bold 26px sans-serif'; g.fillText('พร้อมเพย์ ' + baht(amountS), W / 2, W + 18);
  g.font = '18px sans-serif'; g.fillStyle = '#555'; g.fillText(String(title || '').slice(0, 30), W / 2, W + 48);
  return c;
}

let bill = null, pick = -1, canvas = null;

function render() {
  const b = bill, app = $('#app');
  const left = b.members.filter(m => !m.paid);
  app.innerHTML = `
    <h1>${esc(b.title)}</h1>
    <p class="sub">รวม ${baht(b.totalS)} · ${esc(b.payer)} จ่ายก่อน${b.payerShareS ? ' (ส่วนตัวเอง ' + baht(b.payerShareS) + ')' : ''}</p>
    ${left.length ? '' : '<div class="card msg"><div class="done">🎉 จ่ายครบทุกคนแล้ว</div></div>'}
    <ul class="card who" aria-label="แตะชื่อตัวเองเพื่อดู QR">
      ${b.members.map((m, i) => `<li><button type="button" data-i="${i}" aria-pressed="${i === pick}" class="${m.paid ? 'paid' : ''}">
        <span class="dot" aria-hidden="true"></span><span class="nm">${esc(m.name)}${m.paid ? ' <span class="tag">โอนแล้ว</span>' : ''}</span><span class="am">${baht(m.amtS)}</span></button></li>`).join('')}
    </ul>
    ${pick < 0 && left.length ? '<p class="hint">แตะชื่อตัวเอง แล้วสแกน QR จ่ายได้เลย ยอดใส่ไว้ให้แล้ว</p>' : ''}
    <section class="card qr" id="qr" hidden></section>`;
  app.querySelectorAll('.who button').forEach(btn => btn.onclick = () => { pick = +btn.dataset.i; render(); });
  if (pick > -1) showQR(b.members[pick]);
}

function showQR(m) {
  const box = $('#qr');
  box.hidden = false;
  if (!bill.pp) { box.innerHTML = `<p class="msg">${esc(bill.payer)} ยังไม่ได้ตั้งพร้อมเพย์<br>ให้ ${esc(bill.payer)} พิมพ์ในกลุ่ม: พร้อมเพย์ 08xxxxxxxx</p>`; return; }
  try { canvas = qrCanvas(bill.pp, m.amtS, bill.title); } catch (e) { box.innerHTML = '<p class="msg">ทำ QR ไม่สำเร็จ</p>'; return; }
  box.innerHTML = `
    <div class="amt">${baht(m.amtS)}</div>
    <div class="to">${esc(m.name)} จ่ายให้ ${esc(bill.payer)}</div>
    <img alt="QR พร้อมเพย์ ${baht(m.amtS)}" src="${canvas.toDataURL('image/png')}">
    <div class="pp">พร้อมเพย์ ${esc(mask(bill.pp))}</div>
    <div class="row"><button class="btn" id="save" type="button">บันทึกรูป QR</button></div>
    <p class="after">ถ้าสแกนจากเครื่องนี้ไม่ได้ ให้บันทึกรูป แล้วเปิดแอปธนาคาร เลือกสแกนจากรูป${m.paid ? '' : ' · โอนแล้วกลับไปกด ✅ ฉันโอนแล้ว ใต้บิลในกลุ่ม LINE'}</p>`;
  $('#save').onclick = () => canvas.toBlob(async b => {
    const file = new File([b], `promptpay-${m.amtS / 100}.png`, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  if (matchMedia('(max-width: 600px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

(async () => {
  const t = new URLSearchParams(location.search).get('t') || '';
  const fail = msg => { $('#app').innerHTML = `<div class="card msg">${esc(msg)}</div>`; };
  if (!/^[A-Za-z0-9]{16,40}$/.test(t)) return fail('ลิงก์ไม่ครบ ลองกดปุ่มสแกนจ่ายในกลุ่ม LINE อีกครั้ง');
  try {
    const res = await fetch((window.PAY_API || API_URL), { method: 'POST', body: JSON.stringify({ action: 'pub_bill', t }), redirect: 'follow' });
    const d = await res.json();
    if (!d.ok) return fail(d.error || 'เปิดบิลไม่สำเร็จ');
    bill = d.bill;
    const unpaid = bill.members.map((m, i) => m.paid ? -1 : i).filter(i => i > -1);
    if (unpaid.length === 1) pick = unpaid[0];
    document.title = bill.title + ' · สแกนจ่าย';
    render();
  } catch (e) { fail('ต่อระบบไม่ได้ ลองใหม่อีกครั้ง'); }
})();
