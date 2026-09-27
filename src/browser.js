// Hồ sơ trình duyệt: mỗi profile = một thư mục dữ liệu Chrome riêng (phiên đăng nhập riêng), có thể kèm proxy và chạy ẩn.
// Chạy Chrome thật của máy, điều khiển qua CDP. Engine cloak/adspower/gologin/multilogin của bản gốc không có trên Mac.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { DATA_DIR, PROFILES_DIR } from './paths.js';

export const CHROME = process.env.HPBFLOW_CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium-browser');
// Trên VPS không có màn hình: HPBFLOW_HEADLESS=1 ép mọi hồ sơ chạy ẩn
const FORCE_HEADLESS = process.env.HPBFLOW_HEADLESS === '1';
const REGISTRY = path.join(DATA_DIR, 'profiles.json');
const BASE_PORT = 9330;
const connections = new Map(); // name -> Browser
const workTabs = new Map();    // name -> Page (tab làm việc cho page_action)

function readRegistry() { try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return {}; } }
function writeRegistry(r) { fs.writeFileSync(REGISTRY, JSON.stringify(r, null, 2)); }
async function isUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; } }

export function listProfiles() {
  const r = readRegistry();
  if (!r.default) { r.default = { port: BASE_PORT, note: 'Profile mặc định', engine: 'chrome-cdp', created: Date.now() }; writeRegistry(r); }
  return Object.entries(r).map(([name, v]) => ({ name, id: name, engine: 'chrome-cdp', proxy: '', headless: false, note: '', ...v, connected: connections.get(name)?.isConnected() || false }));
}
export async function profileStatus() {
  return Promise.all(listProfiles().map(async p => ({ ...p, running: await isUp(p.port) })));
}

export function createProfile(name, { note = '', proxy = '', headless = false } = {}) {
  name = String(name || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(name)) throw new Error('Tên profile chỉ gồm chữ, số, gạch ngang/dưới');
  const r = readRegistry();
  if (r[name]) throw new Error('Profile đã tồn tại');
  const used = Object.values(r).map(v => v.port);
  let port = BASE_PORT; while (used.includes(port)) port++;
  r[name] = { port, note, proxy, headless: !!headless, engine: 'chrome-cdp', created: Date.now() };
  writeRegistry(r);
  return { name, ...r[name] };
}
export function updateProfile(name, patch) {
  const r = readRegistry();
  if (!r[name]) throw new Error('Không có profile ' + name);
  for (const k of ['note', 'proxy', 'headless']) if (k in patch) r[name][k] = k === 'headless' ? !!patch[k] : patch[k];
  writeRegistry(r);
  return { name, ...r[name] };
}
export async function deleteProfile(name) {
  if (name === 'default') throw new Error('Không xoá được profile mặc định');
  await closeBrowser(name).catch(() => {});
  const r = readRegistry(); delete r[name]; writeRegistry(r);
  fs.rmSync(path.join(PROFILES_DIR, name), { recursive: true, force: true });
}

export async function getBrowser(name = 'default') {
  const prof = listProfiles().find(p => p.name === name);
  if (!prof) throw new Error(`Không có profile "${name}"`);
  const cached = connections.get(name);
  if (cached?.isConnected()) return cached;

  if (!(await isUp(prof.port))) {
    if (!fs.existsSync(CHROME)) throw new Error('Không thấy Google Chrome tại ' + CHROME);
    const dir = path.join(PROFILES_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    const args = [`--remote-debugging-port=${prof.port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,900'];
    if (prof.proxy) args.push(`--proxy-server=${prof.proxy}`);
    if (prof.headless || FORCE_HEADLESS) args.push('--headless=new');
    if (process.env.HPBFLOW_NO_SANDBOX === '1') args.push('--no-sandbox', '--disable-dev-shm-usage');
    const child = spawn(CHROME, args, { detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 80 && !(await isUp(prof.port)); i++) await new Promise(r => setTimeout(r, 250));
    if (!(await isUp(prof.port))) throw new Error('Không mở được Chrome cho profile ' + name);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${prof.port}`);
  browser.on('disconnected', () => { connections.delete(name); workTabs.delete(name); });
  connections.set(name, browser);
  return browser;
}

export async function getContext(name) { return (await getBrowser(name)).contexts()[0]; }

export async function closeBrowser(name) {
  const prof = listProfiles().find(p => p.name === name);
  if (!prof || !(await isUp(prof.port))) return false;
  const browser = await getBrowser(name);
  const session = await browser.newBrowserCDPSession();
  await session.send('Browser.close').catch(() => {});
  connections.delete(name); workTabs.delete(name);
  return true;
}

// Tab làm việc dùng cho open_page / page_action (dò trang trước khi viết flow)
export async function getWorkPage(name = 'default') {
  const p = workTabs.get(name);
  if (p && !p.isClosed()) return p;
  const ctx = await getContext(name);
  const page = await ctx.newPage();
  workTabs.set(name, page);
  return page;
}
