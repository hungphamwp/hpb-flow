// Mỗi profile = một thư mục dữ liệu Chrome riêng (phiên đăng nhập riêng),
// chạy Chrome thật của máy và điều khiển qua CDP.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { DATA_DIR, PROFILES_DIR } from './paths.js';

const CHROME = process.env.GABEE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REGISTRY = path.join(DATA_DIR, 'profiles.json');
const BASE_PORT = 9330;
const connections = new Map(); // name -> Browser

function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return {}; }
}
function writeRegistry(r) { fs.writeFileSync(REGISTRY, JSON.stringify(r, null, 2)); }

export function listProfiles() {
  const r = readRegistry();
  if (!r.default) { r.default = { port: BASE_PORT, note: 'Profile mặc định' }; writeRegistry(r); }
  return Object.entries(r).map(([name, v]) => ({ name, ...v, connected: connections.has(name) }));
}

export function createProfile(name, note = '') {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error('Tên profile chỉ gồm a-z, 0-9, dấu gạch ngang');
  const r = readRegistry();
  if (r[name]) throw new Error('Profile đã tồn tại');
  const used = Object.values(r).map(v => v.port);
  let port = BASE_PORT; while (used.includes(port)) port++;
  r[name] = { port, note };
  writeRegistry(r);
  return { name, port, note };
}

async function isUp(port) {
  try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); return res.ok; } catch { return false; }
}

export async function getBrowser(name = 'default') {
  const prof = listProfiles().find(p => p.name === name);
  if (!prof) throw new Error(`Không có profile "${name}"`);
  const cached = connections.get(name);
  if (cached?.isConnected()) return cached;

  if (!(await isUp(prof.port))) {
    const dir = path.join(PROFILES_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    const child = spawn(CHROME, [
      `--remote-debugging-port=${prof.port}`,
      `--user-data-dir=${dir}`,
      '--no-first-run', '--no-default-browser-check',
      '--window-size=1280,900',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 60 && !(await isUp(prof.port)); i++) await new Promise(r => setTimeout(r, 250));
    if (!(await isUp(prof.port))) throw new Error('Không mở được Chrome cho profile ' + name);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${prof.port}`);
  browser.on('disconnected', () => connections.delete(name));
  connections.set(name, browser);
  return browser;
}

export async function getContext(name) {
  const browser = await getBrowser(name);
  return browser.contexts()[0];
}

// Tab dùng chung cho các lệnh thao tác tay (MCP open_page / page_action)
const workTabs = new Map();
export async function getWorkPage(name = 'default') {
  const p = workTabs.get(name);
  if (p && !p.isClosed()) return p;
  const ctx = await getContext(name);
  const page = await ctx.newPage();
  workTabs.set(name, page);
  return page;
}
