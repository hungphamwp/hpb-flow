// Cổng MCP (stdio) cho Claude Code, cùng bộ tool với GaBee gốc. Mọi lệnh đi qua HTTP tới app đang chạy
// nên Claude và giao diện dùng chung trình duyệt, profile và lịch sử chạy.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { APP_DIR, PORT } from './paths.js';

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
async function waitRun(id, seconds) {
  const end = Date.now() + Math.min(seconds || 0, 900) * 1000;
  let r = await api('GET', `/api/runs/${id}`);
  while (r.status === 'running' && Date.now() < end) { await new Promise(s => setTimeout(s, 2000)); r = await api('GET', `/api/runs/${id}`); }
  const { logs, shots, ...rest } = r;
  return { ...rest, run_id: r.id, logs: logs.slice(-40), screenshots: shots.map(s => s.url) };
}

const text = v => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const tool = fn => async args => { try { return text(await fn(args)); } catch (e) { return { ...text('Lỗi: ' + e.message), isError: true }; } };
const Flow = z.record(z.string(), z.any());
const Vars = z.record(z.string(), z.any()).optional();

const server = new McpServer({ name: 'gabee-mac', version: '0.2.0' });

server.tool('get_flow_guide', 'Hướng dẫn viết flow (đọc trước khi tạo flow mới)', {}, tool(async () => (await api('GET', '/api/guide')).guide));
server.tool('list_nodes', 'Danh sách loại node và tham số — nguồn sự thật về cú pháp', {}, tool(() => api('GET', '/api/nodes')));
server.tool('list_flows', 'Liệt kê flow có sẵn', {}, tool(() => api('GET', '/api/flows')));
server.tool('get_flow', 'Xem JSON đầy đủ của một flow (để chép và sửa)', { flow_id: z.string() }, tool(({ flow_id }) => api('GET', `/api/flows/${flow_id}`)));
server.tool('validate_flow', 'Kiểm tra cấu trúc flow; trả errors và warnings. Pass không có nghĩa là chạy được.', { flow: Flow }, tool(({ flow }) => api('POST', '/api/flows/validate', { flow })));
server.tool('save_flow', 'Lưu flow vào thư viện người dùng. Chỉ lưu flow ĐÃ chạy được và người dùng sẽ dùng lại.', { flow: Flow, overwrite: z.boolean().optional() },
  tool(({ flow, overwrite }) => api('POST', '/api/flows', { flow, overwrite: overwrite ?? true })));
server.tool('delete_flow', 'Xoá flow trong thư viện người dùng', { flow_id: z.string() }, tool(({ flow_id }) => api('DELETE', `/api/flows/${flow_id}`)));
server.tool('list_profiles', 'Liệt kê profile Chrome (mỗi profile một phiên đăng nhập riêng). Hỏi người dùng chọn profile trước khi chạy.', {}, tool(() => api('GET', '/api/profiles')));
server.tool('open_page', 'Mở URL trên tab làm việc của profile (cửa sổ hiện trước mặt người dùng, dùng cả khi cần họ đăng nhập)', { url: z.string(), profile_id: z.string().optional() },
  tool(({ url, profile_id }) => api('POST', '/api/page/open', { url, profile: profile_id })));
server.tool('snapshot_page', 'Đọc cấu trúc tab làm việc: cây accessibility + danh sách phần tử tương tác kèm selector gợi ý', { profile_id: z.string().optional(), max_chars: z.number().optional() },
  tool(({ profile_id, max_chars }) => api('GET', `/api/page/snapshot?profile=${profile_id || 'default'}&max=${max_chars || 30000}`)));
server.tool('page_action', 'Thử một thao tác lẻ trên tab làm việc: eval (code có return) | click | type | key | scroll | screenshot | goto. Hoặc truyền node đầy đủ.',
  { action: z.enum(['eval', 'click', 'type', 'key', 'scroll', 'screenshot', 'goto']).optional(), selector: z.union([z.string(), z.array(z.string())]).optional(), value: z.string().optional(), code: z.string().optional(), keystrokes: z.boolean().optional(), url: z.string().optional(), node: Flow.optional(), profile_id: z.string().optional() },
  tool(({ profile_id, ...rest }) => api('POST', '/api/page/action', { ...rest, profile: profile_id })));
server.tool('run_flow', 'Chạy flow đã lưu. Trả về run_id; status "running" thì dùng get_run_status, KHÔNG gọi run_flow lại. Hỏi người dùng trước khi chạy flow đăng bài/gửi trên tài khoản thật.',
  { flow_id: z.string(), vars: Vars, profile_id: z.string().optional(), keep_tab: z.boolean().optional(), stop_after: z.string().optional(), wait_seconds: z.number().optional() },
  tool(async ({ flow_id, vars, profile_id, keep_tab, stop_after, wait_seconds = 120 }) => {
    const r = await api('POST', '/api/run', { flow: flow_id, vars, profile: profile_id, keep_tab, stop_after, source: 'agent' });
    return waitRun(r.id, wait_seconds);
  }));
server.tool('run_draft', 'Chạy thử một flow CHƯA lưu (không để lại gì trong thư viện). Dùng để sửa–chạy nhiều vòng trước khi save_flow.',
  { flow: Flow, vars: Vars, profile_id: z.string().optional(), keep_tab: z.boolean().optional(), stop_after: z.string().optional(), wait_seconds: z.number().optional() },
  tool(async ({ flow, vars, profile_id, keep_tab, stop_after, wait_seconds = 120 }) => {
    const r = await api('POST', '/api/run', { flow, vars, profile: profile_id, keep_tab, stop_after, source: 'agent' });
    return waitRun(r.id, wait_seconds);
  }));
server.tool('get_run_status', 'Xem trạng thái, log, output của lượt chạy; wait_seconds > 0 thì chờ tới khi xong', { run_id: z.string(), wait_seconds: z.number().optional() },
  tool(({ run_id, wait_seconds = 0 }) => waitRun(run_id, wait_seconds)));
server.tool('stop_run', 'Dừng lượt chạy', { run_id: z.string() }, tool(({ run_id }) => api('POST', `/api/runs/${run_id}/stop`)));

await server.connect(new StdioServerTransport());
