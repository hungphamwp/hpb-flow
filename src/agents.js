// Trang "Coding Agent": phát hiện agent đã cài trên máy và ghi/gỡ cấu hình MCP hpb-flow cho từng agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { APP_DIR } from './paths.js';

const H = os.homedir();
const MCP_JS = path.join(APP_DIR, 'src', 'mcp.js');
const NAME = 'hpb-flow';
const entry = () => ({ command: process.execPath, args: [MCP_JS] });
const exists = p => fs.existsSync(p);
const which = cmd => { try { return execFileSync('which', [cmd], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
const writeJson = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)); };

function jsonAgent(id, name, installedCheck, file, key = 'mcpServers') {
  return {
    id, name, format: 'json', file,
    installed: () => installedCheck(),
    configured: () => !!(readJson(file)[key] || {})[NAME],
    install: () => { const d = readJson(file); d[key] = { ...(d[key] || {}), [NAME]: entry() }; writeJson(file, d); },
    uninstall: () => { const d = readJson(file); if (d[key]) { delete d[key][NAME]; writeJson(file, d); } },
  };
}

const AGENTS = [
  {
    id: 'claude-code', name: 'Claude Code', format: 'json', file: path.join(H, '.claude.json'),
    installed: () => !!which('claude'),
    configured: () => !!(readJson(path.join(H, '.claude.json')).mcpServers || {})[NAME],
    install: () => execFileSync(which('claude'), ['mcp', 'add', NAME, '-s', 'user', '--', process.execPath, MCP_JS]),
    uninstall: () => execFileSync(which('claude'), ['mcp', 'remove', NAME, '-s', 'user']),
  },
  jsonAgent('claude-desktop', 'Claude Desktop', () => exists('/Applications/Claude.app'), path.join(H, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')),
  jsonAgent('gemini-cli', 'Gemini CLI', () => !!which('gemini'), path.join(H, '.gemini', 'settings.json')),
  {
    id: 'codex', name: 'Codex', format: 'toml', file: path.join(H, '.codex', 'config.toml'),
    installed: () => !!which('codex'),
    configured: () => { try { return new RegExp(`^\\[mcp_servers\\.${NAME}\\]`, 'm').test(fs.readFileSync(path.join(H, '.codex', 'config.toml'), 'utf8')); } catch { return false; } },
    install() { this.uninstall(); const f = this.file; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, `\n[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(MCP_JS)}]\n`); },
    uninstall() { if (!exists(this.file)) return; const t = fs.readFileSync(this.file, 'utf8').replace(new RegExp(`\\n?\\[mcp_servers\\.${NAME}\\][^\\[]*`, 'g'), '\n'); fs.writeFileSync(this.file, t); },
  },
  jsonAgent('cursor', 'Cursor', () => exists('/Applications/Cursor.app'), path.join(H, '.cursor', 'mcp.json')),
  jsonAgent('antigravity', 'Antigravity', () => exists('/Applications/Antigravity.app') || exists('/Applications/Antigravity IDE.app'), path.join(H, '.gemini', 'config', 'mcp_config.json')),
];

export function listAgents() {
  return AGENTS.map(a => ({ id: a.id, name: a.name, format: a.format, file: a.file.replace(H, '~'), installed: a.installed(), configured: a.configured() }));
}
export function setAgent(id, on) {
  const a = AGENTS.find(x => x.id === id);
  if (!a) throw new Error('Không có agent ' + id);
  if (on) a.install(); else a.uninstall();
  return listAgents().find(x => x.id === id);
}
