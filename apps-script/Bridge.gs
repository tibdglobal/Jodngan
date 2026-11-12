/**
 * จดงาน — สะพานปฏิทิน (รันในบัญชี Gmail ที่ได้รับแชร์ปฏิทินพี่วุฒิ)
 * ระบบหลักเรียกมาที่นี่เพื่อขอรายการนัด แล้วให้ผู้ใช้เลือกเองว่าจะเข้านัดไหน
 *
 * ติดตั้ง
 * 1. Run ฟังก์ชัน setup (อนุญาตสิทธิ์) → ดู Execution log จะเห็นรายชื่อปฏิทินที่ดึง และ BRIDGE_KEY
 * 2. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 * 3. นำ Web app URL และ BRIDGE_KEY ไปใส่ใน Script properties ของสคริปต์หลัก (BRIDGE_URL, BRIDGE_KEY)
 */

const TZ = 'Asia/Bangkok';
// ระบุรหัสปฏิทินที่ต้องการ ถ้าเว้นว่าง = ดึงทุกปฏิทินที่ได้รับแชร์ (ไม่รวมปฏิทินของบัญชีนี้เอง/วันหยุด)
const CALENDARS = [];
const props = PropertiesService.getScriptProperties();

function setup() {
  if (!props.getProperty('BRIDGE_KEY')) props.setProperty('BRIDGE_KEY', Utilities.getUuid().replace(/-/g, ''));
  pick_().forEach(c => Logger.log('📆 จะดึง: ' + c.getName() + ' (' + c.getId() + ')'));
  Logger.log('BRIDGE_KEY: ' + props.getProperty('BRIDGE_KEY'));
}

function doGet() {
  return ContentService.createTextOutput('Calendar bridge ทำงานอยู่');
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (!body.key || body.key !== props.getProperty('BRIDGE_KEY')) return out_({ ok: false, error: 'key ไม่ถูกต้อง' });
  const days = Math.min(Number(body.days) || 14, 60);
  return out_({ ok: true, events: list_(days) });
}

/** ปฏิทินที่จะดึง */
function pick_() {
  if (CALENDARS.length) return CALENDARS.map(id => CalendarApp.getCalendarById(id)).filter(Boolean);
  return CalendarApp.getAllCalendars().filter(c =>
    !c.isOwnedByMe() && !/holiday|contacts|#weather|#weeknum/i.test(c.getId()));
}

function list_(days) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const start = new Date(today + 'T00:00:00+07:00');
  const end = new Date(start.getTime() + days * 86400000);
  const out = [];
  pick_().forEach(cal => {
    cal.getEvents(start, end).forEach(e => {
      if (e.isAllDayEvent()) return;
      out.push({
        id: e.getId(),
        title: e.getTitle() || '(ไม่มีชื่อ)',
        start: e.getStartTime().toISOString(),
        end: e.getEndTime().toISOString(),
        location: e.getLocation() || '',
        cal: cal.getName(),
      });
    });
  });
  return out;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
