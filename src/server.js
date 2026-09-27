import express from 'express';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { APP_DIR, OUTPUT_DIR, PORT } from './paths.js';
import { listFlows, getFlow, saveFlow, deleteFlow } from './flows.js';
import { runFlow, runStepOnPage, STEP_TYPES } from './engine.js';
import { listProfiles, createProfile, getWorkPage } from './browser.js';
import { STEP_DOCS } from './docs.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(APP_DIR, 'public')));

const runs = new Map();
const clients = new Set();
const pub = run => {
  const { resolvePause, controller, ...data } = run;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
};
const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); }
};

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

app.get('/api/flows', wrap(() => listFlows().map(({ steps, ...f }) => ({ ...f, step_count: steps?.length || 0 }))));
app.get('/api/flows/:name', wrap(req => getFlow(req.params.name)));
app.post('/api/flows', wrap(req => ({ saved: saveFlow(req.body) })));
app.delete('/api/flows/:name', wrap(req => (deleteFlow(req.params.name), { ok: true })));
app.get('/api/steps', wrap(() => ({ types: STEP_TYPES, docs: STEP_DOCS })));

app.get('/api/profiles', wrap(() => listProfiles()));
app.post('/api/profiles', wrap(req => createProfile(req.body.name, req.body.note)));
app.post('/api/profiles/:name/open', wrap(async req => {
  const page = await getWorkPage(req.params.name);
  if (req.body?.url) await page.goto(req.body.url);
  await page.bringToFront();
  return { ok: true };
}));

function startRun(flow, inputs, profile) {
  const run = { id: randomUUID().slice(0, 8), flow: flow.name, title: flow.title || flow.name, status: 'running', logs: [], started: Date.now(), files: [] };
  run.controller = new AbortController();
  runs.set(run.id, run);
  const log = m => { run.logs.push(`${new Date().toLocaleTimeString('vi-VN')} ${m}`); pub(run); };
  const pause = message => new Promise(resolve => {
    run.status = 'paused'; run.pauseMessage = message; run.resolvePause = resolve; log('⏸ ' + message);
  }).finally(() => { run.status = 'running'; run.pauseMessage = null; run.resolvePause = null; pub(run); });
  runFlow(flow, inputs, { profile, log, pause, signal: run.controller.signal })
    .then(r => { Object.assign(run, { status: 'done', result: r.result, files: r.files }); log('✅ Xong'); })
    .catch(e => { run.status = 'error'; run.error = e.message.split('\n')[0]; log('❌ ' + run.error); })
    .finally(() => { run.ended = Date.now(); pub(run); });
  return run;
}

app.post('/api/run', wrap(req => {
  const { flow, inputs = {}, profile } = req.body;
  const f = typeof flow === 'string' ? getFlow(flow) : flow;
  const { resolvePause, controller, ...data } = startRun(f, inputs, profile);
  return data;
}));
app.get('/api/runs', wrap(() => [...runs.values()].reverse().slice(0, 30).map(({ resolvePause, controller, ...r }) => r)));
app.get('/api/runs/:id', wrap(req => {
  const r = runs.get(req.params.id); if (!r) throw new Error('Không có lượt chạy này');
  const { resolvePause, controller, ...data } = r; return data;
}));
app.post('/api/runs/:id/continue', wrap(req => { runs.get(req.params.id)?.resolvePause?.(); return { ok: true }; }));
app.post('/api/runs/:id/stop', wrap(req => {
  const r = runs.get(req.params.id); r?.controller.abort(); r?.resolvePause?.(); return { ok: true };
}));

// Thao tác tay trên một tab làm việc — dùng cho MCP khi Claude dò trang trước khi viết flow
app.post('/api/page/open', wrap(async req => {
  const page = await getWorkPage(req.body.profile);
  await page.goto(req.body.url, { waitUntil: 'domcontentloaded' });
  return { url: page.url(), title: await page.title() };
}));
app.get('/api/page/snapshot', wrap(async req => {
  const page = await getWorkPage(req.query.profile);
  const snap = await page.locator('body').ariaSnapshot({ timeout: 10000 }).catch(e => 'Lỗi snapshot: ' + e.message);
  return { url: page.url(), title: await page.title(), snapshot: snap.slice(0, Number(req.query.max) || 30000) };
}));
app.post('/api/page/action', wrap(async req => {
  const { profile, step } = req.body;
  const page = await getWorkPage(profile);
  const logs = [];
  const value = await runStepOnPage(page, step, m => logs.push(m));
  return { url: page.url(), value, logs };
}));

// Hộp thoại chọn file của macOS, trả về đường dẫn thật để flow tải lên
app.post('/api/choose-file', wrap(() => new Promise((resolve, reject) => {
  const script = 'tell application "Finder"\nactivate\nset fs to choose file with prompt "Chọn file" with multiple selections allowed\nend tell\nset out to ""\nrepeat with f in fs\nset out to out & POSIX path of (f as alias) & linefeed\nend repeat\nreturn out';
  execFile('osascript', ['-e', script], (err, stdout) => {
    if (err) return /-128/.test(err.message) ? resolve({ paths: [] }) : reject(err);
    resolve({ paths: stdout.split('\n').map(s => s.trim()).filter(Boolean) });
  });
})));

app.post('/api/open-output', wrap(() => (execFile('open', [OUTPUT_DIR]), { ok: true })));
app.post('/api/open-file', wrap(req => {
  if (!String(req.body.path).startsWith(OUTPUT_DIR)) throw new Error('Chỉ mở file trong thư mục kết quả');
  execFile('open', ['-R', req.body.path]); return { ok: true };
}));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`GaBee Mac đang chạy: http://127.0.0.1:${PORT}`);
});
