// Trình chạy flow: flow = { name, title, description, profile?, inputs: [...], steps: [...] }
// Mỗi step có "type" và tham số riêng; chuỗi được thay biến {{inputs.x}}, {{vars.y}}, {{item}}, {{index}}, {{now}}.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { getContext } from './browser.js';
import { OUTPUT_DIR } from './paths.js';

const stamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function lookup(expr, scope) {
  return expr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
}

export function render(val, scope) {
  if (typeof val === 'string') {
    const whole = val.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (whole) return lookup(whole[1], scope);
    return val.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, e) => {
      const v = lookup(e, scope);
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(val)) return val.map(v => render(v, scope));
  if (val && typeof val === 'object') {
    // steps lồng trong for_each được render lúc chạy từng vòng
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, k === 'steps' || k === 'collect' ? v : render(v, scope)]));
  }
  return val;
}

const truthy = v => !(v == null || v === '' || v === false || v === 'false' || v === '0' || (Array.isArray(v) && !v.length));

function toList(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return String(v).split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
}

// selector có thể là chuỗi hoặc mảng các phương án dự phòng; trả về locator đầu tiên hiện ra
async function resolve(page, selector, timeout) {
  const list = Array.isArray(selector) ? selector : [selector];
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const s of list) {
      const loc = page.locator(s).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`Không thấy phần tử: ${list.join(' | ')}`);
}

function outFile(name, ext) {
  const base = (name || 'ket-qua').replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const file = base.includes('.') ? base : `${base}-${stamp()}.${ext}`;
  return path.join(OUTPUT_DIR, file);
}

async function saveBuffer(buf, filename, ext) {
  const f = outFile(filename, ext);
  fs.writeFileSync(f, buf);
  return f;
}

async function download(page, url, filename) {
  let ext = (url.match(/\.(png|jpe?g|webp|gif|mp4|webm)(\?|$)/i) || [])[1] || '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const b64 = await page.evaluate(async u => {
      const r = await fetch(u); const b = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    }, url);
    const [, mime, data] = b64.match(/^data:([^;]+);base64,(.*)$/);
    return saveBuffer(Buffer.from(data, 'base64'), filename, ext || mime.split('/')[1]);
  }
  const res = await page.context().request.get(url, { headers: { referer: page.url() } });
  if (!res.ok()) throw new Error(`Tải thất bại (${res.status()}): ${url}`);
  const mime = res.headers()['content-type'] || '';
  return saveBuffer(await res.body(), filename, ext || (mime.split('/')[1] || 'bin').split(';')[0]);
}

async function saveExcel(rows, filename) {
  rows = Array.isArray(rows) ? rows : [rows];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  const cols = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
  ws.columns = cols.map(c => ({ header: c, key: c, width: Math.min(60, Math.max(12, c.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(Object.fromEntries(cols.map(c => [c, typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]])));
  const f = outFile(filename, 'xlsx');
  await wb.xlsx.writeFile(f);
  return f;
}

const STEPS = {
  async goto(s, { page }) { await page.goto(s.url, { waitUntil: s.wait_until || 'domcontentloaded', timeout: s.timeout || 60000 }); return page.url(); },
  async click(s, { page }) { const l = await resolve(page, s.selector, s.timeout || 15000); await l.click({ force: !!s.force }); },
  async type(s, { page }) {
    if (s.selector) { const l = await resolve(page, s.selector, s.timeout || 15000); await l.click(); }
    // gõ từng dòng, xuống dòng bằng Shift+Enter để không gửi tin nhắn giữa chừng
    const lines = String(s.text ?? '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i) await page.keyboard.press(s.newline_key || 'Shift+Enter');
      if (lines[i]) await page.keyboard.insertText(lines[i]);
    }
  },
  async fill(s, { page }) { const l = await resolve(page, s.selector, s.timeout || 15000); await l.fill(String(s.text ?? '')); },
  async press(s, { page }) {
    if (s.selector) await (await resolve(page, s.selector, s.timeout || 15000)).press(s.key);
    else await page.keyboard.press(s.key);
  },
  async sleep(s, { page }) { await page.waitForTimeout(Math.min(Number(s.ms) || 1000, 10000)); },
  async wait_for(s, { page }) {
    const timeout = s.timeout || 30000;
    if (s.selector && s.state === 'hidden') {
      for (const sel of [].concat(s.selector)) await page.locator(sel).first().waitFor({ state: 'hidden', timeout });
      return;
    }
    if (s.selector) return void await resolve(page, s.selector, timeout);
    if (s.text) return void await page.getByText(s.text).first().waitFor({ timeout });
    if (s.url_includes) return void await page.waitForURL(u => u.href.includes(s.url_includes), { timeout });
    if (s.count_gt) {
      const { selector, value } = s.count_gt;
      await page.waitForFunction(([sel, v]) => document.querySelectorAll(sel).length > v, [selector, Number(value) || 0], { timeout, polling: 1000 });
      return;
    }
    throw new Error('wait_for cần selector | text | url_includes | count_gt');
  },
  async count(s, { page }) { return page.locator(s.selector).count(); },
  async upload(s, { page }) {
    const files = toList(s.files).map(f => f.replace(/^~(?=\/)/, process.env.HOME));
    if (!files.length) return;
    for (const f of files) if (!fs.existsSync(f)) throw new Error('Không có file: ' + f);
    const sels = Array.isArray(s.selector) ? s.selector : [s.selector];
    for (const sel of sels) {
      const input = page.locator(sel).first();
      if (await input.count()) { await input.setInputFiles(files); return files; }
    }
    throw new Error('Không thấy ô chọn file');
  },
  async extract(s, { page }) {
    if (s.fields) {
      return page.$$eval(s.selector, (els, fields) => els.map(el => Object.fromEntries(Object.entries(fields).map(([k, f]) => {
        const t = f.selector ? el.querySelector(f.selector) : el;
        return [k, t ? (f.attr ? t.getAttribute(f.attr) : t.innerText.trim()) : ''];
      }))), s.fields);
    }
    const all = await page.$$eval(s.selector, (els, attr) => els.map(e => attr ? e.getAttribute(attr) : e.innerText.trim()), s.attr);
    return s.all ? all : all[s.index ?? 0];
  },
  async eval(s, { page }) { return page.evaluate(new Function('args', s.script), s.args ?? null); },
  async scroll(s, { page }) {
    for (let i = 0; i < (Number(s.times) || 5); i++) {
      if (s.target_selector) await page.evaluate(sel => { const els = document.querySelectorAll(sel); els[els.length - 1]?.scrollIntoView(); }, s.target_selector);
      else await page.mouse.wheel(0, s.distance || 1500);
      await page.waitForTimeout(s.delay || 1500);
    }
  },
  // Cuộn trang và gom dữ liệu JSON từ các request mạng có URL chứa url_includes
  async collect_responses(s, { page, log }) {
    const pick = new Function('json', s.pick || 'return json;');
    const max = Number(s.max) || 500;
    const out = []; const seen = new Set();
    const onRes = async res => {
      if (!res.url().includes(s.url_includes)) return;
      try {
        const rows = [].concat(pick(await res.json()) || []);
        for (const r of rows) { const k = JSON.stringify(r); if (!seen.has(k)) { seen.add(k); out.push(r); } }
      } catch { /* không phải JSON */ }
    };
    page.on('response', onRes);
    try {
      if (s.url) await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(s.first_wait || 4000);
      // chỉ bấm mở khung dữ liệu khi trang chưa tự tải gì
      if (s.trigger_selector && !out.length) {
        const l = await resolve(page, s.trigger_selector, 10000).catch(() => null);
        if (l) await l.click();
      }
      let idle = 0, last = -1;
      for (let i = 0; i < (Number(s.times) || 30) && out.length < max; i++) {
        if (s.scroll_selector) {
          await page.evaluate(sel => { const els = document.querySelectorAll(sel); els[els.length - 1]?.scrollIntoView(); }, s.scroll_selector);
        } else await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(s.delay || 1500);
        if (out.length === last) { if (++idle >= (s.idle_stop || 4)) break; } else idle = 0;
        last = out.length;
        log(`  đã gom ${out.length} dòng`);
      }
    } finally { page.off('response', onRes); }
    return out.slice(0, max);
  },
  async download(s, { page }) {
    let url = s.url;
    if (!url && s.selector) {
      const l = await resolve(page, s.selector, s.timeout || 15000);
      url = await l.evaluate(el => el.currentSrc || el.src || el.querySelector('source')?.src || el.href);
    }
    if (!url) throw new Error('download cần url hoặc selector');
    return download(page, url, s.filename);
  },
  async screenshot(s, { page }) { return saveBuffer(await page.screenshot({ fullPage: !!s.full_page }), s.filename || 'screenshot', 'png'); },
  async save_excel(s) { return saveExcel(s.data, s.filename); },
  async save_json(s) { const f = outFile(s.filename, 'json'); fs.writeFileSync(f, JSON.stringify(s.data, null, 2)); return f; },
  async human_pause(s, { pause }) { await pause(s.message || 'Bấm Tiếp tục để chạy tiếp'); },
  async log(s, { log }) { log(String(s.message)); },
  async set(s) { return s.value; },
  async return(s, ctx) { ctx.result = s.value; return s.value; },
  async for_each(s, ctx) {
    const items = toList(s.items); const results = [];
    for (let i = 0; i < items.length; i++) {
      ctx.log(`— vòng ${i + 1}/${items.length}`);
      ctx.scope.item = items[i]; ctx.scope.index = i;
      await runSteps(s.steps, ctx);
      if (s.collect) results.push(render(s.collect, ctx.scope));
    }
    return results;
  },
};

export const STEP_TYPES = Object.keys(STEPS);

async function runSteps(steps, ctx) {
  for (const raw of steps) {
    if (ctx.signal?.aborted) throw new Error('Đã dừng');
    const s = render(raw, ctx.scope);
    if ('when' in raw && !truthy(s.when)) continue;
    const fn = STEPS[s.type];
    if (!fn) throw new Error('Step không hỗ trợ: ' + s.type);
    ctx.log(`▶ ${s.type}${s.label ? ' · ' + s.label : ''}`);
    try {
      const v = await fn(s, ctx);
      ctx.scope.vars[s.save_as || '_'] = v;
      if (typeof v === 'string' && v.startsWith(OUTPUT_DIR)) { ctx.files.push(v); ctx.log('  đã lưu ' + v); }
    } catch (e) {
      if (s.optional) { ctx.log(`  (bỏ qua) ${e.message.split('\n')[0]}`); continue; }
      throw e;
    }
  }
}

// Chạy một step lẻ trên tab có sẵn (không đóng tab), dùng khi dò trang
export async function runStepOnPage(page, step, log = () => {}) {
  if (step.type === 'human_pause' || step.type === 'for_each') throw new Error('Step này chỉ dùng trong flow');
  const ctx = { page, scope: { inputs: {}, vars: {}, now: stamp() }, log, files: [], pause: async () => {} };
  await runSteps([step], ctx);
  return ctx.files.length ? ctx.files : ctx.scope.vars[step.save_as || '_'];
}

export function validateFlow(flow) {
  const errs = [];
  if (!flow || typeof flow !== 'object') return ['Flow phải là object JSON'];
  if (!/^[a-z0-9-]+$/.test(flow.name || '')) errs.push('name chỉ gồm a-z, 0-9, dấu gạch ngang');
  if (!Array.isArray(flow.steps) || !flow.steps.length) errs.push('steps phải là mảng không rỗng');
  const walk = (steps, p) => steps?.forEach((s, i) => {
    if (!STEPS[s.type]) errs.push(`${p}[${i}]: type "${s.type}" không hợp lệ`);
    if (s.type === 'for_each') walk(s.steps, `${p}[${i}].steps`);
  });
  walk(flow.steps, 'steps');
  return errs;
}

export async function runFlow(flow, inputs = {}, { profile, log = console.log, pause, signal } = {}) {
  const defaults = Object.fromEntries((flow.inputs || []).map(i => [i.name, i.default ?? '']));
  const scope = { inputs: { ...defaults, ...inputs }, vars: {}, now: stamp() };
  for (const i of flow.inputs || []) if (i.required && !truthy(scope.inputs[i.name])) throw new Error(`Thiếu đầu vào: ${i.label || i.name}`);
  const context = await getContext(profile || flow.profile || 'default');
  const page = await context.newPage();
  const ctx = { page, scope, log, signal, files: [], result: undefined, pause: pause || (async () => {}) };
  try {
    await runSteps(flow.steps, ctx);
    return { ok: true, result: ctx.result ?? scope.vars, files: ctx.files };
  } finally {
    if (!flow.keep_open) await page.close().catch(() => {});
  }
}
