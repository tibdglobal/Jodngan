/**
 * จดครบ — อ่านใบเสร็จ / สลิป / ใบกำกับภาษี ด้วย AI (Google Gemini) แทน OCR + กฎเดา
 * ตั้งค่า: Script Properties → GEMINI_API_KEY (สร้างที่ Google AI Studio) · GEMINI_MODEL (ไม่ใส่ = gemini-3.8-flash)
 * ไม่มี key / AI ล่ม → กลับไปใช้ OCR ของ Drive แบบเดิมให้อัตโนมัติ
 */

const AI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];

/** อ่านเอกสาร: AI ก่อน ถ้าไม่ได้ค่อยใช้ OCR เดิม · คืนรูปแบบเดียวกับ readReceipt_ (+ ช่องเสริม) */
function readDoc_(file, ctx) {
  const ai = aiRead_(file, ctx || {});
  if (ai) return ai;
  let text = '';
  try { text = ocrText_(file); } catch (e) {}
  const o = readReceipt_(text);
  o.via = 'ocr';
  o.memo = slipMemo_(text);
  o.text = String(text).slice(0, 1500);
  o.kind = text ? guessKind_(text) : '';
  return o;
}

function aiRead_(file, ctx) {
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) return null;
  const blob = file.getBlob ? file.getBlob() : file;
  const mime = String(blob.getContentType() || 'image/jpeg');
  if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) return null;
  const bytes = blob.getBytes();
  if (bytes.length > 15 * 1024 * 1024) return null;

  const today = todayStr_();
  const cats = ctx.cats && ctx.cats.length ? ctx.cats : [];
  const prompt = [
    'คุณคือผู้ช่วยบัญชีที่อ่านเอกสารการเงินภาษาไทย/อังกฤษจากรูปได้แม่นยำมาก',
    'อ่านรูปนี้แล้วตอบเป็น JSON ตาม schema เท่านั้น ห้ามเดาข้อมูลที่ไม่มีในรูป (ไม่แน่ใจให้เว้นว่าง "" หรือ 0)',
    'กติกา:',
    '- kind: receipt=ใบเสร็จ/บิลร้าน, tax_invoice=ใบกำกับภาษี, slip=สลิปโอนเงิน/QR, invoice=ใบแจ้งหนี้/ใบวางบิล, quotation=ใบเสนอราคา, other=อื่นๆ (ไม่ใช่เอกสารการเงิน)',
    '- date: วันที่ทำรายการ รูปแบบ YYYY-MM-DD เป็น ค.ศ. เสมอ (ปี พ.ศ. ลบ 543 เช่น 2569→2026, ปีย่อ 69→2026) วันนี้คือ ' + today + ' ถ้าได้วันที่อนาคตแปลว่าอ่านผิด',
    '- time: HH:MM ถ้ามี',
    '- amount: ยอดที่จ่ายจริงสุดท้าย (หลังส่วนลด รวม VAT/service) เป็นตัวเลขล้วน ห้ามเอาเงินที่ลูกค้าให้มาหรือเงินทอน สลิปโอนเงิน = จำนวนเงินที่โอน',
    '- vendor: ชื่อร้าน/บริษัทผู้ขาย (ไม่ใช่ชื่อสาขา ไม่ใช่ที่อยู่) สลิปโอน = ชื่อผู้รับเงิน',
    '- memo: ข้อความบันทึก/โน้ตที่คนโอนพิมพ์ไว้เองในสลิป (ช่อง บันทึกช่วยจำ, บันทึก, ข้อความ, หมายเหตุ, Note, Memo, รายละเอียด) คัดลอกตามที่เขียนทุกตัวอักษร ไม่มีให้ ""',
    '- desc: สรุปสั้นๆ ภาษาไทยว่าจ่าย/รับค่าอะไร ไม่เกิน 40 ตัวอักษร ถ้ามี memo ให้ยึดตาม memo เป็นหลัก (เช่น memo "เงินค่าห้อง พ.ย." → desc "ค่าห้อง พ.ย.") ไม่มี memo ค่อยสรุปจากรายการสินค้า เช่น "ค่าอาหารกลางวัน", "ค่าน้ำมันรถ"',
    '- cat: ถ้ามี memo ให้ใช้ memo ช่วยเลือกหมวดด้วย',
    '- vat: yes ถ้ามีการแสดงภาษีมูลค่าเพิ่ม/VAT หรือเป็นใบกำกับภาษี, no ถ้าไม่มี · vat_amount: ยอด VAT ถ้ามี · prices_include_vat: ราคาสินค้าแต่ละรายการรวม VAT แล้วหรือยัง',
    '- service_charge, discount: ยอดเงิน (ไม่ใช่ %) ถ้ามี',
    '- items: รายการสินค้า/เมนูทุกบรรทัด ชื่อตามที่เขียน qty จำนวน price = ราคารวมของบรรทัดนั้น (ไม่ใช่ราคาต่อหน่วย) ไม่ต้องใส่บรรทัดยอดรวม/ภาษี/ส่วนลด',
    '- pay: วิธีจ่าย เลือกจาก "เงินสด","โอน","QR/พร้อมเพย์","บัตรเครดิต","บัตรเดบิต","" · สลิปโอน = "โอน"',
    '- payer / payee / bank / ref: สำหรับสลิป (ชื่อผู้โอน ผู้รับ ธนาคาร เลขอ้างอิง)',
    '- tax_id: เลขประจำตัวผู้เสียภาษีของผู้ขาย 13 หลักถ้ามี',
    cats.length ? '- cat: เลือกหมวดที่เหมาะที่สุดจากรายการนี้เท่านั้น: ' + cats.join(', ') + ' (ไม่เข้าหมวดไหนให้ "")' : '- cat: ""',
    '- confidence: ความมั่นใจโดยรวม 0-1',
  ].join('\n');

  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  const schema = S('OBJECT', {
    properties: {
      kind: S('STRING', { enum: ['receipt', 'tax_invoice', 'slip', 'invoice', 'quotation', 'other'] }),
      date: S('STRING'), time: S('STRING'), amount: S('NUMBER'), vendor: S('STRING'), desc: S('STRING'),
      vat: S('STRING', { enum: ['yes', 'no', ''] }), vat_amount: S('NUMBER'), prices_include_vat: S('BOOLEAN'),
      service_charge: S('NUMBER'), discount: S('NUMBER'),
      items: S('ARRAY', { items: S('OBJECT', { properties: { name: S('STRING'), qty: S('NUMBER'), price: S('NUMBER') }, required: ['name', 'price'] }) }),
      pay: S('STRING'), memo: S('STRING'), payer: S('STRING'), payee: S('STRING'), bank: S('STRING'), ref: S('STRING'), tax_id: S('STRING'),
      cat: S('STRING'), confidence: S('NUMBER'),
    },
    required: ['kind', 'date', 'amount', 'vendor', 'desc', 'vat', 'items', 'confidence'],
  });

  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } }, { text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };
  const models = [props.getProperty('GEMINI_MODEL')].concat(AI_MODELS).filter((m, i, a) => m && a.indexOf(m) === i);
  for (const model of models) {
    try {
      const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
        headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
      });
      const code = r.getResponseCode();
      if (code === 404 || code === 400 && /model/i.test(r.getContentText())) continue;   // รุ่นนี้ใช้ไม่ได้ ลองรุ่นถัดไป
      if (code !== 200) { console.warn('Gemini ' + model + ' ' + code + ': ' + r.getContentText().slice(0, 300)); continue; }
      const res = JSON.parse(r.getContentText());
      const txt = (((res.candidates || [])[0] || {}).content || {}).parts;
      const raw = (txt || []).map(p => p.text || '').join('');
      const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim());
      return aiNormalize_(j, cats, model);
    } catch (e) { console.warn('Gemini ' + model + ' error: ' + e); }
  }
  return null;
}

/** แปลงผล AI ให้อยู่ในรูปแบบที่ระบบเดิมใช้ + ตรวจความสมเหตุสมผล */
function aiNormalize_(j, cats, model) {
  const n = v => { const x = Number(String(v == null ? '' : v).replace(/[,฿\s]/g, '')); return isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0; };
  let date = String(j.date || '').trim();
  const m = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    let y = Number(m[1]); if (y > 2400) y -= 543;
    date = y + '-' + pad_(m[2]) + '-' + pad_(m[3]);
    const age = daysBetween_(date, todayStr_());
    if (age < -1 || age > 800) date = '';          // อนาคต หรือเก่าเกินไป = น่าจะอ่านผิด
  } else date = '';
  const amount = n(j.amount);
  const kind = { receipt: 'receipt', tax_invoice: 'taxinv', slip: 'slip', invoice: 'other', quotation: 'other', other: 'other' }[j.kind] || '';
  const docType = String(j.kind || '');
  const vat = j.vat === 'yes' || kind === 'taxinv' ? 'yes' : j.vat === 'no' ? 'no' : '';
  let vatAmt = n(j.vat_amount);
  if (vat === 'yes' && !vatAmt && amount) vatAmt = Math.round(amount * 7 / 107 * 100) / 100;
  const items = (Array.isArray(j.items) ? j.items : []).map(it => ({ name: String(it.name || '').trim().slice(0, 60), qty: n(it.qty) || 1, price: n(it.price) }))
    .filter(it => it.name && it.price).slice(0, 60);
  const cat = cats.length && cats.indexOf(String(j.cat || '')) > -1 ? String(j.cat) : '';
  return {
    via: 'ai', model: model, kind: kind, docType: docType, date: date, time: String(j.time || '').slice(0, 5),
    amount: amount ? String(amount) : '', vendor: String(j.vendor || '').trim().slice(0, 80), desc: String(j.desc || '').trim().slice(0, 60),
    vat: vat, vatAmt: vatAmt ? String(vatAmt) : '', pricesIncVat: j.prices_include_vat !== false,
    service: n(j.service_charge), discount: n(j.discount), items: items,
    memo: String(j.memo || '').trim().slice(0, 120), pay: String(j.pay || ''), payer: String(j.payer || '').slice(0, 80), payee: String(j.payee || '').slice(0, 80), bank: String(j.bank || '').slice(0, 40), ref: String(j.ref || '').slice(0, 40),
    taxId: String(j.tax_id || '').replace(/\D/g, '').slice(0, 13), cat: cat, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
  };
}

/** หน้าหารกัน: อ่านใบเสร็จ (เก็บรูปไว้ในโฟลเดอร์รายรับรายจ่าย) แล้วส่งรายการเมนูกลับไป */
function aiReadUpload_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const date = todayStr_();
  const file = moneyFolder_(date.slice(0, 7)).createFile(Utilities.newBlob(bytes, mime, date + '_ใบเสร็จหาร' + (mime === 'application/pdf' ? '.pdf' : '.jpg')));
  const ocr = readDoc_(file, { cats: [] });
  return { ocr: ocr, file: { id: file.getId(), url: file.getUrl(), mime: mime, thumb: String(p.thumb || '').slice(0, 12000) }, ai: !!props.getProperty('GEMINI_API_KEY') };
}

/** หมวดของบิลเบิก และของรายรับรายจ่าย (ให้ AI เลือกจากรายการนี้) */
function billCatList_() {
  const used = billsAll_().map(b => String(b.cat || '').trim()).filter(Boolean);
  const base = ['เดินทาง', 'อาหาร/รับรอง', 'ค่าห้องประชุม', 'ที่พัก', 'อุปกรณ์/วัสดุ', 'ค่าบริการ', 'อื่นๆ'];
  return Array.from(new Set(base.concat(used))).slice(0, 40);
}
function moneyCatList_(type) {
  const base = (MONEY_CATS[type === 'in' ? 'in' : 'out'] || []).map(c => Array.isArray(c) ? c[0] : c);
  return Array.from(new Set(base.concat(['อื่นๆ'])));
}

/** โน้ตที่ผู้โอนพิมพ์ไว้ในสลิป (OCR แบบเดิม) */
function slipMemo_(text) {
  const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const KEY = /^(บันทึกช่วยจำ|บันทึก|ข้อความ|หมายเหตุ|รายละเอียด|note|memo)\s*[:：]?\s*/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(KEY);
    if (!m) continue;
    const v = lines[i].slice(m[0].length).trim() || (lines[i + 1] && !KEY.test(lines[i + 1]) ? lines[i + 1] : '');
    if (v && !/^\d[\d,.\s]*$/.test(v)) return v.slice(0, 120);
  }
  return '';
}

/** ข้อความที่จะใช้เป็นรายละเอียด/โน้ต: โน้ตในสลิปก่อน แล้วค่อยเป็นสรุปของ AI + ชื่อร้าน/ผู้รับ */
function docNote_(o) {
  o = o || {};
  const memo = String(o.memo || '').replace(/^(เงิน|โอน)\s*(?=ค่า)/, '').trim();
  if (memo) return [memo, o.vendor && memo.indexOf(o.vendor) < 0 ? o.vendor : ''].filter(Boolean).join(' · ');
  if (o.via === 'ai') return [o.desc, o.vendor].filter(Boolean).join(' · ');
  return o.vendor || '';
}

/** ทดสอบเทียบ (อ่านอย่างเดียว ไม่บันทึกอะไร): ไฟล์ที่มีอยู่แล้วใน Drive → ผล OCR แบบเดิม vs AI */
function aiCompare_(ids, data, mime) {
  if (data) {   // ไฟล์ทดสอบที่ส่งมาตรงๆ: สร้างไฟล์ชั่วคราว อ่าน แล้วทิ้งลงถังขยะทันที
    const tmp = DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(String(data)), String(mime || 'application/pdf'), 'ai-test-tmp'));
    try { return aiCompare_([tmp.getId()]); } finally { try { tmp.setTrashed(true); } catch (e) {} }
  }
  const pick = o => o ? { kind: o.kind || '', date: o.date || '', amount: o.amount || '', vendor: o.vendor || '', desc: o.desc || '', memo: o.memo || '', vat: o.vat || '', cat: o.cat || '', items: (o.items || []).length } : null;
  return (ids || []).slice(0, 4).map(id => {
    const out = { id: id };
    try {
      const file = DriveApp.getFileById(id);
      const t0 = Date.now();
      let text = '';
      try { text = ocrText_(file); } catch (e) {}
      const old = readReceipt_(text); old.memo = slipMemo_(text);
      out.old = pick(old); out.oldMs = Date.now() - t0;
      const t1 = Date.now();
      out.ai = pick(aiRead_(file, { cats: billCatList_() }));
      out.aiMs = Date.now() - t1;
    } catch (e) { out.error = String(e.message || e); }
    return out;
  });
}

/** รวมยอดหลายเอกสาร: สลิปโอนที่ยอดเท่ากับใบเสร็จ/ใบกำกับในชุดเดียวกัน = จ่ายบิลเดียวกัน ไม่นับซ้ำ */
function sumDocs_(os) {
  const bills = os.filter(o => o.kind !== 'slip' && Number(o.amount) > 0).map(o => Number(o.amount));
  let total = bills.reduce((s, x) => s + x, 0);
  const left = bills.slice();
  os.filter(o => o.kind === 'slip' && Number(o.amount) > 0).forEach(o => {
    const a = Number(o.amount), i = left.findIndex(x => Math.abs(x - a) < 0.01);
    if (i > -1) left.splice(i, 1); else total += a;
  });
  return Math.round(total * 100) / 100;
}

/** ตรวจการเชื่อมต่อ Gemini: รุ่นที่ใช้ได้ + ข้อความ error (ไม่คืนค่า key) */
function aiDebug_() {
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, msg: 'ไม่มี GEMINI_API_KEY' };
  const out = { models: [], tries: [] };
  try {
    const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    out.listCode = r.getResponseCode();
    const j = JSON.parse(r.getContentText() || '{}');
    out.models = (j.models || []).filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') > -1).map(m => String(m.name).replace('models/', ''));
    if (j.error) out.listErr = String(j.error.message || '').slice(0, 300);
  } catch (e) { out.listErr = String(e); }
  const models = [props.getProperty('GEMINI_MODEL')].concat(AI_MODELS).filter((m, i, a) => m && a.indexOf(m) === i);
  models.forEach(model => {
    try {
      const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
        payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ตอบคำว่า ok' }] }] }),
      });
      out.tries.push({ model: model, code: r.getResponseCode(), msg: r.getContentText().slice(0, 300) });
    } catch (e) { out.tries.push({ model: model, err: String(e) }); }
  });
  return out;
}

/** สร้างไฟล์ + อ่านเอกสารทั้งหมดก่อนเข้าล็อก (คืน [{file, mime, thumb, o}]) */
function preRead_(p, folderFn, cats) {
  const list = Array.isArray(p.files) && p.files.length ? p.files.slice(0, 10) : [{ data: p.data, mime: p.mime, thumb: p.thumb }];
  const folder = folderFn();
  return list.map(f => {
    const mime = String(f.mime || 'application/octet-stream');
    if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
    const bytes = Utilities.base64Decode(String(f.data || ''));
    if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
    const file = folder.createFile(Utilities.newBlob(bytes, mime, 'upload'));
    let o = {};
    try { o = readDoc_(file, { cats: cats }) || {}; } catch (e) { o = {}; }
    return { file: file, mime: mime, thumb: f.thumb, o: o };
  });
}
