import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.GABEE_DATA || path.join(os.homedir(), 'Library', 'Application Support', 'GaBeeMac');
export const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
export const USER_FLOWS_DIR = path.join(DATA_DIR, 'flows');
export const BUILTIN_FLOWS_DIR = path.join(APP_DIR, 'flows');
export const LIBRARY_DIR = path.join(DATA_DIR, 'library', 'media');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const PORT = Number(process.env.GABEE_PORT || 4719);

// Thư mục kết quả có thể đổi trong Cài đặt → dùng live binding
export let OUTPUT_DIR = path.join(os.homedir(), 'Downloads', 'GaBeeMac');
export function setOutputDir(dir) {
  OUTPUT_DIR = dir.replace(/^~(?=\/|$)/, os.homedir());
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

for (const d of [DATA_DIR, PROFILES_DIR, USER_FLOWS_DIR, LIBRARY_DIR, RUNS_DIR]) fs.mkdirSync(d, { recursive: true });
try { const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); if (s.output_dir) setOutputDir(s.output_dir); } catch { /* chưa có cài đặt */ }
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Đường dẫn trong flow có thể là ~/..., tương đối, hoặc đường dẫn Windows (flow gốc viết trên Windows)
export function resolvePath(p, base = OUTPUT_DIR) {
  if (p == null || p === '') return '';
  let s = String(p).trim();
  if (/^[A-Za-z]:[\\/]/.test(s)) s = path.basename(s.replace(/\\/g, '/'));
  s = s.replace(/^~(?=\/|$)/, os.homedir());
  return path.isAbsolute(s) ? s : path.join(base, s);
}
