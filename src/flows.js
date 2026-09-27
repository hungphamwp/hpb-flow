// Flow gốc nhập từ bộ cài gốc nằm trong DATA_DIR/flows; flow mẫu của app trong thư mục flows/. Trùng id thì bản người dùng thắng.
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_FLOWS_DIR, USER_FLOWS_DIR } from './paths.js';
import { validateFlow } from './engine.js';

function readDir(dir, source) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { ...d, id: d.id || f.replace('.json', ''), _source: source, _file: path.join(dir, f) };
    } catch (e) { return { id: f.replace('.json', ''), name: f, _error: e.message, _source: source, nodes: [] }; }
  });
}

export function listFlows() {
  const map = new Map();
  for (const f of readDir(BUILTIN_FLOWS_DIR, 'builtin')) map.set(f.id, f);
  for (const f of readDir(USER_FLOWS_DIR, 'user')) map.set(f.id, f);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getFlow(id) {
  const f = listFlows().find(f => f.id === id);
  if (!f) throw new Error(`Không có flow "${id}"`);
  return f;
}

export function saveFlow(flow, { overwrite = true } = {}) {
  const { errors, warnings } = validateFlow(flow);
  if (errors.length) throw new Error('Flow không hợp lệ:\n- ' + errors.join('\n- '));
  const { _source, _error, _file, ...clean } = flow;
  const file = path.join(USER_FLOWS_DIR, `${flow.id}.json`);
  if (!overwrite && fs.existsSync(file)) throw new Error('Flow đã tồn tại; đặt overwrite: true để ghi đè');
  fs.writeFileSync(file, JSON.stringify(clean, null, 2));
  return { file, warnings };
}

export function deleteFlow(id) {
  const file = path.join(USER_FLOWS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error('Chỉ xoá được flow trong thư mục người dùng');
  fs.unlinkSync(file);
}

// Tóm tắt để liệt kê (không kèm nodes)
export function summarize(f) {
  const { nodes, groups, _file, ...rest } = f;
  const tags = f.tags || [];
  const group = f.group || tags[0] || (f.id.split('-')[0]);
  return { ...rest, group, node_count: nodes?.length || 0, input_count: (f.inputs || []).length };
}
