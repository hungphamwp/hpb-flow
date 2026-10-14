// Nhắc việc trên máy (macOS) cho trang "Việc hôm nay" — Hưng muốn được nhắc thường xuyên hơn (08/10/2026).
//  1) Nhắc định kỳ: trong giờ làm việc, cứ N phút hiện thông báo góc màn hình (có âm thanh) liệt kê việc chưa xong hôm nay + quá hạn.
//  2) Nhắc đúng giờ: việc có giờ nhắc (t.remind = "HH:MM") → tới giờ hiện hộp thoại nổi giữa màn hình, chọn
//     "Xong rồi" (đánh dấu xong) / "15 phút nữa" (hoãn) / "Để đó" — hộp thoại không tự tắt nên khó bỏ sót.
// Cấu hình lưu trong todos-remind.json cạnh todos.json.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULTS = { on: true, every: 60, from: 8, to: 21 };
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

export function createTodoRemind({ file, readTodos, writeTodos, port }) {
  const cfgFile = file.replace(/\.json$/, '-remind.json');
  const getCfg = () => { try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch { return { ...DEFAULTS }; } };
  const setCfg = patch => {
    const c = getCfg();
    if ('on' in patch) c.on = !!patch.on;
    if ([15, 30, 45, 60, 90, 120].includes(+patch.every)) c.every = +patch.every;
    if (+patch.from >= 0 && +patch.from <= 23) c.from = +patch.from;
    if (+patch.to >= 1 && +patch.to <= 24) c.to = +patch.to;
    fs.writeFileSync(cfgFile, JSON.stringify(c, null, 1)); lastNudge = Date.now(); return c;
  };

  const notify = (title, text) => execFile('osascript', ['-e', `display notification ${q(text)} with title ${q(title)} sound name "Glass"`], () => {});
  const open = new Set(); // id việc đang hiện hộp thoại, tránh bật trùng
  // cửa sổ nhắc nổi (mac/remind.swift → Contents/MacOS/hpb-remind, mở public/remind.html); chạy từ mã nguồn chưa build thì dùng hộp thoại osascript
  const HELPER = fileURLToPath(new URL('../../../MacOS/hpb-remind', import.meta.url));
  const XP = { 1: 20, 2: 15, 3: 12, 4: 10 };
  function alertTask(t, today) {
    open.add(t.id);
    const after = btn => {
      open.delete(t.id);
      const list = readTodos(), cur = list.find(x => x.id === t.id); if (!cur) return;
      if (btn === 'done') { cur.done = true; cur.doneAt = Date.now(); }
      else if (btn === 'snooze') { cur.snooze = Date.now() + 15 * 60e3; cur.snoozes = (cur.snoozes || 0) + 1; }
      else return;
      writeTodos(list);
    };
    if (fs.existsSync(HELPER)) {
      const qs = new URLSearchParams({ t: t.text, n: t.note || '', at: t.remind, xp: XP[t.prio] || 10, s: t.snoozes || 0, over: t.date < today ? '1' : '0' });
      execFile('afplay', ['/System/Library/Sounds/Glass.aiff'], () => {});
      execFile(HELPER, [`http://127.0.0.1:${port}/remind.html?${qs}`], { timeout: 31 * 60e3 }, (err, stdout) => after((stdout || '').trim()));
      return;
    }
    const msg = t.text + (t.note ? '\n\n' + t.note : '');
    const script = `display alert ${q('⏰ Nhắc việc · ' + t.remind)} message ${q(msg)} buttons {"Để đó", "15 phút nữa", "Xong rồi"} default button "Xong rồi" giving up after 1800`;
    execFile('osascript', ['-e', script], { timeout: 31 * 60e3 }, (err, stdout) => {
      const btn = (/button returned:([^,\n]*)/.exec(stdout || '') || [])[1]?.trim();
      after(btn === 'Xong rồi' ? 'done' : btn === '15 phút nữa' ? 'snooze' : '');
    });
  }

  let lastNudge = Date.now();
  function tick() {
    const now = new Date(), today = dayKey(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`, list = readTodos();
    let dirty = false;
    // nhắc đúng giờ (cả việc quá hạn có giờ nhắc mà chưa nhắc)
    for (const t of list) {
      if (t.done || !t.remind || t.date > today || open.has(t.id)) continue;
      const due = t.snooze ? Date.now() >= t.snooze : (t.date < today || hm >= t.remind) && t.reminded !== t.date + ' ' + t.remind;
      if (!due) continue;
      if (t.snooze) delete t.snooze; else t.reminded = t.date + ' ' + t.remind;
      dirty = true; alertTask(t, today);
    }
    if (dirty) writeTodos(list);
    // nhắc định kỳ
    const c = getCfg(), h = now.getHours();
    if (!c.on || h < c.from || h >= c.to || Date.now() - lastNudge < c.every * 60e3) return;
    nudge(list, today);
  }
  function nudge(list = readTodos(), today = dayKey(new Date()), force = false) {
    lastNudge = Date.now();
    const left = list.filter(t => !t.done && t.date === today), over = list.filter(t => !t.done && t.date < today);
    if (!left.length && !over.length) return force && notify('Không còn việc nào hôm nay', 'Nhắc việc đang bật, sẽ báo khi có việc chưa xong.');
    const top = [...over, ...left].sort((a, b) => (a.prio || 4) - (b.prio || 4)).slice(0, 3).map(t => '• ' + t.text).join('\n');
    notify(`Còn ${left.length} việc hôm nay${over.length ? ` · ${over.length} quá hạn` : ''}`, top);
  }
  setInterval(() => { try { tick(); } catch (e) { console.error('Nhắc việc:', e.message); } }, 30e3);
  return { getCfg, setCfg, test: () => { nudge(undefined, undefined, true); return { ok: true }; },
    // xem thử thẻ nhắc (không đổi dữ liệu): dùng id giả nên bấm gì cũng không ghi
    preview: () => { alertTask({ id: 'preview-' + Date.now(), text: 'Ví dụ: Gọi khách chốt báo giá', note: 'Đây là thẻ xem thử, bấm gì cũng không ảnh hưởng dữ liệu', remind: `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`, prio: 2, date: dayKey(new Date()) }, dayKey(new Date())); return { ok: true }; } };
}
