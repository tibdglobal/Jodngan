/* ===================== ✉️ งานจากอีเมล (Gmail ของบัญชีที่รันสคริปต์) =====================
 * ติดป้าย "จดงาน" ที่อีเมล (หรือตั้งตัวกรองให้ติดเอง / ส่งต่อจากอีเมลอื่นแล้วให้ตัวกรองติดป้าย)
 * ทุก 15 นาที (checkReminders) → สร้างงาน "✉️ หัวเรื่อง" + ลิงก์กลับไปที่อีเมล แล้วย้ายป้ายเป็น "จดงาน/จดแล้ว"
 * วันที่/เวลาในหัวเรื่อง (เช่น "พรุ่งนี้", "5/12 14:00") ใช้เป็นกำหนดส่ง · #โปรเจ็ค ในหัวเรื่องใช้เป็นโปรเจ็ค
 * เปิดใช้: รันฟังก์ชัน mailSetup ใน editor 1 ครั้ง (ขอสิทธิ์อ่าน Gmail) → ตั้ง prop MAIL_ON
 */
const MAIL_LABEL = 'จดงาน';
const MAIL_DONE = 'จดงาน/จดแล้ว';

/** รันเองใน editor ครั้งแรก: ขอสิทธิ์ Gmail + สร้างป้าย + เปิดใช้ */
function mailSetup() {
  if (!GmailApp.getUserLabelByName(MAIL_LABEL)) GmailApp.createLabel(MAIL_LABEL);
  if (!GmailApp.getUserLabelByName(MAIL_DONE)) GmailApp.createLabel(MAIL_DONE);
  props.setProperty('MAIL_ON', '1');
  Logger.log('เปิดใช้งานจากอีเมลแล้ว: ติดป้าย "' + MAIL_LABEL + '" ที่อีเมลใน ' + Session.getEffectiveUser().getEmail());
}

function mailTasks_() {
  if (props.getProperty('MAIL_ON') !== '1') return 0;
  const lb = GmailApp.getUserLabelByName(MAIL_LABEL);
  if (!lb) return 0;
  const done = GmailApp.getUserLabelByName(MAIL_DONE) || GmailApp.createLabel(MAIL_DONE);
  const threads = lb.getThreads(0, 15);
  if (!threads.length) return 0;
  const me = Session.getEffectiveUser().getEmail();
  const made = [];
  threads.forEach(th => {
    const id = 'mail:' + th.getId();
    if (!findRow_(id)) {
      const msgs = th.getMessages(), first = msgs[0], last = msgs[msgs.length - 1];
      const subject = String(th.getFirstMessageSubject() || '(ไม่มีหัวเรื่อง)').replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim();
      const p = parseQuick_(subject);
      const from = String(last.getFrom() || '').replace(/\s*<[^>]+>\s*$/, '').replace(/"/g, '').trim();
      const link = 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me) + '#all/' + th.getId();
      const body = String(last.getPlainBody() || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
      addTask_({
        id: id, title: '✉️ ' + (p.title || subject).slice(0, 150), date: p.date || '', time: p.time || '', due: p.due || '', project: p.project || '',
        source: 'mail',
        note: 'จาก: ' + from + ' · ' + Utilities.formatDate(first.getDate(), TZ, 'd/M/yyyy HH:mm') + '\n' + link + (body ? '\n\n' + body : ''),
      });
      made.push(subject);
    }
    th.removeLabel(lb); th.addLabel(done);
  });
  if (made.length) push_('✉️ จดงานจากอีเมล ' + made.length + ' เรื่อง\n' + made.slice(0, 5).map(s => '• ' + s.slice(0, 60)).join('\n'));
  return made.length;
}
