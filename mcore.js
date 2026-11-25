/* จดครบ — ตัวช่วยร่วมของหน้าเงิน / หารกัน (โหลดก่อน money.js / split.js) */
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwaM09cNIMYY1_HMRTEL0Sm-3qg5rSvxd93k6jLU2EgoaHNZvMUvhgoQ_jRnELgY0FAbA/exec';
const cfg = LS.get('cfg', { url: '', key: '' });
if (!cfg.url) cfg.url = DEFAULT_URL;

/* หมวด + ไอคอน */
const CATS = {
  out: [['อาหาร', '🍚'], ['เครื่องดื่ม/กาแฟ', '☕'], ['เดินทาง', '🚗'], ['ค่าเช่าห้อง', '🔑'], ['เสื้อผ้า', '👕'], ['ออกกำลังกาย', '🏃'], ['อุปกรณ์กีฬา', '🏸'],
    ['ของใช้', '🧴'], ['ซักผ้า', '🧺'], ['เติมเกม', '🎮'], ['การ์ด', '🃏'], ['ค่าน้ำไฟ/โทรศัพท์', '💡'], ['สุขภาพ', '💊'], ['บันเทิง/ท่องเที่ยว', '🎬'], ['การศึกษา', '📚'], ['อื่นๆ', '📦']],
  in: [['เงินเดือน', '💼'], ['โบนัส', '🎉'], ['งานเสริม/ฟรีแลนซ์', '🧑‍💻'], ['ขายของ', '🏷'], ['ดอกเบี้ย/ปันผล', '📈'], ['ได้เงินคืน', '↩️'], ['อื่นๆ', '💰']],
};
const KW = {
  out: [['อาหาร', /ข้าว|ก๋วยเตี๋ยว|อาหาร|กับข้าว|ส้มตำ|หมูกระทะ|ชาบู|บุฟเฟ่|line\s*man|grab\s*food|foodpanda|robinhood|ขนม|มื้อ|kfc|mcdonald|เซเว่น|7-?eleven|ตลาด/i],
    ['เครื่องดื่ม/กาแฟ', /กาแฟ|ชานม|ชาไข่มุก|coffee|cafe|café|คาเฟ่|starbucks|amazon|อเมซอน|น้ำดื่ม|เครื่องดื่ม|เบียร์/i],
    ['เดินทาง', /grab|bolt|แท็กซี่|taxi|bts|mrt|รถไฟ|รถเมล์|วิน|น้ำมัน|ปตท|ptt|บางจาก|shell|ทางด่วน|easy\s*pass|จอดรถ|ตั๋ว|เครื่องบิน/i],
    ['ค่าเช่าห้อง', /ค่าเช่า|ค่าห้อง|เช่าห้อง|คอนโด|หอพัก|อพาร์ท|ส่วนกลาง/i],
    ['เสื้อผ้า', /เสื้อ|กางเกง|กระโปรง|ชุด|รองเท้า|ถุงเท้า|uniqlo|h&m|zara/i],
    ['อุปกรณ์กีฬา', /อุปกรณ์กีฬา|ไม้แบด|ลูกแบด|ลูกขนไก่|ไม้เทนนิส|ลูกบอล|ฟุตบอล|ดัมเบล|เสื่อโยคะ|จักรยาน|decathlon|super\s*sports|กีฬา/i],
    ['ออกกำลังกาย', /ฟิตเนส|fitness|gym|ยิม|วิ่ง|ว่ายน้ำ|สระ|โยคะ|yoga|มวย|แบด|ค่าสนาม|ค่าคอร์ท|เทรนเนอร์|ปั่นจักรยาน|ออกกำลัง/i],
    ['ค่าน้ำไฟ/โทรศัพท์', /ค่าไฟ|ค่าน้ำ|ค่าเน็ต|อินเทอร์เน็ต|internet|wifi|ais|true|dtac|ค่าโทร|มือถือ/i],
    ['สุขภาพ', /ยา|หมอ|คลินิก|โรงพยาบาล|ทำฟัน/i],
    ['เติมเกม', /เติมเกม|เติมเพชร|เติมเงินเกม|top-?up|rov|free\s*fire|pubg|genshin|honkai|garena|steam|playstation|psn|nintendo|valorant|razer\s*gold|truemoney\s*game/i],
    ['การ์ด', /การ์ด|โปเกมอน|pokemon|pokémon|yu-?gi-?oh|ยูกิ|tcg|บูสเตอร์|booster|one\s*piece\s*card|magic\s*the\s*gathering|การ์ดเกม/i],
    ['ซักผ้า', /ซักผ้า|ร้านซัก|เครื่องซัก|อบผ้า|ผงซักฟอก|น้ำยาซักผ้า|ปรับผ้านุ่ม|ซักรีด|รีดผ้า|otteri|หยอดเหรียญ/i],
    ['ของใช้', /ของใช้|สบู่|แชมพู|ยาสีฟัน|แปรงสีฟัน|ทิชชู่|ทิชชู|กระดาษชำระ|ถุงขยะ|โฟมล้างหน้า|ครีม|ผ้าอนามัย|มีดโกน|watsons|วัตสัน|boots|eveandboy|shopee|lazada|lotus|โลตัส|big\s*c|บิ๊กซี|makro|แม็คโคร|tops|ikea|เฟอร์นิเจอร์/i],
    ['บันเทิง/ท่องเที่ยว', /หนัง|netflix|spotify|youtube|disney|คอนเสิร์ต|เที่ยว|โรงแรม|hotel|agoda/i],
    ['การศึกษา', /หนังสือ|คอร์ส|course|เรียน|ค่าเทอม/i]],
  in: [['เงินเดือน', /เงินเดือน|salary/i], ['โบนัส', /โบนัส|bonus/i], ['งานเสริม/ฟรีแลนซ์', /ฟรีแลนซ์|freelance|งานเสริม|ค่าจ้าง|ค่าแรง/i],
    ['ขายของ', /ขาย|ออเดอร์/i], ['ดอกเบี้ย/ปันผล', /ดอกเบี้ย|ปันผล/i], ['ได้เงินคืน', /คืน|refund|cashback/i]],
};
const icon = (type, cat) => ((CATS[type] || []).find(c => c[0] === cat) || [0, type === 'in' ? '💰' : (cat ? '🏷' : '📦')])[1];

let items = LS.get('money', []);
let view = LS.get('moneyView', 'list');

/* ---------- ช่วยเหลือ ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const baht = n => { const v = Number(n || 0); return '฿' + v.toLocaleString('th-TH', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const sum = list => list.reduce((s, x) => s + Number(x.amount || 0), 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[-.]/g, '');
const monthName = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const monthShort = m => new Date(m + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'short' });
const addMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const inMonth = (x, m) => (x.date || '').slice(0, 7) === m;
const dayLabel = s => { const t = today(); const y = ymd(new Date(Date.now() - 864e5)); const d = new Date(s + 'T00:00:00'); return (s === t ? 'วันนี้ · ' : s === y ? 'เมื่อวาน · ' : '') + d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(action, payload = {}) {
  const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action, key: cfg.key, ...payload }), redirect: 'follow' });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}
function showStatus(msg, ok) { const el = $('#status'); el.textContent = msg || ''; el.hidden = !msg; el.classList.toggle('ok', !!ok); }
function upsert(m) { const i = items.findIndex(x => x.id === m.id); if (i > -1) items[i] = m; else items.push(m); LS.set('money', items); }

async function sync() {
  if (!cfg.key) { showStatus('ยังไม่ได้เชื่อมเครื่องนี้ กลับไปหน้าหลักแล้วเปิดลิงก์จาก LINE ก่อน'); return; }
  $('#btnSync').classList.add('spin');
  try { items = (await api('money_list')).items; LS.set('money', items); showStatus(''); render(); }
  catch (e) { showStatus('ดึงข้อมูลไม่สำเร็จ: ' + e.message); }
  finally { $('#btnSync').classList.remove('spin'); }
}

/* เดาหมวด: เคยจดชื่อนี้ไว้หมวดไหน → ใช้หมวดนั้น · ไม่งั้นดูจากคำ */
function guessCat(type, note) {
  const t = String(note || '').trim();
  if (!t) return '';
  const hit = [...items].reverse().find(x => x.type === type && x.cat && String(x.note).trim() === t);
  if (hit) return hit.cat;
  const r = (KW[type] || []).find(x => x[1].test(t));
  return r ? r[0] : '';
}

let busyTick = null;
function busyStart(img) {
  const t0 = Date.now();
  $('#busyImg').hidden = !img;
  if (img) $('#busyImg').src = img;
  const steps = [[0, 'กำลังส่งรูป…'], [2, 'กำลังอ่านสลิป…'], [6, 'กำลังหายอดเงิน วันที่…'], [14, 'ใกล้เสร็จแล้ว…']];
  const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); $('#busyMsg').textContent = steps.filter(x => s >= x[0]).pop()[1]; $('#busySub').textContent = s + ' วินาที · ปกติใช้ราว 5–10 วินาที'; };
  clearInterval(busyTick); tick(); busyTick = setInterval(tick, 500);
  $('#busy').hidden = false;
}
function busyEnd() { clearInterval(busyTick); $('#busy').hidden = true; }
async function prepare(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 10 * 1024 * 1024) throw new Error('PDF ใหญ่เกิน 10MB');
    return { mime: 'application/pdf', data: await toB64(file), thumb: '' };
  }
  const img = await new Promise((ok, bad) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => bad(new Error('เปิดรูปนี้ไม่ได้')); i.src = u; });
  return { mime: 'image/jpeg', data: draw(img, 1800, 0.82).split(',')[1], thumb: draw(img, 160, 0.6) };
}
function draw(img, max, q) {
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
const toB64 = file => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => bad(new Error('อ่านไฟล์ไม่ได้')); r.readAsDataURL(file); });

/* แถบแจ้ง + ยกเลิก/แก้ */
let toastTimer = null;
function toast(msg, undo, edit) {
  $('#toastMsg').textContent = msg;
  $('#toastUndo').textContent = '↩ ยกเลิก';
  $('#toastUndo').onclick = () => { $('#toast').hidden = true; undo && undo(); };
  $('#toastMsg').onclick = () => { $('#toast').hidden = true; edit && edit(); };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

/* ---------- ตัวเลือกด่วน 2 บรรทัด: ⭐ ใช้บ่อย / 🕘 ล่าสุด + ＋ ดูเพิ่มเติม (ใช้กับชื่อคน รายละเอียด และหมวดรายรับ-จ่าย) ----------
 * stats = [{ key, label, n (จำนวนครั้ง), last ('YYYY-MM-DD...') }] · onPick(key) · opts: per, plus:false, on (key ที่เลือกอยู่), keepOrder (ที่เหลือคงลำดับเดิม) */
function quickPick(box, stats, onPick, opts) {
  if (!box) return;
  opts = opts || {};
  const PER = opts.per || 3, plus = opts.plus === false ? '' : '＋ ';
  const freq = stats.slice().sort((x, y) => y.n - x.n || String(y.last).localeCompare(String(x.last))).slice(0, PER);
  const used = new Set(freq.map(s => s.key));
  const recent = stats.filter(s => !used.has(s.key) && s.last).sort((x, y) => String(y.last).localeCompare(String(x.last)) || y.n - x.n).slice(0, PER);
  recent.forEach(s => used.add(s.key));
  const rest = stats.filter(s => !used.has(s.key));
  if (!opts.keepOrder) rest.sort((x, y) => String(x.label).localeCompare(String(y.label), 'th'));
  const more = box.dataset.more === '1';
  const chip = s => `<button type="button" data-add="${esc(s.key)}"${opts.on === s.key ? ' class="on"' : ''}>${plus}${esc(s.label)}</button>`;
  const row = (label, list) => list.length ? `<div class="pk-row"><span class="pk-l">${label}</span><div class="pk-c">${list.map(chip).join('')}</div></div>` : '';
  box.classList.add('s-pick');
  box.innerHTML = !stats.length ? '' : row('⭐ ใช้บ่อย', freq) + row('🕘 ล่าสุด', recent) +
    (rest.length ? `<button type="button" class="pk-more" data-more>${more ? '▴ ซ่อน' : `＋ ดูเพิ่มเติม (${rest.length})`}</button>` + (more ? `<div class="pk-all">${rest.map(chip).join('')}</div>` : '') : '');
  box.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more !== undefined) { box.dataset.more = more ? '' : '1'; quickPick(box, stats, onPick, opts); return; }
    if (b.dataset.add) onPick(b.dataset.add);
  };
}
