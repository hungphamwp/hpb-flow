/* HPB Flow — giao diện web. Trang: Tổng quan, Workflow (danh sách/chi tiết/canvas), Lần chạy, Thư viện, Hồ sơ, Proxy, Trình duyệt, API, Cài đặt. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const j = v => JSON.stringify(v);
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || d.error || r.statusText); return d;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
function copy(t) { navigator.clipboard.writeText(t).then(() => toast('Đã chép')); }
function ago(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return 'vừa xong'; if (s < 3600) return Math.floor(s / 60) + ' phút trước'; if (s < 86400) return Math.floor(s / 3600) + ' giờ trước'; return Math.floor(s / 86400) + ' ngày trước'; }
function dur(r) { if (!r.ended) return ''; const s = Math.round((r.ended - r.started) / 1000); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
const STATUS = { running: 'Đang chạy', paused: 'Chờ bạn', ok: 'Xong', error: 'Lỗi', stopped: 'Dừng' };
const SRC = { canvas: 'Canvas', agent: 'Agent', api: 'API', draft: 'Nháp' };
const ICON = { browser_session: '🌐', goto: '🔗', wait: '⏱', wait_for_function: '⏳', eval_js: '⟨⟩', click: '👆', type: '⌨', key_press: '⌨', hover: '🖱', scroll: '↕', mouse_click: '🖱', mouse_drag: '↔', resize_viewport: '⤢', screenshot: '📷', return: '↩', condition: '⑂', loop: '🔁', set_var: '𝑥', emit_progress: '💬', human_pause: '✋', subflow: '⧉', upload_file: '📎', upload_via_chooser: '📎', resolve_images: '🖼', save_images_to_library: '🖼', download_file: '⬇', poll_stream_text: '💬', save_to_file: '💾', read_from_txt: '📄', save_to_excel: '📊', read_from_excel: '📊', get_cookies: '🍪', set_cookies: '🍪', clear_cookies: '🍪', new_tab: '🗂', switch_tab: '🗂' };
const state = { flows: [], runs: new Map(), filter: '', tag: '', sort: 'recent', profiles: [], sel: null, canvas: null };

// ---------- router
window.addEventListener('hashchange', route);
async function route() {
  const [, page = 'overview', a, b] = location.hash.split('/');
  document.querySelectorAll('#nav a').forEach(x => x.classList.toggle('active', x.dataset.page === page));
  const fn = { overview, flows: a ? flowDetail : flowList, runs: a ? runDetail : runList, run: runView, library, profiles, proxies, engines, api: apiPage, settings }[page] || overview;
  try { await fn(a, b); } catch (e) { $('#main').innerHTML = `<div class="warn">${esc(e.message)}</div>`; }
}
function nav(h) { location.hash = h; }

// ---------- tổng quan
async function overview() {
  const o = await api('GET', '/api/overview');
  $('#main').innerHTML = `<h1>Tổng quan</h1><p class="sub">HPB Flow · tự động hoá trình duyệt bằng flow, điều khiển được từ Claude Code qua MCP</p>
  <div class="tiles">
    <div class="tile"><b>${o.flows}</b><span>workflow${o.flow_errors ? ` · <span style="color:var(--err)">${o.flow_errors} lỗi</span>` : ''}</span></div>
    <div class="tile"><b>${o.profiles}</b><span>hồ sơ trình duyệt</span></div>
    <div class="tile"><b>${o.runs_today}</b><span>lượt chạy hôm nay</span></div>
    <div class="tile"><b>${o.runs_error}</b><span>lượt lỗi</span></div>
    <div class="tile"><b>${o.media}</b><span>file trong thư viện</span></div>
  </div>
  <div class="card"><div class="lbl" style="margin-top:0">Lần chạy gần đây</div>${runTable(o.recent)}</div>`;
}
function runTable(list) {
  if (!list.length) return '<p class="muted">Chưa có lượt chạy nào.</p>';
  return `<table>${list.map(r => `<tr class="click" onclick="nav('#/runs/${r.id}')"><td><span class="badge ${r.status}">${STATUS[r.status] || r.status}</span></td><td><b>${esc(r.name)}</b></td><td><span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span></td><td class="muted">${ago(r.started)}</td><td class="muted">${dur(r)}</td><td class="muted mono">${esc(r.id)}</td></tr>`).join('')}</table>`;
}

// ---------- workflow: danh sách
async function loadFlows() { state.flows = await api('GET', '/api/flows'); }
async function flowList() {
  await loadFlows(); state.profiles = await api('GET', '/api/profiles');
  renderFlowList();
}
function renderFlowList() {
  const tags = [...new Set(state.flows.flatMap(f => f.tags || []))].sort();
  let list = state.flows.filter(f => (!state.filter || (f.id + ' ' + (f.name || '') + ' ' + (f.description || '')).toLowerCase().includes(state.filter.toLowerCase())) && (!state.tag || (f.tags || []).includes(state.tag)));
  list = list.sort((a, b) => state.sort === 'name' ? a.id.localeCompare(b.id) : a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
  const groups = new Map(); for (const f of list) { const g = f.group.toUpperCase(); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(f); }
  const errs = state.flows.filter(f => f.errors || f._error).length;
  $('#main').innerHTML = `<div class="topbar"><h1>Workflow</h1><div class="right"><span class="chip">${state.flows.length} workflow</span><span class="chip">${state.profiles.length} hồ sơ</span>${errs ? `<span class="chip err">${errs} lỗi</span>` : ''}<button class="ghost" onclick="flowList()">↻</button></div></div>
  <div class="search"><input type="text" placeholder="Tìm workflow…" value="${esc(state.filter)}" oninput="state.filter=this.value;renderFlowList()">
    <select style="width:170px" onchange="state.sort=this.value;renderFlowList()"><option value="recent" ${state.sort === 'recent' ? 'selected' : ''}>Theo nhóm</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>Theo tên</option></select>
    <button onclick="newFlow()">+ Flow mới</button></div>
  <div class="tags"><button class="${!state.tag ? 'on' : ''}" onclick="state.tag='';renderFlowList()">Tất cả</button>${tags.map(t => `<button class="${state.tag === t ? 'on' : ''}" onclick="state.tag=${j(t)};renderFlowList()">${esc(t)}</button>`).join('')}</div>
  ${[...groups].map(([g, fs]) => `<div class="grouph">${esc(g)} <span class="chip">${fs.length}</span></div><div class="grid">${fs.map(f => `
    <div class="fcard" onclick="nav('#/flows/${f.id}')"><div class="t"><span class="av">${esc((f.name || f.id)[0].toUpperCase())}</span><span title="${esc(f.id)}">${esc(f.name || f.id)}</span></div>
      <p>${esc(f.description || '')}</p>
      <div class="foot">${f.input_count ? f.input_count + ' ô nhập' : 'Không cần nhập gì'}${f.errors ? ' · <span style="color:var(--err)">lỗi</span>' : ''}<span style="flex:1"></span>${(f.tags || []).slice(0, 2).map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>
      <div class="acts"><button title="Nhân bản" onclick="event.stopPropagation();dupFlow('${f.id}')">⧉</button><button title="Sửa JSON" onclick="event.stopPropagation();nav('#/flows/${f.id}/json')">✎</button>${f._source === 'user' ? `<button title="Xoá" onclick="event.stopPropagation();delFlow('${f.id}')">🗑</button>` : ''}</div>
    </div>`).join('')}</div>`).join('') || '<p class="muted">Không có flow nào khớp.</p>'}`;
}
async function dupFlow(id) { try { await api('POST', `/api/flows/${id}/duplicate`); toast('Đã nhân bản'); flowList(); } catch (e) { toast(e.message); } }
async function delFlow(id) { if (!confirm('Xoá flow ' + id + '?')) return; await api('DELETE', '/api/flows/' + id); toast('Đã xoá'); flowList(); }
function newFlow() {
  const tpl = { id: 'flow-moi', name: 'Flow mới', description: '', tags: ['cua-toi'], inputs: [{ name: 'url', type: 'string', required: true, description: 'Link cần mở' }], vars: { url: '' },
    nodes: [{ id: 'n0', label: 'Mở trình duyệt', type: 'browser_session', params: {}, next: 'n1' }, { id: 'n1', label: 'Vào trang', type: 'goto', params: { url: '{{vars.url}}', wait_until: 'domcontentloaded' }, next: 'n2' }, { id: 'n2', label: 'Chụp màn hình', type: 'screenshot', params: { emit: true, output_var: 'shot' }, next: 'n3' }, { id: 'n3', label: 'Trả kết quả', type: 'return', params: { shot_path: '{{vars.shot}}' } }] };
  jsonEditor(tpl, true);
}
function jsonEditor(flow, isNew) {
  const { _source, _file, ...clean } = flow;
  $('#main').innerHTML = `<div class="topbar"><button onclick="history.back()">← Quay lại</button><h1>${isNew ? 'Flow mới' : esc(flow.name || flow.id)}</h1></div>
  <p class="sub">Sửa JSON rồi Lưu. Cách nhanh hơn: trong Claude Code gõ "dùng hpb-flow tạo workflow …", Claude tự dò trang và viết flow qua MCP.</p>
  <textarea id="jsonText" style="min-height:70vh;font:12px ui-monospace,Menlo,monospace">${esc(JSON.stringify(clean, null, 2))}</textarea>
  <div class="row" style="margin-top:10px"><button class="primary" onclick="saveJson()">Lưu flow</button><button onclick="validateJson()">Kiểm tra</button><span id="jsonMsg" class="muted small"></span></div>`;
}
async function validateJson() { try { const r = await api('POST', '/api/flows/validate', { flow: JSON.parse($('#jsonText').value) }); $('#jsonMsg').textContent = r.errors.length ? 'Lỗi: ' + r.errors.join('; ') : 'Hợp lệ' + (r.warnings.length ? ' — cảnh báo: ' + r.warnings.join('; ') : ''); } catch (e) { $('#jsonMsg').textContent = e.message; } }
async function saveJson() { try { const f = JSON.parse($('#jsonText').value); const r = await api('POST', '/api/flows', { flow: f }); toast('Đã lưu' + (r.warnings?.length ? ' (có cảnh báo)' : '')); nav('#/flows/' + f.id); } catch (e) { $('#jsonMsg').textContent = e.message; } }

// ---------- workflow: chi tiết
function fieldHtml(i, val) {
  const id = 'in_' + i.name, v = val ?? i.default ?? '';
  const head = `<label for="${id}">${esc(i.name)}${i.required ? ' <span class="req">*</span>' : ''}<span class="type">${esc(i.type || 'string')}</span></label><div class="desc">${esc(i.description || '')}</div>`;
  let input;
  if (i.type === 'select') input = `<select id="${id}">${(i.options || []).map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${o === '' ? '— mặc định —' : esc(o)}</option>`).join('')}</select>`;
  else if (i.type === 'number') input = `<input type="number" id="${id}" value="${esc(v)}">`;
  else if (i.type === 'boolean') input = `<label class="check"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> Bật</label>`;
  else if (i.type === 'image' || i.type === 'array' || i.type === 'file') input = `<div class="row" style="flex-wrap:nowrap"><textarea id="${id}" style="min-height:44px" placeholder="Mỗi dòng một file hoặc URL">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea><button onclick="pick('${id}')">+ Add ${i.type === 'image' ? 'image' : 'file'}</button></div>`;
  else input = /prompt|noi_dung|content|text|question/i.test(i.name) || String(v).length > 60 ? `<textarea id="${id}">${esc(v)}</textarea>` : `<input type="text" id="${id}" value="${esc(v)}">`;
  return `<div class="field">${head}${input}</div>`;
}
function readInputs(f) {
  const vars = {};
  for (const i of f.inputs || []) {
    const el = $('#in_' + i.name); if (!el) continue;
    if (i.type === 'boolean') vars[i.name] = el.checked;
    else if (i.type === 'number') vars[i.name] = el.value === '' ? '' : Number(el.value);
    else if (i.type === 'image' || i.type === 'array' || i.type === 'file') vars[i.name] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else vars[i.name] = el.value;
  }
  return vars;
}
async function pick(id) { const { paths } = await api('POST', '/api/choose-file'); if (paths.length) { const el = $('#' + id); el.value = (el.value ? el.value + '\n' : '') + paths.join('\n'); checkReady(); } }
function checkReady() {
  const f = state.flow; if (!f || !$('#runBtn')) return;
  const vars = readInputs(f);
  const missing = (f.inputs || []).filter(i => i.required && (vars[i.name] === '' || vars[i.name] == null || (Array.isArray(vars[i.name]) && !vars[i.name].length)));
  $('#runBtn').disabled = !!missing.length; $('#runHint').textContent = missing.length ? 'Còn ô bắt buộc chưa điền' : '';
}
async function flowDetail(id, mode) {
  const f = await api('GET', '/api/flows/' + id); state.flow = f;
  if (mode === 'json') return jsonEditor(f);
  state.profiles = await api('GET', '/api/profiles');
  const runs = (await api('GET', '/api/runs?limit=200')).filter(r => r.flow_id === id).slice(0, 12);
  const prof = state.profiles.find(p => p.name === (localStorage.getItem('hpbflow.profile') || 'default')) || state.profiles[0];
  const needsBrowser = (f.nodes || []).some(n => n.type === 'browser_session');
  $('#main').innerHTML = `<div class="detail">
    <div class="left">
      <div class="row"><button onclick="nav('#/flows')">← Danh sách</button><div style="min-width:0"><b style="display:block;font-size:15px">${esc(f.name || f.id)}</b><span class="muted small">${esc(f.id)} · ${(f.inputs || []).length} ô nhập${needsBrowser ? ' · cần trình duyệt' : ''}</span></div></div>
      <div class="lbl">Hồ sơ trình duyệt <span class="req">*</span></div>
      <div class="profilebox"><span>🌐</span><b id="profName">${esc(prof.name)}</b><span class="muted small">${esc(prof.engine)}</span><button class="sm" onclick="chooseProfile()">Đổi</button></div>
      <label class="check"><input type="checkbox" id="headless" ${prof.headless ? 'checked' : ''} onchange="setHeadless(this.checked)"> Chạy ẩn (không hiện cửa sổ trình duyệt)</label>
      <label class="check"><input type="checkbox" id="keeptab"> Giữ tab sau khi chạy</label>
      <div class="lbl">Thông tin cần nhập</div>
      <div oninput="checkReady()" onchange="checkReady()">${(f.inputs || []).map(i => fieldHtml(i, f.vars?.[i.name] || undefined)).join('') || '<p class="muted small">Không cần nhập gì.</p>'}</div>
      <div class="row" style="margin-top:16px"><button class="primary" id="runBtn" onclick="runFlow()">▶ Chạy workflow <span class="muted" style="font-weight:400">⌘↵</span></button><span id="runHint" class="muted small"></span></div>
      <div class="row" style="margin-top:14px"><button class="sm" onclick="nav('#/flows/${f.id}/json')">Sửa JSON</button><button class="sm" onclick="dupFlow('${f.id}')">Nhân bản</button>${f._source === 'user' ? `<button class="sm danger" onclick="delFlow('${f.id}')">Xoá</button>` : ''}</div>
      ${f.description ? `<p class="muted small" style="margin-top:14px">${esc(f.description)}</p>` : ''}
    </div>
    <div class="rightcol">
      <div class="canvaswrap" id="cw"><div class="head">⧉ Sơ đồ workflow <span class="muted">· cuộn để kéo, bấm node để xem tham số</span></div><div class="zoom"><button onclick="cz(1.2)">+</button><button onclick="cz(0.8)">−</button><button onclick="cfit()">⤢</button></div><div class="canvas" id="canvas"></div></div>
      <div class="recent"><div class="lbl">Lần chạy gần đây <a href="#/runs">Xem tất cả</a></div>${runTable(runs)}</div>
    </div></div>`;
  drawCanvas(f, $('#canvas'));
  checkReady();
  document.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && $('#runBtn') && !$('#runBtn').disabled) runFlow(); };
}
async function setHeadless(on) { const name = $('#profName').textContent; await api('PATCH', '/api/profiles/' + name, { headless: on }); toast(on ? 'Profile sẽ chạy ẩn ở lần mở Chrome tiếp theo' : 'Profile sẽ hiện cửa sổ'); }
function chooseProfile() {
  modal(`<h3>Chọn hồ sơ trình duyệt</h3>${state.profiles.map(p => `<div class="opt ${p.name === $('#profName').textContent ? 'on' : ''}" onclick="localStorage.setItem('hpbflow.profile',${j(p.name)});$('#profName').textContent=${j(p.name)};$('#modal').close()"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.engine)}${p.proxy ? ' · proxy ' + esc(p.proxy) : ''}</span><small>${esc(p.note || '')}</small></div>`).join('')}<div class="acts"><button onclick="$('#modal').close();nav('#/profiles')">Quản lý hồ sơ</button></div>`);
}
async function runFlow() {
  const f = state.flow;
  try {
    const r = await api('POST', '/api/run', { flow: f.id, vars: readInputs(f), profile: $('#profName').textContent, keep_tab: $('#keeptab').checked, source: 'canvas' });
    state.runs.set(r.id, r); nav('#/run/' + r.id);
  } catch (e) { toast(e.message); }
}

// ---------- canvas
function layoutFlow(f) {
  const nodes = f.nodes || [], byId = new Map(nodes.map(n => [n.id, n]));
  const edges = [];
  for (const n of nodes) {
    const p = n.params || {};
    if (n.type === 'condition') { if (p.if_true) edges.push({ from: n.id, to: p.if_true, kind: 'yes' }); if (p.if_false) edges.push({ from: n.id, to: p.if_false, kind: 'no' }); }
    if (n.type === 'loop' && p.first_body_node) edges.push({ from: n.id, to: p.first_body_node, kind: 'body' });
    if (n.next) edges.push({ from: n.id, to: n.next, kind: 'next' });
    if (n.on_error) edges.push({ from: n.id, to: n.on_error, kind: 'err' });
  }
  const level = new Map(), order = [];
  const visit = (id, lv, path) => {
    if (!byId.has(id) || path.has(id)) return;
    if (level.has(id) && level.get(id) >= lv) return;
    level.set(id, lv); if (!order.includes(id)) order.push(id);
    const kids = edges.filter(e => e.from === id).sort((a, b) => ({ next: 0, yes: 1, body: 1, no: 2, err: 3 })[a.kind] - ({ next: 0, yes: 1, body: 1, no: 2, err: 3 })[b.kind]);
    for (const e of kids) visit(e.to, lv + 1, new Set([...path, id]));
  };
  if (nodes[0]) visit(nodes[0].id, 0, new Set());
  for (const n of nodes) if (!level.has(n.id)) { level.set(n.id, 0); order.push(n.id); }
  const cols = new Map(), pos = new Map();
  for (const id of order) { const lv = level.get(id); const c = cols.get(lv) || 0; cols.set(lv, c + 1); pos.set(id, { x: 60 + c * 300, y: 40 + lv * 104 }); }
  return { nodes, edges, pos, byId };
}
function drawCanvas(f, el, opts = {}) {
  const L = layoutFlow(f); state.canvas = { ...L, el, scale: 0.9, tx: 0, ty: 0, opts, flow: f };
  const W = 240, H = 58;
  const groups = new Map((f.groups || []).map(g => [g.id, g]));
  const svgEdges = L.edges.map(e => {
    const a = L.pos.get(e.from), b = L.pos.get(e.to); if (!a || !b) return '';
    const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y;
    const color = { next: '#9a9a90', yes: '#1f8a4c', body: '#2563eb', no: '#c53a2b', err: '#c53a2b' }[e.kind];
    let d; if (y2 <= y1 - 20) { const off = 160; d = `M${x1},${y1} C${x1 + off},${y1 + 60} ${x2 + off},${y2 - 60} ${x2},${y2}`; }
    else d = `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const lab = e.kind === 'next' ? '' : `<rect x="${mx - 15}" y="${my - 8}" width="30" height="16" rx="8" fill="${color}"/><text x="${mx}" y="${my + 4}" text-anchor="middle" fill="#fff" class="elabel">${{ yes: 'YES', no: 'NO', err: 'ERR', body: 'LOOP' }[e.kind]}</text>`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" marker-end="url(#arr)"/>${lab}`;
  }).join('');
  let seenG = new Set();
  const nodesHtml = L.nodes.map(n => {
    const p = L.pos.get(n.id); let g = '';
    if (n.group && !seenG.has(n.group)) { seenG.add(n.group); const gg = groups.get(n.group); g = `<div class="glabel" style="left:${p.x}px;top:${p.y - 22}px">${esc(gg ? gg.label : n.group)}</div>`; }
    return g + `<div class="node" id="nd-${esc(n.id)}" style="left:${p.x}px;top:${p.y}px" onclick="selNode(${j(n.id)})"><div class="ic">${ICON[n.type] || '•'}</div><div class="txt"><b>${esc(n.label || n.id)}</b><small>${esc(n.type)}</small></div><span class="dot"></span></div>`;
  }).join('');
  const maxY = Math.max(...[...L.pos.values()].map(p => p.y)) + 120, maxX = Math.max(...[...L.pos.values()].map(p => p.x)) + 420;
  el.innerHTML = `<div class="layer" id="layer" style="width:${maxX}px;height:${maxY}px"><svg width="${maxX}" height="${maxY}"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9a9a90"/></marker></defs>${svgEdges}</svg>${nodesHtml}</div>`;
  el.onwheel = e => { e.preventDefault(); state.canvas.tx -= e.deltaX; state.canvas.ty -= e.deltaY; applyT(); };
  let drag = null; el.onmousedown = e => { if (e.target.closest('.node')) return; drag = { x: e.clientX - state.canvas.tx, y: e.clientY - state.canvas.ty }; };
  window.onmousemove = e => { if (drag) { state.canvas.tx = e.clientX - drag.x; state.canvas.ty = e.clientY - drag.y; applyT(); } };
  window.onmouseup = () => drag = null;
  cfit();
}
function applyT() { const c = state.canvas; if (!c) return; $('#layer').style.transform = `translate(${c.tx}px,${c.ty}px) scale(${c.scale})`; }
function cz(k) { state.canvas.scale = Math.min(2, Math.max(.3, state.canvas.scale * k)); applyT(); }
function cfit() { const c = state.canvas; const w = c.el.clientWidth, lw = $('#layer').offsetWidth; c.scale = Math.min(1, Math.max(.4, (w - 40) / lw)); c.tx = Math.max(20, (w - lw * c.scale) / 2); c.ty = 40; applyT(); }
function selNode(id) {
  document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));
  $('#nd-' + CSS.escape(id))?.classList.add('sel'); state.sel = id;
  const n = state.canvas.byId.get(id);
  if (state.canvas.opts.onSelect) return state.canvas.opts.onSelect(n);
  modal(`<h3>${ICON[n.type] || '•'} ${esc(n.label || n.id)} <span class="muted small mono">${esc(n.type)} · ${esc(n.id)}</span></h3>
    <div class="kv"><div class="k">Tham số</div><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre></div>
    ${n.next ? `<div class="small">next → <code>${esc(n.next)}</code></div>` : ''}${n.on_error ? `<div class="small">on_error → <code>${esc(n.on_error)}</code></div>` : ''}${n.note ? `<p class="muted small">${esc(n.note)}</p>` : ''}
    <div class="acts"><button onclick="$('#modal').close()">Đóng</button></div>`);
}
function paintRun(r) {
  if (!state.canvas) return;
  document.querySelectorAll('.node').forEach(n => n.classList.remove('now', 'done', 'err'));
  for (const id of r.trail || []) $('#nd-' + CSS.escape(id))?.classList.add('done');
  if (r.current_node) { const el = $('#nd-' + CSS.escape(r.current_node)); el?.classList.remove('done'); el?.classList.add('now'); }
  if (r.status === 'error' && r.trail?.length) { const last = $('#nd-' + CSS.escape(r.trail[r.trail.length - 1])); last?.classList.remove('done', 'now'); last?.classList.add('err'); }
  if (state.showSS !== false) for (const s of r.shots || []) { const el = $('#nd-' + CSS.escape(s.node || '')); if (el && !el.querySelector('.shot')) el.insertAdjacentHTML('beforeend', `<img class="shot" src="${s.url}" onclick="event.stopPropagation();view('${s.url}')">`); }
  if (state.showSS === false) document.querySelectorAll('.node .shot').forEach(i => i.remove());
}

// ---------- run view (canvas đang chạy)
async function runView(id) {
  let r = state.runs.get(id) || await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || await api('GET', '/api/flows/' + r.flow_id); state.flow = f; state.runTab = state.runTab || 'detail';
  $('#main').innerHTML = `<div class="runview"><div class="canvaswrap" id="cw">
      <div class="tools"><button onclick="nav('#/flows/${f.id}')">← Flows</button><button class="primary" id="rerun" onclick="nav('#/flows/${f.id}')">▶ Run all</button><button class="danger" id="stopBtn" onclick="api('POST','/api/runs/${id}/stop')">■ Stop</button><button onclick="nav('#/flows/${f.id}')">↻ Reset</button><button onclick="state.showSS=state.showSS===false;paintRun(state.runs.get('${id}'));this.textContent=state.showSS===false?'Show SS':'Hide SS'">${state.showSS === false ? 'Show SS' : 'Hide SS'}</button></div>
      <div class="status" id="runStatus"></div>
      <div class="zoom" style="top:auto;bottom:20px;transform:none"><button onclick="cz(1.2)">+</button><button onclick="cz(0.8)">−</button><button onclick="cfit()">⤢</button></div>
      <div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="tabs">${['detail', 'output', 'log', 'api'].map(t => `<button class="${state.runTab === t ? 'on' : ''}" onclick="state.runTab='${t}';renderSide()">${{ detail: 'Detail', output: 'Output', log: 'Log', api: 'API' }[t]}</button>`).join('')}</div><div class="body" id="sideBody"></div></div></div>`;
  drawCanvas(f, $('#canvas'), { onSelect: n => { state.runTab = 'detail'; renderSide(); } });
  renderSide(); paintRun(r);
}
function renderSide() {
  const id = location.hash.split('/')[2]; const r = state.runs.get(id); if (!r || !$('#sideBody')) return;
  $('#runStatus').innerHTML = `<span class="badge ${r.status}">${STATUS[r.status]}</span>`;
  if ($('#stopBtn')) $('#stopBtn').disabled = !(r.status === 'running' || r.status === 'paused');
  document.querySelectorAll('.side .tabs button').forEach(b => b.classList.toggle('on', b.textContent.toLowerCase() === state.runTab));
  const pause = r.status === 'paused' ? `<div class="pausebox">✋ ${esc(r.pause_message)}<div class="row" style="margin-top:8px"><button class="primary sm" onclick="api('POST','/api/runs/${r.id}/continue')">Tiếp tục</button><button class="danger sm" onclick="api('POST','/api/runs/${r.id}/stop')">Dừng</button></div></div>` : '';
  let html = pause;
  if (state.runTab === 'detail') {
    const n = state.sel ? state.canvas.byId.get(state.sel) : null;
    html += n ? `<div class="row" style="margin-bottom:8px"><span class="ic" style="font-size:18px">${ICON[n.type] || '•'}</span><div><b>${esc(n.label || n.id)}</b><div class="muted small mono">${esc(n.type)} · ${esc(n.id)}</div></div></div>
      <button class="sm" style="width:100%;margin-bottom:10px" onclick="runToHere(${j(n.id)})">▶ Chạy tới node này</button>
      <div class="kv"><div class="k">Input</div><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre></div>${n.note ? `<p class="muted small">${esc(n.note)}</p>` : ''}`
      : `<div class="kv"><div class="k">Lượt chạy</div><div class="small">${esc(r.name)} · <span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span> · hồ sơ <b>${esc(r.profile)}</b></div></div>
      <div class="kv"><div class="k">Đầu vào</div><pre>${esc(JSON.stringify(r.vars || {}, null, 2))}</pre></div>
      <div class="kv"><div class="k">Đang ở node</div><div class="small">${esc(r.current_node || (r.status === 'running' ? '…' : 'đã kết thúc'))}</div></div>
      <p class="muted small">Bấm một node trên sơ đồ để xem tham số.</p>`;
  } else if (state.runTab === 'output') {
    html += r.status === 'ok' ? '<div class="chip ok" style="margin-bottom:10px">✓ Completed</div>' : r.error ? `<div class="warn">${esc(r.error)}</div>` : '<p class="muted">Workflow đang chạy…</p>';
    for (const [k, v] of Object.entries(r.output || {})) html += `<div class="kv"><div class="k">${esc(k)}<button class="sm ghost" onclick='copy(${j(typeof v === 'string' ? v : JSON.stringify(v, null, 2))})'>Chép</button></div><pre>${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</pre></div>`;
    if (r.output_paths?.length) html += `<div class="kv"><div class="k">File</div>${r.output_paths.map(p => `<div class="small"><a href="#" onclick="api('POST','/api/open-path',{path:${j(p)}});return false">📄 ${esc(p.split('/').pop())}</a></div>`).join('')}</div>`;
    if (r.shots?.length) html += `<div class="kv"><div class="k">Ảnh chụp</div><div class="shots">${r.shots.map(s => `<img src="${s.url}" title="${esc(s.label || '')}" onclick="view('${s.url}')">`).join('')}</div></div>`;
  } else if (state.runTab === 'log') html += `<div class="log">${esc((r.logs || []).join('\n'))}</div>`;
  else html += `<p class="small">Chạy lại flow này từ máy khác bằng REST API (bật ở trang API):</p><pre class="mono" style="white-space:pre-wrap;background:var(--soft);padding:8px;border-radius:8px">curl -X POST ${location.origin}/api/v1/flows/${esc(r.flow_id)}/run \\
  -H "X-API-Key: &lt;khoá&gt;" -H "content-type: application/json" \\
  -d '${esc(JSON.stringify({ vars: r.vars || {}, profile_id: r.profile }))}'</pre>`;
  $('#sideBody').innerHTML = html;
  const lg = $('#sideBody .log'); if (lg) lg.scrollTop = lg.scrollHeight;
}
async function runToHere(nodeId) {
  const r0 = state.runs.get(location.hash.split('/')[2]);
  try { const r = await api('POST', '/api/run', { flow: r0.flow_id, vars: r0.vars || {}, profile: r0.profile, keep_tab: true, stop_after: nodeId, source: 'canvas' }); state.runs.set(r.id, r); nav('#/run/' + r.id); } catch (e) { toast(e.message); }
}

// ---------- lần chạy
async function runList() {
  const list = await api('GET', '/api/runs?limit=200');
  $('#main').innerHTML = `<div class="topbar"><h1>Lần chạy</h1><div class="right"><span class="chip">${list.length} lượt</span></div></div><p class="sub">Mọi lần chạy flow — từ canvas, agent hay REST API</p><div class="card">${runTable(list)}</div>`;
}
async function runDetail(id) {
  const r = await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || {}; state.flow = f;
  let changed = false; try { const cur = await api('GET', '/api/flows/' + r.flow_id); changed = JSON.stringify(cur.nodes) !== JSON.stringify(f.nodes); } catch { /* flow đã xoá */ }
  $('#main').innerHTML = `<div class="topbar"><button onclick="nav('#/runs')">← Danh sách</button><span class="badge ${r.status}">${STATUS[r.status]}</span><h1 style="font-size:17px">${esc(r.name)}</h1><span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span><span class="chip mono">Hồ sơ: ${esc(r.profile)}</span>
    <div class="right"><span class="muted small">Chỉ xem lại — không chạy gì</span><button onclick="nav('#/flows/${r.flow_id}')">Mở workflow này</button><button class="primary" onclick="rerunDialog('${id}')">Chạy lại…</button></div></div>
  ${changed ? '<div class="warn">⚠ Flow đã đổi kể từ lần chạy này. Canvas dưới đây vẽ theo bản lúc chạy.</div>' : ''}
  <div class="runview" style="margin:0;height:calc(100vh - 140px);border:1px solid var(--line);border-radius:12px;overflow:hidden">
    <div class="canvaswrap"><div class="zoom" style="top:auto;bottom:20px;transform:none"><button onclick="cz(1.2)">+</button><button onclick="cz(0.8)">−</button><button onclick="cfit()">⤢</button></div><div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="body">
      <div class="kv"><div class="k">Đầu vào</div>${Object.entries(r.vars || {}).map(([k, v]) => `<div class="small"><span class="muted">${esc(k)}</span> &nbsp;${esc(typeof v === 'string' ? v : JSON.stringify(v))}</div>`).join('') || '<span class="muted small">—</span>'}</div>
      <div class="kv"><div class="k">Kết quả trả về</div>${r.error ? `<div class="warn">${esc(r.error)}</div>` : ''}${Object.entries(r.output || {}).map(([k, v]) => `<div class="small" style="margin-bottom:6px"><span class="muted">${esc(k)}</span><pre>${esc(typeof v === 'string' ? (v.length > 1200 ? v.slice(0, 1200) + '…' : v) : JSON.stringify(v, null, 1).slice(0, 1500))}</pre></div>`).join('') || '<span class="muted small">—</span>'}</div>
      ${r.output_paths?.length ? `<div class="kv"><div class="k">File</div>${r.output_paths.map(p => `<div class="small"><a href="#" onclick="api('POST','/api/open-path',{path:${j(p)}});return false">📄 ${esc(p.split('/').pop())}</a></div>`).join('')}</div>` : ''}
      ${r.shots?.length ? `<div class="kv"><div class="k">Ảnh chụp</div><div class="shots">${r.shots.map(s => `<img src="${s.url}" onclick="view('${s.url}')">`).join('')}</div></div>` : ''}
      <div class="kv"><div class="k">Chi tiết node</div><div id="nodeDetail" class="muted small">Bấm một node trên sơ đồ để xem.</div></div>
      <div class="kv"><div class="k">Log</div><div class="log" style="max-height:200px;overflow:auto">${esc((r.logs || []).slice(-60).join('\n'))}</div></div>
      <div class="row"><button class="sm danger" onclick="if(confirm('Xoá lượt chạy này?'))api('DELETE','/api/runs/${id}').then(()=>nav('#/runs'))">Xoá lượt chạy</button><span class="muted small mono">${esc(id)}</span></div>
    </div></div></div>`;
  if (f.nodes) { drawCanvas(f, $('#canvas'), { onSelect: n => { $('#nodeDetail').innerHTML = `<b>${esc(n.label || n.id)}</b> <span class="mono">${esc(n.type)}</span><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre>`; } }); paintRun(r); }
}
function rerunDialog(id) {
  const r = state.runs.get(id);
  modal(`<h3>Chạy lại flow này?</h3><p class="small muted">Đây là CHẠY THẬT — flow sẽ mở trình duyệt và thao tác trên tài khoản của bạn, không phải xem lại.</p>
    <div class="opt on" id="o1" onclick="this.classList.add('on');$('#o2').classList.remove('on')"><b>Flow hiện tại</b><small>Chạy "${esc(r.flow_id)}" bản mới nhất, dùng lại input cũ.</small></div>
    <div class="opt" id="o2" onclick="this.classList.add('on');$('#o1').classList.remove('on')"><b>Flow lúc đó (bản đã lưu)</b><small>Tái hiện đúng lần chạy này, kể cả khi flow đã bị sửa sau đó.</small></div>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="rerun('${id}', $('#o2').classList.contains('on'))">Chạy lại</button></div>`);
}
async function rerun(id, snapshot) {
  const r = state.runs.get(id); $('#modal').close();
  try { const n = await api('POST', '/api/run', { flow: snapshot ? r.flow_snapshot : r.flow_id, vars: r.vars || {}, profile: r.profile, source: 'canvas' }); state.runs.set(n.id, n); nav('#/run/' + n.id); } catch (e) { toast(e.message); }
}

// ---------- thư viện
async function library() {
  const items = await api('GET', '/api/library'); state.lib = state.lib || { q: '', kind: '' };
  const list = items.filter(i => (!state.lib.q || i.name.toLowerCase().includes(state.lib.q.toLowerCase())) && (!state.lib.kind || (state.lib.kind === 'video') === i.video));
  $('#main').innerHTML = `<div class="topbar"><h1>Thư viện</h1><div class="right"><span class="chip">${items.length} file</span><span class="chip">${items.filter(i => !i.video).length} ảnh</span><span class="chip">${items.filter(i => i.video).length} video</span></div></div><p class="sub">Ảnh và video các workflow đã tạo ra</p>
  <div class="search"><input type="text" placeholder="Tìm theo tên file…" value="${esc(state.lib.q)}" oninput="state.lib.q=this.value;library()">
    <div class="tags" style="margin:0"><button class="${!state.lib.kind ? 'on' : ''}" onclick="state.lib.kind='';library()">Tất cả</button><button class="${state.lib.kind === 'image' ? 'on' : ''}" onclick="state.lib.kind='image';library()">Ảnh</button><button class="${state.lib.kind === 'video' ? 'on' : ''}" onclick="state.lib.kind='video';library()">Video</button></div>
    <button onclick="api('POST','/api/open-path',{path:'~/Library/Application Support/HPBFlow/library/media'})">Mở thư mục</button></div>
  <div class="mgrid">${list.map(i => `<figure onclick='previewMedia(${j(i)})'>${i.video ? `<video src="/api/file?path=${encodeURIComponent(i.path)}" muted></video>` : `<img src="/api/file?path=${encodeURIComponent(i.path)}" loading="lazy">`}<figcaption>${esc(i.name)}<br><span class="muted">media · ${(i.size / 1024).toFixed(0)} KB</span></figcaption></figure>`).join('') || '<p class="muted">Chưa có gì. Chạy flow tạo ảnh (chatgpt-image, gemini-image) để có kết quả ở đây.</p>'}</div>`;
}
function previewMedia(i) {
  const src = `/api/file?path=${encodeURIComponent(i.path)}`;
  modal(`<h3>Xem trước</h3>${i.video ? `<video src="${src}" controls style="width:100%;border-radius:10px"></video>` : `<img src="${src}" style="width:100%;border-radius:10px">`}
    <p class="small" style="margin:12px 0 4px"><b>File:</b> ${esc(i.name)}</p><p class="small muted" style="margin:0"><b>Thư mục:</b> media</p>
    <div class="acts"><button class="danger" onclick="if(confirm('Xoá file này?'))api('DELETE','/api/library/${encodeURIComponent(i.name)}').then(()=>{$('#modal').close();library()})">Xoá</button><button onclick="api('POST','/api/open-path',{path:${j(i.path)}})">Mở thư mục</button><button class="primary" onclick="$('#modal').close()">Đóng</button></div>`);
}
function view(src) { $('#viewer').innerHTML = /\.(mp4|webm)/.test(src) ? `<video src="${src}" controls autoplay></video>` : `<img src="${src}">`; $('#viewer').showModal(); }

// ---------- hồ sơ
async function profiles() {
  const list = await api('GET', '/api/profiles/status'); state.profiles = list; state.pf = state.pf || '';
  $('#main').innerHTML = `<div class="topbar"><h1>Hồ sơ trình duyệt</h1><div class="right"><button class="primary" onclick="profileDialog()">+ Thêm hồ sơ</button></div></div><p class="sub">Quản lý hồ sơ đăng nhập và vân tay trình duyệt. Mỗi hồ sơ là một Chrome riêng với phiên đăng nhập riêng.</p>
  <div class="card"><div class="row" style="margin-bottom:10px"><input type="text" placeholder="Tìm theo tên hồ sơ…" style="max-width:320px" oninput="state.pf=this.value;document.querySelectorAll('#ptab tr[data-n]').forEach(t=>t.hidden=!t.dataset.n.includes(this.value.toLowerCase()))"><span class="chip">Tất cả ${list.length}</span><span class="chip">Chrome ${list.length}</span></div>
  <table id="ptab"><tr><th>Hồ sơ</th><th>Proxy</th><th>Chạy ẩn</th><th>Trạng thái</th><th></th></tr>${list.map(p => `<tr data-n="${esc(p.name.toLowerCase())}"><td><div class="row" style="gap:10px"><span class="av">🌐</span><div><b>${esc(p.name)}</b><div class="muted small">${esc(p.engine)}${p.note ? ' · ' + esc(p.note) : ''}</div></div></div></td>
    <td>${p.proxy ? `<span class="small">${esc(p.proxy)}</span>` : `<a href="#" class="small" onclick="editProfile(${j(p.name)});return false">+ Gán proxy</a>`}</td>
    <td class="small">${p.headless ? '🙈 Chạy ẩn' : '👁 Luôn hiện cửa sổ'}</td>
    <td>${p.running ? '<span class="chip ok">● Sẵn sàng</span>' : '<span class="chip">● Nghỉ</span>'}</td>
    <td style="text-align:right;white-space:nowrap"><button class="sm" onclick="api('POST','/api/profiles/${p.name}/open',{}).then(()=>profiles())">Mở</button> ${p.running ? `<button class="sm" onclick="api('POST','/api/profiles/${p.name}/close').then(()=>profiles())">Đóng</button>` : ''} <button class="sm ghost" onclick="editProfile(${j(p.name)})">✎</button>${p.name !== 'default' ? ` <button class="sm ghost danger" onclick="if(confirm('Xoá hồ sơ ${p.name} và toàn bộ phiên đăng nhập của nó?'))api('DELETE','/api/profiles/${p.name}').then(()=>profiles())">🗑</button>` : ''}</td></tr>`).join('')}</table></div>
  <div class="warn" style="margin-top:14px">Mật khẩu bạn tự gõ trong Chrome, app không lưu hay đọc. Đăng nhập Facebook, TikTok, ChatGPT, Google… một lần trong cửa sổ của hồ sơ; các flow dùng lại phiên đó.</div>`;
}
async function profileDialog() {
  const proxies = await api('GET', '/api/proxies');
  modal(`<h3>Create Profile</h3>
    <div class="field"><label>Profile name <span class="req">*</span></label><input type="text" id="pname" placeholder="VD: page-hpb"></div>
    <div class="field"><label>Browser Engine</label><select id="pengine"><option value="chrome-cdp">Chrome CDP (Google Chrome trên máy)</option></select><div class="desc">CloakBrowser / AdsPower / GoLogin / Multilogin không có trên bản Mac.</div></div>
    <div class="field"><label>Proxy <span class="muted small">(optional)</span></label><div class="row" style="flex-wrap:nowrap"><select id="pproxy"><option value="">-- No proxy --</option>${proxies.map(p => `<option value="${esc(p.server)}">${esc(p.name)} (${esc(p.server)})</option>`).join('')}</select><button onclick="$('#modal').close();nav('#/proxies')">+ New</button></div></div>
    <div class="field"><label>Ghi chú</label><input type="text" id="pnote" placeholder="VD: tài khoản Page HPB"></div>
    <label class="check"><input type="checkbox" id="pheadless"> Chạy ẩn (không hiện cửa sổ)</label>
    <div class="acts"><button onclick="$('#modal').close()">Cancel</button><button class="primary" onclick="createProfile()">Create Profile</button></div>`);
}
async function createProfile() {
  try { await api('POST', '/api/profiles', { name: $('#pname').value.trim(), proxy: $('#pproxy').value, note: $('#pnote').value, headless: $('#pheadless').checked }); $('#modal').close(); toast('Đã tạo hồ sơ'); profiles(); } catch (e) { toast(e.message); }
}
async function editProfile(name) {
  const p = state.profiles.find(x => x.name === name); const proxies = await api('GET', '/api/proxies');
  modal(`<h3>Sửa hồ sơ ${esc(name)}</h3>
    <div class="field"><label>Proxy</label><select id="pproxy"><option value="">-- No proxy --</option>${proxies.map(x => `<option value="${esc(x.server)}" ${x.server === p.proxy ? 'selected' : ''}>${esc(x.name)} (${esc(x.server)})</option>`).join('')}${p.proxy && !proxies.some(x => x.server === p.proxy) ? `<option selected>${esc(p.proxy)}</option>` : ''}</select></div>
    <div class="field"><label>Ghi chú</label><input type="text" id="pnote" value="${esc(p.note || '')}"></div>
    <label class="check"><input type="checkbox" id="pheadless" ${p.headless ? 'checked' : ''}> Chạy ẩn</label>
    <p class="muted small">Đổi proxy/chạy ẩn có hiệu lực ở lần mở Chrome tiếp theo (bấm Đóng rồi Mở lại).</p>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="api('PATCH','/api/profiles/${name}',{proxy:$('#pproxy').value,note:$('#pnote').value,headless:$('#pheadless').checked}).then(()=>{$('#modal').close();profiles()})">Lưu</button></div>`);
}

// ---------- proxy
async function proxies() {
  const list = await api('GET', '/api/proxies');
  $('#main').innerHTML = `<div class="topbar"><h1>Proxy</h1><div class="right"><button class="primary" onclick="proxyDialog()">+ Thêm proxy</button></div></div><p class="sub">Đặt tên proxy để gán cho hồ sơ. Chrome của hồ sơ sẽ đi qua proxy này (dạng host:port, socks5://host:port…).</p>
  <div class="card"><table><tr><th>Tên</th><th>Địa chỉ</th><th>Tài khoản</th><th></th></tr>${list.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="mono">${esc(p.server)}</td><td class="small muted">${esc(p.username || '—')}</td><td style="text-align:right"><button class="sm ghost danger" onclick="api('DELETE','/api/proxies/${encodeURIComponent(p.name)}').then(proxies)">🗑</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Chưa có proxy nào.</td></tr>'}</table></div>
  <div class="warn" style="margin-top:14px">Proxy có tài khoản/mật khẩu: Chrome sẽ hỏi đăng nhập ở lần mở đầu; nên dùng proxy whitelist IP để chạy tự động không bị chặn.</div>`;
}
function proxyDialog() {
  modal(`<h3>Thêm proxy</h3><div class="field"><label>Tên</label><input type="text" id="xname" placeholder="VD: Proxy VN 1"></div><div class="field"><label>Địa chỉ</label><input type="text" id="xserver" placeholder="103.27.238.251:3128 hoặc socks5://host:port"></div>
    <div class="row"><div class="field" style="flex:1"><label>Tài khoản</label><input type="text" id="xuser"></div><div class="field" style="flex:1"><label>Mật khẩu</label><input type="password" id="xpass"></div></div>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="api('POST','/api/proxies',{name:$('#xname').value,server:$('#xserver').value,username:$('#xuser').value,password:$('#xpass').value}).then(()=>{$('#modal').close();proxies()}).catch(e=>toast(e.message))">Lưu</button></div>`);
}

// ---------- trình duyệt (engine)
async function engines() {
  const list = await api('GET', '/api/engines');
  $('#main').innerHTML = `<div class="topbar"><h1>Trình duyệt</h1><div class="right"><button onclick="engines()">↻ Kiểm tra lại</button></div></div><p class="sub">Cấu hình và theo dõi các engine trình duyệt. Hồ sơ trình duyệt sẽ dùng engine bạn gán cho nó.</p>
  <div class="engines">${list.map(e => `<div class="ecard ${e.recommended ? 'rec' : ''}"><div class="row" style="justify-content:space-between"><h3>${esc(e.name)}</h3>${e.recommended ? '<span class="chip warn">Khuyến dùng</span>' : ''}</div><div class="muted small">${esc(e.vendor)}</div><p>${esc(e.desc)}</p>
    <div class="row">${e.status === 'ready' ? '<span class="chip ok">● Sẵn sàng</span>' : e.status === 'missing' ? '<span class="chip err">● Chưa cài Google Chrome</span>' : '<span class="chip">Không có trên Mac</span>'}${e.id === 'chrome-cdp' ? '<span style="flex:1"></span><a href="#/profiles" class="small">Cấu hình →</a>' : ''}</div></div>`).join('')}</div>`;
}

// ---------- API
async function apiPage() {
  const s = await api('GET', '/api/settings'); state.apiTab = state.apiTab || 'key';
  const profiles = await api('GET', '/api/profiles');
  const body = state.apiTab === 'key' ? `
    <div class="section"><div class="lbl" style="margin-top:0">Khoá API</div><div class="keyfield"><code id="keyText">${'•'.repeat(40)}</code><button class="sm" onclick="$('#keyText').textContent=$('#keyText').textContent.startsWith('•')?${j(s.api_key)}:'${'•'.repeat(40)}'">Hiện</button><button class="sm" onclick="copy(${j(s.api_key)})">Chép</button><button class="sm" onclick="if(confirm('Tạo khoá mới? Client cũ sẽ không gọi được nữa.'))api('POST','/api/settings/rotate-key').then(apiPage)">Tạo khoá mới</button></div></div>
    <div class="section"><div class="lbl" style="margin-top:0">Địa chỉ để gọi API</div><p class="small muted">Client bên ngoài dán địa chỉ này.</p><div class="keyfield"><code>${esc(s.public_url || s.local_url)}</code><button class="sm" onclick="copy(${j(s.public_url || s.local_url)})">Chép</button></div><p class="small muted">Địa chỉ trên máy: <code>${esc(s.local_url)}</code></p></div>
    <div class="section"><div class="lbl" style="margin-top:0">Hồ sơ cho AI API</div><p class="small muted">Một khoá API ứng với một hồ sơ. Hồ sơ cung cấp phiên trình duyệt và tài khoản ChatGPT/Gemini mà /v1/* điều khiển.</p><select onchange="api('POST','/api/settings',{ai_profile:this.value}).then(()=>toast('Đã lưu'))">${profiles.map(p => `<option ${p.name === (s.ai_profile || 'default') ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="section"><div class="lbl" style="margin-top:0">Gọi từ máy khác qua tên miền riêng</div><p class="small muted">Chỉ điền khi bạn đã có reverse proxy (ngrok, Cloudflare Tunnel…) trỏ tên miền về ${esc(s.local_url)}. Điền xong, ô "Địa chỉ để gọi API" ở trên sẽ đổi theo.</p><div class="row" style="flex-wrap:nowrap"><input type="text" id="pubUrl" value="${esc(s.public_url)}" placeholder="https://ten-mien-cua-ban.example"><button class="sm" onclick="api('POST','/api/settings',{public_url:$('#pubUrl').value.trim()}).then(apiPage)">Lưu</button><button class="sm" onclick="api('POST','/api/settings',{public_url:''}).then(apiPage)">Bỏ tên miền</button></div></div>`
  : state.apiTab === 'ai' ? `
    <div class="row" style="margin-bottom:6px"><b>🤖 AI API —</b><button class="switch ${s.ai_api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{ai_api_enabled:${!s.ai_api_enabled}}).then(apiPage)"></button><span class="chip ${s.ai_api_enabled ? 'ok' : ''}">${s.ai_api_enabled ? '/v1/* đang mở' : '/v1/* đang đóng'}</span></div>
    <p class="small muted">Cho phép gọi ChatGPT/Gemini/Perplexity/Grok bạn đang đăng nhập qua /v1/* (OpenAI-compatible): <code>/v1/models</code>, <code>/v1/chat/completions</code>, <code>/v1/images/generations</code>. Chọn hồ sơ ở tab Khoá API.</p>
    <div class="lbl">Models khả dụng</div><div id="models"><span class="muted small">Đang tải…</span></div>
    <div class="lbl">Ví dụ</div><pre class="mono" style="white-space:pre-wrap;background:var(--soft);padding:10px;border-radius:8px">curl ${esc(s.local_url)}/v1/chat/completions \\
  -H "Authorization: Bearer &lt;khoá&gt;" -H "content-type: application/json" \\
  -d '{"model":"gpt-5.6","messages":[{"role":"user","content":"Xin chào"}]}'</pre>`
  : `
    <h2>Để AI tự viết workflow cho bạn</h2><p class="small">Cắm HPB Flow vào coding agent bạn đang dùng, rồi mô tả việc muốn tự động hoá bằng tiếng Việt. Agent tự đọc danh sách node, tự nhìn trang web đang mở để lấy selector thật, viết flow rồi chạy thử. Tiền LLM tính vào gói đăng ký agent của bạn.</p>
    <div class="lbl">Agent trên máy này</div><div id="agents"><span class="muted small">Đang kiểm tra…</span></div>
    <div class="lbl">Thử xem chạy chưa</div><ol class="steps small"><li>Khởi động lại agent vừa cài — nó chỉ nạp tool lúc mở.</li><li>Giữ HPB Flow đang chạy (app này).</li><li>Dán prompt sau vào agent: <code>dùng gabee list_flows rồi chạy flow test-browser-echo</code></li><li>Thấy agent gọi tool <code>hpb-flow</code> và trả kết quả là xong.</li></ol>`;
  $('#main').innerHTML = `<h1>API</h1><p class="sub">Dùng ChatGPT/Gemini bạn đang đăng nhập như một API (OpenAI-compatible)</p>
  <div class="card" style="padding:0"><div class="apibar"><b>⚙ API đang ${s.api_enabled ? 'BẬT' : 'TẮT'}</b><button class="switch ${s.api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{api_enabled:${!s.api_enabled}}).then(apiPage)"></button><span class="chip ${s.api_enabled ? 'ok' : ''}">${s.api_enabled ? 'Đang chạy' : 'Đang tắt'}</span><code>${esc(s.local_url)}</code><button class="sm" onclick="copy(${j(s.local_url)})">Chép</button><a class="small" href="/api/openapi.json" target="_blank">⧉ Tài liệu API</a></div>
  <div style="display:flex;gap:14px;padding:14px 16px"><div class="subtabs">${[['key', '🔑 Khoá API'], ['ai', '🤖 AI API'], ['agent', '⌨ Coding Agent']].map(([k, l]) => `<button class="${state.apiTab === k ? 'on' : ''}" onclick="state.apiTab='${k}';apiPage()">${l}</button>`).join('')}</div><div style="flex:1;min-width:0">${body}</div></div></div>`;
  if (state.apiTab === 'ai') { const m = await api('GET', '/api/ai-models'); $('#models').innerHTML = `<table><tr><th>Model ID</th><th>Surface</th><th>Flow</th></tr>${m.map(x => `<tr><td class="mono">${esc(x.id)}</td><td><span class="chip ${x.surface === 'chat' ? 'ok' : 'info'}">${esc(x.surface)}</span></td><td><a href="#/flows/${x.flow}" class="small">${esc(x.flow)}</a></td></tr>`).join('')}</table>`; }
  if (state.apiTab === 'agent') renderAgents();
}
async function renderAgents() {
  const list = await api('GET', '/api/agents');
  $('#agents').innerHTML = `<table><tr><th>Agent</th><th>Trạng thái</th><th>Cắm bằng</th><th></th></tr>${list.map(a => `<tr><td><b>${esc(a.name)}</b><div class="muted small mono">${esc(a.file)}</div></td><td class="small">${a.installed ? '<span style="color:var(--ok)">● Đã cài</span>' : '<span class="muted">○ Chưa cài</span>'}</td><td class="small mono">ghi ${a.format}</td><td style="text-align:right">${a.configured ? `<button class="sm" onclick="setAgent('${a.id}',false)">Gỡ</button>` : `<button class="sm primary" onclick="setAgent('${a.id}',true)" ${a.installed ? '' : 'disabled'}>Cài</button>`}</td></tr>`).join('')}</table><div class="row" style="margin-top:8px"><button class="sm" onclick="renderAgents()">Làm mới</button></div>`;
}
async function setAgent(id, on) { try { await api('POST', '/api/agents/' + id, { enabled: on }); toast(on ? 'Đã ghi cấu hình MCP. Khởi động lại agent để nhận tool.' : 'Đã gỡ'); renderAgents(); } catch (e) { toast(e.message); } }

// ---------- cài đặt
async function settings() {
  const s = await api('GET', '/api/settings');
  $('#main').innerHTML = `<h1>Cài đặt</h1><p class="sub">Worker, hồ sơ, nơi lưu file và giao diện</p>
  <div class="card">
    <div class="section"><div class="lbl" style="margin-top:0">Khởi động cùng máy</div><div class="row"><span class="small">Tự động mở HPB Flow khi đăng nhập vào máy, worker sẽ luôn sẵn sàng.</span><span style="flex:1"></span><button class="switch ${s.launch_at_login ? 'on' : ''}" onclick="api('POST','/api/settings',{launch_at_login:${!s.launch_at_login}}).then(settings)"></button></div></div>
    <div class="section"><div class="lbl" style="margin-top:0">Nơi lưu kết quả</div><code style="display:block;padding:8px 10px;margin-bottom:8px">${esc(s.output_dir)}</code><div class="row"><button class="sm" onclick="api('POST','/api/choose-folder').then(r=>r.path&&api('POST','/api/settings',{output_dir:r.path}).then(settings))">Chọn thư mục</button><button class="sm" onclick="api('POST','/api/settings',{output_dir:'~/Downloads/HPBFlow'}).then(settings)">Đặt lại</button><button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.output_dir)}})">Mở thư mục</button></div></div>
    <div class="section"><div class="lbl" style="margin-top:0">Nơi lưu hồ sơ trình duyệt</div><p class="small muted">Thư mục gốc chứa dữ liệu đăng nhập của từng hồ sơ.</p><code style="display:block;padding:8px 10px;margin-bottom:8px">${esc(s.profiles_dir)}</code><button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.profiles_dir)}})">Mở thư mục</button></div>
    <div class="section"><div class="lbl" style="margin-top:0">Thư viện ảnh/video</div><code style="display:block;padding:8px 10px">~/Library/Application Support/HPBFlow/library/media</code></div>
    <div class="section"><div class="lbl" style="margin-top:0">Flow gốc đã nhập</div><p class="small muted">41 flow mẫu nằm ở <code>~/Library/Application Support/HPBFlow/flows</code>. Engine cloak/adspower trong flow tự chuyển sang Chrome CDP.</p></div>
  </div>`;
}

// ---------- chung
function modal(html) { $('#modal').innerHTML = `<div class="box">${html}</div>`; $('#modal').showModal(); }
(async () => {
  (await api('GET', '/api/runs?limit=100')).forEach(r => state.runs.set(r.id, r));
  new EventSource('/api/events').onmessage = e => {
    const r = JSON.parse(e.data); state.runs.set(r.id, r);
    const [, page, a] = location.hash.split('/');
    if (page === 'run' && a === r.id) { paintRun(r); renderSide(); if (['ok', 'error', 'stopped'].includes(r.status) && !state.notified?.has(r.id)) { (state.notified ||= new Set()).add(r.id); state.runTab = 'output'; renderSide(); } }
    else if (page === 'flows' && a && r.flow_id === a && (['ok', 'error', 'stopped'].includes(r.status))) flowDetail(a);
    else if (page === 'runs' && !a) runList();
  };
  if (!location.hash) location.hash = '#/overview';
  route();
})();
