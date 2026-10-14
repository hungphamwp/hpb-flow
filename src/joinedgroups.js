// Nhóm đã tham gia của từng nick Facebook (FB chính = profile default, FB phụ = fb-phu): đọc trang facebook.com/groups/joins, chia chủ đề theo tên nhóm.
// Mỗi nick một file <dir>/<profile>-da-tham-gia.json. Chỉ nhóm của FB phụ bật được "radar" (flow quét lead chạy bằng FB phụ),
// flow fb-quet-lead-nhom gộp các nhóm đó vào danh sách quét (cạnh Sheet danh sách nhóm).
import fs from 'node:fs';
import path from 'node:path';
import { getContext, focusPage } from './browser.js';

export const TOPICS = { web: 'Website', agent: 'Claude & Agent', ai: 'AI chung', video: 'Video & ảnh AI', jobs: 'Việc làm & giáo dục', khac: 'Khác' };
export function topicOf(name) {
  const s = name || '';
  // "AI"/"Ai" viết hoa mới tính (chữ "ai" thường trong tiếng Việt là "người nào")
  const ai = /\bA\.?[Ii]\b/.test(s) || /chat ?gpt|\bgpt\b|grok|gemini|claude|prompt|notebooklm|openai|trí tuệ nhân tạo|copilot|cursor|deepseek|midjourney|veo ?3|sora|kling|n8n|automation/i.test(s);
  if (/nói không với ai|voz|j2team|cto vietnam|build in public|xóm lo/i.test(s)) return 'khac';
  const web = /web|wordpress|\bwp\b|landing|ladi|\bseo\b|tên miền|domain|hosting|backlink|code thuê|html|css|php/i.test(s);
  if (/việc làm|jobs?\b|tuyển dụng|giáo viên|education|\bedu\b/i.test(s)) return ai ? 'jobs' : web && !/tuyển dụng|việc làm/i.test(s) ? 'web' : 'khac';
  if (web) return 'web';
  if (ai && /video|hình ảnh|ảnh ai|\bart\b|sáng tạo|midjourney|stable diffusion|sdvn/i.test(s)) return 'video';
  if (/claude|agent|vibe|codex|antigravity|automation|openclaw|n8n|cursor/i.test(s)) return 'agent';
  if (ai) return 'ai';
  return 'khac';
}

export const ACCOUNTS = { default: 'FB chính', 'fb-phu': 'FB phụ' };
export const RADAR_PROFILE = 'fb-phu';

// Trang /about của nhóm có khối Activity: "527 new posts today / 15.9K in the last month / 407 new comments today / 7,124 in the last month / ..."
const num = x => { const m = String(x || '').replace(/,/g, '').match(/([\d.]+)\s*([KkMm])?/); if (!m) return null; return Math.round(parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1)); };
export function parseAbout(text) {
  const L = text.split('\n').map(x => x.trim()).filter(Boolean), o = {};
  // "No posts today" / "No comments in the last month" = 0
  const val = l => /^(no|không có)\b/i.test(l) ? 0 : num(l);
  const pair = re => { const i = L.findIndex(l => re.test(l)); if (i < 0) return [null, null]; const month = /last month|tháng trước|30 ngày/i.test(L[i + 1] || '') ? val(L[i + 1]) : null; return [val(L[i]), month]; };
  [o.posts_day, o.posts_month] = pair(/(new )?posts? today|bài viết (mới )?hôm nay/i);
  [o.cmt_day, o.cmt_month] = pair(/(new )?comments? today|bình luận (mới )?hôm nay/i);
  [o.react_day, o.react_month] = pair(/(new )?reactions? today|cảm xúc (mới )?hôm nay/i);
  o.pending = L.some(l => /membership is pending|Cancel request|yêu cầu tham gia đang chờ|Huỷ yêu cầu|Hủy yêu cầu/i.test(l));
  const mem = L.find(l => /total members|tổng số thành viên/i.test(l)); o.members = mem ? num(mem) : null;
  o.privacy = L.some(l => /^(Private group|Nhóm Riêng tư)/i.test(l)) ? 'Riêng tư' : L.some(l => /^(Public group|Nhóm Công khai)/i.test(l)) ? 'Công khai' : null;
  return o;
}
// điểm tương tác: bình luận + 0,3 × cảm xúc trong tháng, nhân tỉ lệ bình luận/bài (nhóm toàn bài spam không ai trả lời thì điểm thấp)
export function heatOf(a) {
  if (!a || a.cmt_month == null) return null;
  const ratio = (a.cmt_month || 0) / Math.max(a.posts_month || 0, 1);
  return Math.round(((a.cmt_month || 0) + 0.3 * (a.react_month || 0)) * Math.min(1, ratio));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toLocaleDateString('sv-SE');

export function createJoinedGroups(dir) {
  const fileOf = p => { if (!ACCOUNTS[p]) throw new Error('Không có tài khoản ' + p); return path.join(dir, `${p}-da-tham-gia.json`); };
  const readP = p => { try { return JSON.parse(fs.readFileSync(fileOf(p), 'utf8')); } catch { return { groups: [], at: null, status: null }; } };
  const writeP = (p, d) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(p), JSON.stringify(d, null, 1)); };
  const read = () => readP(RADAR_PROFILE), write = d => writeP(RADAR_PROFILE, d);
  const running = {};

  function setRadar(id, on) {
    const d = read(), g = d.groups.find(x => x.id === id); if (!g) throw new Error('Không có nhóm này');
    g.radar = !!on; write(d); return d;
  }
  function setRadarTopic(topic, on) {
    const d = read(); for (const g of d.groups) if (g.topic === topic) g.radar = !!on; write(d); return d;
  }

  async function scrape(page) {
    await page.goto('https://www.facebook.com/groups/joins/?nav_source=tab', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.querySelectorAll('[role=main] a[href*="/groups/"]').length > 5, null, { timeout: 30000 });
    return page.evaluate(async () => {
      let last = 0, same = 0;
      for (let i = 0; i < 80 && same < 4; i++) {
        window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 1500));
        const n = document.querySelectorAll('[role=main] a[href*="/groups/"]').length; same = n === last ? same + 1 : 0; last = n;
      }
      const m = new Map();
      for (const a of document.querySelectorAll('[role=main] a[href*="/groups/"]')) {
        const id = (a.href.match(/groups\/([^/?#]+)/) || [])[1], t = (a.innerText || '').trim().split('\n')[0];
        if (!id || /^(feed|discover|joins|create)$/.test(id) || !t || t.length < 3 || /^(Unread|Xem nhóm|View group)/i.test(t) || m.has(id)) continue;
        m.set(id, t);
      }
      return [...m].map(([id, name]) => ({ id, name }));
    });
  }
  function refresh(profile = RADAR_PROFILE) {
    fileOf(profile);
    if (running[profile]) throw new Error('Đang đọc danh sách nhóm, chờ lượt này xong');
    const read = () => readP(profile), write = d => writeP(profile, d);
    running[profile] = (async () => {
      const set = st => { const d = read(); d.status = st; write(d); };
      set({ running: true, at: Date.now(), step: `Đang mở Facebook (${ACCOUNTS[profile]})` });
      let page;
      try {
        page = await focusPage(await (await getContext(profile)).newPage());
        const found = await scrape(page);
        if (found.length < 5) throw new Error(`Đọc được quá ít nhóm, có thể ${ACCOUNTS[profile]} bị đăng xuất`);
        const d = read(), old = new Map(d.groups.map(g => [g.id, g])), now = Date.now();
        d.groups = found.map(f => { const o = old.get(f.id); return o ? { ...o, name: f.name } : { id: f.id, name: f.name, topic: topicOf(f.name), radar: false, added: now }; });
        const gone = [...old.keys()].filter(id => !found.some(f => f.id === id)).length, added = found.filter(f => !old.has(f.id)).length;
        d.at = now; write(d);
        set({ running: false, at: now, ok: true, step: `Đã đọc ${found.length} nhóm${added ? ` · ${added} nhóm mới` : ''}${gone ? ` · ${gone} nhóm đã rời` : ''}` });
      } catch (e) {
        set({ running: false, at: Date.now(), ok: false, step: e.message });
      } finally {
        if (page) await page.close().catch(() => {});
        running[profile] = null;
      }
    })();
    return { ok: true };
  }
  // Đo tương tác: mở trang /about từng nhóm website & AI (giãn cách 8–15 giây như người xem), bỏ qua nhóm đã đo trong 6 ngày (lịch quét hằng tuần vẫn đo lại đủ)
  function measure(profile = 'default', { force = false } = {}) {
    fileOf(profile);
    if (running[profile]) throw new Error('Tài khoản này đang chạy việc khác, chờ xong đã');
    const read = () => readP(profile), write = d => writeP(profile, d);
    const order = { web: 0, agent: 1, ai: 2, jobs: 3, video: 4 };
    const todo = read().groups.filter(g => g.topic !== 'khac' && (force || !g.act?.at || Date.now() - g.act.at > 6 * 864e5 || (g.act.cmt_month == null && !g.act.pending))).sort((a, b) => order[a.topic] - order[b.topic]);
    if (!todo.length) throw new Error('Nhóm nào cũng vừa đo trong 6 ngày qua');
    stopReq[profile] = false; measuring[profile] = true;
    running[profile] = (async () => {
      const set = st => { const d = read(); d.mstatus = st; write(d); };
      let page, ok = 0, err = 0, stop = '', fails = 0;
      // Chrome của nick bị đóng giữa chừng (09/10 1:58 → 377 nhóm lỗi liền) → mở lại tab/Chrome; lỗi 5 nhóm liền thì dừng hẳn
      const openPage = async () => { if (page) await page.close().catch(() => {}); page = await (await getContext(profile)).newPage(); };
      try {
        await openPage();
        for (const [i, g] of todo.entries()) {
          if (fails >= 5) { stop = 'Lỗi 5 nhóm liên tiếp (Chrome bị đóng hoặc mất mạng), đã dừng'; break; }
          if (fails && page.isClosed()) await openPage().catch(() => {});
          if (stopReq[profile]) { stop = 'Đã dừng theo yêu cầu'; break; }
          set({ running: true, at: Date.now(), step: `Đang đo ${i + 1}/${todo.length}: ${g.name}`, done: i, total: todo.length });
          try {
            await page.goto(`https://www.facebook.com/groups/${g.id}/about`, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForFunction(() => /posts? today|bài viết (mới )?hôm nay|isn't available|không xem được/i.test((document.querySelector('[role=main]') || document.body).innerText), null, { timeout: 20000 }).catch(() => {});
            await sleep(1200);
            const text = await page.evaluate(() => (document.querySelector('[role=main]') || document.body).innerText);
            if (/checkpoint/.test(page.url()) || /temporarily blocked|tạm thời bị chặn|you can't use this feature|bạn tạm thời/i.test(text)) { stop = 'Facebook báo tạm chặn, đã dừng để giữ an toàn tài khoản'; break; }
            const a = parseAbout(text), d = read(), gg = d.groups.find(x => x.id === g.id);
            if (gg) { gg.act = { at: Date.now(), ...a, heat: heatOf(a) }; write(d); }
            if (a.cmt_month == null) err++; else ok++;
            fails = 0;
          } catch { err++; fails++; if (page.isClosed() || fails >= 2) await openPage().catch(() => {}); }
          await sleep(8000 + Math.random() * 7000);
        }
      } catch (e) { stop = e.message; } finally {
        if (page) await page.close().catch(() => {});
        stopReq[profile] = false; measuring[profile] = false; running[profile] = null;
        set({ running: false, at: Date.now(), ok: !stop, step: `${stop ? stop + ' · ' : ''}Đã đo ${ok} nhóm${err ? ` · ${err} nhóm không đọc được số liệu` : ''}` });
      }
    })();
    return { ok: true, total: todo.length };
  }
  // cờ dừng chỉ đặt khi đang ĐO (đặt lúc đang đọc danh sách nhóm thì cờ treo lại và chặn lượt đo sau, lỗi 08/10)
  const stopReq = {}, measuring = {};
  function stopMeasure(profile = 'default') { if (measuring[profile]) stopReq[profile] = true; return { ok: true, stopping: !!measuring[profile] }; }
  // đánh dấu đã vào nhóm hôm nay (danh sách việc hằng ngày của FB chính)
  function visit(profile, id, on = true) {
    const d = readP(profile), g = d.groups.find(x => x.id === id); if (!g) throw new Error('Không có nhóm này');
    const t = today(); g.visits = (g.visits || []).filter(x => x !== t); if (on) g.visits.push(t); g.visits = g.visits.slice(-30);
    writeP(profile, d); return get();
  }

  // trả về cả 2 nick; mỗi nhóm có cờ `other` = nick còn lại cũng đã ở nhóm này
  function get() {
    const acc = {};
    for (const p of Object.keys(ACCOUNTS)) {
      const d = readP(p);
      if (d.status?.running && !running[p]) d.status = { ...d.status, running: false, ok: false, step: 'Lượt trước bị ngắt giữa chừng (app khởi động lại)' };
      if (d.mstatus?.running && !running[p]) d.mstatus = { ...d.mstatus, running: false, ok: false, step: 'Lượt đo trước bị ngắt giữa chừng (app khởi động lại), bấm đo tiếp' };
      acc[p] = { name: ACCOUNTS[p], ...d };
    }
    const ids = Object.fromEntries(Object.entries(acc).map(([p, d]) => [p, new Set(d.groups.map(g => g.id))]));
    for (const p of Object.keys(acc)) { const o = Object.keys(acc).find(x => x !== p); for (const g of acc[p].groups) g.other = ids[o].has(g.id); }
    return { accounts: acc, radar_profile: RADAR_PROFILE, topics: TOPICS, today: today() };
  }
  return { get, setRadar, setRadarTopic, refresh, measure, stopMeasure, visit };
}
