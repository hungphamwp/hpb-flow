// Trình chạy flow dạng đồ thị node (định dạng bản gốc):
// flow = { id, name, description, inputs: [...], vars: {...}, groups?: [...], nodes: [ {id, label, type, params, next?, on_error?} ] }
import fs from 'node:fs';
import path from 'node:path';
import { NODES, NODE_DOCS } from './nodes.js';
import { render } from './template.js';
import { getContext } from './browser.js';
import { RUNS_DIR } from './paths.js';

const PATH_KEY = /path|file|dir|saved|download/i;

export function validateFlow(flow) {
  const errors = [], warnings = [];
  if (!flow || typeof flow !== 'object') return { errors: ['Flow phải là object JSON'], warnings };
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(flow.id || '')) errors.push('id chỉ gồm chữ, số, dấu chấm, gạch ngang');
  if (!Array.isArray(flow.nodes) || !flow.nodes.length) errors.push('nodes phải là mảng không rỗng');
  if (flow.inputs != null && !Array.isArray(flow.inputs)) errors.push('inputs phải là MẢNG các {name, type, required, default, description}, không phải object');
  const ids = new Set((flow.nodes || []).map(n => n.id));
  const ref = (n, k, v) => { if (v && !ids.has(v)) errors.push(`${n.id}: ${k} trỏ tới node "${v}" không tồn tại`); };
  for (const n of flow.nodes || []) {
    if (!n.id) { errors.push('Có node thiếu id'); continue; }
    if (!NODES[n.type]) errors.push(`${n.id}: type "${n.type}" không hỗ trợ`);
    if (!n.label) warnings.push(`${n.id}: thiếu label`);
    ref(n, 'next', n.next); ref(n, 'on_error', n.on_error);
    const p = n.params || {};
    if (n.type === 'condition') { ref(n, 'if_true', p.if_true); ref(n, 'if_false', p.if_false); if (!p.expression) errors.push(`${n.id}: condition thiếu expression`); }
    if (n.type === 'loop') { ref(n, 'first_body_node', p.first_body_node); if (!p.first_body_node) errors.push(`${n.id}: loop thiếu first_body_node`); }
    if (n.type === 'wait_for_function' && /^\s*return\b/.test(p.expression || '')) errors.push(`${n.id}: expression của wait_for_function không được có return`);
    if (n.type === 'eval_js' && !/\breturn\b/.test(p.code || '')) warnings.push(`${n.id}: eval_js không có return → kết quả luôn null`);
    if (n.type === 'return' && !Object.keys(p).some(k => PATH_KEY.test(k)) && (flow.nodes || []).some(m => ['download_file', 'save_to_file', 'save_to_excel', 'save_images_to_library'].includes(m.type)))
      warnings.push(`${n.id}: flow có lưu file nhưng return không trả key nào tên path/file/dir/saved`);
  }
  if (Array.isArray(flow.inputs)) for (const i of flow.inputs) {
    if (!i.name) errors.push('Có input thiếu name');
    if (i.default != null && i.default !== '' && flow.vars && !(i.name in flow.vars)) warnings.push(`input ${i.name}: default chỉ dùng cho UI; đặt cả vào "vars" để có mặc định lúc chạy`);
  }
  return { errors, warnings };
}

function collectPaths(output, files) {
  const out = new Set(files);
  const walk = (v, k = '') => {
    if (typeof v === 'string') { if (PATH_KEY.test(k) && v && fs.existsSync(v)) out.add(v); }
    else if (Array.isArray(v)) v.forEach(x => walk(x, k));
    else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk);
  };
  walk(output);
  return [...out];
}

/**
 * Chạy flow. opts: { profile, vars, log, pause, signal, onNode, emitShot, keepTab, stopAfter, runId, getFlow }
 * Trả về { status: 'ok'|'error'|'stopped', output, output_paths, error, error_code }
 */
export async function runFlow(flow, opts = {}) {
  const { errors } = validateFlow(flow);
  if (errors.length) throw new Error('Flow không hợp lệ:\n- ' + errors.join('\n- '));
  const log = opts.log || console.log;
  const inputDefaults = Object.fromEntries((flow.inputs || []).filter(i => i.default != null).map(i => [i.name, i.default]));
  const vars = { ...inputDefaults, ...(flow.vars || {}), ...(opts.vars || {}) };
  for (const i of flow.inputs || []) if (i.required && (vars[i.name] == null || vars[i.name] === '')) throw new Error(`Thiếu đầu vào bắt buộc: ${i.name}`);

  const context = await getContext(opts.profile || 'default');
  const page = await context.newPage();
  const runDir = path.join(RUNS_DIR, opts.runId || String(Date.now()));
  fs.mkdirSync(runDir, { recursive: true });
  const nodes = new Map(flow.nodes.map(n => [n.id, n]));
  const ctx = {
    page, context, pages: [page], vars, log, runDir, files: [], signal: opts.signal,
    pause: opts.pause || (async () => {}),
    emitShot: opts.emitShot || (() => {}),
    async runGraph(startId) { return walk(startId); },
    async runSubflow(id, subVars) {
      if (!opts.getFlow) throw new Error('subflow không khả dụng');
      return runFlow(opts.getFlow(id), { ...opts, vars: { ...vars, ...subVars }, runId: (opts.runId || 'run') + '-sub', stopAfter: undefined });
    },
  };
  let stopped = false;

  async function walk(startId) {
    let id = startId;
    while (id) {
      if (ctx.signal?.aborted) throw new Error('Đã dừng');
      const node = nodes.get(id);
      if (!node) throw new Error(`Node "${id}" không tồn tại`);
      opts.onNode?.(node);
      log(`▶ ${node.label || node.type} (${node.id})`);
      const params = render(node.params || {}, vars);
      let next = node.next, result;
      try {
        result = await NODES[node.type](params, node, ctx);
        if (result && typeof result === 'object' && '__goto' in result) next = result.__goto;
        else if (result && typeof result === 'object' && result.__end) return result;
        else if (params.output_var) vars[params.output_var] = result;
      } catch (e) {
        const msg = e.message.split('\n')[0];
        if (!node.on_error) throw new Error(`${node.label || node.id}: ${msg}`);
        log(`  ⚠ ${msg} → chuyển sang ${node.on_error}`);
        next = node.on_error;
      }
      if (opts.stopAfter && id === opts.stopAfter) { stopped = true; return; }
      id = next;
    }
  }

  try {
    const r = await walk(flow.nodes[0].id);
    const output = r?.output ?? {};
    if (stopped) return { status: 'stopped', output: {}, output_paths: ctx.files, stopped_at: opts.stopAfter };
    if (output && typeof output === 'object' && output.error) return { status: 'error', error: String(output.error), error_code: output.error_code || 'flow_error', output, output_paths: collectPaths(output, ctx.files) };
    return { status: 'ok', output, output_paths: collectPaths(output, ctx.files) };
  } finally {
    if (!opts.keepTab && !stopped) for (const pg of ctx.pages) await pg.close().catch(() => {});
  }
}

// Chạy một node lẻ trên tab có sẵn (dùng khi dò trang qua MCP / page_action)
export async function runNodeOnPage(page, node, vars = {}, log = () => {}) {
  if (['human_pause', 'loop', 'subflow', 'return', 'condition'].includes(node.type)) throw new Error(`${node.type} chỉ dùng trong flow`);
  if (!NODES[node.type]) throw new Error('type không hỗ trợ: ' + node.type);
  const ctx = { page, context: page.context(), pages: [page], vars, log, runDir: RUNS_DIR, files: [], pause: async () => {}, emitShot: () => {} };
  const params = render(node.params || {}, vars);
  return NODES[node.type](params, node, ctx);
}

export { NODE_DOCS };
export const NODE_TYPES = Object.keys(NODES);
