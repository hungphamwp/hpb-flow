// Các loại node của flow, cùng tên và tham số với flow bản gốc.
// Mỗi hàm nhận (p = params đã thay biến, node, ctx) và trả về giá trị; giá trị được ghi vào vars[p.output_var] nếu có.
// Trả về { __goto: id } để rẽ nhánh, { __end: true, output } để kết thúc flow.
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { LIBRARY_DIR, OUTPUT_DIR, resolvePath } from './paths.js';
import { truthy, evalCondition } from './template.js';
import { focusPage } from './browser.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const stamp = () => {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
};
const withTimeout = (promise, ms, what) => Promise.race([
  promise, sleep(ms).then(() => { throw new Error(`${what} quá ${ms}ms`); }),
]);

// Selector có thể là mảng dự phòng: thử lần lượt, lấy cái đầu tiên hiện ra
async function find(page, selector, timeout = 15000, state = 'visible') {
  const sels = list(selector).filter(Boolean);
  if (!sels.length) throw new Error('Thiếu selector');
  const deadline = Date.now() + timeout;
  do {
    for (const s of sels) {
      const loc = page.locator(s).first();
      const ok = state === 'attached' ? (await loc.count().catch(() => 0)) > 0 : await loc.isVisible().catch(() => false);
      if (ok) return loc;
    }
    await sleep(250);
  } while (Date.now() < deadline);
  throw new Error(`ELEMENT_NOT_FOUND: ${sels.join(' | ')}`);
}

// Phím kiểu "ctrl+a", "Escape" → tên phím Playwright; trên Mac ctrl+chữ cái = Cmd+chữ cái
function normalizeKey(k) {
  const parts = String(k).split('+').map(s => s.trim()).filter(Boolean);
  const key = parts.pop();
  const mods = parts.map(m => ({ ctrl: process.platform === 'darwin' && key.length === 1 ? 'Meta' : 'Control', control: 'Control', shift: 'Shift', alt: 'Alt', option: 'Alt', meta: 'Meta', cmd: 'Meta', command: 'Meta' })[m.toLowerCase()] || m);
  const named = key.length === 1 ? key : key[0].toUpperCase() + key.slice(1);
  return [...mods, named].join('+');
}

async function fetchToBuffer(page, url) {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const dataUrl = await page.evaluate(async u => {
      const b = await (await fetch(u)).blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    }, url);
    const [, mime, data] = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    return { buf: Buffer.from(data, 'base64'), mime };
  }
  // ưu tiên tải từ trong trang (mang cookie, cùng origin), lỗi thì tải bằng context
  try {
    const dataUrl = await page.evaluate(async u => {
      const r = await fetch(u); if (!r.ok) throw new Error(r.status);
      const b = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    }, url);
    const [, mime, data] = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    return { buf: Buffer.from(data, 'base64'), mime };
  } catch {
    const res = await page.context().request.get(url, { headers: { referer: page.url() } });
    if (!res.ok()) throw new Error(`Tải thất bại (${res.status()}): ${url}`);
    return { buf: await res.body(), mime: (res.headers()['content-type'] || '').split(';')[0] };
  }
}
const extOf = (url, mime) => (url.match(/\.(png|jpe?g|webp|gif|mp4|webm|pdf|txt|json|csv)(\?|$)/i) || [])[1] || ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' })[mime] || 'bin';

// Chuyển innerHTML của khối trả lời sang markdown (chạy trong trang)
const HTML_TO_MD = `(function(root){
  function esc(s){ return s.replace(/\\s+/g,' '); }
  function walk(n){
    if (n.nodeType === 3) return esc(n.nodeValue);
    if (n.nodeType !== 1) return '';
    var t = n.tagName.toLowerCase(), c = function(){ return [].map.call(n.childNodes, walk).join(''); };
    if (/^h[1-6]$/.test(t)) return '\\n' + '#'.repeat(+t[1]) + ' ' + c().trim() + '\\n\\n';
    if (t === 'p') return c().trim() + '\\n\\n';
    if (t === 'br') return '\\n';
    if (t === 'strong' || t === 'b') return '**' + c().trim() + '**';
    if (t === 'em' || t === 'i') return '_' + c().trim() + '_';
    if (t === 'code' && n.parentElement.tagName !== 'PRE') return '\`' + n.textContent + '\`';
    if (t === 'pre') { var code = n.querySelector('code'); var lang = ((code && code.className.match(/language-([\\w-]+)/)) || [])[1] || ''; return '\\n\`\`\`' + lang + '\\n' + (code || n).textContent.replace(/\\n$/,'') + '\\n\`\`\`\\n\\n'; }
    if (t === 'a') return '[' + c().trim() + '](' + (n.getAttribute('href') || '') + ')';
    if (t === 'ul' || t === 'ol') return '\\n' + [].map.call(n.children, function(li, i){ return (t === 'ol' ? (i + 1) + '. ' : '- ') + walk(li).trim().replace(/\\n+/g, '\\n  '); }).join('\\n') + '\\n\\n';
    if (t === 'li') return c();
    if (t === 'table') { var rows = [].map.call(n.querySelectorAll('tr'), function(tr){ return '| ' + [].map.call(tr.children, function(td){ return walk(td).trim().replace(/\\|/g,'\\\\|'); }).join(' | ') + ' |'; }); if (rows.length) rows.splice(1, 0, '|' + ' --- |'.repeat(n.querySelector('tr').children.length)); return '\\n' + rows.join('\\n') + '\\n\\n'; }
    if (t === 'hr') return '\\n---\\n';
    if (t === 'img') return '![' + (n.alt || '') + '](' + (n.src || '') + ')';
    if (t === 'script' || t === 'style' || t === 'button' || t === 'svg') return '';
    var out = c();
    return (getComputedStyle(n).display === 'block' && !/^(div|span)$/.test(t)) ? out + '\\n' : out;
  }
  return walk(root).replace(/\\n{3,}/g, '\\n\\n').trim();
})`;

export const NODES = {
  async browser_session(p, node, ctx) {
    if (p.engine && !['chrome-cdp', 'chrome', 'camoufox'].includes(p.engine)) ctx.log(`  engine "${p.engine}" không có trên Mac → dùng Chrome của profile`);
    if (Array.isArray(p.viewport) && p.viewport.length === 2) await ctx.page.setViewportSize({ width: +p.viewport[0], height: +p.viewport[1] }).catch(() => {});
    return true;
  },
  async resize_viewport(p, n, { page }) { await page.setViewportSize({ width: +p.width, height: +p.height }); },
  async goto(p, n, { page }) {
    await page.goto(String(p.url), { waitUntil: p.wait_until || 'domcontentloaded', timeout: +p.timeout || 60000 });
    if (p.wait_ms) await sleep(+p.wait_ms);
    return page.url();
  },
  async wait(p, n, { page }) {
    if (p.selector) { await find(page, p.selector, +p.timeout || 15000); return true; }
    await sleep(Math.min(+p.ms || 1000, 120000));
  },
  async wait_for_function(p, n, { page, vars }) {
    const expr = String(p.expression || 'true');
    if (/^\s*return\b/.test(expr)) throw new Error('expression của wait_for_function là biểu thức, không viết return');
    const timeout = +p.timeout || +p.timeout_ms || 30000, polling = +p.polling || +p.polling_ms || 500;
    const fn = new Function('vars', `try { return !!(${expr}); } catch (e) { return false; }`);
    await page.waitForFunction(fn, vars, { timeout, polling });
    return true;
  },
  async eval_js(p, n, { page, vars }) {
    const fn = new Function('vars', String(p.code || 'return null;'));
    return withTimeout(page.evaluate(fn, vars), +p.timeout || 30000, 'eval_js');
  },
  async click(p, n, { page }) {
    const loc = await find(page, p.selector, +p.timeout || 15000);
    await loc.click({ timeout: +p.timeout || 15000, force: !!p.force });
    return true;
  },
  async type(p, n, { page }) {
    const loc = await find(page, p.selector, +p.timeout || 15000);
    const value = p.value == null ? '' : String(p.value);
    if (p.mode === 'keystrokes') {
      // ô bị lớp khác che (popup, thanh dính của Facebook…) thì focus bằng mã rồi gõ tiếp, không kẹt 30 giây
      // caret_end: gõ tiếp ở cuối ô (không bấm chuột vào giữa ô) — dùng khi gõ nhiều đoạn, vd. quanh một tag @tên
      const toEnd = el => { el.scrollIntoView({ block: 'center' }); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      if (p.caret_end) await loc.evaluate(toEnd);
      else await loc.click({ timeout: 5000 }).catch(() => loc.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.focus(); }));
      if (p.clear_first !== false) { await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await page.keyboard.press('Backspace'); }
      await page.keyboard.type(value, { delay: +p.delay || 0 });
    } else {
      if (p.clear_first !== false) await loc.fill('');
      await loc.fill(value).catch(async () => { await loc.click(); await page.keyboard.insertText(value); });
    }
    return true;
  },
  async key_press(p, n, { page }) { await page.keyboard.press(normalizeKey(p.key)); },
  async hover(p, n, { page }) { await (await find(page, p.selector, +p.timeout || 15000)).hover(); },
  async scroll(p, n, { page }) {
    if (p.selector) { await (await find(page, p.selector, +p.timeout || 15000, 'attached')).scrollIntoViewIfNeeded(); return; }
    const amt = +p.amount || 800;
    await page.mouse.wheel(0, p.direction === 'up' ? -amt : amt);
  },
  async mouse_click(p, n, { page }) { await page.mouse.click(+p.x, +p.y); },
  async mouse_drag(p, n, { page }) {
    await page.mouse.move(+p.from_x, +p.from_y); await page.mouse.down();
    if (p.hold_ms) await sleep(+p.hold_ms);
    await page.mouse.move(+p.to_x, +p.to_y, { steps: +p.steps || 20 }); await page.mouse.up();
  },
  async screenshot(p, node, ctx) {
    const buf = await ctx.page.screenshot({ fullPage: !!p.full_page, type: p.quality ? 'jpeg' : 'png', quality: p.quality ? +p.quality : undefined });
    const file = path.join(ctx.runDir, `${node.id || 'shot'}-${stamp()}.${p.quality ? 'jpg' : 'png'}`);
    fs.writeFileSync(file, buf);
    const savePath = resolvePath(p.save_path || p.path);
    if (savePath) { fs.mkdirSync(path.dirname(savePath), { recursive: true }); fs.writeFileSync(savePath, buf); ctx.files.push(savePath); }
    if (p.emit !== false) ctx.emitShot(file, node.label);
    return savePath || file;
  },
  async return(p) { return { __end: true, output: p }; },
  async condition(p, node, { vars }) { return { __goto: evalCondition(node.params?.expression, vars) ? p.if_true : p.if_false }; },
  async set_var(p, n, { vars }) { vars[p.key] = p.value; return p.value; },
  async emit_progress(p, n, ctx) { ctx.log('  ' + (p.message || '')); },
  async human_pause(p, n, ctx) {
    await withTimeout(ctx.pause(p.message || 'Bấm Tiếp tục để chạy tiếp'), (+p.timeout || 120) * 1000, 'human_pause');
  },
  async loop(p, node, ctx) {
    const items = p.iterate_over != null ? list(typeof p.iterate_over === 'string' && p.iterate_over.trim().startsWith('[') ? JSON.parse(p.iterate_over) : p.iterate_over) : null;
    // Danh sách rỗng hoặc times = 0 thì không chạy vòng nào (trước đây rơi về max_iterations = 100 vòng)
    const hasTimes = p.times != null && p.times !== '';
    const max = Math.min(items ? items.length : hasTimes ? +p.times || 0 : +p.max_iterations || 100, +p.max_iterations || 1000, 1000);
    const until = node.params?.until_expression;
    const maxMs = (+p.max_minutes || 0) * 60000, t0 = Date.now();
    for (let i = 0; i < max; i++) {
      // Dừng sớm nhưng vẫn chạy các bước sau vòng lặp (xuất báo cáo)
      if (ctx.shouldFinish?.()) { ctx.log(`  ⏭ Dừng sớm theo yêu cầu sau ${i}/${max} vòng — chuyển sang bước tiếp theo`); break; }
      if (maxMs && Date.now() - t0 >= maxMs) { ctx.log(`  ⏱ Hết ${p.max_minutes} phút sau ${i}/${max} vòng — chuyển sang bước tiếp theo`); break; }
      if (i > 0 && until) {
        const done = await ctx.page.evaluate(new Function('vars', `try { return !!(${until}); } catch (e) { return false; }`), ctx.vars);
        if (done) break;
      }
      ctx.vars[p.item_var || 'item'] = items ? items[i] : i + 1;
      ctx.vars[p.index_var || 'index'] = i;
      ctx.log(`  vòng ${i + 1}/${max}`);
      const r = await ctx.runGraph(p.first_body_node);
      if (r?.__end) return r;
    }
  },
  // Hỏi Claude qua Claude Code CLI đã đăng nhập trên máy (dùng gói thuê bao, không cần API key).
  // Tắt toàn bộ công cụ: Claude chỉ trả lời chữ, không chạy lệnh / đọc ghi file.
  async claude_prompt(p, n, ctx) {
    const bin = [p.claude_path, process.env.HPBFLOW_CLAUDE, path.join(os.homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].find(b => b && fs.existsSync(b));
    if (!bin) throw new Error('Không tìm thấy Claude Code CLI (cài và đăng nhập: claude login)');
    const prompt = typeof p.prompt === 'object' ? JSON.stringify(p.prompt) : String(p.prompt || '');
    if (!prompt.trim()) throw new Error('prompt rỗng');
    const args = ['-p', prompt, '--output-format', 'text', '--disallowedTools', 'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task', 'Agent'];
    if (p.model) args.push('--model', String(p.model));
    if (p.system) args.push('--append-system-prompt', String(p.system));
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hpbflow-claude-'));
    ctx.log('  🤖 Đang hỏi Claude…');
    const out = await new Promise((res, rej) => execFile(bin, args, { cwd, timeout: (+p.timeout || 180) * 1000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PATH: `${path.dirname(bin)}:/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin` } },
      (e, so, se) => e ? rej(new Error('Claude lỗi: ' + (se || e.message).toString().slice(0, 300))) : res(String(so).trim())));
    fs.rmSync(cwd, { recursive: true, force: true });
    if (p.json) { // lấy khối JSON đầu tiên trong câu trả lời
      const m = out.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, out];
      const t = m[1].trim(); const i = Math.min(...['[', '{'].map(c => t.indexOf(c)).filter(x => x >= 0));
      try { return JSON.parse(t.slice(i)); } catch (e) { throw new Error('Claude không trả JSON hợp lệ: ' + out.slice(0, 200)); }
    }
    return out;
  },
  async subflow(p, n, ctx) {
    const r = await ctx.runSubflow(p.flow_id || p.flow, p.vars || {});
    return r.output;
  },
  async upload_file(p, n, { page }) {
    const files = list(p.path).map(f => resolvePath(f));
    for (const f of files) if (!fs.existsSync(f)) throw new Error('Không có file: ' + f);
    const loc = await find(page, p.selector || 'input[type=file]', +p.timeout || 15000, 'attached');
    await loc.setInputFiles(files);
    if (p.wait_ms) await sleep(+p.wait_ms);
    return files;
  },
  async upload_via_chooser(p, n, { page }) {
    const files = list(p.path).map(f => resolvePath(f));
    for (const f of files) if (!fs.existsSync(f)) throw new Error('Không có file: ' + f);
    const timeout = +p.timeout || 15000;
    const loc = await find(page, p.trigger_selector, timeout);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout }),
      loc.click({ force: !!p.force, timeout }),
    ]);
    await chooser.setFiles(files);
    if (p.wait_ms) await sleep(+p.wait_ms);
    return files;
  },
  async resolve_images(p, n, ctx) {
    let v = ctx.vars[p.images_var];
    if (typeof v === 'string' && v.trim().startsWith('[')) { try { v = JSON.parse(v); } catch { /* giữ nguyên */ } }
    const items = Array.isArray(v) ? v : String(v ?? '').split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const it of items) {
      if (/^https?:\/\//.test(it)) {
        const { buf, mime } = await fetchToBuffer(ctx.page, it);
        const f = path.join(LIBRARY_DIR, `ref_${stamp()}_${out.length}.${extOf(it, mime)}`);
        fs.writeFileSync(f, buf); out.push(f);
      } else {
        const f = resolvePath(it, LIBRARY_DIR);
        if (!fs.existsSync(f)) throw new Error('Không có ảnh: ' + it);
        out.push(f);
      }
    }
    return out;
  },
  async save_images_to_library(p, n, ctx) {
    const srcs = await ctx.page.$$eval(String(p.selector), (els, max) => els.map(e => e.currentSrc || e.src).filter(Boolean).slice(0, max), +p.max_images || 4);
    const paths = [], errors = [];
    for (const src of srcs) {
      try {
        const { buf, mime } = await fetchToBuffer(ctx.page, src);
        const f = path.join(LIBRARY_DIR, `${p.name_prefix || 'img'}_${stamp()}_${paths.length}.${extOf(src, mime)}`);
        fs.writeFileSync(f, buf); paths.push(f); ctx.files.push(f);
      } catch (e) { errors.push(e.message); }
    }
    if (p.output_var) ctx.vars[`${p.output_var}_count`] = paths.length;
    ctx.log(`  đã lưu ${paths.length} ảnh vào thư viện`);
    return { count: paths.length, urls: srcs, paths, found: srcs.length, errors };
  },
  async download_file(p, n, ctx) {
    const { page } = ctx;
    const dir = resolvePath(p.save_dir || '') || OUTPUT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const timeout = (+p.timeout || 60) * 1000;
    let dest;
    if (p.target_var) {
      const url = ctx.vars[p.target_var];
      if (!url) throw new Error(`Biến ${p.target_var} rỗng`);
      const { buf, mime } = await fetchToBuffer(page, String(url));
      dest = path.join(dir, p.filename || `download-${stamp()}.${extOf(String(url), mime)}`);
      fs.writeFileSync(dest, buf);
    } else {
      const loc = await find(page, p.button_selector, Math.min(timeout, 20000));
      try {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout }), loc.click()]);
        dest = path.join(dir, p.filename || dl.suggestedFilename());
        await dl.saveAs(dest);
      } catch (e) {
        // không bắt được sự kiện tải → thử lấy thẳng URL từ phần tử
        const url = await loc.evaluate(el => el.href || el.currentSrc || el.src || el.closest('a')?.href || document.querySelector('video')?.currentSrc || '');
        if (!url) throw e;
        const { buf, mime } = await fetchToBuffer(page, url);
        dest = path.join(dir, p.filename || `download-${stamp()}.${extOf(url, mime)}`);
        fs.writeFileSync(dest, buf);
      }
    }
    ctx.files.push(dest);
    return dest;
  },
  async poll_stream_text(p, node, ctx) {
    const { page } = ctx;
    const timeout = (+p.timeout || 120) * 1000, stale = (+p.stale_timeout || 20) * 1000;
    const settle = (+p.done_settle || 1.5) * 1000, interval = Math.max((+p.poll_interval || 0.5) * 1000, 100);
    const fmt = p.response_format || 'text';
    const read = new Function('args', `
      const msgs = document.querySelectorAll(args.msg);
      const base = window.__gabeeBaseCount || 0, baseText = window.__gabeeBaseText || '';
      const last = msgs[msgs.length - 1];
      if (!last) return '';
      if (msgs.length <= base && (last.innerText || '').trim() === baseText) return '';
      let root = args.text ? (last.querySelector(args.text) || last) : last;
      if (args.exclude) { root = root.cloneNode(true); root.querySelectorAll(args.exclude).forEach(e => e.remove()); }
      const md = args.fmt === 'markdown' ? (${HTML_TO_MD})(root) : (root.innerText || '').trim();
      window.__snapshot = md;
      return md;`);
    const args = { msg: p.msg_selector, text: p.text_selector || '', exclude: p.exclude_selector || '', fmt };
    const doneFn = p.done_expression ? new Function(`try { return !!(${p.done_expression}); } catch (e) { return false; }`) : null;
    const start = Date.now();
    let text = '', lastChange = Date.now(), stableSince = null;
    while (Date.now() - start < timeout) {
      if (ctx.signal?.aborted) throw new Error('Đã dừng');
      const t = await page.evaluate(read, args).catch(() => text);
      if (t !== text) { text = t; lastChange = Date.now(); stableSince = null; }
      const done = doneFn ? await page.evaluate(doneFn).catch(() => false) : false;
      if (done && text) { stableSince ??= Date.now(); if (Date.now() - stableSince >= settle) break; }
      else if (text && Date.now() - lastChange > stale) { ctx.log('  văn bản đứng yên quá lâu, coi như xong'); break; }
      await sleep(interval);
    }
    if (!text) throw new Error('Không đọc được câu trả lời (hết giờ)');
    if (fmt === 'json') {
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (m) { try { return JSON.parse(m[1]); } catch { return m[1].trim(); } }
    }
    return text;
  },
  async save_to_file(p, n, ctx) {
    const f = resolvePath(p.path || `ket-qua-${stamp()}.txt`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const content = typeof p.content === 'object' ? JSON.stringify(p.content, null, 2) : String(p.content ?? '');
    if (p.mode === 'a') fs.appendFileSync(f, content); else fs.writeFileSync(f, content);
    ctx.files.push(f);
    return f;
  },
  async read_from_txt(p) { const s = fs.readFileSync(resolvePath(p.path), 'utf8'); return p.strip === false ? s : s.trim(); },
  async save_to_excel(p, n, ctx) {
    const rows = list(typeof p.rows === 'string' ? JSON.parse(p.rows) : p.rows);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(p.sheet || 'Sheet1');
    const cols = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
    ws.columns = cols.map(c => ({ header: c, key: c, width: Math.min(60, Math.max(12, c.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map(c => [c, r[c] != null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]])));
    const f = resolvePath(p.path || `bang-${stamp()}.xlsx`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    await wb.xlsx.writeFile(f); ctx.files.push(f);
    return f;
  },
  async read_from_excel(p) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(resolvePath(p.path));
    const ws = p.sheet ? wb.getWorksheet(p.sheet) : wb.worksheets[0];
    if (!ws) throw new Error('Không có sheet ' + p.sheet);
    const header = ws.getRow(1).values.slice(1).map(v => String(v ?? ''));
    const rows = [];
    ws.eachRow((row, i) => { if (i > 1) rows.push(Object.fromEntries(header.map((h, j) => [h, row.values[j + 1] ?? null]))); });
    return rows;
  },
  async get_cookies(p, n, { page }) {
    let cookies = await page.context().cookies();
    if (p.domain) cookies = cookies.filter(c => c.domain.includes(p.domain));
    return p.as_dict ? Object.fromEntries(cookies.map(c => [c.name, c.value])) : cookies;
  },
  async set_cookies(p, n, { page }) {
    const url = p.url || page.url();
    const arr = Array.isArray(p.cookies) ? p.cookies : Object.entries(p.cookies || {}).map(([name, value]) => ({ name, value: String(value), url }));
    await page.context().addCookies(arr);
  },
  async clear_cookies(p, n, { page }) { await page.context().clearCookies(); },
  async new_tab(p, n, ctx) {
    const page = await focusPage(await ctx.context.newPage());
    ctx.pages.push(page); ctx.page = page;
    if (p.url) await page.goto(String(p.url), { waitUntil: 'domcontentloaded' });
    if (p.tab_index_var) ctx.vars[p.tab_index_var] = ctx.pages.length - 1;
    return ctx.pages.length - 1;
  },
  async switch_tab(p, n, ctx) {
    const page = p.url_contains ? ctx.pages.find(pg => pg.url().includes(p.url_contains)) : ctx.pages[+p.index];
    if (!page) throw new Error('Không tìm thấy tab');
    ctx.page = page; await focusPage(page);
    return page.url();
  },
};

export const NODE_DOCS = {
  browser_session: { desc: 'Mở trình duyệt của profile. Node đầu tiên của mọi flow.', params: 'engine? (chrome-cdp; cloak/adspower không có trên Mac → dùng Chrome), viewport? [w,h], headless? (bỏ qua)' },
  goto: { desc: 'Mở URL', params: 'url, wait_until? domcontentloaded|load|networkidle, timeout?, wait_ms?' },
  wait: { desc: 'Chờ cố định hoặc chờ selector hiện', params: 'ms | selector + timeout' },
  wait_for_function: { desc: 'Chờ tới khi biểu thức JS trong trang đúng', params: 'expression (BIỂU THỨC, không return), timeout? ms, polling? ms' },
  eval_js: { desc: 'Chạy JS trong trang, phải return. Dùng để đọc trang / đánh dấu phần tử', params: 'code, output_var?, timeout?' },
  click: { desc: 'Bấm chuột thật', params: 'selector (chuỗi hoặc mảng dự phòng), timeout?, force?' },
  type: { desc: 'Gõ vào ô nhập', params: 'selector, value, clear_first? (mặc định true), mode? auto|keystrokes, delay? ms giữa phím, caret_end? (keystrokes: gõ tiếp ở cuối ô, không bấm chuột)' },
  key_press: { desc: 'Nhấn phím', params: 'key, ví dụ "Escape", "Enter", "ctrl+a"' },
  hover: { desc: 'Di chuột lên phần tử', params: 'selector' },
  scroll: { desc: 'Cuộn trang', params: 'direction? up|down, amount? px | selector (cuộn tới phần tử)' },
  mouse_click: { desc: 'Bấm tại toạ độ', params: 'x, y' },
  mouse_drag: { desc: 'Kéo chuột', params: 'from_x, from_y, to_x, to_y, steps?, hold_ms?' },
  resize_viewport: { desc: 'Đổi kích thước khung nhìn', params: 'width, height' },
  screenshot: { desc: 'Chụp màn hình; output_var nhận đường dẫn file', params: 'save_path?, full_page?, emit? (hiện lên UI), output_var?' },
  return: { desc: 'Kết thúc flow, mọi params là kết quả. Có key "error" → flow báo lỗi', params: 'bất kỳ; error?, error_code?' },
  condition: { desc: 'Rẽ nhánh', params: 'expression ("{{vars.a}} == yes", "{{vars.n}} < 3", "{{vars.flag}}"), if_true, if_false' },
  loop: { desc: 'Lặp thân vòng bắt đầu từ first_body_node tới node không có next', params: 'iterate_over? | times? | until_expression? (kiểm trước mỗi vòng trừ vòng đầu), item_var?, index_var?, first_body_node, max_iterations?, max_minutes? (hết giờ thì thoát vòng và chạy tiếp). Nút "Dừng & lấy kết quả" cũng thoát vòng như vậy' },
  set_var: { desc: 'Gán biến', params: 'key, value' },
  emit_progress: { desc: 'Ghi một dòng log lên UI', params: 'message' },
  human_pause: { desc: 'Dừng chờ người dùng bấm Tiếp tục trên UI', params: 'message, timeout? giây' },
  subflow: { desc: 'Chạy flow khác', params: 'flow_id, vars?, output_var?' },
  claude_prompt: { desc: 'Hỏi Claude qua Claude Code CLI trên máy (gói thuê bao, không cần API key; công cụ bị tắt, chỉ trả chữ)', params: 'prompt, system?, model? (sonnet|opus|haiku), json? (true = parse JSON), timeout? giây (mặc định 180), output_var' },
  upload_file: { desc: 'Đẩy file vào input[type=file] (kể cả input ẩn)', params: 'selector?, path (chuỗi/mảng), wait_ms?' },
  upload_via_chooser: { desc: 'Bấm nút mở hộp chọn file rồi đưa file vào', params: 'trigger_selector, path, timeout?, wait_ms?, force?' },
  resolve_images: { desc: 'Biến ảnh (URL/đường dẫn/danh sách) thành mảng file local', params: 'images_var, output_var' },
  save_images_to_library: { desc: 'Tải ảnh khớp selector về thư viện; đặt thêm {output_var}_count', params: 'selector, output_var, name_prefix?, max_images?' },
  download_file: { desc: 'Tải file về máy', params: 'button_selector | target_var (biến chứa URL), save_dir?, filename?, timeout? giây, output_var' },
  poll_stream_text: { desc: 'Đọc câu trả lời đang stream của trang chat AI (cần eval_js chốt window.__gabeeBaseCount/__gabeeBaseText trước khi gửi)', params: 'msg_selector, text_selector?, exclude_selector?, done_expression?, done_settle? giây, stale_timeout? giây, timeout? giây, poll_interval? giây, response_format? text|markdown|json, output_var' },
  save_to_file: { desc: 'Ghi văn bản ra file', params: 'path, content, mode? w|a, output_var?' },
  read_from_txt: { desc: 'Đọc file văn bản', params: 'path, output_var, strip?' },
  save_to_excel: { desc: 'Ghi mảng object ra .xlsx', params: 'path, rows, sheet?' },
  read_from_excel: { desc: 'Đọc .xlsx thành mảng object', params: 'path, sheet?, output_var' },
  get_cookies: { desc: 'Đọc cookie', params: 'output_var, as_dict?, domain?' },
  set_cookies: { desc: 'Đặt cookie', params: 'cookies {name: value}, url?' },
  clear_cookies: { desc: 'Xoá cookie của profile', params: '' },
  new_tab: { desc: 'Mở tab mới và chuyển sang tab đó', params: 'url?, tab_index_var?' },
  switch_tab: { desc: 'Chuyển tab', params: 'url_contains | index' },
};
