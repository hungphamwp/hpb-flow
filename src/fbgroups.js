// Nhóm Facebook đang làm admin: danh sách nhóm + số liệu đọc từ trang quản trị của chính nhóm (Overview, Members, Insights).
// Đọc bằng một tab riêng trong hồ sơ trình duyệt đã đăng nhập nick admin, không đụng tới tab làm việc của flow.
import fs from 'node:fs';
import path from 'node:path';
import { getContext, focusPage } from './browser.js';

const num = s => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KkMm](?![a-zA-Z]))?/); if (!m) return null; const v = parseFloat(m[1]); return Math.round(v * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1)); };
const pct = s => { const m = String(s || '').replace(/,/g, '').match(/(-?[\d.]+)%/); return m ? parseFloat(m[1]) : null; };
// số đứng ngay trên/dưới một nhãn (trang Overview in "Pending posts\n0\n0 new today")
const after = (lines, re, max = 3) => { const i = lines.findIndex(l => re.test(l)); if (i < 0) return null; for (let k = i + 1; k <= i + max && k < lines.length; k++) if (/^-?[\d.,]+[KkMm]?$/.test(lines[k])) return num(lines[k]); return null; };

export function parseOverview(text) {
  const L = text.split('\n').map(s => s.trim()).filter(Boolean);
  const o = {
    reported: after(L, /^(Member-reported content|Nội dung thành viên báo cáo)/i),
    alerts: after(L, /^(Moderation alerts|Cảnh báo kiểm duyệt)/i),
    pending_posts: after(L, /^(Pending posts|Bài viết đang chờ)/i),
    member_requests: after(L, /^(Member requests|Yêu cầu làm thành viên)/i),
    violations: (() => { const l = L.find(x => /admin violations|vi phạm/i.test(x)); return l ? num(l) : null; })(),
  };
  // Insights 7 ngày: "Posts\n17\n100%"
  const seven = (re) => { const i = L.findIndex(l => re.test(l)); if (i < 0) return [null, null]; return [num(L[i + 1]), pct(L[i + 2])]; };
  [o.posts7, o.posts7_chg] = seven(/^(Posts|Bài viết)$/i);
  [o.comments7, o.comments7_chg] = seven(/^(Comments|Bình luận)$/i);
  [o.reactions7, o.reactions7_chg] = seven(/^(Reactions|Cảm xúc|Lượt bày tỏ cảm xúc)$/i);
  // Bài nổi bật 28 ngày: dòng nội dung rồi dòng "504 reach, 13 engagement"
  const top = [], s = L.findIndex(l => /^(Top posts|Bài viết hàng đầu)/i.test(l));
  if (s >= 0) for (let i = s + 1; i < L.length && top.length < 5; i++) {
    const m = L[i].replace(/,(?=\d{3})/g, '').match(/^([\d.]+[KkMm]?)\s*(reach|người tiếp cận|lượt tiếp cận),\s*([\d.]+[KkMm]?)\s*(engagement|tương tác)/i);
    if (m) top.push({ text: L[i - 1].slice(0, 220), reach: num(m[1]), engagement: num(m[3]) });
  }
  o.top_posts = top;
  return o;
}
export function parseMembers(text) {
  const L = text.split('\n').map(s => s.trim()).filter(Boolean), o = {};
  const cnt = re => { const i = L.findIndex(l => re.test(l)); if (i < 0) return null; for (let k = i; k < i + 3 && k < L.length; k++) { const m = L[k].match(/·\s*([\d.,]+[KkMm]?)\s*$/); if (m) return num(m[1]); } return null; };
  o.members = cnt(/^(Members|Thành viên)$/i);
  o.visitors = cnt(/^(Visitors|Khách)$/i);
  const nw = L.find(l => /\d/.test(l) && /new members this week|thành viên mới trong tuần/i.test(l)); o.new_week = nw ? num(nw) : 0;
  const pv = L.find(l => /^(Public|Private) group$|^Nhóm (Công khai|Riêng tư)$/i.test(l)); o.privacy = pv ? (/Private|Riêng/i.test(pv) ? 'Riêng tư' : 'Công khai') : null;
  const t = L.findIndex(l => l === o.privacy || /group$/i.test(l)); if (t > 0) o.name = L[t - 1];
  if (o.members == null) { const m = L.find(l => /[\d.,]+[KkMm]?\s*(members|thành viên)/i.test(l)); if (m) o.members = num(m); }
  return o;
}
export function parseInsights(text) {
  const L = text.split('\n').map(s => s.trim()).filter(Boolean), o = {};
  const pick = re => { const i = L.findIndex(l => re.test(l)); return i < 0 ? [null, null] : [num(L[i]), pct(L[i + 1])]; };
  [o.active28, o.active28_chg] = pick(/posted and commented|đã đăng và bình luận/i);
  [o.viewed28, o.viewed28_chg] = pick(/\bviewed$|đã xem$/i);
  return o;
}

export function createFbGroups(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { groups: [], snaps: {}, status: null }; } };
  const write = d => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(d, null, 1)); };
  let running = null;

  const idFrom = s => { const m = String(s || '').trim().match(/groups\/([^/?#\s]+)/) || String(s).trim().match(/^([\w.]+)$/); return m ? m[1] : null; };
  function add({ url, profile = 'fb-phu', note = '' }) {
    const id = idFrom(url); if (!id) throw new Error('Dán link nhóm dạng facebook.com/groups/...');
    const d = read(); if (d.groups.some(g => g.id === id || g.slug === id)) throw new Error('Nhóm này đã có trong danh sách');
    d.groups.push({ id, name: '', profile, note, added: Date.now() }); write(d); return d;
  }
  function update(id, patch) { const d = read(), g = d.groups.find(x => x.id === id); if (!g) throw new Error('Không có nhóm này'); for (const k of ['name', 'profile', 'note', 'goal']) if (k in patch) g[k] = patch[k]; write(d); return d; }
  function remove(id) { const d = read(); d.groups = d.groups.filter(g => g.id !== id); delete d.snaps[id]; write(d); return d; }

  // chờ tới khi trang hiện chữ cần đọc (FB vẽ chậm, mạng yếu có khi >10s), quá 20s thì đọc những gì đang có
  async function grab(page, url, ready) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(src => { const t = (document.querySelector('[role=main]') || document.body).innerText; return new RegExp(src, 'i').test(t) || /isn't available|không xem được/i.test(t); }, ready.source, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return page.evaluate(() => (document.querySelector('[role=main]') || document.body).innerText);
  }
  async function refreshOne(page, g) {
    const base = `https://www.facebook.com/groups/${g.id}`;
    const ov = await grab(page, base + '/overview', /(Insights summary|Tóm tắt)[\s\S]*(Top posts|Bài viết hàng đầu|Pro tips|Mẹo)/);
    if (/isn't available|không xem được|không có sẵn/i.test(ov.slice(0, 300))) throw new Error('Không mở được trang quản trị (nick này chưa là admin?)');
    const snap = { at: Date.now(), ...parseOverview(ov) };
    Object.assign(snap, parseMembers(await grab(page, base + '/members', /(Members|Thành viên)\s*·\s*\d/)));
    Object.assign(snap, parseInsights(await grab(page, base + '/insights', /(viewed|đã xem)\n/)));
    // id số + slug (link đẹp) để mở đúng trang
    const real = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="/groups/"]')].map(x => x.href.match(/groups\/([^/?#]+)/)?.[1]).filter(Boolean); return { num: a.find(x => /^\d+$/.test(x)), slug: a.find(x => !/^\d+$/.test(x) && !/^(feed|discover|joins|create)$/.test(x)) }; }).catch(() => ({}));
    return { snap, real };
  }
  async function refresh(only) {
    if (running) throw new Error('Đang cập nhật, chờ lượt này xong');
    const d0 = read(), list = d0.groups.filter(g => !only || g.id === only);
    if (!list.length) throw new Error('Chưa có nhóm nào');
    running = (async () => {
      const set = st => { const d = read(); d.status = st; write(d); };
      const errs = [];
      set({ running: true, at: Date.now(), step: 'Đang mở trình duyệt' });
      const pages = new Map();
      try {
        for (const [i, g] of list.entries()) {
          set({ running: true, at: Date.now(), step: `Nhóm ${i + 1}/${list.length}: ${g.name || g.id}` });
          try {
            if (!pages.has(g.profile)) pages.set(g.profile, await focusPage(await (await getContext(g.profile)).newPage()));
            const { snap, real } = await refreshOne(pages.get(g.profile), g);
            const d = read(), gg = d.groups.find(x => x.id === g.id); if (!gg) continue;
            if (snap.name && !gg.name_locked) gg.name = snap.name;
            if (real.slug && real.slug !== gg.id) gg.slug = real.slug;
            if (real.num && real.num !== gg.id) gg.num = real.num;
            gg.privacy = snap.privacy || gg.privacy; gg.error = '';
            (d.snaps[g.id] ||= []).push(snap); d.snaps[g.id] = d.snaps[g.id].slice(-400);
            write(d);
          } catch (e) { errs.push(`${g.name || g.id}: ${e.message}`); const d = read(), gg = d.groups.find(x => x.id === g.id); if (gg) { gg.error = e.message; write(d); } }
        }
      } finally {
        for (const p of pages.values()) await p.close().catch(() => {});
        set({ running: false, at: Date.now(), ok: !errs.length, step: errs.join(' · ') || `Đã cập nhật ${list.length} nhóm` });
        running = null;
      }
    })();
    return { ok: true };
  }
  function get() {
    const d = read();
    if (d.status?.running && !running) d.status = { ...d.status, running: false, ok: false, step: 'Lượt trước bị ngắt giữa chừng (app khởi động lại)' };
    return d;
  }
  return { get, add, update, remove, refresh };
}
