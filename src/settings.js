import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { SETTINGS_FILE, OUTPUT_DIR, PROFILES_DIR, APP_DIR, PORT, setOutputDir } from './paths.js';

const DEFAULTS = () => ({
  api_enabled: false, ai_api_enabled: true, api_key: 'gb_' + randomBytes(24).toString('hex'),
  public_url: '', launch_at_login: false, output_dir: OUTPUT_DIR,
});

let cache;
export function getSettings() {
  if (!cache) {
    try { cache = { ...DEFAULTS(), ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }; }
    catch { cache = DEFAULTS(); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cache, null, 2)); }
  }
  return { ...cache, profiles_dir: PROFILES_DIR, local_url: `http://127.0.0.1:${PORT}` };
}

export function saveSettings(patch) {
  const s = getSettings();
  const allowed = ['api_enabled', 'ai_api_enabled', 'api_key', 'public_url', 'launch_at_login', 'output_dir', 'ai_profile'];
  for (const k of allowed) if (k in patch) s[k] = patch[k];
  if (patch.output_dir) setOutputDir(patch.output_dir);
  if ('launch_at_login' in patch) setLaunchAtLogin(!!patch.launch_at_login);
  const { profiles_dir, local_url, ...persist } = s;
  cache = persist;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(persist, null, 2));
  return getSettings();
}

export function rotateApiKey() { return saveSettings({ api_key: 'gb_' + randomBytes(24).toString('hex') }); }

// Khởi động cùng máy: LaunchAgent chạy server khi đăng nhập
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'vn.hpbmedia.hpb-flow.plist');
function setLaunchAtLogin(on) {
  if (!on) { execFile('launchctl', ['unload', PLIST], () => {}); try { fs.unlinkSync(PLIST); } catch { /* chưa có */ } return; }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>vn.hpbmedia.hpb-flow</string>
<key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(APP_DIR, 'src', 'server.js')}</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><false/>
<key>StandardOutPath</key><string>${path.join(os.homedir(), 'Library', 'Logs', 'hpb-flow.log')}</string>
<key>StandardErrorPath</key><string>${path.join(os.homedir(), 'Library', 'Logs', 'hpb-flow.log')}</string>
</dict></plist>`;
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.writeFileSync(PLIST, xml);
  execFile('launchctl', ['load', PLIST], () => {});
}
