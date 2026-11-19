/* จดครบ — 🎙 เสียงประชุมในบันทึกประชุม/ดูงาน (โหลดหลัง inote.js · ใช้ m, mId, mDirty, api, items, upsert, drafts, LS, esc, toast, showStatus, pickFiles)
 * อัดเสียงในแอป (MediaRecorder) หรืออัปไฟล์เสียง → เก็บใน Drive "จดครบ - กล่องฝาก/เสียงประชุม"
 * ระหว่างอัด เก็บท่อนลง IndexedDB ทุก 10 วิ: แอปปิด/เน็ตหลุด เสียงไม่หาย เปิดบันทึกอีกครั้งจะอัปต่อให้เอง
 * อัปทีละ 4 MB (resumable upload ของ Drive ผ่าน Apps Script) · 🎧 ส่งสำเนาให้ระบบถอดเสียง TIBD ได้ */
(() => {
  const CHUNK = 4 * 1024 * 1024;           // ต้องเป็นทวีคูณของ 256 KB
  const AUDIO_ACCEPT = 'audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.aac,.ogg,.opus,.amr,.3gp,.wma,.flac';

  /* ---------- IndexedDB: recs {id, mid, name, mime, dur, at, status:'rec'|'ready', session, offset, size} + parts [rid, n] → blob ---------- */
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open('jodkrob-audio', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('recs', { keyPath: 'id' }); r.result.createObjectStore('parts', { keyPath: ['rid', 'n'] }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }));
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => ok(out && 'result' in out ? out.result : out); t.onerror = () => no(t.error); }); };
  const putRec = r => tx('recs', 'readwrite', s => s.put(r));
  const getRecs = () => tx('recs', 'readonly', s => s.getAll());
  const putPart = (rid, n, blob) => tx('parts', 'readwrite', s => s.put({ rid, n, blob }));
  const getParts = rid => tx('parts', 'readonly', s => s.getAll(IDBKeyRange.bound([rid, 0], [rid, Infinity])));
  const delRec = async rid => { await tx('parts', 'readwrite', s => s.delete(IDBKeyRange.bound([rid, 0], [rid, Infinity]))); await tx('recs', 'readwrite', s => s.delete(rid)); };

  const fmtDur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0'); };
  const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const extOf = mime => /mp4|m4a|aac/.test(mime) ? '.m4a' : /ogg/.test(mime) ? '.ogg' : /mpeg|mp3/.test(mime) ? '.mp3' : /wav/.test(mime) ? '.wav' : '.webm';
  const b64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
  const baseName = () => [(m.when || '').slice(0, 10), m.title || (MTYPE[m.type] || MTYPE.meet)[1]].filter(Boolean).join(' ');

  /* ---------- ส่วนในหน้าบันทึก ---------- */
  $('#mBody').querySelector('.m-box[data-list="todos"]').insertAdjacentHTML('beforebegin', `
    <section class="m-box m-aud" id="mAud">
      <h3>🎙 เสียงประชุม</h3>
      <div class="au-rec" id="auRec" hidden>
        <span class="au-dot"></span><b id="auTime">0:00</b><small id="auNote">กำลังอัด</small>
        <span class="spacer"></span>
        <button type="button" class="mini" id="auPause">⏸ พัก</button>
        <button type="button" class="mini au-stop" id="auStop">⏹ หยุด</button>
      </div>
      <div id="auList" class="au-list"></div>
      <div class="c-btns" id="auBtns">
        <button type="button" class="mini" id="auStart">🔴 อัดเสียง</button>
        <button type="button" class="mini" id="auFile">📁 อัปไฟล์เสียง</button>
      </div>
      <p class="hint" id="auHint">อัดในแอปหรืออัปไฟล์ที่อัดไว้ (m4a mp3 wav …) เก็บใน Drive · ระหว่างอัดเก็บในเครื่องทุก 10 วิ เน็ตหลุดเสียงไม่หาย · iPhone ต้องเปิดจอค้างไว้ระหว่างอัด</p>
    </section>`);
  $('#mCam').insertAdjacentHTML('afterend', '<button type="button" id="mMic" class="icon-btn" aria-label="อัดเสียงประชุม">🎙</button>');

  let pend = [];            // ไฟล์ที่ยังอัปไม่เสร็จของบันทึกนี้ [{id, name, size, dur, status, offset, err, busy, file?}]
  const files = {};         // id → File (อัปจากเครื่อง ไม่เก็บลง IndexedDB)
  const busy = {};          // id → true ระหว่างอัป
  let rec = null;           // { mr, stream, id, mid, t0, acc, paused, n, timer, wake }

  function render() {
    if (!m) return;
    const list = Array.isArray(m.audio) ? m.audio : [];
    const mine = pend.filter(p => p.mid === mId);
    $('#auList').innerHTML = list.map((a, i) => `<div class="au-it">
        <a class="au-play" href="${esc(a.url)}" target="_blank" rel="noopener" title="เปิดฟังใน Drive">▶</a>
        <div class="au-tx"><b>${esc(a.name)}</b><small>${[a.dur ? '⏱ ' + fmtDur(a.dur) : '', a.size ? fmtSize(a.size) : '', a.tibd ? '🎧 ส่งถอดเสียงแล้ว' : ''].filter(Boolean).join(' · ')}</small></div>
        ${a.tibd ? '' : `<button type="button" class="mini" data-au="tibd" data-i="${i}" title="ส่งสำเนาให้ระบบถอดเสียง TIBD">🎧 ถอดเสียง</button>`}
        <button type="button" class="mini au-x" data-au="rm" data-i="${i}" aria-label="เอาเสียงออก">✕</button>
      </div>`).join('') + mine.map(p => {
        const pct = p.size ? Math.floor((p.offset || 0) / p.size * 100) : 0;
        return `<div class="au-it pend">
        <span class="au-play">${p.status === 'rec' ? '🔴' : '⏳'}</span>
        <div class="au-tx"><b>${esc(p.name)}</b><small>${p.status === 'rec' ? 'กำลังอัด…' : busy[p.id] ? `กำลังอัปขึ้น ${pct}%` : p.err ? '⚠️ ' + esc(p.err) : 'รออัปขึ้น'}${p.size ? ' · ' + fmtSize(p.size) : ''}${p.dur ? ' · ⏱ ' + fmtDur(p.dur) : ''}</small>
          ${busy[p.id] ? `<i class="au-bar"><i style="width:${pct}%"></i></i>` : ''}</div>
        ${p.status !== 'rec' && !busy[p.id] ? `<button type="button" class="mini" data-au="up" data-id="${p.id}">⟳ อัปต่อ</button><button type="button" class="mini au-x" data-au="drop" data-id="${p.id}" aria-label="ทิ้งไฟล์นี้">✕</button>` : ''}
      </div>`;
      }).join('');
    $('#auHint').hidden = !!(list.length || mine.length || rec);
    $('#auStart').hidden = !!rec;
    $('#mMic').classList.toggle('on', !!rec);
  }

  /** เปิดบันทึก → โหลดไฟล์ค้างของบันทึกนี้จาก IndexedDB แล้วอัปต่อ */
  window.mAudioOpen = async () => {
    if (!Array.isArray(m.audio)) m.audio = [];
    render();
    try {
      const all = await getRecs();
      all.filter(r => !pend.some(p => p.id === r.id)).forEach(r => pend.push(Object.assign(r, rec && rec.id === r.id ? {} : { status: 'ready' })));
      render();
      pend.filter(p => p.mid === mId && p.status === 'ready').forEach(p => upload(p));
    } catch (e) { console.warn(e); }
  };
  window.mAudioBusy = () => !!rec;

  /* ---------- อัดเสียง ---------- */
  async function start() {
    if (rec) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) return showStatus('เครื่องนี้อัดเสียงในแอปไม่ได้ ใช้ 📁 อัปไฟล์เสียงแทน');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
    catch (e) { return showStatus('เปิดไมค์ไม่ได้: ' + (e.name === 'NotAllowedError' ? 'ยังไม่ได้อนุญาตให้ใช้ไมค์' : e.message)); }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    const type = mr.mimeType || mime || 'audio/webm';
    const now = new Date();
    const r = { id: 'au' + now.getTime().toString(36), mid: mId, mime: type, at: now.toISOString(), status: 'rec', size: 0, dur: 0,
      name: baseName() + ' ' + now.toTimeString().slice(0, 5).replace(':', '.') + extOf(type) };
    rec = { mr, stream, id: r.id, mid: mId, t0: Date.now(), acc: 0, paused: false, n: 0, r };
    await putRec(r);
    pend.push(r);
    if (!m.audio) m.audio = [];
    mr.ondataavailable = async e => {
      if (!e.data || !e.data.size) return;
      const n = rec ? rec.n++ : Date.now();
      r.size += e.data.size;
      try { await putPart(r.id, n, e.data); await putRec(Object.assign({}, r, { dur: elapsed() })); } catch (err) { console.warn(err); }
    };
    mr.onstop = async () => {
      setTimeout(async () => {   // รอท่อนสุดท้ายลง IndexedDB
        r.dur = elapsed(true); r.status = 'ready';
        await putRec(r).catch(() => {});
        stream.getTracks().forEach(t => t.stop());
        clearInterval(rec && rec.timer);
        try { rec && rec.wake && rec.wake.release(); } catch (e) {}
        rec = null;
        $('#auRec').hidden = true;
        render();
        toast('🎙 อัดเสร็จ ' + fmtDur(r.dur) + ' กำลังอัปขึ้น Drive');
        upload(r);
      }, 400);
    };
    mr.start(10000);
    try { rec.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    $('#auRec').hidden = false; $('#auPause').textContent = '⏸ พัก'; $('#auNote').textContent = 'กำลังอัด';
    rec.timer = setInterval(tick, 500); tick();
    render();
    $('#mAud').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function elapsed(final) {
    if (!rec) return 0;
    const s = (rec.acc + (rec.paused ? 0 : Date.now() - rec.t0)) / 1000;
    if (final) rec.acc += rec.paused ? 0 : Date.now() - rec.t0, rec.t0 = Date.now();
    return Math.round(s);
  }
  function tick() { if (rec) $('#auTime').textContent = fmtDur(elapsed()); }
  function pause() {
    if (!rec) return;
    if (rec.paused) { rec.mr.resume(); rec.t0 = Date.now(); rec.paused = false; }
    else { rec.mr.pause(); rec.acc += Date.now() - rec.t0; rec.paused = true; }
    $('#auPause').textContent = rec.paused ? '▶ อัดต่อ' : '⏸ พัก';
    $('#auNote').textContent = rec.paused ? 'พักอยู่' : 'กำลังอัด';
    $('#auRec').classList.toggle('paused', rec.paused);
  }
  function stop() { if (rec && rec.mr.state !== 'inactive') { $('#auNote').textContent = 'กำลังเก็บ…'; rec.mr.stop(); } }
  window.mAudioStop = stop;
  // กลับมาที่แอปแล้วไมค์ถูกตัด (เช่น iPhone ล็อกจอ) → เก็บที่อัดได้ไว้ก่อน
  document.addEventListener('visibilitychange', async () => {
    if (!rec) return;
    if (document.visibilityState === 'visible') {
      if (rec.stream.getAudioTracks().some(t => t.readyState === 'ended')) { stop(); showStatus('ไมค์ถูกปิดตอนออกจากแอป เก็บเสียงที่อัดได้แล้ว กด 🔴 อัดเสียง เพื่ออัดต่อเป็นไฟล์ใหม่'); }
      else if (!rec.wake || rec.wake.released) { try { rec.wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
    }
  });
  window.addEventListener('beforeunload', e => { if (rec) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- อัปขึ้น Drive ทีละท่อน ---------- */
  async function upload(p) {
    if (busy[p.id] || p.status === 'rec') return;
    busy[p.id] = true; p.err = ''; render();
    try {
      let blob;
      if (files[p.id]) blob = files[p.id];
      else {
        const parts = await getParts(p.id);
        if (!parts.length) throw new Error('ไม่พบเสียงในเครื่องแล้ว');
        blob = new Blob(parts.sort((a, b) => a.n - b.n).map(x => x.blob), { type: p.mime });
      }
      p.size = blob.size;
      if (!p.session) { p.session = (await api('audio_start', { name: p.name, mime: p.mime, size: p.size })).session; p.offset = 0; if (!files[p.id]) await putRec(stripFile(p)); }
      let file = null, fails = 0;
      while (!file) {
        try {
          const part = blob.slice(p.offset || 0, Math.min(p.size, (p.offset || 0) + CHUNK));
          const r = await api('audio_chunk', { session: p.session, offset: p.offset || 0, total: p.size, mime: p.mime, data: await b64(part) });
          if (r.done) file = r.file; else p.offset = r.next;
          fails = 0;
          if (!files[p.id]) await putRec(stripFile(p));
          render();
        } catch (err) {
          if (/หมดอายุ/.test(err.message)) { p.session = ''; p.offset = 0; throw err; }
          if (++fails > 3) throw err;
          await new Promise(ok => setTimeout(ok, 1500 * fails));
          try { const q = await api('audio_chunk', { session: p.session, total: p.size, probe: 1 }); if (q.done) file = q.file; else p.offset = q.next; } catch (e) {}
        }
      }
      attach(p.mid, { id: file.id, name: p.name, url: file.url, mime: p.mime, size: file.size || p.size, dur: p.dur || 0, at: p.at });
      delete files[p.id];
      await delRec(p.id).catch(() => {});
      pend = pend.filter(x => x.id !== p.id);
      toast('🎙 อัปเสียงขึ้น Drive แล้ว');
    } catch (err) {
      p.err = 'อัปไม่สำเร็จ: ' + err.message + (navigator.onLine ? '' : ' (ไม่มีเน็ต)');
      if (!files[p.id]) await putRec(stripFile(p)).catch(() => {});
    } finally { delete busy[p.id]; render(); }
  }
  const stripFile = p => { const o = Object.assign({}, p); delete o.err; return o; };

  /** ใส่ไฟล์ที่อัปเสร็จเข้าบันทึก (บันทึกที่เปิดอยู่ หรือบันทึกอื่นถ้าปิดไปแล้ว) */
  function attach(mid, a) {
    if (m && mId === mid) { if (!Array.isArray(m.audio)) m.audio = []; m.audio.push(a); render(); mDirty(true); return; }
    const d = drafts()[mid];
    if (d) { d.data.audio = (d.data.audio || []).concat(a); const all = drafts(); all[mid] = d; LS.set('meetDrafts', all); }
    const o = items.find(x => x.id === mid);
    const data = d ? d.data : o ? Object.assign({}, o.data || {}, { audio: ((o.data || {}).audio || []).concat(a) }) : null;
    if (!data) return;
    if (o) upsert(Object.assign({}, o, { data }));
    api('inbox_save', { item: { id: mid, kind: 'meet', data, text: meetText(data) } }).then(r => { upsert(Object.assign(r.item, { _pending: false })); if (d) dropDraft(mid); }).catch(() => {});
  }

  async function addFile() {
    const [f] = await pickFiles(false, AUDIO_ACCEPT);
    if (!f) return;
    if (!/^(audio|video)\//.test(f.type) && !/\.(m4a|mp3|wav|aac|ogg|opus|amr|3gp|wma|flac|webm|mp4)$/i.test(f.name)) return showStatus('ไฟล์นี้ไม่ใช่ไฟล์เสียง');
    const id = 'af' + Date.now().toString(36);
    const mime = f.type || ({ m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', amr: 'audio/amr', flac: 'audio/flac' }[(f.name.split('.').pop() || '').toLowerCase()] || 'audio/mpeg');
    const p = { id, mid: mId, name: f.name, mime, size: f.size, dur: 0, at: new Date().toISOString(), status: 'ready', offset: 0 };
    files[id] = f; pend.push(p); render();
    // ความยาวเสียง (ถ้าเบราว์เซอร์อ่านได้)
    try { const el = new Audio(); el.preload = 'metadata'; el.src = URL.createObjectURL(f); el.onloadedmetadata = () => { if (isFinite(el.duration)) { p.dur = Math.round(el.duration); render(); } URL.revokeObjectURL(el.src); }; } catch (e) {}
    upload(p);
  }

  /* ---------- ปุ่ม ---------- */
  $('#auStart').addEventListener('click', start);
  $('#auPause').addEventListener('click', pause);
  $('#auStop').addEventListener('click', stop);
  $('#auFile').addEventListener('click', addFile);
  $('#mMic').addEventListener('click', () => rec ? stop() : start());
  $('#auList').addEventListener('click', async e => {
    const b = e.target.closest('[data-au]');
    if (!b) return;
    const act = b.dataset.au;
    if (act === 'up') { const p = pend.find(x => x.id === b.dataset.id); if (p) upload(p); return; }
    if (act === 'drop') {
      const p = pend.find(x => x.id === b.dataset.id);
      if (!p || !confirm('ทิ้งเสียง "' + p.name + '" ที่ยังไม่ได้อัป? ทิ้งแล้วเอาคืนไม่ได้')) return;
      delete files[p.id]; pend = pend.filter(x => x.id !== p.id); await delRec(p.id).catch(() => {}); render(); return;
    }
    const i = +b.dataset.i, a = m.audio[i];
    if (!a) return;
    if (act === 'rm') {
      if (!confirm('เอาเสียง "' + a.name + '" ออกจากบันทึก? ไฟล์ใน Drive จะย้ายไปถังขยะ (กู้คืนได้ใน 30 วัน)')) return;
      m.audio.splice(i, 1); render(); mDirty(true);
      api('audio_rm', { id: a.id }).catch(err => showStatus('ย้ายไฟล์ไปถังขยะไม่สำเร็จ: ' + err.message));
    }
    if (act === 'tibd') {
      if (!confirm('ส่งสำเนา "' + a.name + '" เข้าโฟลเดอร์ไฟล์เสียงประชุมของระบบถอดเสียง TIBD?\nจากนั้นสั่ง Claude ของ TIBD ให้ถอดไฟล์นี้ (ข้อมูลไม่ออกนอกระบบ ถอดด้วยโมเดลในเครื่อง)')) return;
      b.disabled = true; b.textContent = '🎧 กำลังส่ง…';
      try {
        const r = await api('audio_tibd', { id: a.id, name: baseName() });
        a.tibd = { id: r.copy.id, name: r.copy.name, at: new Date().toISOString() };
        render(); mDirty(true);
        copyText('ถอดเสียงไฟล์ "' + r.copy.name + '" ในโฟลเดอร์ไฟล์เสียงประชุม แล้วทำรายงานเข้า "1 รอยืนยัน"', '🎧 ส่งแล้ว · คัดลอกข้อความสั่ง Claude ของ TIBD ไว้ให้ วางได้เลย');
      } catch (err) { b.disabled = false; b.textContent = '🎧 ถอดเสียง'; showStatus('ส่งไม่สำเร็จ: ' + err.message); }
    }
  });
  window.addEventListener('online', () => pend.filter(p => p.status === 'ready' && !busy[p.id] && p.err).forEach(upload));
})();
