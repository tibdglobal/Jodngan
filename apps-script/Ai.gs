/**
 * จดครบ — อ่านใบเสร็จ / สลิป / ใบกำกับภาษี ด้วย AI (Google Gemini) แทน OCR + กฎเดา
 * ตั้งค่า: Script Properties → GEMINI_API_KEY (สร้างที่ Google AI Studio) · GEMINI_MODEL (ไม่ใส่ = gemini-3.8-flash)
 * ไม่มี key / AI ล่ม → กลับไปใช้ OCR ของ Drive แบบเดิมให้อัตโนมัติ
 */

const AI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];   // lite: ~4 วิ แม่นพอ · 3.8-flash ช้า/คนใช้เยอะ ใช้สำรอง
let AI_ERRS = [];   // ข้อผิดพลาดล่าสุด (ไว้ดูตอนทดสอบ)

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
  ctx = ctx || {};
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
    '- service_charge, discount: ยอดเงิน (ไม่ใช่ %) ถ้ามี · discount ระดับบิล = เฉพาะส่วนลดท้ายบิลที่ไม่ได้ผูกกับสินค้าชิ้นใด (ส่วนลดที่ผูกกับสินค้าให้ใส่ใน items[].discount แทน ห้ามนับซ้ำ)',
    '- items: รายการสินค้า/เมนูทุกบรรทัด ชื่อตามที่เขียน qty จำนวน price = ราคารวมของบรรทัดนั้นก่อนหักส่วนลด (ไม่ใช่ราคาต่อหน่วย) ไม่ต้องใส่บรรทัดยอดรวม/ภาษี/ส่วนลดเป็นรายการแยก',
    '- items[].discount: ส่วนลดของสินค้าชิ้นนั้น เป็นยอดบวก เช่นบรรทัด "ส่วนลด -8" หรือโปร/คูปองที่อยู่ใต้สินค้าหรือระบุชื่อสินค้า (ส่วนลด % ให้คำนวณเป็นบาท) · items[].discount_note: ชื่อส่วนลด/โปรตามที่เขียน ไม่มีให้ ""',
    '- ใบเสร็จร้านสะดวกซื้อ/ห้าง (เช่น 7-Eleven, Lotus, Big C, Tops) มักพิมพ์ "ยอดรวม" ก่อน แล้วตามด้วยบรรทัดส่วนลด/โปร/คูปอง (ติดลบ) แล้วจึง "ยอดสุทธิ/รับเงิน/เงินสด" · amount ต้องเป็นยอดหลังหักส่วนลดทุกบรรทัดเสมอ ไม่ใช่ "ยอดรวม" ก่อนลด',
    '- บรรทัดส่วนลดที่ระบุชื่อสินค้า (เช่น "ส่วนลดน้ำแร่", "7ลดไอศกรีม", "AMBลด…", "คูปองชีสไบท์") ให้ใส่เป็น items[].discount ของสินค้าชื่อนั้น ห้ามใส่เป็นสินค้าแยกหรือราคาติดลบ · ส่วนลดที่ไม่ระบุสินค้า (คูปองท้ายบิล แต้ม The1/สมาชิก Meal Deal ส่วนลดค่าส่ง) = discount ระดับบิล',
    '- ซื้อ 1 แถม 1 / ซื้อคู่ถูกกว่า: ใส่สินค้าตามจำนวนจริงและราคาเต็ม แล้วใส่ส่วนที่ลดเป็น items[].discount ของสินค้านั้น',
    '- บรรทัดราคา 0.00 (ของแถม แสตมป์ แต้มสะสม กิจกรรม ข้อความโปร) และบรรทัดยอดรวม/เงินที่รับ/เงินทอน/VAT ไม่ต้องใส่ใน items',
    '- แอปส่งอาหาร (Grab, LINE MAN, foodpanda, Robinhood, ShopeeFood): items = เมนู · ค่าส่ง+ค่าบริการแพลตฟอร์ม+ค่ากล่อง รวมกันเป็น service_charge · โปร/ส่วนลดค่าส่ง/โค้ด = discount',
    '- ร้านอาหารที่บวก service charge 10% และ/หรือ VAT 7% ท้ายบิล: ราคาเมนูยังไม่รวม → prices_include_vat=false และใส่ vat_amount, service_charge ตามที่พิมพ์',
    '- ตรวจก่อนตอบทุกครั้ง: ผลรวมของ (price − discount) ทุกรายการ − discount + service_charge (+ vat_amount เฉพาะเมื่อ prices_include_vat=false) ต้องเท่ากับ amount ถ้าไม่เท่า ให้อ่านรูปใหม่หาบรรทัดที่ตกหล่น/อ่านเลขผิด/ส่วนลดที่หายไป จนกว่าจะตรง (ถ้าตรวจแล้วยังไม่ตรงจริงๆ ให้ยึด amount ตามที่พิมพ์ในรูป)',
    '- pay: วิธีจ่าย เลือกจาก "เงินสด","โอน","QR/พร้อมเพย์","บัตรเครดิต","บัตรเดบิต","" · สลิปโอน = "โอน"',
    '- payer / payee / bank / ref: สำหรับสลิป (ชื่อผู้โอน ผู้รับ ธนาคาร เลขอ้างอิง)',
    '- tax_id: เลขประจำตัวผู้เสียภาษีของผู้ขาย 13 หลักถ้ามี',
    cats.length ? '- cat: เลือกหมวดที่เหมาะที่สุดจากรายการนี้เท่านั้น: ' + cats.join(', ') + ' (ไม่เข้าหมวดไหนให้ "")' : '- cat: ""',
    aiCatHints_(cats),
    '- confidence: ความมั่นใจโดยรวม 0-1',
  ].join('\n');

  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  const schema = S('OBJECT', {
    properties: {
      kind: S('STRING', { enum: ['receipt', 'tax_invoice', 'slip', 'invoice', 'quotation', 'other'] }),
      date: S('STRING'), time: S('STRING'), amount: S('NUMBER'), vendor: S('STRING'), desc: S('STRING'),
      vat: S('STRING', { enum: ['yes', 'no', 'unknown'] }), vat_amount: S('NUMBER'), prices_include_vat: S('BOOLEAN'),
      service_charge: S('NUMBER'), discount: S('NUMBER'),
      items: S('ARRAY', { items: S('OBJECT', { properties: { name: S('STRING'), qty: S('NUMBER'), price: S('NUMBER'), discount: S('NUMBER'), discount_note: S('STRING') }, required: ['name', 'price'] }) }),
      pay: S('STRING'), memo: S('STRING'), payer: S('STRING'), payee: S('STRING'), bank: S('STRING'), ref: S('STRING'), tax_id: S('STRING'),
      cat: S('STRING'), confidence: S('NUMBER'),
    },
    required: ['kind', 'date', 'amount', 'vendor', 'desc', 'vat', 'items', 'confidence'],
  });

  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } }, { text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };
  const models = ctx.models || aiModels_();
  const start = Date.now();
  const r1 = aiCall_(models, body, key, start, ctx);
  if (!r1) { if (!ctx.models && !ctx.noHealth) aiHealthDone_(false); return null; }
  let o = aiNormalize_(r1.j, cats, r1.model);
  // ✅ ตรวจตัวเอง: รายการรวมแล้วไม่เท่ายอดจ่าย → ให้ AI อ่านใบเดิมซ้ำอีกรอบ พร้อมบอกว่าต่างกันเท่าไหร่
  if (o.check && !o.check.ok && !ctx.noRetry && Date.now() - start < 35000) {
    const fix = JSON.parse(JSON.stringify(body));
    fix.contents[0].parts[1].text = prompt + '\n\n' + aiFixNote_(o);
    const r2 = aiCall_([r1.model], fix, key, start, ctx);
    if (r2) {
      const o2 = aiNormalize_(r2.j, cats, r2.model);
      if (o2.check) o2.check.pass = 2;
      if (!o2.check || o2.check.ok || Math.abs(o2.check.diff) < Math.abs(o.check.diff)) o = o2;
      else o.check.retry = o2.check.diff;
    }
  }
  if (!ctx.models && !ctx.noHealth) aiHealthDone_(true);
  return o;
}

/** เรียก Gemini ตามลำดับรุ่น (ลองซ้ำเมื่อคนใช้เยอะ) → { j, model } หรือ null */
function aiCall_(models, body, key, start, ctx) {
  for (const model of models) {
    if (Date.now() - start > 60000) { AI_ERRS.push('หมดเวลา ข้าม ' + model); break; }   // อย่าให้ผู้ใช้รอนานเกินไป
    try {
      const think = ctx.think === undefined ? 'low' : ctx.think;
      const req = JSON.parse(JSON.stringify(body));
      if (think && /^gemini-[3-9]/.test(model)) req.generationConfig.thinkingConfig = { thinkingLevel: think };   // คิดน้อย = เร็วขึ้นมาก
      let r = aiFetch_(model, req, key);
      if ((r.getResponseCode() === 429 || r.getResponseCode() === 503) && Date.now() - start < 30000) { Utilities.sleep(2500); r = aiFetch_(model, req, key); }   // คนใช้เยอะ/ถี่ไป รอแป๊บแล้วลองอีกครั้ง
      if (r.getResponseCode() === 400 && /thinking/i.test(r.getContentText())) { delete req.generationConfig.thinkingConfig; r = aiFetch_(model, req, key); }
      const code = r.getResponseCode();
      if (code !== 200) { AI_ERRS.push(model + ' ' + code + ': ' + r.getContentText().slice(0, 300)); console.warn('Gemini ' + model + ' ' + code); continue; }   // ลองรุ่นถัดไป
      const res = JSON.parse(r.getContentText());
      const txt = (((res.candidates || [])[0] || {}).content || {}).parts;
      const raw = (txt || []).map(p => p.thought ? '' : (p.text || '')).join('');
      return { j: JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()), model: model };
    } catch (e) { AI_ERRS.push(model + ' error: ' + e); console.warn('Gemini ' + model + ' error: ' + e); }
  }
  return null;
}

/** ข้อความบอก AI ในรอบอ่านซ้ำ: รอบแรกอ่านได้อะไร และต่างจากยอดจ่ายเท่าไหร่ */
function aiFixNote_(o) {
  const c = o.check, f = x => Math.round(x * 100) / 100;
  const list = o.items.map(it => it.name + ' ' + f(it.price) + (it.disc ? ' ลด ' + f(it.disc) : '')).join(' | ');
  return ['รอบก่อนคุณอ่านได้: ' + list,
    'ส่วนลดท้ายบิล ' + f(o.discount) + ' · ค่าบริการ ' + f(o.service) + (o.pricesIncVat ? '' : ' · VAT ' + f(Number(o.vatAmt) || 0)) + ' · amount ' + o.amount,
    'แต่ผลรวมรายการสุทธิ = ' + f(c.expect) + ' ไม่เท่ากับ amount (ต่างกัน ' + f(c.diff) + ' บาท) แปลว่ามีบางอย่างผิด เช่น ตกบรรทัด อ่านราคาผิด ส่วนลดหาย/นับซ้ำ จำนวนชิ้นผิด หรือ amount ไม่ใช่ยอดที่จ่ายจริง',
    'อ่านรูปใหม่อย่างละเอียดทีละบรรทัด แล้วตอบ JSON ใหม่ทั้งหมดตาม schema'].join('\n');
}

/* ===================== 🩺 สุขภาพ AI: นับสำเร็จ/ล่มรายวัน · เตือน LINE · สลับรุ่นเอง ===================== */
function aiHealth_() {
  let h = {};
  try { h = JSON.parse(props.getProperty('AI_HEALTH') || '{}') || {}; } catch (e) { h = {}; }
  const d = todayStr_();
  if (h.d !== d) h = { d: d, ok: 0, fail: 0, m: {}, last: h.last || null, prev: h.d ? { d: h.d, ok: h.ok || 0, fail: h.fail || 0 } : (h.prev || null) };
  h.m = h.m || {};
  return h;
}
function aiHealthSave_(h) { try { props.setProperty('AI_HEALTH', JSON.stringify(h).slice(0, 8000)); } catch (e) {} }
/** ผลของแต่ละครั้งที่เรียกรุ่นหนึ่ง (เรียกจาก aiFetch_) */
function aiHealthModel_(model, code, text) {
  if (code === 400 && /thinking/i.test(text || '')) return;   // แค่รุ่นนี้ไม่รับตัวเลือก thinking ระบบลองใหม่ให้เอง
  try {
    const h = aiHealth_(), x = h.m[model] = h.m[model] || { ok: 0, fail: 0 };
    if (code === 200) x.ok++;
    else { x.fail++; h.last = { t: stamp_(), model: model, code: code, msg: aiErrShort_(code, text) }; }
    aiHealthSave_(h);
  } catch (e) {}
}
function aiErrShort_(code, text) {
  let m = '';
  try { m = String((JSON.parse(text || '{}').error || {}).message || ''); } catch (e) { m = String(text || ''); }
  const k = code === 429 ? 'ใช้ถี่/โควตาเต็ม' : code === 503 ? 'คนใช้เยอะ (503)' : code === 403 ? 'key ใช้ไม่ได้' : code === 404 ? 'ไม่มีรุ่นนี้' : code ? 'error ' + code : 'ติดต่อไม่ได้';
  return (k + (m ? ': ' + m : '')).replace(/AIza[\w-]+/g, '…').slice(0, 140);
}
/** ผลรวมของงานอ่านหนึ่งครั้ง (ทุกรุ่นพังหมด = ล่ม 1 ครั้ง) · ล่มครบ 3 ครั้งในวันเดียว เตือนเจ้าของทาง LINE วันละครั้ง */
function aiHealthDone_(ok) {
  try {
    const h = aiHealth_();
    if (ok) h.ok++; else h.fail++;
    let alert = false;
    if (!ok && h.fail >= 3 && !h.alerted) { h.alerted = 1; alert = true; }
    aiHealthSave_(h);
    if (alert) push_('⚠️ AI อ่านใบเสร็จไม่ตอบ ' + h.fail + ' ครั้งแล้ววันนี้' + (h.last ? '\nล่าสุด: ' + h.last.model + ' ' + h.last.msg : '') +
      '\nระบบอ่านแบบเดิม (ได้แค่ยอดรวม) ไปก่อน และจะลองรุ่นสำรองให้เอง\nดูรายละเอียดที่ 🩺 สถานะระบบ');
  } catch (e) {}
}
/** ลำดับรุ่นที่จะลอง: รุ่นหลักที่ล่มบ่อยวันนี้ (ล่ม ≥3 และมากกว่าที่สำเร็จ) ย้ายไปไว้ท้าย ให้รุ่นสำรองขึ้นก่อน */
function aiModels_() {
  const list = [props.getProperty('GEMINI_MODEL')].concat(AI_MODELS).filter((m, i, a) => m && a.indexOf(m) === i);
  let h = null;
  try { h = aiHealth_(); } catch (e) {}
  if (!h) return list;
  const bad = m => { const x = h.m[m]; return !!x && x.fail >= 3 && x.fail > x.ok; };
  return list.filter(m => !bad(m)).concat(list.filter(bad));
}
function aiHealthInfo_() {
  const h = aiHealth_(), order = aiModels_(), main = [props.getProperty('GEMINI_MODEL')].concat(AI_MODELS).filter(Boolean)[0];
  return { d: h.d, ok: h.ok, fail: h.fail, models: h.m, last: h.last, prev: h.prev, use: order[0], switched: order[0] !== main, alerted: !!h.alerted };
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
  // บรรทัดส่วนลด/ราคาติดลบที่ AI แยกมาเป็นสินค้า → ย้ายไปเป็นส่วนลดของสินค้าชื่อเดียวกัน (ไม่เจอ = ส่วนลดท้ายบิล)
  const raw = Array.isArray(j.items) ? j.items : [];
  const num = v => { const x = Number(String(v == null ? '' : v).replace(/[,฿\s]/g, '')); return isFinite(x) ? x : 0; };
  const isDiscLine = it => num(it.price) < 0 || (AI_DISC_RE.test(String(it.name || '')) && !n(it.discount));
  const items = raw.filter(it => !isDiscLine(it)).map(it => {
    const price = n(it.price), disc = Math.min(n(it.discount), price);
    return { name: String(it.name || '').trim().slice(0, 60), qty: n(it.qty) || 1, price: price, disc: disc, discNote: String(it.discount_note || '').trim().slice(0, 40) };
  }).filter(it => it.name && it.price).slice(0, 60);
  let extraDisc = 0;
  raw.filter(isDiscLine).forEach(it => {
    const amt = Math.round(Math.abs(num(it.price)) * 100) / 100, name = String(it.name || '').trim().slice(0, 40);
    if (!amt) return;
    const t = aiDiscTarget_(name, items);
    if (t && Math.abs(t.disc - amt) < 0.01) return;               // AI ใส่ส่วนลดนี้ไว้ที่สินค้าแล้ว ไม่นับซ้ำ
    if (t && t.disc + amt <= t.price) { t.disc = Math.round((t.disc + amt) * 100) / 100; t.discNote = t.discNote ? t.discNote + ', ' + name : name; }
    else extraDisc += amt;
  });
  // AI ใส่ส่วนลดซ้ำทั้งที่สินค้าและท้ายบิล → ตัดของท้ายบิลออก
  const itemDisc = items.reduce((s, it) => s + it.disc, 0);
  let billDisc = n(j.discount);
  if (extraDisc && billDisc && Math.abs(billDisc - extraDisc) < 0.5) billDisc = 0;
  if (itemDisc && billDisc && Math.abs(billDisc - itemDisc) < 0.5) billDisc = 0;
  billDisc = Math.round((billDisc + extraDisc) * 100) / 100;
  // ✅ ตรวจตัวเลข: (ราคา − ส่วนลด) ของทุกรายการ − ส่วนลดท้ายบิล + ค่าบริการ (+ VAT ถ้าราคายังไม่รวม) ต้องเท่ายอดจ่าย
  const service = n(j.service_charge), incVat = j.prices_include_vat !== false;
  const vatAdd = incVat ? 0 : n(j.vat_amount);   // ใช้เฉพาะยอด VAT ที่พิมพ์จริง ไม่ใช้ค่าประมาณ
  const gross = items.reduce((s, it) => s + it.price, 0);
  const r2 = x => Math.round(x * 100) / 100;
  let amt = amount, check = null, fixed = '';
  if (items.length && kind !== 'slip') {
    const expect = r2(gross - itemDisc - billDisc + service + vatAdd);
    // ยอดที่ AI ให้มาเท่ากับยอดก่อนหักส่วนลดพอดี (แบบ 7-Eleven) → ใช้ยอดหลังหักส่วนลด
    if (amt && (itemDisc + billDisc) > 0 && Math.abs(amt - r2(gross + service + vatAdd)) < 0.5 && expect > 0) { amt = expect; fixed = 'ยอดก่อนลด → ยอดหลังลด'; }
    if (!amt && expect > 0) { amt = expect; fixed = 'ไม่เจอยอดจ่าย ใช้ผลรวมรายการ'; }
    const diff = r2(amt - expect);
    check = { ok: Math.abs(diff) <= 1, diff: diff, expect: expect, pass: 1 };
    if (fixed) check.fixed = fixed;
  }
  const cat = cats.length && cats.indexOf(String(j.cat || '')) > -1 ? String(j.cat) : '';
  return {
    via: 'ai', model: model, kind: kind, docType: docType, date: date, time: String(j.time || '').slice(0, 5),
    amount: amt ? String(amt) : '', vendor: String(j.vendor || '').trim().slice(0, 80), desc: String(j.desc || '').trim().slice(0, 60),
    vat: vat, vatAmt: vatAmt ? String(vatAmt) : '', pricesIncVat: incVat,
    service: service, discount: billDisc, items: items, check: check,
    memo: String(j.memo || '').trim().slice(0, 120), pay: String(j.pay || ''), payer: String(j.payer || '').slice(0, 80), payee: String(j.payee || '').slice(0, 80), bank: String(j.bank || '').slice(0, 40), ref: String(j.ref || '').slice(0, 40),
    taxId: String(j.tax_id || '').replace(/\D/g, '').slice(0, 13), cat: cat, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
  };
}

const AI_DISC_RE = /^\s*(?:ส่วนลด|ลด\s|discount|disc\.?\s|โปรโมชั่น|โปร\s|คูปอง|coupon|[A-Za-z0-9]{1,6}\s?(?:ลด|คูปอง))/i;   // ตรงกับ owe.js / hk.js
/** หาสินค้าที่บรรทัดส่วนลดพูดถึง เช่น "ส่วนลดน้ำแร่เพอร์ร่า" → "น้ำแร่เพอร์ร่า 1500" (ต้องมีคำร่วมกัน ≥4 ตัว) */
function aiDiscTarget_(discName, list) {
  const norm = t => String(t || '').toLowerCase().replace(AI_DISC_RE, '').replace(/^\s*\d+\s*[×x]\s*/, '').replace(/\d+\s*(บ|บาท)?$/, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const k = norm(discName);
  if (k.length < 2) return null;
  const common = (a, b) => { let best = 0; for (let i = 0; i < a.length; i++) for (let j = i + best + 1; j <= a.length; j++) { if (b.indexOf(a.slice(i, j)) > -1) best = j - i; else break; } return best; };
  let pick = null, score = 0;
  list.forEach(it => {
    const nm = norm(it.name);
    if (!nm) return;
    const sc = nm.indexOf(k) > -1 || k.indexOf(nm) > -1 ? 99 : common(k, nm);
    if (sc >= 4 && sc > score) { pick = it; score = sc; }
  });
  return pick;
}

/** หมวดของบิลเบิก (ให้ AI เลือกจากรายการนี้) */
function billCatList_() {
  const used = billsAll_().map(b => String(b.cat || '').trim()).filter(Boolean);
  const base = ['เดินทาง', 'อาหาร/รับรอง', 'ค่าห้องประชุม', 'ที่พัก', 'อุปกรณ์/วัสดุ', 'ค่าบริการ', 'อื่นๆ'];
  return Array.from(new Set(base.concat(used))).slice(0, 40);
}
/** ตัวอย่างหมวดที่เจ้าของเคยจัดเอง (ร้าน → หมวด) ให้ AI เลือกหมวดแบบเดียวกัน */
function aiCatHints_(cats) {
  if (cats.indexOf('ค่าห้องประชุม') < 0) return '';   // เฉพาะบิลเบิก
  try {
    const seen = {}, pairs = [];
    billsAll_().forEach(b => {
      const v = String(b.vendor || '').trim().slice(0, 30), c = String(b.cat || '').trim();
      if (!v || !c || /^\d|TH\d/.test(v) || seen[v]) return;
      seen[v] = 1; pairs.push(v + ' → ' + c);
    });
    return pairs.length ? '- หมวดที่เจ้าของเคยจัดไว้ (ร้านเดียวกันหรือประเภทเดียวกันให้ใช้หมวดเดียวกัน): ' + pairs.slice(-40).join(' · ') : '';
  } catch (e) { return ''; }
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
  const pick = o => o ? { kind: o.kind || '', date: o.date || '', amount: o.amount || '', vendor: o.vendor || '', desc: o.desc || '', memo: o.memo || '', vat: o.vat || '', cat: o.cat || '', discount: o.discount || 0, items: (o.items || []).map(i => [i.name, i.price, i.disc || 0]) } : null;
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
      AI_ERRS = [];
      out.ai = pick(aiRead_(file, { cats: billCatList_() }));
      if (AI_ERRS.length) out.aiErr = AI_ERRS.slice(0, 4);
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

function aiFetch_(model, req, key) {
  let r;
  try {
    r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(req),
      headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
    });
  } catch (e) { aiHealthModel_(model, 0, String(e)); throw e; }
  aiHealthModel_(model, r.getResponseCode(), r.getResponseCode() === 200 ? '' : r.getContentText());
  return r;
}

/** ทดสอบความเร็ว/ความแม่นของรุ่นเดียว (อ่านอย่างเดียว ไม่บันทึก) */
function aiBench_(id, model, think) {
  AI_ERRS = [];
  const t0 = Date.now();
  const o = aiRead_(DriveApp.getFileById(id), { cats: billCatList_(), models: [model], think: think });
  return { model: model, think: think, ms: Date.now() - t0, errs: AI_ERRS.slice(0, 3),
    ai: o ? { kind: o.kind, date: o.date, amount: o.amount, vendor: o.vendor, vat: o.vat, cat: o.cat, memo: o.memo || '', items: (o.items || []).length } : null };
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

/** เรียก Gemini ให้ตอบเป็น JSON ตาม schema (ใช้รุ่น/การลองซ้ำแบบเดียวกับ aiRead_) */
function aiJson_(bytes, mime, prompt, schema) {
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('ยังไม่ได้ใส่ GEMINI_API_KEY');
  const parts = bytes ? [{ inline_data: { mime_type: mime, data: Utilities.base64Encode(bytes) } }, { text: prompt }] : [{ text: prompt }];
  const body = {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };
  const models = aiModels_();
  const start = Date.now();
  let last = '';
  for (const model of models) {
    if (Date.now() - start > 60000) break;
    try {
      const req = JSON.parse(JSON.stringify(body));
      if (/^gemini-[3-9]/.test(model)) req.generationConfig.thinkingConfig = { thinkingLevel: 'low' };
      let r = aiFetch_(model, req, key);
      if (r.getResponseCode() === 400 && /thinking/i.test(r.getContentText())) { delete req.generationConfig.thinkingConfig; r = aiFetch_(model, req, key); }
      if ((r.getResponseCode() === 429 || r.getResponseCode() === 503) && Date.now() - start < 30000) { Utilities.sleep(2500); r = aiFetch_(model, req, key); }
      if (r.getResponseCode() !== 200) { last += model + ' ' + r.getResponseCode() + ': ' + r.getContentText().replace(/\s+/g, ' ').slice(0, 160) + ' | '; continue; }
      const res = JSON.parse(r.getContentText());
      const cand = (res.candidates || [])[0] || {};
      const raw = ((cand.content || {}).parts || []).map(p => p.thought ? '' : (p.text || '')).join('');
      try { const out = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()); aiHealthDone_(true); return out; }
      catch (e) { last += model + ' อ่านคำตอบไม่ได้ (' + (cand.finishReason || '') + '): ' + raw.slice(0, 120) + ' | '; }
    } catch (e) { last += model + ' ' + e + ' | '; }
  }
  aiHealthDone_(false);
  throw new Error('AI อ่านไม่สำเร็จ ลองใหม่อีกครั้ง (' + last + ')');
}

/** 📷 นามบัตร / ป้ายร้าน / ป้ายเครื่อง → ช่องข้อมูล
 *  p.mode: 'card' (การ์ดข้อมูล) หรือ 'plate' (ป้ายเครื่องในบันทึกดูงาน → แถว หัวข้อ/ค่า/หน่วย) */
function aiFields_(p) {
  const mime = String(p.mime || 'image/jpeg');
  if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
  const bytes = Utilities.base64Decode(String(p.data || ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  if (p.mode === 'plate') {
    const j = aiJson_(bytes, mime, [
      'รูปนี้เป็นป้ายเครื่องจักร/ฉลากสเปก/ป้ายข้อมูล ในการไปดูงาน',
      'ดึงข้อมูลสำคัญเป็นแถว หัวข้อ (ภาษาไทยถ้าแปลได้ เช่น รุ่น, ยี่ห้อ, กำลังการผลิต, กำลังไฟ, แรงดันไฟ, ปีผลิต, น้ำหนัก, เลขเครื่อง) · ค่า · หน่วย',
      'name = ชื่อเรียกสั้นๆ ของเครื่อง/สิ่งของ ถ้ารู้ (เช่น "เครื่องบด Retsch SM300") ถ้าไม่รู้ให้ ""',
      'ห้ามเดาค่าที่มองไม่เห็น ตอบเป็น JSON',
    ].join('\n'), S('OBJECT', { properties: { name: S('STRING'),
      rows: S('ARRAY', { items: S('OBJECT', { properties: { k: S('STRING'), v: S('STRING'), u: S('STRING') }, required: ['k', 'v'] }) }) }, required: ['rows'] }));
    return { name: String(j.name || ''), rows: (j.rows || []).filter(r => r && r.k && r.v).slice(0, 30) };
  }
  const j = aiJson_(bytes, mime, [
    'อ่านรูปนี้ (นามบัตร ป้ายร้าน ใบปลิว หน้าจอ หรือเอกสาร) แล้วสรุปเป็นการ์ดข้อมูลสำหรับจดเก็บไว้',
    'tpl: contact = คน/นามบัตร, place = ร้าน/สถานที่, company = บริษัท/ผู้ขาย (มีเลขผู้เสียภาษี/ที่อยู่ออกใบกำกับ), product = สินค้า/ราคา, asset = เครื่อง/อุปกรณ์/รถ, custom = อื่นๆ',
    'title = ชื่อหลักของการ์ด (ชื่อคน / ชื่อร้าน / ชื่อบริษัท / ชื่อสินค้า)',
    'fields = ช่องข้อมูล หัวข้อภาษาไทยสั้นๆ เช่น contact: บริษัท, ตำแหน่ง, เบอร์, อีเมล, LINE, เว็บ, ที่อยู่ · place: ที่อยู่, เบอร์, เวลาเปิด, ลิงก์แผนที่ · company: เลขผู้เสียภาษี, ที่อยู่ออกใบกำกับ, เบอร์, อีเมล · product: ร้าน, ราคา, รุ่น, ลิงก์',
    'เบอร์โทรเขียนแบบ 081-234-5678 ถ้ามีหลายเบอร์แยกเป็นหลายช่อง (เบอร์มือถือ, เบอร์ออฟฟิศ) ห้ามเดาค่าที่มองไม่เห็น ตอบเป็น JSON',
  ].join('\n'), S('OBJECT', { properties: {
    tpl: S('STRING', { enum: ['contact', 'place', 'company', 'product', 'asset', 'custom'] }), title: S('STRING'),
    fields: S('ARRAY', { items: S('OBJECT', { properties: { k: S('STRING'), v: S('STRING') }, required: ['k', 'v'] }) }) }, required: ['tpl', 'title', 'fields'] }));
  let photo = null;
  if (p.keep) photo = inboxPhoto_({ data: p.data, mime: mime, thumb: p.thumb, name: j.title || 'การ์ด' });
  return { tpl: j.tpl || 'custom', title: String(j.title || ''), fields: (j.fields || []).filter(f => f && f.k && f.v).slice(0, 30), photo: photo };
}

/** 📅 อ่านกำหนดการ (รูป/PDF หรือข้อความ) → ช่วงเวลา หัวข้อ วิทยากร · ใช้ทำส่วนในบันทึกอบรม/ประชุม (อ่านอย่างเดียว ไม่บันทึกอะไร) */
function aiAgenda_(p) {
  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  let bytes = null, mime = '';
  const text = String(p.text || '').trim().slice(0, 15000);
  if (p.data) {
    mime = String(p.mime || 'image/jpeg');
    if (!/^(image\/|application\/pdf)/.test(mime)) throw new Error('รองรับเฉพาะรูปและ PDF');
    bytes = Utilities.base64Decode(String(p.data));
    if (bytes.length > 15 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 15MB');
  } else if (!text) throw new Error('ยังไม่มีกำหนดการ');
  const j = aiJson_(bytes, mime, [
    bytes ? 'รูป/เอกสารนี้คือกำหนดการ (agenda) ของการอบรม/สัมมนา/ประชุม' : 'ข้อความนี้คือกำหนดการ (agenda) ของการอบรม/สัมมนา/ประชุม:\n"""\n' + text + '\n"""',
    'แยกเป็นรายการตามลำดับเวลา แต่ละรายการ:',
    '- start / end = เวลาเริ่ม/จบแบบ 24 ชม. "HH:MM" (เช่น 9.00 น. → "09:00", 1 PM → "13:00") ถ้าไม่มีเวลาให้ ""',
    '- day = วันที่แบบ YYYY-MM-DD ถ้ากำหนดการระบุวัน (หลายวัน) ถ้าไม่ระบุให้ "" · ปี พ.ศ. ให้ลบ 543',
    '- title = หัวข้อช่วงนั้น สั้น กระชับ คงภาษาเดิม · who = วิทยากร/ผู้บรรยาย ถ้ามี ไม่มีให้ ""',
    '- รวมช่วงพัก/อาหาร/ลงทะเบียนไว้ด้วย ใส่ brk = true',
    'title_all = ชื่อการอบรม/งาน ถ้ามี · place = สถานที่ ถ้ามี · ห้ามเดาข้อมูลที่ไม่มี ตอบเป็น JSON',
  ].join('\n'), S('OBJECT', { properties: { title_all: S('STRING'), place: S('STRING'),
    items: S('ARRAY', { items: S('OBJECT', { properties: { day: S('STRING'), start: S('STRING'), end: S('STRING'), title: S('STRING'), who: S('STRING'), brk: S('BOOLEAN') }, required: ['title'] }) }) }, required: ['items'] }));
  const hm = t => { const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; };
  const items = (j.items || []).filter(x => x && x.title).slice(0, 40).map(x => ({
    day: /^\d{4}-\d{2}-\d{2}$/.test(x.day || '') ? x.day : '', at: hm(x.start), end: hm(x.end),
    title: String(x.title).trim().slice(0, 120), who: String(x.who || '').trim().slice(0, 80), brk: !!x.brk }));
  let photo = null;
  if (p.keep && bytes) { try { photo = inboxPhoto_({ data: p.data, mime: mime, thumb: p.thumb, name: 'กำหนดการ ' + (j.title_all || '') }); } catch (e) {} }
  return { title: String(j.title_all || '').trim(), place: String(j.place || '').trim(), items: items, photo: photo };
}

/* ===================== 📇 การ์ดจากข้อความ/รูปใน LINE · ✨ สรุปบันทึกประชุม ===================== */

const CARD_TPL_FIELDS = {
  contact: ['บริษัท', 'ตำแหน่ง', 'เบอร์', 'อีเมล', 'LINE'], place: ['ที่อยู่', 'ลิงก์แผนที่', 'เวลาเปิด', 'เบอร์'],
  company: ['เลขผู้เสียภาษี', 'ที่อยู่ออกใบกำกับ', 'ผู้ติดต่อ', 'เบอร์', 'อีเมล'], product: ['ร้าน', 'ราคา', 'ลิงก์', 'สเปก'],
  asset: ['รุ่น', 'เลขเครื่อง/ทะเบียน', 'วันซื้อ', 'ประกันหมด'], custom: [],
};
const CARD_ICON = { contact: '👤', place: '📍', company: '🏢', product: '🛒', asset: '🚗', custom: '✏️' };

/** ข้อความอิสระ → การ์ด (AI ก่อน ไม่มี key/ล่ม → แยก "หัวข้อ: ค่า" แบบง่าย) */
function cardFromText_(text) {
  text = String(text || '').trim().slice(0, 4000);
  try {
    const S = (type, extra) => Object.assign({ type: type }, extra || {});
    const j = aiJson_(null, null, [
      'แปลงข้อความนี้เป็นการ์ดข้อมูลสำหรับจดเก็บไว้ (ข้อความ:)', text, '',
      'tpl: contact = คน, place = ร้าน/สถานที่, company = บริษัท/ผู้ขาย, product = สินค้า/ราคา, asset = เครื่อง/อุปกรณ์/รถ, custom = อื่นๆ',
      'title = ชื่อหลัก · fields = หัวข้อภาษาไทยสั้นๆ กับค่า (เบอร์, อีเมล, บริษัท, ตำแหน่ง, ที่อยู่, ราคา ฯลฯ) · note = ส่วนที่เหลือที่ไม่เข้าช่องไหน',
      'ใช้เฉพาะข้อมูลที่อยู่ในข้อความ ห้ามแต่งเพิ่ม ตอบเป็น JSON',
    ].join('\n'), S('OBJECT', { properties: {
      tpl: S('STRING', { enum: Object.keys(CARD_TPL_FIELDS) }), title: S('STRING'), note: S('STRING'),
      fields: S('ARRAY', { items: S('OBJECT', { properties: { k: S('STRING'), v: S('STRING') }, required: ['k', 'v'] }) }) }, required: ['tpl', 'title', 'fields'] }));
    return { tpl: CARD_TPL_FIELDS[j.tpl] ? j.tpl : 'custom', title: String(j.title || '').slice(0, 200), note: String(j.note || ''), fields: (j.fields || []).filter(f => f && f.k && f.v).slice(0, 30), via: 'ai' };
  } catch (e) {
    const out = { tpl: 'custom', title: '', note: '', fields: [], via: 'text' };
    text.split(/\n/).map(s => s.trim()).filter(Boolean).forEach(s => {
      const m = s.match(/^([^:：]{1,30})[:：]\s*(.+)$/);
      if (m) out.fields.push({ k: m[1].trim(), v: m[2].trim() });
      else if (!out.title) out.title = s.slice(0, 200);
      else out.note += (out.note ? '\n' : '') + s;
    });
    return out;
  }
}

/** บันทึกการ์ด (เรียกขณะถือล็อก) */
function saveCard_(c, photo) {
  const fields = (c.fields || []).slice();
  (CARD_TPL_FIELDS[c.tpl] || []).forEach(k => { if (!fields.some(f => f.k === k)) fields.push({ k: k, v: '' }); });
  const data = { tpl: c.tpl || 'custom', title: c.title || '', fields: fields, note: c.note || '' };
  if (photo) data.photo = photo;
  const text = [(CARD_ICON[data.tpl] || '📇') + ' ' + data.title].concat(fields.filter(f => f.v).map(f => f.k + ': ' + f.v), data.note ? [data.note] : []).join('\n');
  return inboxSave_({ kind: 'card', data: data, text: text });
}
function cardLine_(o) {
  const d = o.data || {};
  return '📇 บันทึกการ์ดแล้ว' + (d.title ? '\n' + (CARD_ICON[d.tpl] || '') + ' ' + d.title : '') +
    (d.fields || []).filter(f => f.v).slice(0, 8).map(f => '\n• ' + f.k + ': ' + f.v).join('') +
    '\n\nแก้/เพิ่มช่องได้ในแอป หน้า 📌 ฝาก';
}

/** LINE: พิมพ์ "ข้อมูล ..." (อ่านด้วย AI นอกล็อก แล้วค่อยล็อกตอนบันทึก) */
function lineCardText_(token, text) {
  const c = cardFromText_(text);
  return withLock_(LockService.getScriptLock(), token, () => {
    const o = saveCard_(c);
    line_('reply', { replyToken: token, messages: [{ type: 'text', text: cardLine_(o).slice(0, 4900), quickReply: { items: [qr_('🗑 ยกเลิก', 'chg|i|' + o.id + '|x', 'ยกเลิกการ์ดนี้')] } }] });
  });
}

/** LINE: รูปรอจัด → 📇 การ์ดข้อมูล (นามบัตร/ป้ายร้าน) */
function lineCardPhoto_(ev, fid) {
  let file;
  try { file = DriveApp.getFileById(fid); } catch (e) { return reply_(ev.replyToken, 'ไม่พบรูปนี้แล้ว ลองส่งใหม่'); }
  if (file.isTrashed() || (file.getParents().hasNext() && file.getParents().next().getName() !== 'รอจัด')) return reply_(ev.replyToken, 'รูปนี้จัดไปแล้ว');
  const blob = file.getBlob();
  let r;
  try { r = aiFields_({ data: Utilities.base64Encode(blob.getBytes()), mime: blob.getContentType() || 'image/jpeg', mode: 'card' }); }
  catch (e) { return reply_(ev.replyToken, 'AI อ่านรูปไม่สำเร็จ: ' + (e.message || e) + '\nแตะปุ่มเดิมอีกครั้ง หรือเลือก 📌 เก็บไว้เฉยๆ'); }
  return withLock_(LockService.getScriptLock(), ev.replyToken, () => {
    try { file.moveTo(inboxFolder_()); file.setName((r.title || 'การ์ด') + '.jpg'); } catch (e) {}
    const photo = { id: file.getId(), url: file.getUrl(), thumb: inboxThumb_(file.getId(), 6000) };
    const o = saveCard_(r, photo);
    CacheService.getScriptCache().remove('pend:' + fid);
    billNextPending_(ev.replyToken, cardLine_(o), []);
  });
}

/** ✨ สรุปบันทึก (ประชุม ดูงาน คุยลูกค้า อบรม) เป็นรายงานสั้น · หัวข้อในรายงานเปลี่ยนตามแบบ (ข้อความดิบจาก meetText ฝั่งหน้าเว็บ) */
function aiMeetSummary_(p) {
  const raw = String(p.text || '').trim().slice(0, 20000);
  if (!raw) throw new Error('บันทึกยังว่างอยู่');
  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  const j = aiJson_(null, null, [
    'นี่คือบันทึกดิบที่จดระหว่าง' + ({ visit: 'ไปดูงาน', talk: 'คุยกับลูกค้า', train: 'เข้าอบรม' }[p.type] || 'ประชุม') + ' (จดเร็วๆ อาจไม่เรียบร้อย):',
    '"""', raw, '"""', '',
    'เขียนเป็นรายงานสรุปภาษาไทย สุภาพ กระชับ สำหรับส่งหัวหน้าทาง LINE โดย:',
    '- บรรทัดแรก: หัวข้อ · บรรทัดถัดมา: วันที่ สถานที่ ' + (p.type === 'train' ? 'วิทยากร' : p.type === 'talk' ? 'ลูกค้า/ผู้ร่วมคุย' : 'ผู้เข้าร่วม') + ' (ถ้ามี)',
  ].concat(p.type === 'train' ? [
    '- 💡 สิ่งที่ได้เรียนรู้: 3–7 ข้อ เขียนให้คนที่ไม่ได้ไปอบรมอ่านแล้วเข้าใจ',
    '- 📊 ข้อมูล/ตัวเลข/มาตรฐานที่ควรจำ: "• หัวข้อ: ค่า หน่วย" คงตัวเลขตามที่จดทุกตัว (ถ้ามี)',
    '- 🛠 นำไปใช้กับงาน · ❓ ข้อสงสัยที่ยังค้าง (เฉพาะหัวข้อที่มีข้อมูล)',
  ] : p.type === 'talk' ? [
    '- 🎯 ลูกค้าต้องการอะไร / ปัญหาที่เจอ: 2–5 ข้อ',
    '- 📊 ข้อมูลสำคัญ (งบ จำนวน สเปก กำหนดเวลา): "• หัวข้อ: ค่า หน่วย" คงตัวเลขตามที่จดทุกตัว',
    '- ✅ สิ่งที่รับปาก/ตกลงกัน · ☐ ติดตามลูกค้า (ใคร ทำอะไร เมื่อไร) · ❓ ลูกค้าถามที่ยังต้องหาคำตอบ (เฉพาะหัวข้อที่มีข้อมูล)',
  ] : [
    '- 📌 ประเด็นสำคัญ: 3–7 ข้อ เรียบเรียงจากโน้ตให้อ่านรู้เรื่อง',
    '- 📊 ข้อมูล/สเปก: แยกตามส่วน (เช่น ชั้น/เครื่อง) แต่ละบรรทัด "• หัวข้อ: ค่า หน่วย" คงตัวเลขและหน่วยตามที่จดทุกตัว',
    '- ✅ ข้อตกลง · ☐ งานต่อ · ❓ คำถามที่ยังค้าง (เฉพาะหัวข้อที่มีข้อมูล)',
  ]).concat([
    '- ห้ามเพิ่มข้อมูลหรือตัวเลขที่ไม่มีในบันทึก ห้ามใช้ markdown (** หรือ #) ใช้ขึ้นบรรทัดใหม่และ • แทน',
    'ตอบเป็น JSON: summary = รายงานทั้งก้อน',
  ]).join('\n'), S('OBJECT', { properties: { summary: S('STRING') }, required: ['summary'] }));
  return { summary: String(j.summary || '').replace(/\*\*/g, '').trim() };
}

/* ===================== 🎙 ข้อความเสียงใน LINE → งาน / ฝาก ===================== */
/* AI ฟังเสียง (นอกล็อก) → แปลงเป็นคำสั่งรูปแบบเดียวกับที่พิมพ์ แล้วส่งต่อเข้า handleLine_ เหมือนพิมพ์เอง
 * คำตอบขึ้นต้นด้วย "🎙 ได้ยินว่า …" (REPLY_PREFIX) ถ้าเดาผิด แตะ ↔ เปลี่ยนประเภทได้เหมือนข้อความปกติ */
function lineVoice_(ev) {
  const msg = ev.message;
  if (Number(msg.duration || 0) > 120000) { reply_(ev.replyToken, '🎙 เสียงยาวเกิน 2 นาที ลองพูดสั้นๆ ทีละเรื่องนะครับ'); return; }
  const res = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + msg.id + '/content', {
    headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('ดาวน์โหลดเสียงจาก LINE ไม่ได้');
  const blob = res.getBlob();
  let mime = String(blob.getContentType() || 'audio/mp4');
  if (/m4a|x-m4a|mp4/.test(mime)) mime = 'audio/mp4';
  const j = voiceParse_(blob.getBytes(), mime, '');
  const heard = String(j.text || '').trim(), cmd = String(j.cmd || '').replace(/\s+/g, ' ').trim();
  if (!heard || !cmd) { reply_(ev.replyToken, '🎙 ไม่ได้ยินคำพูดชัดๆ ลองอัดใหม่ใกล้ไมค์อีกนิดครับ'); return; }
  REPLY_PREFIX = '🎙 ได้ยินว่า "' + heard.slice(0, 200) + '"\n\n';
  try {
    handleLine_([{ type: 'message', replyToken: ev.replyToken, source: ev.source, message: { type: 'text', id: msg.id, text: cmd.slice(0, 500) } }]);
  } finally { REPLY_PREFIX = ''; }
}

/** 🎙 ถอดเสียง + แปลงเป็นคำสั่งแบบพิมพ์ · page = หน้าที่กดไมค์ (tasks/inbox) ช่วยเดาประเภท */
function voiceParse_(bytes, mime, page) {
  const S = (type, extra) => Object.assign({ type: type }, extra || {});
  const hint = { tasks: 'ผู้ใช้กดไมค์ในหน้า "งาน" ส่วนใหญ่จะเป็น task', inbox: 'ผู้ใช้กดไมค์ในหน้า "กล่องฝาก" ส่วนใหญ่จะเป็น note' }[page] || '';
  return aiJson_(bytes, mime, [
    'นี่คือข้อความเสียงภาษาไทย (อาจมีอังกฤษปน) ที่เจ้าของพูดสั่งแอปจดงาน วันนี้คือ ' + todayStr_() + (hint ? ' · ' + hint : ''),
    '1) text = ถอดคำพูดตามที่ได้ยิน ไม่แต่งเพิ่ม ถ้าไม่ได้ยินคำพูดเลยให้เว้นว่าง',
    '2) kind = task (งาน/นัด/สิ่งที่ต้องทำ) | note (เรื่องที่อยากจดเก็บไว้ ไม่ใช่สิ่งที่ต้องทำ)',
    '3) cmd = แปลงเป็นข้อความสั้นตามรูปแบบนี้เท่านั้น ใช้ตัวเลขอารบิก เวลาแบบ 24 ชม. HH:MM',
    '   task: "[วัน] [เวลา] ชื่องาน" วันใช้ วันนี้/พรุ่งนี้/มะรืน/จันทร์หน้า หรือ d/m เช่น "พรุ่งนี้ 10:00 ส่งรายงาน" ไม่มีวันก็ใส่แค่ชื่องาน',
    '   note: "ฝาก ข้อความ"',
  ].join('\n'), S('OBJECT', {
    properties: { text: S('STRING'), kind: S('STRING', { enum: ['task', 'note'] }), cmd: S('STRING') },
    required: ['text', 'kind', 'cmd'],
  }));
}
function aiVoice_(body) {
  const b64 = String(body.data || '');
  if (!b64) throw new Error('ไม่มีเสียง');
  if (b64.length > 8e6) throw new Error('เสียงยาวเกินไป');
  const j = voiceParse_(Utilities.base64Decode(b64), String(body.mime || 'audio/wav'), String(body.page || ''));
  return { text: String(j.text || '').trim(), kind: j.kind || '', cmd: String(j.cmd || '').replace(/\s+/g, ' ').trim() };
}
