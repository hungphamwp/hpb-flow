// Gợi ý việc hôm nay từ dự án trên panel.hmarketing.vn (Hưng yêu cầu 10/10/2026).
// Đọc qua sync-api.php của panel (cùng khoá với lệnh hpb-sync: ~/.config/hpb-sync/key), đồng bộ hai chiều:
// việc thêm từ gợi ý mang src {pid, tid}; tích xong trong app → task trên panel chuyển cột "done", và ngược lại.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CONF_DIR = process.env.HPB_SYNC_CONF || path.join(os.homedir(), '.config', 'hpb-sync');
const PANEL = 'https://panel.hmarketing.vn';
const PRIO = { high: 1, medium: 2, low: 3 };
const day = d => new Date(d + 'T00:00:00');
const diff = (a, b) => Math.round((day(a) - day(b)) / 864e5);

export function createProjects(dataFile) {
  let cache = null, cacheAt = 0;
  const conf = () => {
    let url = `${PANEL}/sync-api.php`, key = process.env.HPB_SYNC_KEY || '';
    try { url = JSON.parse(fs.readFileSync(path.join(CONF_DIR, 'config.json'), 'utf8')).url || url; } catch { /* mặc định */ }
    try { key = key || fs.readFileSync(path.join(CONF_DIR, 'key'), 'utf8').trim(); } catch { /* chưa có khoá */ }
    if (!key) throw new Error('Chưa có khoá đồng bộ panel (~/.config/hpb-sync/key)');
    return { url, key };
  };
  async function call(action, body = {}) {
    const { url, key } = conf();
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': key, 'User-Agent': 'hpb-flow/1' }, body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`Panel: ${j.error || r.status}`);
    return j;
  }
  async function pull(force) {
    if (!force && cache && Date.now() - cacheAt < 5 * 60e3) return cache;
    cache = await call('pull'); cacheAt = Date.now(); return cache;
  }
  const readSt = () => { try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { return { dismissed: {} }; } };
  const writeSt = s => fs.writeFileSync(dataFile, JSON.stringify(s, null, 1));

  // Chấm điểm: mỗi dự án đang chạy lấy MỘT việc nên làm nhất, xếp theo độ gấp
  function rank(p, today) {
    const projs = Object.fromEntries(p.projects.map(x => [x.id, x]));
    const active = p.projects.filter(x => x.status === 'active');
    const open = p.tasks.filter(t => t.col !== 'done' && projs[t.pid]?.status === 'active');
    const touch = {}; for (const t of p.tasks) touch[t.pid] = [touch[t.pid] || '', t.updated_at].sort().pop();
    const out = [];
    for (const pr of active) {
      const ts = open.filter(t => t.pid === pr.id).map(t => {
        let s = 20, why = 'Việc tiếp theo của dự án';
        if (t.due && t.due < today) { s = 100 + Math.min(diff(today, t.due), 30); why = `Trễ hạn ${diff(today, t.due)} ngày`; }
        else if (t.due === today) { s = 90; why = 'Đến hạn hôm nay'; }
        else if (t.due && diff(t.due, today) <= 3) { s = 70; why = `Còn ${diff(t.due, today)} ngày tới hạn`; }
        else if (t.due) { s = 30; why = `Hạn ${t.due.split('-').reverse().slice(0, 2).join('/')}`; }
        s += t.pri === 'high' ? 15 : t.pri === 'low' ? -5 : 0;
        if (t.col === 'doing' || t.col === 'progress') s += 10;
        return { t, s, why };
      }).sort((a, b) => b.s - a.s);
      const lateP = pr.end && pr.end < today, soonP = pr.end && pr.end >= today && diff(pr.end, today) <= 7;
      const base = { pid: pr.id, du_an: pr.n, khach: pr.client || '', han_du_an: pr.end || '', link: `${PANEL}/index.php` };
      if (ts.length) {
        const b = ts[0]; let s = b.s, why = b.why;
        if (lateP) { s += 25; why += ` · dự án trễ deadline ${pr.end.split('-').reverse().slice(0, 2).join('/')}`; }
        else if (soonP) { s += 15; why += ` · dự án còn ${diff(pr.end, today)} ngày tới deadline`; }
        out.push({ ...base, key: 't:' + b.t.id, tid: b.t.id, text: b.t.t, note: b.t.d || '', due: b.t.due || '', prio: PRIO[b.t.pri] || 2, score: s, why, con: ts.length - 1 });
      } else {
        const stale = Math.max(diff(today, (pr.updated_at || '').slice(0, 10) || today), diff(today, (touch[pr.id] || '').slice(0, 10) || today));
        out.push({ ...base, key: `p:${pr.id}:${today}`, tid: null, text: lateP ? 'Chốt lại deadline và việc còn lại với khách' : 'Lên việc tiếp theo cho dự án', note: '', due: '', prio: lateP ? 1 : 3,
          score: lateP ? 95 : stale > 7 ? 35 : 25, why: lateP ? `Dự án trễ deadline ${pr.end.split('-').reverse().slice(0, 2).join('/')}, chưa có việc nào mở` : `Chưa có việc mở${stale > 7 ? ` · ${stale} ngày không cập nhật` : ''}`, con: 0 });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }

  // todos: danh sách việc của app (đọc/ghi qua hàm của server). Trả gợi ý + đồng bộ chiều panel → app.
  async function suggest(date, todos, saveTodos, { force } = {}) {
    const p = await pull(force), st = readSt(), today = date;
    // chiều panel → app: task trên panel đã xong thì việc liên kết trong app cũng xong
    const tasks = Object.fromEntries(p.tasks.map(t => [t.id, t])); let changed = false;
    for (const td of todos) if (td.src?.tid && tasks[td.src.tid]) {
      const pd = tasks[td.src.tid].col === 'done';
      if (pd && !td.done) { td.done = true; td.doneAt = Date.now(); td.src.from = 'panel'; changed = true; }
    }
    if (changed) saveTodos(todos);
    const linked = new Set(todos.filter(t => t.src?.key && (!t.done || t.date === today)).map(t => t.src.key));
    const dis = new Set(st.dismissed?.[today] || []);
    const all = rank(p, today);
    const items = all.filter(s => !linked.has(s.key) && !dis.has(s.key));
    return { date: today, at: cacheAt, items: items.slice(0, 8), con_lai: Math.max(0, items.length - 8), da_them: all.filter(s => linked.has(s.key)).length, an: dis.size,
      tong: { dang_chay: p.projects.filter(x => x.status === 'active').length, tre: p.projects.filter(x => x.status === 'active' && x.end && x.end < today).length } };
  }
  function dismiss(date, key) { const st = readSt(); (st.dismissed ||= {})[date] = [...new Set([...(st.dismissed[date] || []), key])]; for (const d of Object.keys(st.dismissed)) if (d < date) delete st.dismissed[d]; writeSt(st); }
  function undismiss(date) { const st = readSt(); if (st.dismissed) delete st.dismissed[date]; writeSt(st); }
  async function findSuggestion(date, key) { return rank(await pull(), date).find(s => s.key === key); }
  // chiều app → panel: tích xong / bỏ tích việc liên kết thì đổi cột task trên panel
  async function setDone(tid, done) {
    const p = await pull(); const t = p.tasks.find(x => x.id === tid); if (!t) throw new Error('Task không còn trên panel');
    if ((t.col === 'done') === done) return t;
    const r = await call('save_task', { id: tid, fields: { col: done ? 'done' : 'todo' } });
    Object.assign(t, r.task || { col: done ? 'done' : 'todo' }); return t;
  }
  return { suggest, dismiss, undismiss, findSuggestion, setDone, pull };
}
