// Flow có sẵn nằm trong thư mục flows/ của app; flow người dùng (hoặc Claude) tạo nằm trong DATA_DIR/flows và được ưu tiên khi trùng tên.
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_FLOWS_DIR, USER_FLOWS_DIR } from './paths.js';
import { validateFlow } from './engine.js';

function readDir(dir, source) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { return { ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), _source: source }; }
    catch (e) { return { name: f.replace('.json', ''), title: f, _error: e.message, _source: source, steps: [] }; }
  });
}

export function listFlows() {
  const map = new Map();
  for (const f of readDir(BUILTIN_FLOWS_DIR, 'builtin')) map.set(f.name, f);
  for (const f of readDir(USER_FLOWS_DIR, 'user')) map.set(f.name, f);
  return [...map.values()].sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name));
}

export function getFlow(name) {
  const f = listFlows().find(f => f.name === name);
  if (!f) throw new Error(`Không có flow "${name}"`);
  return f;
}

export function saveFlow(flow) {
  const errs = validateFlow(flow);
  if (errs.length) throw new Error('Flow không hợp lệ:\n- ' + errs.join('\n- '));
  const { _source, _error, ...clean } = flow;
  const file = path.join(USER_FLOWS_DIR, `${flow.name}.json`);
  fs.writeFileSync(file, JSON.stringify(clean, null, 2));
  return file;
}

export function deleteFlow(name) {
  const file = path.join(USER_FLOWS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error('Chỉ xoá được flow do bạn tạo');
  fs.unlinkSync(file);
}
