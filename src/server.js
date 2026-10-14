import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { spawn as spawnResearch } from 'node:child_process';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { APP_DIR, OUTPUT_DIR, LIBRARY_DIR, RUNS_DIR, PROFILES_DIR, PORT, HOST } from './paths.js';
import { listFlows, getFlow, saveFlow, deleteFlow, summarize } from './flows.js';
import { runFlow, runNodeOnPage, validateFlow, NODE_DOCS } from './engine.js';
import { listProfiles, profileStatus, createProfile, updateProfile, deleteProfile, getWorkPage, closeBrowser, getBrowser, CHROME } from './browser.js';
import { FLOW_GUIDE } from './docs.js';
import { getSettings, saveSettings, rotateApiKey } from './settings.js';
import { listAgents, setAgent } from './agents.js';
import { mountApi, aiModels } from './api_v1.js';
import { createAiNews } from './ainews.js';
import { createFbGroups } from './fbgroups.js';
import { createJoinedGroups } from './joinedgroups.js';
import { createProjects } from './projects.js';
import { createTodoRemind } from './todoremind.js';
import { createPet } from './pet.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ---- đăng nhập: chỉ bật khi đặt HPBFLOW_PASSWORD (bản chạy trên VPS). /api/v1 và /v1 đã có khoá API riêng.
const PASSWORD = process.env.HPBFLOW_PASSWORD || '';
if (PASSWORD) {
  const token = createHmac('sha256', PASSWORD).update('hpb-flow-session').digest('hex');
  const cookieOk = req => {
    const m = /(?:^|;\s*)hpbflow=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    return !!m && timingSafeEqual(Buffer.from(m[1]), Buffer.from(token));
  };
  const loginPage = err => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập · HPB Flow</title><link rel="stylesheet" href="/style.css"></head>
<body style="align-items:center;justify-content:center"><form method="post" action="/login" class="card" style="width:320px;padding:24px">
<h1 style="margin-bottom:4px">HPB Flow</h1><p class="sub">Nhập mật khẩu để vào</p>
${err ? '<p class="chip err" style="margin:0 0 12px">Sai mật khẩu</p>' : ''}
<input type="password" name="password" autofocus required style="margin-bottom:12px"><button class="primary" style="width:100%">Đăng nhập</button></form></body></html>`;
  app.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
    const given = Buffer.from(createHmac('sha256', PASSWORD).update(String(req.body?.password || '')).digest('hex'));
    const want = Buffer.from(createHmac('sha256', PASSWORD).update(PASSWORD).digest('hex'));
    if (!timingSafeEqual(given, want)) { await new Promise(r => setTimeout(r, 1500)); return res.status(401).send(loginPage(true)); }
    res.set('Set-Cookie', `hpbflow=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`).redirect('/');
  });
  app.get('/logout', (req, res) => res.set('Set-Cookie', 'hpbflow=; Path=/; Max-Age=0').redirect('/'));
  app.use((req, res, next) => {
    if (req.path === '/style.css' || req.path.startsWith('/api/v1') || req.path === '/v1' || req.path.startsWith('/v1/') || cookieOk(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    res.status(401).send(loginPage(false));
  });
}

app.use(express.static(path.join(APP_DIR, 'public')));

// ---- lượt chạy: giữ trong bộ nhớ, ghi run.json để xem lại sau khi mở app
const runs = new Map();
const clients = new Set();
const publicRun = ({ resolvePause, controller, ...r }) => r;
const pub = run => { const msg = `data: ${JSON.stringify(publicRun(run))}\n\n`; for (const c of clients) c.write(msg); };
const persist = run => { try { fs.mkdirSync(path.join(RUNS_DIR, run.id), { recursive: true }); fs.writeFileSync(path.join(RUNS_DIR, run.id, 'run.json'), JSON.stringify(publicRun(run))); } catch { /* bỏ qua */ } };
for (const d of fs.readdirSync(RUNS_DIR)) {
  try { const r = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, d, 'run.json'), 'utf8')); if (r.status === 'running' || r.status === 'paused') { r.status = 'error'; r.error = 'App đã tắt khi đang chạy'; } runs.set(r.id, r); } catch { /* không có */ }
}
const wrap = fn => async (req, res) => { try { res.json(await fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); } };

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders(); clients.add(res); req.on('close', () => clients.delete(res));
});

function startRun(flow, vars, { profile, keepTab, stopAfter, source = 'canvas' } = {}) {
  const run = { id: 'run_' + Date.now() + '_' + randomUUID().slice(0, 6), flow_id: flow.id, name: flow.name || flow.id, profile: profile || 'default', source,
    status: 'running', current_node: null, logs: [], shots: [], vars, started: Date.now(), flow_snapshot: flow };
  run.controller = new AbortController();
  runs.set(run.id, run);
  const log = m => { run.logs.push(`${new Date().toLocaleTimeString('vi-VN')} ${m}`); if (run.logs.length > 400) run.logs.splice(0, 100); pub(run); };
  const pause = message => new Promise(resolve => {
    run.status = 'paused'; run.pause_message = message; run.resolvePause = resolve; log('⏸ ' + message);
  }).finally(() => { run.status = 'running'; run.pause_message = null; run.resolvePause = null; pub(run); });
  runFlow(flow, {
    profile, vars, log, pause, keepTab, stopAfter, runId: run.id, signal: run.controller.signal, getFlow,
    shouldFinish: () => run.finishEarly,
    onNode: n => { run.current_node = n.id; (run.trail ||= []).push(n.id); pub(run); },
    emitShot: (file, label) => { run.shots.push({ url: `/api/runs/${run.id}/shot/${path.basename(file)}`, label, node: run.current_node }); pub(run); },
  })
    .then(r => { Object.assign(run, r); log(r.status === 'ok' ? '✅ Xong' : r.status === 'stopped' ? `⏹ Dừng sau node ${r.stopped_at}` : '❌ ' + r.error); })
    .catch(e => { run.status = 'error'; run.error = e.message.split('\n')[0]; run.error_code = 'exception'; log('❌ ' + run.error); })
    .finally(() => { run.ended = Date.now(); run.current_node = null; pub(run); persist(run); });
  return run;
}
async function waitRun(id, seconds) {
  const end = Date.now() + Math.min(seconds || 0, 900) * 1000;
  let r = runs.get(id); if (!r) throw new Error('Không có lượt chạy này');
  while (r.status === 'running' && Date.now() < end) await new Promise(s => setTimeout(s, 1000));
  return publicRun(r);
}

// ---- tổng quan
app.get('/api/overview', wrap(async () => {
  const all = [...runs.values()];
  const today = new Date().setHours(0, 0, 0, 0);
  const flows = listFlows();
  return {
    flows: flows.length, flow_errors: flows.filter(f => f._error || validateFlow(f).errors.length).length,
    profiles: listProfiles().length, runs_total: all.length, runs_today: all.filter(r => r.started >= today).length,
    runs_error: all.filter(r => r.status === 'error').length, media: fs.readdirSync(LIBRARY_DIR).length,
    recent: all.sort((a, b) => b.started - a.started).slice(0, 8).map(({ logs, shots, flow_snapshot, vars, ...r }) => r),
  };
}));

// ---- flows
app.get('/api/flows', wrap(() => listFlows().map(f => ({ ...summarize(f), errors: validateFlow(f).errors.length }))));
app.get('/api/flows/:id', wrap(req => getFlow(req.params.id)));
app.post('/api/flows', wrap(req => saveFlow(req.body.flow || req.body, { overwrite: req.body.overwrite ?? true })));
app.post('/api/flows/validate', wrap(req => validateFlow(req.body.flow || req.body)));
app.post('/api/flows/:id/duplicate', wrap(req => { const f = getFlow(req.params.id); const id = f.id + '-copy'; return saveFlow({ ...f, id, name: (f.name || f.id) + ' (Copy)' }, { overwrite: false }); }));
app.delete('/api/flows/:id', wrap(req => (deleteFlow(req.params.id), { ok: true })));
app.get('/api/nodes', wrap(() => NODE_DOCS));
app.get('/api/guide', wrap(() => ({ guide: FLOW_GUIDE })));

// ---- profiles
app.get('/api/profiles', wrap(() => listProfiles()));
app.get('/api/profiles/status', wrap(() => profileStatus()));
app.post('/api/profiles', wrap(req => createProfile(req.body.name, req.body)));
app.patch('/api/profiles/:name', wrap(req => updateProfile(req.params.name, req.body)));
app.delete('/api/profiles/:name', wrap(async req => (await deleteProfile(req.params.name), { ok: true })));
app.post('/api/profiles/:name/open', wrap(async req => {
  const page = await getWorkPage(req.params.name);
  if (req.body?.url) await page.goto(req.body.url);
  await page.bringToFront(); return { ok: true };
}));
app.post('/api/profiles/:name/close', wrap(async req => ({ closed: await closeBrowser(req.params.name) })));

// ---- runs
app.post('/api/run', wrap(req => {
  const { flow, vars = {}, profile, keep_tab, stop_after, source } = req.body;
  const f = typeof flow === 'string' ? getFlow(flow) : flow;
  if (typeof flow !== 'string') { const { errors } = validateFlow(f); if (errors.length) throw new Error('Flow không hợp lệ:\n- ' + errors.join('\n- ')); }
  return publicRun(startRun(f, vars, { profile, keepTab: keep_tab, stopAfter: stop_after, source: source || (typeof flow === 'string' ? 'canvas' : 'draft') }));
}));
app.get('/api/runs', wrap(req => [...runs.values()].sort((a, b) => b.started - a.started).slice(0, Number(req.query.limit) || 100)
  .map(({ logs, shots, flow_snapshot, vars, ...r }) => ({ ...r, shots: shots?.length || 0 }))));
app.get('/api/runs/:id', wrap(req => { const r = runs.get(req.params.id); if (!r) throw new Error('Không có lượt chạy này'); return publicRun(r); }));
app.post('/api/runs/:id/continue', wrap(req => { runs.get(req.params.id)?.resolvePause?.(); return { ok: true }; }));
app.post('/api/runs/:id/stop', wrap(req => { const r = runs.get(req.params.id); r?.controller?.abort(); r?.resolvePause?.(); return { ok: true }; }));
// Dừng & lấy kết quả: vòng lặp đang chạy thoát sau lượt hiện tại, flow chạy tiếp các bước xuất kết quả
app.post('/api/runs/:id/finish', wrap(req => { const r = runs.get(req.params.id); if (r && r.status !== 'ok' && r.status !== 'error') { r.finishEarly = true; r.finish_requested = true; r.logs.push(`${new Date().toLocaleTimeString('vi-VN')} ⏭ Đã yêu cầu dừng & lấy kết quả — chờ xong lượt hiện tại`); pub(r); } return { ok: !!r }; }));
app.delete('/api/runs/:id', wrap(req => { runs.delete(req.params.id); fs.rmSync(path.join(RUNS_DIR, req.params.id), { recursive: true, force: true }); return { ok: true }; }));
app.get('/api/runs/:id/shot/:file', (req, res) => res.sendFile(path.join(RUNS_DIR, req.params.id, path.basename(req.params.file))));

// ---- tab làm việc (dò trang)
app.post('/api/page/open', wrap(async req => {
  const page = await getWorkPage(req.body.profile);
  await page.goto(req.body.url, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  return { url: page.url(), title: await page.title() };
}));
app.get('/api/page/snapshot', wrap(async req => {
  const page = await getWorkPage(req.query.profile);
  const max = Number(req.query.max) || 30000;
  const aria = await page.locator('body').ariaSnapshot({ timeout: 10000 }).catch(e => 'Lỗi snapshot: ' + e.message);
  const elements = await page.evaluate(() => {
    const out = [];
    const q = 'button, a[href], input, textarea, select, [role=button], [role=textbox], [role=menuitem], [role=option], [role=tab], [contenteditable=true]';
    for (const el of document.querySelectorAll(q)) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const s = [];
      if (el.id && !/^\d|:/.test(el.id)) s.push('#' + CSS.escape(el.id));
      for (const a of ['data-testid', 'data-e2e', 'data-test-id', 'name', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a); if (v) s.push(`${el.tagName.toLowerCase()}[${a}="${v.replace(/"/g, '\\"')}"]`);
      }
      const role = el.getAttribute('role'); if (role && !s.length) s.push(`[role=${role}]`);
      out.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || '').trim().slice(0, 60), selectors: s.slice(0, 3) });
      if (out.length >= 150) break;
    }
    return out;
  }).catch(() => []);
  return { url: page.url(), title: await page.title(), snapshot: aria.slice(0, max), elements };
}));
app.post('/api/page/action', wrap(async req => {
  const { profile, node, action, selector, value, code, keystrokes, url } = req.body;
  const page = await getWorkPage(profile);
  const n = node || ({
    eval: { type: 'eval_js', params: { code } },
    click: { type: 'click', params: { selector } },
    type: { type: 'type', params: { selector, value, mode: keystrokes ? 'keystrokes' : 'auto', delay: keystrokes ? 20 : 0 } },
    key: { type: 'key_press', params: { key: value } },
    scroll: { type: 'scroll', params: { selector, direction: value || 'down', amount: 800 } },
    screenshot: { type: 'screenshot', params: { emit: false } },
    goto: { type: 'goto', params: { url: url || value } },
  })[action];
  if (!n) throw new Error('action phải là eval|click|type|key|scroll|screenshot|goto hoặc truyền node');
  const logs = [];
  let result = await runNodeOnPage(page, { id: 'pa', ...n }, {}, m => logs.push(m));
  if (typeof result === 'string' && result.length > 4000) result = result.slice(0, 4000) + '…(cắt)';
  return { url: page.url(), result, logs };
}));

// ---- thư viện & file
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm)$/i;
app.get('/api/library', wrap(() => fs.readdirSync(LIBRARY_DIR).filter(f => MEDIA.test(f))
  .map(f => { const p = path.join(LIBRARY_DIR, f); const st = fs.statSync(p); return { name: f, path: p, size: st.size, mtime: st.mtimeMs, video: /\.(mp4|webm)$/i.test(f) }; })
  .sort((a, b) => b.mtime - a.mtime)));
app.delete('/api/library/:name', wrap(req => { fs.unlinkSync(path.join(LIBRARY_DIR, path.basename(req.params.name))); return { ok: true }; }));
app.get('/api/file', (req, res) => {
  const p = path.resolve(String(req.query.path || ''));
  if (![LIBRARY_DIR, OUTPUT_DIR, RUNS_DIR].some(d => p.startsWith(d))) return res.status(403).end();
  res.sendFile(p);
});
// ---- bài đăng video tự động (series "Bắt bệnh doanh nghiệp") — đọc meta.json từng tập trong OUTPUT_DIR/video
app.get('/api/posts', wrap(() => {
  // gộp mọi chuyên mục video tự động: mỗi chuyên mục một thư mục trong OUTPUT_DIR, mỗi tập một thư mục có meta.json
  const SERIES = [['video', 'Bắt bệnh doanh nghiệp'], ['ai-news', 'Tin AI dùng ngay']];
  return SERIES.flatMap(([sub, series]) => {
    const base = path.join(OUTPUT_DIR, sub);
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base)
      .map(name => ({ name, dir: path.join(base, name), file: path.join(base, name, 'meta.json') }))
      .filter(x => fs.existsSync(x.file))
      .map(x => { try { return { ...JSON.parse(fs.readFileSync(x.file, 'utf8')), dir: x.dir, series }; } catch { return null; } })
      .filter(Boolean);
  }).sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
}));
const VIDEO_AUTO_DIR = path.join(os.homedir(), 'websites', 'hpb-video-auto');
// YouTube tự đo qua launchd (API chính thức). TikTok phải mở trình duyệt nên KHÔNG chạy lịch (Hưng tắt 08/10/2026),
// chỉ đo khi bấm nút "Cập nhật TikTok" trên trang Bài đăng: chạy ngầm lần lượt 2 chuyên mục, trang tự làm mới thấy số mới.
const AI_NEWS_DIR = path.join(os.homedir(), 'websites', 'hpb-ai-news');
const tiktokJob = { running: false, at: 0, error: '' };
app.get('/api/posts/tiktok', (req, res) => res.json(tiktokJob));
app.post('/api/posts/tiktok', wrap(() => {
  if (tiktokJob.running) return tiktokJob;
  const env = { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${path.join(os.homedir(), '.local/bin')}:${process.env.PATH}` };
  const dirs = [VIDEO_AUTO_DIR, AI_NEWS_DIR].filter(d => fs.existsSync(path.join(d, 'scripts', 'stats.mjs')));
  if (!dirs.length) throw new Error('Không tìm thấy scripts/stats.mjs');
  Object.assign(tiktokJob, { running: true, at: Date.now(), error: '' });
  const errs = [];
  const next = i => {
    if (i >= dirs.length) return Object.assign(tiktokJob, { running: false, at: Date.now(), error: errs.join(' · ') });
    execFile('node', ['scripts/stats.mjs', '--only=tiktok'], { cwd: dirs[i], env, timeout: 300000 }, (err, stdout, stderr) => {
      const skip = /Bỏ qua TikTok:\s*(.*)/.exec(stdout || '');
      if (err || skip) errs.push(`${path.basename(dirs[i])}: ${skip ? skip[1] : (stderr || err.message).trim().split('\n').pop()}`);
      next(i + 1);
    });
  };
  next(0);
  return tiktokJob;
}));
app.post('/api/choose-file', wrap(() => new Promise((resolve, reject) => {
  const kind = 'file';
  const script = `tell application "Finder"\nactivate\nset fs to choose ${kind} with prompt "Chọn file" with multiple selections allowed\nend tell\nset out to ""\nrepeat with f in fs\nset out to out & POSIX path of (f as alias) & linefeed\nend repeat\nreturn out`;
  execFile('osascript', ['-e', script], (err, stdout) => {
    if (err) return /-128/.test(err.message) ? resolve({ paths: [] }) : reject(err);
    resolve({ paths: stdout.split('\n').map(s => s.trim()).filter(Boolean) });
  });
})));
app.post('/api/choose-folder', wrap(() => new Promise((resolve, reject) => {
  const script = 'tell application "Finder"\nactivate\nset f to choose folder with prompt "Chọn thư mục"\nend tell\nreturn POSIX path of f';
  execFile('osascript', ['-e', script], (err, stdout) => {
    if (err) return /-128/.test(err.message) ? resolve({ path: '' }) : reject(err);
    resolve({ path: stdout.trim() });
  });
})));
app.post('/api/open-path', wrap(req => {
  const p = path.resolve(String(req.body.path || OUTPUT_DIR).replace(/^~(?=\/)/, process.env.HOME));
  if (!p.startsWith(process.env.HOME)) throw new Error('Chỉ mở được đường dẫn trong thư mục người dùng');
  execFile('open', [fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : '-R', ...(fs.existsSync(p) && fs.statSync(p).isDirectory() ? [] : [p])]);
  return { ok: true };
}));

// ---- proxy: danh sách proxy đặt tên để gán cho hồ sơ
const PROXIES = path.join(path.dirname(RUNS_DIR), 'proxies.json');
const readProxies = () => { try { return JSON.parse(fs.readFileSync(PROXIES, 'utf8')); } catch { return []; } };
app.get('/api/proxies', wrap(() => readProxies()));
app.post('/api/proxies', wrap(req => {
  const { name, server, username = '', password = '' } = req.body;
  if (!name || !server) throw new Error('Cần tên và địa chỉ host:port');
  const list = readProxies().filter(p => p.name !== name);
  list.push({ name, server, username, password, created: Date.now() });
  fs.writeFileSync(PROXIES, JSON.stringify(list, null, 2));
  return list;
}));
app.delete('/api/proxies/:name', wrap(req => { const list = readProxies().filter(p => p.name !== req.params.name); fs.writeFileSync(PROXIES, JSON.stringify(list, null, 2)); return list; }));

// ---- cài đặt, API, coding agent
// Báo cáo quét nhóm & bình luận Facebook (đọc các file flow ghi ra trong thư mục kết quả)
app.get('/api/reports/fb', wrap(() => {
  const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, f), 'utf8')); } catch { return d; } };
  let sheet = ''; try { sheet = fs.readFileSync(path.join(OUTPUT_DIR, 'sheet-nhat-ky.txt'), 'utf8').trim(); } catch { /* chưa có */ }
  const stats = rd('nhom-thong-ke.json', {});
  const groups = Object.entries(stats).map(([id, h]) => ({ id, name: h.name, lan_quet: h.lan_quet || 0, bai: h.bai || 0, lead_cao: h.lead_cao || 0, lead_tb: h.lead_tb || 0,
    rac: h.bai_quet ? Math.round(h.rac / h.bai_quet * 100) : null, tuong_tac: h.eng_n ? Math.round(h.eng_sum / h.eng_n) : null, lan_cuoi: h.lan_cuoi || '' }));
  return { comments: rd('binh-luan-lich-su.json', []).slice(-500).reverse(), runs: rd('tu-dong-lich-su.json', []).slice(-300).reverse(), groups, sheet };
}));
// ---- Nghiên cứu nội dung: số liệu thật YouTube/TikTok + kênh mình + kết luận Claude.
// Thu thập/phân tích nằm ở ~/websites/hpb-ai-news/scripts/research.mjs, ghi ra OUTPUT_DIR/research/*.json; app chỉ đọc + bấm chạy.
const RESEARCH_DIR = path.join(OUTPUT_DIR, 'research'), RESEARCH_SCRIPT = path.join(os.homedir(), 'websites', 'hpb-ai-news', 'scripts', 'research.mjs');
const readRes = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf8')); } catch { return d; } };
app.get('/api/research', wrap(() => {
  let history = []; try { history = fs.readdirSync(path.join(RESEARCH_DIR, 'history')).filter(f => f.endsWith('.json')).sort().reverse(); } catch { /* chưa có */ }
  return { data: readRes('latest.json', null), status: readRes('status.json', null), history, available: fs.existsSync(RESEARCH_SCRIPT) };
}));
app.post('/api/research/run', wrap(() => {
  const st = readRes('status.json', null);
  if (st?.running && Date.now() - new Date(st.at) < 30 * 60e3) throw new Error('Đang nghiên cứu, chờ lượt này xong');
  if (!fs.existsSync(RESEARCH_SCRIPT)) throw new Error('Không thấy ' + RESEARCH_SCRIPT);
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  const logFd = fs.openSync(path.join(RESEARCH_DIR, 'run.log'), 'a');
  spawnResearch(process.execPath, [RESEARCH_SCRIPT], { cwd: path.dirname(path.dirname(RESEARCH_SCRIPT)), stdio: ['ignore', logFd, logFd], detached: true }).unref();
  return { ok: true };
}));
// ---- Tin tức & video AI: chỉ cập nhật khi người dùng bấm làm mới
const aiNews = createAiNews(path.join(OUTPUT_DIR, 'ainews'));
app.get('/api/ainews', wrap(() => aiNews.get()));
app.post('/api/ainews/refresh', wrap(() => aiNews.refresh()));
// ---- Nhóm Facebook làm admin: danh sách + số liệu đọc từ trang quản trị nhóm (bấm cập nhật mới đọc)
const fbGroups = createFbGroups(path.join(path.dirname(RUNS_DIR), 'fb-groups.json'));
app.get('/api/fbgroups', wrap(() => fbGroups.get()));
app.post('/api/fbgroups', wrap(req => fbGroups.add(req.body)));
app.patch('/api/fbgroups/:id', wrap(req => fbGroups.update(req.params.id, req.body)));
app.delete('/api/fbgroups/:id', wrap(req => fbGroups.remove(req.params.id)));
app.post('/api/fbgroups/refresh', wrap(req => fbGroups.refresh(req.body?.id)));
// ---- Nhóm đã tham gia của FB chính / FB phụ (khối trong Radar): bật radar (chỉ FB phụ) thì flow fb-quet-lead-nhom quét thêm nhóm đó
const joined = createJoinedGroups(path.join(OUTPUT_DIR, 'nhom-fb'));
app.get('/api/joined-groups', wrap(() => joined.get()));
app.patch('/api/joined-groups/:id', wrap(req => { joined.setRadar(req.params.id, req.body?.radar); return joined.get(); }));
app.post('/api/joined-groups/topic', wrap(req => { joined.setRadarTopic(req.body?.topic, req.body?.radar); return joined.get(); }));
app.post('/api/joined-groups/refresh', wrap(req => joined.refresh(req.body?.profile)));
app.post('/api/joined-groups/measure', wrap(req => joined.measure(req.body?.profile, { force: !!req.body?.force })));
app.post('/api/joined-groups/measure/stop', wrap(req => joined.stopMeasure(req.body?.profile)));
app.post('/api/joined-groups/visit', wrap(req => joined.visit(req.body?.profile || 'default', req.body?.id, req.body?.on !== false)));
// ---- việc cần làm mỗi ngày (to-do): lưu file todos.json trong thư mục dữ liệu của app
const TODOS = path.join(path.dirname(RUNS_DIR), 'todos.json');
const readTodos = () => { try { return JSON.parse(fs.readFileSync(TODOS, 'utf8')); } catch { return []; } };
const writeTodos = list => fs.writeFileSync(TODOS, JSON.stringify(list, null, 1));
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
app.get('/api/todos', wrap(req => {
  const all = readTodos(), day = isDay(req.query.date) ? req.query.date : null;
  if (!day) return all;
  // việc chưa xong của các ngày trước (để chuyển sang hôm nay)
  return { items: all.filter(t => t.date === day), overdue: all.filter(t => !t.done && t.date < day) };
}));
app.post('/api/todos', wrap(req => {
  const text = String(req.body.text || '').trim(); if (!text) throw new Error('Nhập nội dung việc cần làm');
  if (!isDay(req.body.date)) throw new Error('Thiếu ngày');
  const list = readTodos(), t = { id: 't' + Date.now().toString(36) + randomUUID().slice(0, 4), date: req.body.date, text: text.slice(0, 500), done: false, star: !!req.body.star, prio: [1, 2, 3, 4].includes(+req.body.prio) ? +req.body.prio : 4, note: String(req.body.note || '').trim().slice(0, 1000), remind: remindOf(req.body.remind), created: Date.now() };
  list.push(t); writeTodos(list); return t;
}));
app.patch('/api/todos/:id', wrap(req => {
  const list = readTodos(), t = list.find(x => x.id === req.params.id); if (!t) throw new Error('Không có việc này');
  if ('done' in req.body) { t.done = !!req.body.done; t.doneAt = t.done ? Date.now() : null; }
  if ('star' in req.body) t.star = !!req.body.star;
  if ([1, 2, 3, 4].includes(+req.body.prio)) { t.prio = +req.body.prio; t.star = false; }
  if ('note' in req.body) t.note = String(req.body.note || '').trim().slice(0, 1000);
  if ('text' in req.body && String(req.body.text).trim()) t.text = String(req.body.text).trim().slice(0, 500);
  if ('date' in req.body && isDay(req.body.date)) t.date = req.body.date;
  if ('remind' in req.body) { t.remind = remindOf(req.body.remind); delete t.snooze; }
  writeTodos(list);
  // việc thêm từ gợi ý dự án: tích xong/bỏ tích → đổi cột task trên panel (chạy nền, lỗi ghi vào t.syncErr)
  if ('done' in req.body && t.src?.tid) projects.setDone(t.src.tid, t.done).then(() => { const l = readTodos(), x = l.find(y => y.id === t.id); if (x && x.syncErr) { delete x.syncErr; writeTodos(l); } })
    .catch(e => { const l = readTodos(), x = l.find(y => y.id === t.id); if (x) { x.syncErr = e.message; writeTodos(l); } });
  return t;
}));
// giờ nhắc "HH:MM" (rỗng = không nhắc); đổi giờ/ngày thì được nhắc lại
const remindOf = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
const todoRemind = createTodoRemind({ file: TODOS, readTodos, writeTodos, port: PORT });
createPet({ dataDir: path.dirname(RUNS_DIR) })(app);
app.get('/api/todos/remind', wrap(() => todoRemind.getCfg()));
app.post('/api/todos/remind', wrap(req => todoRemind.setCfg(req.body || {})));
app.post('/api/todos/remind/test', wrap(() => todoRemind.test()));
app.post('/api/todos/remind/preview', wrap(() => todoRemind.preview()));
// ---- Gợi ý việc từ dự án trên panel (mục "Gợi ý từ dự án" ở trang Việc hôm nay)
const projects = createProjects(path.join(path.dirname(RUNS_DIR), 'du-an-goi-y.json'));
app.get('/api/project-suggest', wrap(async req => { const d = isDay(req.query.date) ? req.query.date : new Date().toLocaleDateString('sv-SE'); const l = readTodos(); return projects.suggest(d, l, writeTodos, { force: req.query.force === '1' }); }));
app.post('/api/project-suggest/add', wrap(async req => {
  const { key, date } = req.body || {}; if (!isDay(date)) throw new Error('Thiếu ngày');
  const s = await projects.findSuggestion(date, key); if (!s) throw new Error('Gợi ý không còn trên panel, bấm làm mới');
  const list = readTodos();
  if (list.some(t => t.src?.key === key && !t.done)) throw new Error('Việc này đã có trong danh sách');
  const t = { id: 't' + Date.now().toString(36) + randomUUID().slice(0, 4), date, text: `${s.text} — ${s.du_an}`.slice(0, 500), done: false, star: false, prio: s.prio,
    note: [s.why, s.khach && 'Khách: ' + s.khach, s.note].filter(Boolean).join(' · ').slice(0, 1000), remind: '', created: Date.now(), src: { from: 'panel', key, pid: s.pid, tid: s.tid, du_an: s.du_an } };
  list.push(t); writeTodos(list); return t;
}));
app.post('/api/project-suggest/dismiss', wrap(req => { const { key, date } = req.body || {}; if (!isDay(date) || !key) throw new Error('Thiếu dữ liệu'); projects.dismiss(date, key); return { ok: true }; }));
app.post('/api/project-suggest/undismiss', wrap(req => { if (!isDay(req.body?.date)) throw new Error('Thiếu ngày'); projects.undismiss(req.body.date); return { ok: true }; }));
app.delete('/api/todos/:id', wrap(req => { writeTodos(readTodos().filter(x => x.id !== req.params.id)); return { ok: true }; }));
app.get('/api/settings', wrap(() => ({ ...getSettings(), output_dir: OUTPUT_DIR, profiles_dir: PROFILES_DIR })));
app.post('/api/settings', wrap(req => saveSettings(req.body)));
app.post('/api/settings/rotate-key', wrap(() => rotateApiKey()));
app.get('/api/ai-models', wrap(() => aiModels()));
app.get('/api/agents', wrap(() => listAgents()));
app.post('/api/agents/:id', wrap(req => setAgent(req.params.id, !!req.body.enabled)));
app.get('/api/engines', wrap(async () => {
  const chrome = fs.existsSync(CHROME);
  return [
    { id: 'chrome-cdp', name: 'Chrome CDP', vendor: 'Google Chrome', status: chrome ? 'ready' : 'missing', recommended: true, desc: 'Điều khiển Chrome sẵn có trên máy qua cổng gỡ lỗi. Mỗi profile một cửa sổ, phiên đăng nhập riêng, có thể gắn proxy.' },
    { id: 'cloak', name: 'CloakBrowser', vendor: 'CloakBrowser', status: 'unavailable', desc: 'Chromium vá fingerprint. Bản Mac không hỗ trợ — flow khai engine "cloak" tự chạy bằng Chrome CDP.' },
    { id: 'adspower', name: 'AdsPower', vendor: 'AdsPower', status: 'unavailable', desc: 'Trình duyệt ẩn danh remote. Không hỗ trợ trên bản Mac.' },
    { id: 'gologin', name: 'GoLogin', vendor: 'GoLogin', status: 'unavailable', desc: 'Không hỗ trợ trên bản Mac.' },
    { id: 'multilogin', name: 'Multilogin', vendor: 'Multilogin', status: 'unavailable', desc: 'Không hỗ trợ trên bản Mac.' },
  ];
}));

mountApi(app, { startRun, waitRun });

// JSON hỏng từ client: trả 400 gọn, không in cả trang stack vào log
app.use((err, req, res, next) => { if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' }); next(err); });

// lưới an toàn: một lỗi lạ trong callback/promise chỉ ghi log, không làm sập cả server (app Mac sẽ phải khởi động lại)
const stamp = () => new Date().toLocaleString('vi-VN');
process.on('uncaughtException', e => console.error(`[${stamp()}] lỗi chưa bắt:`, e?.stack || e));
process.on('unhandledRejection', e => console.error(`[${stamp()}] promise lỗi:`, e?.stack || e));

const server = app.listen(PORT, HOST, () => console.log(`[${stamp()}] HPB Flow đang chạy: http://${HOST}:${PORT}${PASSWORD ? ' (có mật khẩu)' : ''}`));
// cổng bị chiếm (server cũ còn treo): thoát hẳn với mã 98 để app Mac dọn tiến trình cũ rồi chạy lại
server.on('error', e => { console.error(`[${stamp()}] không mở được cổng ${PORT}:`, e.code || e.message); process.exit(e.code === 'EADDRINUSE' ? 98 : 1); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { server.close(); process.exit(0); });
