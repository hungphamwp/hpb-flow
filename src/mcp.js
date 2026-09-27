// Cổng MCP (stdio) để Claude Code điều khiển GaBee Mac. Mọi lệnh đi qua HTTP tới app đang chạy,
// nên Claude và giao diện dùng chung trình duyệt, profile và lịch sử chạy.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_DIR, PORT } from './paths.js';
import { FLOW_GUIDE } from './docs.js';

const BASE = `http://127.0.0.1:${PORT}`;

async function ensureServer() {
  try { await fetch(BASE + '/api/profiles'); return; } catch { /* chưa chạy */ }
  spawn(process.execPath, [path.join(APP_DIR, 'src', 'server.js')], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(BASE + '/api/profiles'); return; } catch { /* chờ */ }
  }
  throw new Error('Không khởi động được GaBee Mac');
}

async function api(method, url, body) {
  await ensureServer();
  const res = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const tool = fn => async args => { try { return text(await fn(args)); } catch (e) { return { ...text('Lỗi: ' + e.message), isError: true }; } };

const server = new McpServer({ name: 'gabee-mac', version: '0.1.0' });

server.tool('get_flow_guide', 'Hướng dẫn viết flow và danh sách step. Đọc trước khi tạo flow mới.', {}, tool(async () => FLOW_GUIDE));
server.tool('list_flows', 'Liệt kê các flow có sẵn và flow đã tạo', {}, tool(() => api('GET', '/api/flows')));
server.tool('get_flow', 'Xem đầy đủ JSON của một flow', { name: z.string() }, tool(({ name }) => api('GET', `/api/flows/${name}`)));
server.tool('save_flow', 'Lưu (tạo mới hoặc ghi đè) một flow của người dùng. flow là object JSON đầy đủ.',
  { flow: z.record(z.string(), z.any()) }, tool(({ flow }) => api('POST', '/api/flows', flow)));
server.tool('list_profiles', 'Liệt kê profile Chrome (mỗi profile là một phiên đăng nhập riêng)', {}, tool(() => api('GET', '/api/profiles')));
server.tool('run_flow', 'Chạy flow. Hỏi người dùng trước khi chạy flow đăng bài trên tài khoản thật. Trả về id lượt chạy; dùng get_run để theo dõi.',
  { name: z.string(), inputs: z.record(z.string(), z.any()).optional(), profile: z.string().optional() },
  tool(({ name, inputs, profile }) => api('POST', '/api/run', { flow: name, inputs, profile })));
server.tool('get_run', 'Xem trạng thái, log, kết quả của một lượt chạy. wait_seconds > 0 thì chờ tới khi xong/tạm dừng.',
  { id: z.string(), wait_seconds: z.number().optional() },
  tool(async ({ id, wait_seconds = 0 }) => {
    const end = Date.now() + Math.min(wait_seconds, 600) * 1000;
    let r = await api('GET', `/api/runs/${id}`);
    while (r.status === 'running' && Date.now() < end) { await new Promise(s => setTimeout(s, 2000)); r = await api('GET', `/api/runs/${id}`); }
    return { ...r, logs: r.logs.slice(-40) };
  }));
server.tool('open_page', 'Mở URL trên tab làm việc của profile để dò trang', { url: z.string(), profile: z.string().optional() },
  tool(({ url, profile }) => api('POST', '/api/page/open', { url, profile })));
server.tool('snapshot_page', 'Đọc cây accessibility (YAML) của tab làm việc để chọn selector', { profile: z.string().optional(), max_chars: z.number().optional() },
  tool(({ profile, max_chars }) => api('GET', `/api/page/snapshot?profile=${profile || 'default'}&max=${max_chars || 30000}`)));
server.tool('page_action', 'Chạy thử một step (cùng cú pháp như trong flow) trên tab làm việc', { step: z.record(z.string(), z.any()), profile: z.string().optional() },
  tool(({ step, profile }) => api('POST', '/api/page/action', { step, profile })));

await server.connect(new StdioServerTransport());
