/* HPB Flow — giao diện web. Khung: thanh icon dọc + thanh trên (đường dẫn, tìm nhanh ⌘K).
   Trang: Tổng quan (bảng điều khiển), Workflow (danh sách/chi tiết/canvas), Lần chạy, Thư viện, Hồ sơ, Proxy, Engine, API, Cài đặt. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// JSON để nhúng vào thuộc tính onclick="…" / onclick='…': phải thoát cả nháy kép lẫn nháy đơn
const j = v => esc(JSON.stringify(v)).replace(/'/g, '&#39;');
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || d.error || r.statusText); return d;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200); }
function copy(t) { navigator.clipboard.writeText(t).then(() => toast('Đã chép')); }
function ago(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return 'vừa xong'; if (s < 3600) return Math.floor(s / 60) + ' phút trước'; if (s < 86400) return Math.floor(s / 3600) + ' giờ trước'; return Math.floor(s / 86400) + ' ngày trước'; }
function secs(r) { return r.ended ? Math.round((r.ended - r.started) / 1000) : null; }
function fmtS(s) { return s == null ? '' : s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
function dur(r) { return fmtS(secs(r)); }
const STATUS = { running: 'Đang chạy', paused: 'Chờ bạn', ok: 'Xong', error: 'Lỗi', stopped: 'Dừng' };
const SRC = { canvas: 'Thủ công', agent: 'AI Agent', api: 'API', draft: 'Nháp' };
const I = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
// icon + nhóm màu của từng loại node: nav = điều hướng, act = thao tác, data = dữ liệu, logic = điều khiển, end = kết thúc
const NODE_UI = { browser_session: ['globe', 'nav'], goto: ['link', 'nav'], wait: ['clock', 'logic'], wait_for_function: ['hourglass', 'logic'], eval_js: ['code', 'act'], click: ['pointer', 'act'], type: ['keyboard', 'act'], key_press: ['keyboard', 'act'], hover: ['mouse', 'act'], scroll: ['updown', 'act'], mouse_click: ['mouse', 'act'], mouse_drag: ['move', 'act'], resize_viewport: ['expand', 'nav'], screenshot: ['camera', 'data'], return: ['return', 'end'], condition: ['branch', 'logic'], loop: ['repeat', 'logic'], set_var: ['variable', 'logic'], emit_progress: ['message', 'data'], human_pause: ['hand', 'logic'], subflow: ['layers', 'logic'], upload_file: ['clip', 'act'], upload_via_chooser: ['clip', 'act'], resolve_images: ['image', 'data'], save_images_to_library: ['image', 'data'], download_file: ['download', 'data'], poll_stream_text: ['message', 'data'], save_to_file: ['save', 'data'], read_from_txt: ['file', 'data'], save_to_excel: ['table', 'data'], read_from_excel: ['table', 'data'], get_cookies: ['cookie', 'nav'], set_cookies: ['cookie', 'nav'], clear_cookies: ['cookie', 'nav'], new_tab: ['tabs', 'nav'], switch_tab: ['tabs', 'nav'] };
const nIcon = t => I((NODE_UI[t] || ['zap'])[0]);
const nCat = t => (NODE_UI[t] || [0, 'nav'])[1];
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'h' + (h % 6); };
const state = { flows: [], runs: new Map(), filter: '', tag: '', group: '', sort: 'recent', runFilter: '', profiles: [], sel: null, canvas: null };

// ---------- khung: đường dẫn trên thanh trên, tiêu đề trang
function crumbs(...parts) {
  $('#crumbs').innerHTML = [['HPB Flow', '#/overview'], ...parts].map(([t, h], i, a) => i === a.length - 1 ? `<b>${esc(t)}</b>` : `<a href="${h}">${esc(t)}</a><span class="sep">/</span>`).join('');
}
function pageHead(title, sub, right = '') {
  return `<div class="ph"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="ph-r">${right}</div>` : ''}</div>`;
}

// ---------- router
window.addEventListener('hashchange', route);
async function route() {
  const [, page = 'overview', a, b] = location.hash.split('/');
  document.querySelectorAll('#rail a[data-page]').forEach(x => x.classList.toggle('active', x.dataset.page === (page === 'run' ? 'runs' : page)));
  const fn = { overview, flows: a ? flowDetail : flowList, runs: a ? runDetail : runList, run: runView, library, profiles, proxies, engines, api: apiPage, settings }[page] || overview;
  const m = $('#main'); m.className = ''; m.scrollTop = 0; document.onkeydown = null;
  try { await fn(a, b); } catch (e) { m.innerHTML = `<div class="warn">${I('alert')}${esc(e.message)}</div>`; }
  void m.offsetWidth; m.classList.add('enter');
}
function nav(h) { location.hash = h; }

// ---------- tổng quan: bảng điều khiển
async function overview() {
  crumbs(['Tổng quan']);
  const [o, runs] = await Promise.all([api('GET', '/api/overview'), api('GET', '/api/runs?limit=1000')]);
  const DAY = 86400000, today = new Date().setHours(0, 0, 0, 0);
  const days = [...Array(14)].map((_, i) => { const t = today - (13 - i) * DAY; const rs = runs.filter(r => r.started >= t && r.started < t + DAY); return { t, n: rs.length, ok: rs.filter(r => r.status === 'ok').length, err: rs.filter(r => r.status === 'error').length }; });
  const last7 = runs.filter(r => r.started >= today - 6 * DAY), prev7 = runs.filter(r => r.started >= today - 13 * DAY && r.started < today - 6 * DAY);
  const done = runs.filter(r => ['ok', 'error'].includes(r.status)), rate = done.length ? Math.round(done.filter(r => r.status === 'ok').length / done.length * 100) : null;
  const ds = runs.map(secs).filter(x => x != null), avg = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  const delta = last7.length - prev7.length;
  const top = Object.entries(runs.reduce((m, r) => (m[r.flow_id] = (m[r.flow_id] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const h = new Date().getHours(), greet = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  $('#main').innerHTML = pageHead(`${greet}`, `Hôm nay: <b>${o.runs_today}</b> lượt chạy · ${o.flows} workflow sẵn sàng · ${o.profiles} hồ sơ trình duyệt`,
    `<button onclick="newFlow()">${I('plus')} Workflow mới</button><button class="primary" onclick="nav('#/flows')">${I('play')} Chạy workflow</button>`) + `
  <div class="kpis">
    <div class="kpi"><div class="k-l">${I('zap')} Lượt chạy 7 ngày</div><div class="k-v">${last7.length}</div><div class="k-s ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta === 0 ? 'Bằng 7 ngày trước' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' so với 7 ngày trước'}</div></div>
    <div class="kpi"><div class="k-l">${I('check')} Tỉ lệ thành công</div><div class="k-v">${rate == null ? '—' : rate + '<small>%</small>'}</div><div class="meter"><i style="width:${rate || 0}%"></i></div><div class="k-s">${done.length} lượt đã kết thúc · ${o.runs_error} lỗi</div></div>
    <div class="kpi"><div class="k-l">${I('clock')} Thời gian trung bình</div><div class="k-v">${avg == null ? '—' : fmtS(avg).replace(/(\d+)(m|s)/g, '$1<small>$2</small>')}</div><div class="k-s">mỗi lượt chạy</div></div>
    <div class="kpi"><div class="k-l">${I('workflow')} Workflow</div><div class="k-v">${o.flows}</div><div class="k-s">${o.flow_errors ? `<span class="t-err">${o.flow_errors} cần sửa</span>` : 'Tất cả hợp lệ'} · ${o.media} file đã tạo</div></div>
  </div>
  <div class="dash">
    <section class="card"><div class="c-h"><div><h3>Lượt chạy 14 ngày qua</h3><p>Rê chuột lên cột để xem số lượt thành công và lỗi</p></div><span class="chip">${runs.filter(r => r.started >= today - 13 * DAY).length} lượt</span></div>${barChart(days)}</section>
    <section class="card"><div class="c-h"><div><h3>Chạy nhiều nhất</h3><p>Theo số lượt, mọi thời điểm</p></div></div>
      ${top.length ? `<div class="hbars">${top.map(([id, n]) => `<a class="hb" href="#/flows/${esc(id)}" data-tip="${esc(id)}: ${n} lượt"><span class="hb-n">${esc(id)}</span><span class="hb-t"><i style="width:${Math.max(6, n / top[0][1] * 100)}%"></i></span><span class="hb-v">${n}</span></a>`).join('')}</div>` : '<p class="empty">Chưa có lượt chạy nào.</p>'}</section>
  </div>
  <section class="card flush"><div class="c-h pad"><div><h3>Hoạt động gần đây</h3></div><a href="#/runs" class="more">Xem tất cả ${I('arrow-right')}</a></div>${runTable(o.recent)}</section>`;
}
function barChart(days) {
  const W = 640, H = 200, P = { l: 30, r: 8, t: 12, b: 26 }, max = Math.max(4, ...days.map(d => d.n));
  const step = Math.ceil(max / 4), top = step * 4, iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / days.length, barW = Math.min(24, bw * 0.56);
  const y = v => P.t + ih - v / top * ih;
  const grid = [0, 1, 2, 3, 4].map(k => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(k * step)}" y2="${y(k * step)}" class="gl"/><text x="${P.l - 8}" y="${y(k * step) + 4}" class="ax" text-anchor="end">${k * step}</text>`).join('');
  const bars = days.map((d, i) => {
    const cx = P.l + bw * i + bw / 2, hgt = d.n ? Math.max(3, ih * d.n / top) : 0, x = cx - barW / 2, yy = P.t + ih - hgt, r = Math.min(4, hgt / 2);
    const date = new Date(d.t), lab = `${date.getDate()}/${date.getMonth() + 1}`;
    const path = hgt ? `<path d="M${x},${P.t + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${P.t + ih} Z" class="bar"/>` : '';
    return `<g class="col" data-tip="${lab}: ${d.n} lượt · ${d.ok} xong · ${d.err} lỗi"><rect x="${P.l + bw * i}" y="${P.t}" width="${bw}" height="${ih}" class="hit"/>${path}${i % 2 === 1 || i === days.length - 1 ? `<text x="${cx}" y="${H - 8}" class="ax" text-anchor="middle">${lab}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Số lượt chạy mỗi ngày trong 14 ngày">${grid}<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}" class="base"/>${bars}</svg>`;
}
function runTable(list) {
  if (!list.length) return '<p class="empty">Chưa có lượt chạy nào. Mở một workflow và bấm Chạy để bắt đầu.</p>';
  return `<table class="tbl"><thead><tr><th>Trạng thái</th><th>Workflow</th><th>Nguồn</th><th>Hồ sơ</th><th>Bắt đầu</th><th class="num">Thời gian</th></tr></thead><tbody>${list.map(r => `<tr class="click" onclick="nav('#/runs/${r.id}')"><td><span class="badge ${r.status}">${STATUS[r.status] || r.status}</span></td><td><b>${esc(r.name)}</b><div class="sub mono">${esc(r.id)}</div></td><td><span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span></td><td class="muted">${esc(r.profile || 'default')}</td><td class="muted">${ago(r.started)}</td><td class="num muted">${dur(r)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- workflow: danh sách dạng bảng + cột lọc nhóm
async function loadFlows() { state.flows = await api('GET', '/api/flows'); }
async function flowList() {
  crumbs(['Workflow']);
  const [, profs, runs] = await Promise.all([loadFlows(), api('GET', '/api/profiles'), api('GET', '/api/runs?limit=1000')]);
  state.profiles = profs; state.lastRun = {};
  for (const r of runs) if (!state.lastRun[r.flow_id] || r.started > state.lastRun[r.flow_id].started) state.lastRun[r.flow_id] = r;
  state.runCount = runs.reduce((m, r) => (m[r.flow_id] = (m[r.flow_id] || 0) + 1, m), {});
  renderFlowList();
}
function renderFlowList() {
  const groups = Object.entries(state.flows.reduce((m, f) => (m[f.group] = (m[f.group] || 0) + 1, m), {})).sort((a, b) => a[0].localeCompare(b[0]));
  const tags = [...new Set(state.flows.flatMap(f => f.tags || []))].sort();
  let list = state.flows.filter(f => (!state.filter || (f.id + ' ' + (f.name || '') + ' ' + (f.description || '')).toLowerCase().includes(state.filter.toLowerCase())) && (!state.tag || (f.tags || []).includes(state.tag)) && (!state.group || f.group === state.group));
  list = list.sort((a, b) => state.sort === 'name' ? a.id.localeCompare(b.id) : state.sort === 'used' ? (state.lastRun[b.id]?.started || 0) - (state.lastRun[a.id]?.started || 0) : a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
  const errs = state.flows.filter(f => f.errors || f._error).length;
  const side = (label, val, n, key) => `<button class="${state[key] === val ? 'on' : ''}" onclick="state.${key}=${j(val)};renderFlowList()"><span>${esc(label)}</span><em>${n}</em></button>`;
  $('#main').innerHTML = pageHead('Workflow', `${state.flows.length} workflow · ${state.profiles.length} hồ sơ trình duyệt${errs ? ` · <span class="t-err">${errs} lỗi</span>` : ''}`,
    `<button class="primary" onclick="newFlow()">${I('plus')} Workflow mới</button>`) + `
  <div class="split">
    <aside class="facets">
      <div class="f-h">Nhóm</div>${side('Tất cả', '', state.flows.length, 'group')}${groups.map(([g, n]) => side(g, g, n, 'group')).join('')}
      ${tags.length ? `<div class="f-h">Nhãn</div>${side('Mọi nhãn', '', state.flows.length, 'tag')}${tags.map(t => side('#' + t, t, state.flows.filter(f => (f.tags || []).includes(t)).length, 'tag')).join('')}` : ''}
    </aside>
    <section class="card flush">
      <div class="toolbar"><div class="sbox">${I('search')}<input type="text" id="fsearch" placeholder="Tìm theo tên, mô tả…" value="${esc(state.filter)}" oninput="state.filter=this.value;renderFlowList();const e=$('#fsearch');e.focus();e.setSelectionRange(e.value.length,e.value.length)"></div>
        <div class="seg">${[['recent', 'Theo nhóm'], ['used', 'Chạy gần đây'], ['name', 'Theo tên']].map(([k, l]) => `<button class="${state.sort === k ? 'on' : ''}" onclick="state.sort='${k}';renderFlowList()">${l}</button>`).join('')}</div>
        <span class="muted small">${list.length} kết quả</span></div>
      ${list.length ? `<table class="tbl flows"><thead><tr><th>Workflow</th><th>Nhóm</th><th class="num">Ô nhập</th><th>Lần chạy gần nhất</th><th class="num">Số lượt</th><th></th></tr></thead><tbody>${list.map(f => { const lr = state.lastRun[f.id]; return `
        <tr class="click" onclick="nav('#/flows/${f.id}')">
          <td><div class="fcell"><span class="av ${hue(f.group)}">${esc((f.name || f.id)[0].toUpperCase())}</span><div><b>${esc(f.name || f.id)}</b>${f.errors ? ' <span class="badge error">lỗi</span>' : ''}<div class="sub">${esc(f.description || f.id)}</div></div></div></td>
          <td><span class="tag">${esc(f.group)}</span>${(f.tags || []).slice(0, 2).map(t => `<span class="tag ghost">#${esc(t)}</span>`).join('')}</td>
          <td class="num">${f.input_count || '—'}</td>
          <td>${lr ? `<span class="badge ${lr.status}">${STATUS[lr.status]}</span> <span class="muted small">${ago(lr.started)}</span>` : '<span class="muted small">Chưa chạy</span>'}</td>
          <td class="num">${state.runCount[f.id] || 0}</td>
          <td class="acts"><button class="icon ghost" title="Nhân bản" onclick="event.stopPropagation();dupFlow('${f.id}')">${I('copy')}</button><button class="icon ghost" title="Sửa JSON" onclick="event.stopPropagation();nav('#/flows/${f.id}/json')">${I('edit')}</button>${f._source === 'user' ? `<button class="icon ghost danger" title="Xoá" onclick="event.stopPropagation();delFlow('${f.id}')">${I('trash')}</button>` : ''}<span class="go">${I('arrow-right')}</span></td>
        </tr>`; }).join('')}</tbody></table>` : '<p class="empty">Không có workflow nào khớp bộ lọc.</p>'}
    </section>
  </div>`;
}
async function dupFlow(id) { try { await api('POST', `/api/flows/${id}/duplicate`); toast('Đã nhân bản'); flowList(); } catch (e) { toast(e.message); } }
async function delFlow(id) { if (!confirm('Xoá flow ' + id + '?')) return; await api('DELETE', '/api/flows/' + id); toast('Đã xoá'); nav('#/flows'); flowList(); }
function newFlow() {
  const tpl = { id: 'flow-moi', name: 'Flow mới', description: '', tags: ['cua-toi'], inputs: [{ name: 'url', type: 'string', required: true, description: 'Link cần mở' }], vars: { url: '' },
    nodes: [{ id: 'n0', label: 'Mở trình duyệt', type: 'browser_session', params: {}, next: 'n1' }, { id: 'n1', label: 'Vào trang', type: 'goto', params: { url: '{{vars.url}}', wait_until: 'domcontentloaded' }, next: 'n2' }, { id: 'n2', label: 'Chụp màn hình', type: 'screenshot', params: { emit: true, output_var: 'shot' }, next: 'n3' }, { id: 'n3', label: 'Trả kết quả', type: 'return', params: { shot_path: '{{vars.shot}}' } }] };
  jsonEditor(tpl, true);
}
function jsonEditor(flow, isNew) {
  const { _source, _file, ...clean } = flow;
  crumbs(['Workflow', '#/flows'], [isNew ? 'Workflow mới' : (flow.name || flow.id), isNew ? '#/flows' : '#/flows/' + flow.id], ['Sửa JSON']);
  $('#main').innerHTML = pageHead(isNew ? 'Workflow mới' : esc(flow.name || flow.id), 'Sửa JSON rồi Lưu. Nhanh hơn: trong Claude Code gõ "dùng hpb-flow tạo workflow …", Claude tự dò trang và viết flow qua MCP.',
    `<button onclick="history.back()">Huỷ</button><button onclick="validateJson()">${I('check')} Kiểm tra</button><button class="primary" onclick="saveJson()">${I('save')} Lưu workflow</button>`) + `
  <div class="editor"><div class="ed-bar"><span class="dots"><i></i><i></i><i></i></span><span class="mono">${esc(flow.id)}.json</span><span id="jsonMsg" class="small"></span></div>
  <textarea id="jsonText" spellcheck="false">${esc(JSON.stringify(clean, null, 2))}</textarea></div>`;
}
async function validateJson() { try { const r = await api('POST', '/api/flows/validate', { flow: JSON.parse($('#jsonText').value) }); $('#jsonMsg').textContent = r.errors.length ? 'Lỗi: ' + r.errors.join('; ') : 'Hợp lệ' + (r.warnings.length ? ' — cảnh báo: ' + r.warnings.join('; ') : ''); } catch (e) { $('#jsonMsg').textContent = e.message; } }
async function saveJson() { try { const f = JSON.parse($('#jsonText').value); const r = await api('POST', '/api/flows', { flow: f }); toast('Đã lưu' + (r.warnings?.length ? ' (có cảnh báo)' : '')); nav('#/flows/' + f.id); } catch (e) { $('#jsonMsg').textContent = e.message; } }

// ---------- workflow: chi tiết (sơ đồ + bảng chạy)
function fieldHtml(i, val) {
  const id = 'in_' + i.name, v = val ?? i.default ?? '';
  const head = `<label for="${id}">${esc(i.name)}${i.required ? ' <span class="req">*</span>' : ''}<span class="type">${esc(i.type || 'string')}</span></label><div class="desc">${esc(i.description || '')}</div>`;
  let input;
  if (i.type === 'select') input = `<select id="${id}">${(i.options || []).map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${o === '' ? '— mặc định —' : esc(o)}</option>`).join('')}</select>`;
  else if (i.type === 'number') input = `<input type="number" id="${id}" value="${esc(v)}">`;
  else if (i.type === 'boolean') input = `<label class="check"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> Bật</label>`;
  else if (i.type === 'image' || i.type === 'array' || i.type === 'file') input = `<div class="row" style="flex-wrap:nowrap"><textarea id="${id}" style="min-height:44px" placeholder="Mỗi dòng một file hoặc URL">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea><button onclick="pick('${id}')">${I('plus')} ${i.type === 'image' ? 'Thêm ảnh' : 'Thêm file'}</button></div>`;
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
  crumbs(['Workflow', '#/flows'], [f.name || f.id]);
  state.profiles = await api('GET', '/api/profiles');
  const runs = (await api('GET', '/api/runs?limit=200')).filter(r => r.flow_id === id).slice(0, 12);
  const prof = state.profiles.find(p => p.name === (localStorage.getItem('hpbflow.profile') || 'default')) || state.profiles[0];
  const needsBrowser = (f.nodes || []).some(n => n.type === 'browser_session');
  $('#main').className = 'full';
  $('#main').innerHTML = `<div class="fd">
    <div class="fd-head">
      <span class="av lg ${hue(f.group)}">${esc((f.name || f.id)[0].toUpperCase())}</span>
      <div class="fd-t"><h1>${esc(f.name || f.id)}</h1><div class="meta"><span class="mono">${esc(f.id)}</span><span>${(f.nodes || []).length} bước</span><span>${(f.inputs || []).length} ô nhập</span>${needsBrowser ? `<span>${I('globe')} cần trình duyệt</span>` : ''}${f._source === 'user' ? '<span>của bạn</span>' : '<span>mẫu có sẵn</span>'}</div></div>
      <div class="ph-r"><button onclick="nav('#/flows/${f.id}/json')">${I('edit')} Sửa JSON</button><button onclick="dupFlow('${f.id}')">${I('copy')} Nhân bản</button>${f._source === 'user' ? `<button class="danger" onclick="delFlow('${f.id}')">${I('trash')} Xoá</button>` : ''}</div>
    </div>
    <div class="detail">
      <div class="rightcol">
        <div class="canvaswrap" id="cw"><div class="head">${I('workflow')} Sơ đồ · kéo để di chuyển, bấm vào bước để xem tham số</div><div class="legend"><span class="lg-nav">Điều hướng</span><span class="lg-act">Thao tác</span><span class="lg-data">Dữ liệu</span><span class="lg-logic">Điều khiển</span><span class="lg-end">Kết thúc</span></div><div class="zoom"><button title="Phóng to" onclick="cz(1.2)">${I('plus')}</button><button title="Thu nhỏ" onclick="cz(0.8)">${I('minus')}</button><button title="Vừa khung" onclick="cfit()">${I('expand')}</button></div><div class="canvas" id="canvas"></div></div>
      </div>
      <div class="left">
        <div class="pn-h">${I('play')} Chạy workflow</div>
        ${f.description ? `<p class="muted small" style="margin:0 0 14px">${esc(f.description)}</p>` : ''}
        <div class="lbl">Hồ sơ trình duyệt <span class="req">*</span></div>
        <div class="profilebox"><span class="av ${hue(prof.name)}" style="width:30px;height:30px">${esc(prof.name[0].toUpperCase())}</span><div style="flex:1;min-width:0"><b id="profName">${esc(prof.name)}</b><div class="muted small">${esc(prof.engine)}${prof.proxy ? ' · có proxy' : ''}</div></div><button class="sm" onclick="chooseProfile()">Đổi</button></div>
        <label class="check"><input type="checkbox" id="headless" ${prof.headless ? 'checked' : ''} onchange="setHeadless(this.checked)"> Chạy ẩn (không hiện cửa sổ trình duyệt)</label>
        <label class="check"><input type="checkbox" id="keeptab"> Giữ tab sau khi chạy</label>
        <div class="lbl">Thông tin cần nhập</div>
        <div oninput="checkReady()" onchange="checkReady()">${(f.inputs || []).map(i => fieldHtml(i, f.vars?.[i.name] || undefined)).join('') || '<p class="muted small">Workflow này không cần nhập gì.</p>'}</div>
        <button class="primary" id="runBtn" onclick="runFlow()">${I('play')} Chạy ngay <kbd>⌘↵</kbd></button><span id="runHint" class="muted small"></span>
        <div class="lbl" style="margin-top:26px">Lịch sử <a href="#/runs" style="margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500">Tất cả</a></div>
        <div class="hist">${runs.map(r => `<a class="hi" href="#/runs/${r.id}"><span class="badge ${r.status}">${STATUS[r.status]}</span><span class="muted small">${ago(r.started)}</span><span class="muted small" style="margin-left:auto">${dur(r)}</span></a>`).join('') || '<p class="muted small">Chưa chạy lần nào.</p>'}</div>
      </div>
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
    const color = { next: '#94a3b8', yes: '#15803d', body: '#7c3aed', no: '#dc2626', err: '#dc2626' }[e.kind];
    let d; if (y2 <= y1 - 20) { const off = 160; d = `M${x1},${y1} C${x1 + off},${y1 + 60} ${x2 + off},${y2 - 60} ${x2},${y2}`; }
    else d = `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const txt = { yes: 'ĐÚNG', no: 'SAI', err: 'LỖI', body: 'LẶP' }[e.kind], lw = txt ? 14 + txt.length * 7 : 0;
    const lab = e.kind === 'next' ? '' : `<rect x="${mx - lw / 2}" y="${my - 9}" width="${lw}" height="18" rx="9" fill="${color}"/><text x="${mx}" y="${my + 4}" text-anchor="middle" fill="#fff" class="elabel">${txt}</text>`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" ${e.kind === 'err' ? 'stroke-dasharray="5 5"' : ''} marker-end="url(#arr-${e.kind})"/>${lab}`;
  }).join('');
  let seenG = new Set();
  const nodesHtml = L.nodes.map((n, idx) => {
    const p = L.pos.get(n.id); let g = '';
    if (n.group && !seenG.has(n.group)) { seenG.add(n.group); const gg = groups.get(n.group); g = `<div class="glabel" style="left:${p.x}px;top:${p.y - 22}px">${esc(gg ? gg.label : n.group)}</div>`; }
    return g + `<div class="node" data-cat="${nCat(n.type)}" id="nd-${esc(n.id)}" style="left:${p.x}px;top:${p.y}px" onclick="selNode(${j(n.id)})"><span class="num">${idx + 1}</span><div class="ic">${nIcon(n.type)}</div><div class="txt"><b>${esc(n.label || n.id)}</b><small>${esc(n.type)}</small></div><span class="dot"></span></div>`;
  }).join('');
  const maxY = Math.max(...[...L.pos.values()].map(p => p.y)) + 120, maxX = Math.max(...[...L.pos.values()].map(p => p.x)) + 420;
  el.innerHTML = `<div class="layer" id="layer" style="width:${maxX}px;height:${maxY}px"><svg width="${maxX}" height="${maxY}"><defs>${Object.entries({ next: '#94a3b8', yes: '#15803d', body: '#7c3aed', no: '#dc2626', err: '#dc2626' }).map(([k, c]) => `<marker id="arr-${k}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9 Q3,5 1,1z" fill="${c}"/></marker>`).join('')}</defs>${svgEdges}</svg>${nodesHtml}</div>`;
  el.onwheel = e => { e.preventDefault(); state.canvas.tx -= e.deltaX; state.canvas.ty -= e.deltaY; applyT(); };
  let drag = null; el.onmousedown = e => { if (e.target.closest('.node')) return; drag = { x: e.clientX - state.canvas.tx, y: e.clientY - state.canvas.ty }; };
  window.onmousemove = e => { if (drag) { state.canvas.tx = e.clientX - drag.x; state.canvas.ty = e.clientY - drag.y; applyT(); } };
  window.onmouseup = () => drag = null;
  cfit();
}
function applyT() { const c = state.canvas; if (!c) return; $('#layer').style.transform = `translate(${c.tx}px,${c.ty}px) scale(${c.scale})`; }
function cz(k) { state.canvas.scale = Math.min(2, Math.max(.3, state.canvas.scale * k)); applyT(); }
function cfit() { const c = state.canvas; const w = c.el.clientWidth, h = c.el.clientHeight, lw = $('#layer').offsetWidth, lh = $('#layer').offsetHeight; c.scale = Math.min(1, Math.max(.4, Math.min((w - 40) / lw, (h - 110) / lh))); c.tx = Math.max(20, (w - lw * c.scale) / 2); c.ty = 56; applyT(); }
function selNode(id) {
  document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel'));
  $('#nd-' + CSS.escape(id))?.classList.add('sel'); state.sel = id;
  const n = state.canvas.byId.get(id);
  if (state.canvas.opts.onSelect) return state.canvas.opts.onSelect(n);
  modal(`<h3>${nIcon(n.type)} ${esc(n.label || n.id)} <span class="muted small mono">${esc(n.type)} · ${esc(n.id)}</span></h3>
    <div class="kv"><div class="k">Tham số</div><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre></div>
    ${n.next ? `<div class="small">Bước tiếp theo → <code>${esc(n.next)}</code></div>` : ''}${n.on_error ? `<div class="small">Khi lỗi → <code>${esc(n.on_error)}</code></div>` : ''}${n.note ? `<p class="muted small">${esc(n.note)}</p>` : ''}
    <div class="acts"><button class="primary" onclick="$('#modal').close()">Đóng</button></div>`);
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

// ---------- đang chạy (canvas trực tiếp)
async function runView(id) {
  let r = state.runs.get(id) || await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || await api('GET', '/api/flows/' + r.flow_id); state.flow = f; state.runTab = state.runTab || 'detail';
  crumbs(['Workflow', '#/flows'], [f.name || f.id, '#/flows/' + f.id], ['Lượt chạy']);
  $('#main').className = 'full';
  $('#main').innerHTML = `<div class="runview"><div class="canvaswrap" id="cw">
      <div class="tools"><button onclick="nav('#/flows/${f.id}')">${I('back')} Workflow</button><i class="tsep"></i><button class="primary" id="rerun" onclick="nav('#/flows/${f.id}')">${I('play')} Chạy lại</button><button class="danger" id="stopBtn" onclick="api('POST','/api/runs/${id}/stop')">${I('stop')} Dừng</button><button onclick="nav('#/flows/${f.id}')">${I('refresh')} Đặt lại</button><i class="tsep"></i><button onclick="state.showSS=state.showSS===false;paintRun(state.runs.get('${id}'));this.innerHTML=state.showSS===false?I('eye')+' Hiện ảnh':I('eye-off')+' Ẩn ảnh'">${state.showSS === false ? I('eye') + ' Hiện ảnh' : I('eye-off') + ' Ẩn ảnh'}</button></div>
      <div class="status" id="runStatus"></div>
      <div class="zoom"><button title="Phóng to" onclick="cz(1.2)">${I('plus')}</button><button title="Thu nhỏ" onclick="cz(0.8)">${I('minus')}</button><button title="Vừa khung" onclick="cfit()">${I('expand')}</button></div>
      <div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="tabs">${['detail', 'output', 'log', 'api'].map(t => `<button data-tab="${t}" class="${state.runTab === t ? 'on' : ''}" onclick="state.runTab='${t}';renderSide()">${{ detail: 'Chi tiết', output: 'Kết quả', log: 'Nhật ký', api: 'API' }[t]}</button>`).join('')}</div><div class="body" id="sideBody"></div></div></div>`;
  drawCanvas(f, $('#canvas'), { onSelect: n => { state.runTab = 'detail'; renderSide(); } });
  renderSide(); paintRun(r);
}
function renderSide() {
  const id = location.hash.split('/')[2]; const r = state.runs.get(id); if (!r || !$('#sideBody')) return;
  $('#runStatus').innerHTML = `<span class="badge ${r.status}">${STATUS[r.status]}</span>`;
  if ($('#stopBtn')) $('#stopBtn').disabled = !(r.status === 'running' || r.status === 'paused');
  document.querySelectorAll('.side .tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.runTab));
  const pause = r.status === 'paused' ? `<div class="pausebox"><div class="row" style="flex-wrap:nowrap;align-items:flex-start;color:var(--warn)">${I('hand')}<b>${esc(r.pause_message)}</b></div><div class="row" style="margin-top:8px"><button class="primary sm" onclick="api('POST','/api/runs/${r.id}/continue')">Tiếp tục</button><button class="danger sm" onclick="api('POST','/api/runs/${r.id}/stop')">Dừng</button></div></div>` : '';
  let html = pause;
  if (state.runTab === 'detail') {
    const n = state.sel ? state.canvas.byId.get(state.sel) : null;
    html += n ? `<div class="row" style="margin-bottom:10px;flex-wrap:nowrap"><span class="av h0">${nIcon(n.type)}</span><div><b>${esc(n.label || n.id)}</b><div class="muted small mono">${esc(n.type)} · ${esc(n.id)}</div></div></div>
      <button class="sm" style="width:100%;margin-bottom:12px" onclick="runToHere(${j(n.id)})">${I('play')} Chạy tới bước này</button>
      <div class="kv"><div class="k">Tham số</div><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre></div>${n.note ? `<p class="muted small">${esc(n.note)}</p>` : ''}`
      : `<div class="kv"><div class="k">Lượt chạy</div><div class="small">${esc(r.name)} · <span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span> · hồ sơ <b>${esc(r.profile)}</b></div></div>
      <div class="kv"><div class="k">Đầu vào</div><pre>${esc(JSON.stringify(r.vars || {}, null, 2))}</pre></div>
      <div class="kv"><div class="k">Đang ở bước</div><div class="small">${esc(r.current_node || (r.status === 'running' ? '…' : 'đã kết thúc'))}</div></div>
      <p class="muted small">Bấm một bước trên sơ đồ để xem tham số.</p>`;
  } else if (state.runTab === 'output') {
    html += r.status === 'ok' ? '<div class="chip ok" style="margin-bottom:12px">' + I('check') + ' Hoàn tất</div>' : r.error ? `<div class="warn">${I('alert')}${esc(r.error)}</div>` : '<p class="muted">Workflow đang chạy…</p>';
    for (const [k, v] of Object.entries(r.output || {})) html += `<div class="kv"><div class="k">${esc(k)}<button class="sm ghost" onclick='copy(${j(typeof v === 'string' ? v : JSON.stringify(v, null, 2))})'>Chép</button></div><pre>${esc(typeof v === 'string' ? v : JSON.stringify(v, null, 2))}</pre></div>`;
    if (r.output_paths?.length) html += `<div class="kv"><div class="k">File</div>${r.output_paths.map(p => `<div class="small"><a href="#" onclick="api('POST','/api/open-path',{path:${j(p)}});return false">${I('file')} ${esc(p.replace(/\/+$/, '').split('/').pop() || p)}</a></div>`).join('')}</div>`;
    if (r.shots?.length) html += `<div class="kv"><div class="k">Ảnh chụp</div><div class="shots">${r.shots.map(s => `<img src="${s.url}" title="${esc(s.label || '')}" onclick="view('${s.url}')">`).join('')}</div></div>`;
  } else if (state.runTab === 'log') html += `<div class="log">${esc((r.logs || []).join('\n'))}</div>`;
  else html += `<p class="small">Chạy lại flow này từ máy khác bằng REST API (bật ở trang API):</p><pre class="mono" style="white-space:pre-wrap">curl -X POST ${location.origin}/api/v1/flows/${esc(r.flow_id)}/run \\
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
  crumbs(['Lần chạy']);
  const list = await api('GET', '/api/runs?limit=200'); state.runListData = list;
  const cnt = s => list.filter(r => !s || r.status === s).length;
  const shown = list.filter(r => !state.runFilter || r.status === state.runFilter);
  $('#main').innerHTML = pageHead('Lần chạy', 'Mọi lượt chạy workflow: chạy tay, từ AI Agent hay qua REST API') + `
  <section class="card flush"><div class="toolbar"><div class="seg">${[['', 'Tất cả'], ['ok', 'Xong'], ['error', 'Lỗi'], ['running', 'Đang chạy'], ['stopped', 'Dừng']].map(([k, l]) => `<button class="${state.runFilter === k ? 'on' : ''}" onclick="state.runFilter='${k}';runList()">${l} <em>${cnt(k)}</em></button>`).join('')}</div></div>${runTable(shown)}</section>`;
}
async function runDetail(id) {
  const r = await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || {}; state.flow = f;
  crumbs(['Lần chạy', '#/runs'], [r.name]);
  let changed = false; try { const cur = await api('GET', '/api/flows/' + r.flow_id); changed = JSON.stringify(cur.nodes) !== JSON.stringify(f.nodes); } catch { /* flow đã xoá */ }
  $('#main').innerHTML = pageHead(`${esc(r.name)} <span class="badge ${r.status}" style="vertical-align:middle">${STATUS[r.status]}</span>`, `<span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span> · hồ sơ <b>${esc(r.profile)}</b> · ${ago(r.started)}${dur(r) ? ' · chạy ' + dur(r) : ''} · <span class="mono">${esc(id)}</span>`,
    `<button onclick="nav('#/flows/${r.flow_id}')">Mở workflow</button><button class="primary" onclick="rerunDialog('${id}')">${I('play')} Chạy lại…</button>`) + `
  ${changed ? '<div class="warn">' + I('alert') + ' Flow đã đổi kể từ lần chạy này. Sơ đồ dưới đây vẽ theo bản lúc chạy.</div>' : ''}
  <div class="runview boxed">
    <div class="canvaswrap"><div class="head">${I('eye')} Chỉ xem lại, không chạy gì</div><div class="zoom"><button title="Phóng to" onclick="cz(1.2)">${I('plus')}</button><button title="Thu nhỏ" onclick="cz(0.8)">${I('minus')}</button><button title="Vừa khung" onclick="cfit()">${I('expand')}</button></div><div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="body">
      <div class="kv"><div class="k">Đầu vào</div>${Object.entries(r.vars || {}).map(([k, v]) => `<div class="small"><span class="muted">${esc(k)}</span> &nbsp;${esc(typeof v === 'string' ? v : JSON.stringify(v))}</div>`).join('') || '<span class="muted small">—</span>'}</div>
      <div class="kv"><div class="k">Kết quả trả về</div>${r.error ? `<div class="warn">${I('alert')}${esc(r.error)}</div>` : ''}${Object.entries(r.output || {}).map(([k, v]) => `<div class="small" style="margin-bottom:6px"><span class="muted">${esc(k)}</span><pre>${esc(typeof v === 'string' ? (v.length > 1200 ? v.slice(0, 1200) + '…' : v) : JSON.stringify(v, null, 1).slice(0, 1500))}</pre></div>`).join('') || '<span class="muted small">—</span>'}</div>
      ${r.output_paths?.length ? `<div class="kv"><div class="k">File</div>${r.output_paths.map(p => `<div class="small"><a href="#" onclick="api('POST','/api/open-path',{path:${j(p)}});return false">${I('file')} ${esc(p.replace(/\/+$/, '').split('/').pop() || p)}</a></div>`).join('')}</div>` : ''}
      ${r.shots?.length ? `<div class="kv"><div class="k">Ảnh chụp</div><div class="shots">${r.shots.map(s => `<img src="${s.url}" onclick="view('${s.url}')">`).join('')}</div></div>` : ''}
      <div class="kv"><div class="k">Chi tiết bước</div><div id="nodeDetail" class="muted small">Bấm một bước trên sơ đồ để xem.</div></div>
      <div class="kv"><div class="k">Nhật ký</div><div class="log" style="max-height:200px;overflow:auto">${esc((r.logs || []).slice(-60).join('\n'))}</div></div>
      <button class="sm danger" onclick="if(confirm('Xoá lượt chạy này?'))api('DELETE','/api/runs/${id}').then(()=>nav('#/runs'))">${I('trash')} Xoá lượt chạy</button>
    </div></div></div>`;
  if (f.nodes) { drawCanvas(f, $('#canvas'), { onSelect: n => { $('#nodeDetail').innerHTML = `<b>${esc(n.label || n.id)}</b> <span class="mono">${esc(n.type)}</span><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre>`; } }); paintRun(r); }
}
function rerunDialog(id) {
  const r = state.runs.get(id);
  modal(`<h3>Chạy lại workflow này?</h3><p class="small muted">Đây là CHẠY THẬT: workflow sẽ mở trình duyệt và thao tác trên tài khoản của bạn, không phải xem lại.</p>
    <div class="opt on" id="o1" onclick="this.classList.add('on');$('#o2').classList.remove('on')"><b>Bản hiện tại</b><small>Chạy "${esc(r.flow_id)}" bản mới nhất, dùng lại thông tin đã nhập lần trước.</small></div>
    <div class="opt" id="o2" onclick="this.classList.add('on');$('#o1').classList.remove('on')"><b>Bản lúc đó</b><small>Tái hiện đúng lần chạy này, kể cả khi workflow đã bị sửa sau đó.</small></div>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="rerun('${id}', $('#o2').classList.contains('on'))">Chạy lại</button></div>`);
}
async function rerun(id, snapshot) {
  const r = state.runs.get(id); $('#modal').close();
  try { const n = await api('POST', '/api/run', { flow: snapshot ? r.flow_snapshot : r.flow_id, vars: r.vars || {}, profile: r.profile, source: 'canvas' }); state.runs.set(n.id, n); nav('#/run/' + n.id); } catch (e) { toast(e.message); }
}

// ---------- thư viện
async function library() {
  crumbs(['Thư viện']);
  const items = await api('GET', '/api/library'); state.lib = state.lib || { q: '', kind: '' };
  const list = items.filter(i => (!state.lib.q || i.name.toLowerCase().includes(state.lib.q.toLowerCase())) && (!state.lib.kind || (state.lib.kind === 'video') === i.video));
  $('#main').innerHTML = pageHead('Thư viện', `Ảnh và video các workflow đã tạo ra · ${items.filter(i => !i.video).length} ảnh · ${items.filter(i => i.video).length} video`,
    `<button onclick="api('POST','/api/open-path',{path:'~/Library/Application Support/HPBFlow/library/media'})">${I('folder')} Mở thư mục</button>`) + `
  <section class="card flush"><div class="toolbar"><div class="sbox">${I('search')}<input type="text" id="lsearch" placeholder="Tìm theo tên file…" value="${esc(state.lib.q)}" oninput="state.lib.q=this.value;library().then(()=>{const e=$('#lsearch');e.focus();e.setSelectionRange(e.value.length,e.value.length)})"></div>
    <div class="seg"><button class="${!state.lib.kind ? 'on' : ''}" onclick="state.lib.kind='';library()">Tất cả</button><button class="${state.lib.kind === 'image' ? 'on' : ''}" onclick="state.lib.kind='image';library()">Ảnh</button><button class="${state.lib.kind === 'video' ? 'on' : ''}" onclick="state.lib.kind='video';library()">Video</button></div></div>
  <div class="mgrid">${list.map(i => `<figure onclick='previewMedia(${j(i)})'>${i.video ? `<video src="/api/file?path=${encodeURIComponent(i.path)}" muted></video>` : `<img src="/api/file?path=${encodeURIComponent(i.path)}" loading="lazy">`}<figcaption>${esc(i.name)}<br><span class="muted">${(i.size / 1024).toFixed(0)} KB</span></figcaption></figure>`).join('') || '<p class="empty">Chưa có gì. Chạy workflow tạo ảnh (chatgpt-image, gemini-image) để có kết quả ở đây.</p>'}</div></section>`;
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
  crumbs(['Hồ sơ trình duyệt']);
  const list = await api('GET', '/api/profiles/status'); state.profiles = list;
  $('#main').innerHTML = pageHead('Hồ sơ trình duyệt', 'Mỗi hồ sơ là một Chrome riêng với phiên đăng nhập riêng, có thể gắn proxy.', `<button class="primary" onclick="profileDialog()">${I('plus')} Thêm hồ sơ</button>`) + `
  <section class="card flush"><div class="toolbar"><div class="sbox">${I('search')}<input type="text" placeholder="Tìm theo tên hồ sơ…" oninput="document.querySelectorAll('#ptab tr[data-n]').forEach(t=>t.hidden=!t.dataset.n.includes(this.value.toLowerCase()))"></div><span class="muted small">${list.length} hồ sơ · ${list.filter(p => p.running).length} đang mở</span></div>
  <table class="tbl" id="ptab"><thead><tr><th>Hồ sơ</th><th>Proxy</th><th>Cửa sổ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${list.map(p => `<tr data-n="${esc(p.name.toLowerCase())}"><td><div class="fcell"><span class="av ${hue(p.name)}">${esc(p.name[0].toUpperCase())}</span><div><b>${esc(p.name)}</b><div class="sub">${esc(p.engine)}${p.note ? ' · ' + esc(p.note) : ''}</div></div></div></td>
    <td>${p.proxy ? `<span class="mono small">${esc(p.proxy)}</span>` : `<a href="#" class="small" onclick="editProfile(${j(p.name)});return false">+ Gán proxy</a>`}</td>
    <td class="small">${p.headless ? I('eye-off') + ' Chạy ẩn' : I('eye') + ' Hiện cửa sổ'}</td>
    <td>${p.running ? '<span class="badge ok">Đang mở</span>' : '<span class="badge stopped">Đang nghỉ</span>'}</td>
    <td class="acts" style="opacity:1"><button class="sm" onclick="api('POST','/api/profiles/${p.name}/open',{}).then(()=>profiles())">Mở</button> ${p.running ? `<button class="sm" onclick="api('POST','/api/profiles/${p.name}/close').then(()=>profiles())">Đóng</button>` : ''} <button class="icon ghost" title="Sửa" onclick="editProfile(${j(p.name)})">${I('edit')}</button>${p.name !== 'default' ? ` <button class="icon ghost danger" title="Xoá" onclick="if(confirm('Xoá hồ sơ ${p.name} và toàn bộ phiên đăng nhập của nó?'))api('DELETE','/api/profiles/${p.name}').then(()=>profiles())">${I('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></section>
  <div class="note">${I('shield')}<span>Mật khẩu bạn tự gõ trong Chrome, app không lưu hay đọc. Đăng nhập Facebook, TikTok, ChatGPT, Google… một lần trong cửa sổ của hồ sơ; các workflow dùng lại phiên đó.</span></div>`;
}
async function profileDialog() {
  const proxies = await api('GET', '/api/proxies');
  modal(`<h3>Tạo hồ sơ trình duyệt</h3>
    <div class="field"><label>Tên hồ sơ <span class="req">*</span></label><input type="text" id="pname" placeholder="VD: page-hpb"></div>
    <div class="field"><label>Engine trình duyệt</label><select id="pengine"><option value="chrome-cdp">Chrome CDP (Google Chrome trên máy)</option></select><div class="desc">CloakBrowser / AdsPower / GoLogin / Multilogin không có trên bản Mac.</div></div>
    <div class="field"><label>Proxy <span class="muted small" style="font-weight:400">(không bắt buộc)</span></label><div class="row" style="flex-wrap:nowrap"><select id="pproxy"><option value="">Không dùng proxy</option>${proxies.map(p => `<option value="${esc(p.server)}">${esc(p.name)} (${esc(p.server)})</option>`).join('')}</select><button onclick="$('#modal').close();nav('#/proxies')">${I('plus')} Thêm</button></div></div>
    <div class="field"><label>Ghi chú</label><input type="text" id="pnote" placeholder="VD: tài khoản Page HPB"></div>
    <label class="check"><input type="checkbox" id="pheadless"> Chạy ẩn (không hiện cửa sổ)</label>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="createProfile()">Tạo hồ sơ</button></div>`);
}
async function createProfile() {
  try { await api('POST', '/api/profiles', { name: $('#pname').value.trim(), proxy: $('#pproxy').value, note: $('#pnote').value, headless: $('#pheadless').checked }); $('#modal').close(); toast('Đã tạo hồ sơ'); profiles(); } catch (e) { toast(e.message); }
}
async function editProfile(name) {
  const p = state.profiles.find(x => x.name === name); const proxies = await api('GET', '/api/proxies');
  modal(`<h3>Sửa hồ sơ ${esc(name)}</h3>
    <div class="field"><label>Proxy</label><select id="pproxy"><option value="">Không dùng proxy</option>${proxies.map(x => `<option value="${esc(x.server)}" ${x.server === p.proxy ? 'selected' : ''}>${esc(x.name)} (${esc(x.server)})</option>`).join('')}${p.proxy && !proxies.some(x => x.server === p.proxy) ? `<option selected>${esc(p.proxy)}</option>` : ''}</select></div>
    <div class="field"><label>Ghi chú</label><input type="text" id="pnote" value="${esc(p.note || '')}"></div>
    <label class="check"><input type="checkbox" id="pheadless" ${p.headless ? 'checked' : ''}> Chạy ẩn</label>
    <p class="muted small">Đổi proxy/chạy ẩn có hiệu lực ở lần mở Chrome tiếp theo (bấm Đóng rồi Mở lại).</p>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="api('PATCH','/api/profiles/${name}',{proxy:$('#pproxy').value,note:$('#pnote').value,headless:$('#pheadless').checked}).then(()=>{$('#modal').close();profiles()})">Lưu</button></div>`);
}

// ---------- proxy
async function proxies() {
  crumbs(['Proxy']);
  const list = await api('GET', '/api/proxies');
  $('#main').innerHTML = pageHead('Proxy', 'Đặt tên proxy để gán cho hồ sơ. Chrome của hồ sơ sẽ đi qua proxy này (dạng host:port, socks5://host:port…).', `<button class="primary" onclick="proxyDialog()">${I('plus')} Thêm proxy</button>`) + `
  <section class="card flush"><table class="tbl"><thead><tr><th>Tên</th><th>Địa chỉ</th><th>Tài khoản</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="mono">${esc(p.server)}</td><td class="small muted">${esc(p.username || '—')}</td><td class="acts" style="opacity:1"><button class="icon ghost danger" title="Xoá" onclick="api('DELETE','/api/proxies/${encodeURIComponent(p.name)}').then(proxies)">${I('trash')}</button></td></tr>`).join('') || '<tr><td colspan="4"><p class="empty">Chưa có proxy nào.</p></td></tr>'}</tbody></table></section>
  <div class="note">${I('alert')}<span>Proxy có tài khoản/mật khẩu: Chrome sẽ hỏi đăng nhập ở lần mở đầu; nên dùng proxy whitelist IP để chạy tự động không bị chặn.</span></div>`;
}
function proxyDialog() {
  modal(`<h3>Thêm proxy</h3><div class="field"><label>Tên</label><input type="text" id="xname" placeholder="VD: Proxy VN 1"></div><div class="field"><label>Địa chỉ</label><input type="text" id="xserver" placeholder="103.27.238.251:3128 hoặc socks5://host:port"></div>
    <div class="row" style="flex-wrap:nowrap"><div class="field" style="flex:1"><label>Tài khoản</label><input type="text" id="xuser"></div><div class="field" style="flex:1"><label>Mật khẩu</label><input type="password" id="xpass"></div></div>
    <div class="acts"><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="api('POST','/api/proxies',{name:$('#xname').value,server:$('#xserver').value,username:$('#xuser').value,password:$('#xpass').value}).then(()=>{$('#modal').close();proxies()}).catch(e=>toast(e.message))">Lưu</button></div>`);
}

// ---------- engine trình duyệt
async function engines() {
  crumbs(['Engine trình duyệt']);
  const list = await api('GET', '/api/engines');
  $('#main').innerHTML = pageHead('Engine trình duyệt', 'Hồ sơ trình duyệt dùng engine bạn gán cho nó.', `<button onclick="engines()">${I('refresh')} Kiểm tra lại</button>`) + `
  <div class="engines">${list.map(e => `<div class="ecard ${e.recommended ? 'rec' : ''}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div class="row" style="flex-wrap:nowrap"><span class="av ${e.status === 'ready' ? 'h0' : 'off'}">${I('monitor')}</span><div><h3>${esc(e.name)}</h3><div class="muted small">${esc(e.vendor)}</div></div></div>${e.recommended ? '<span class="chip info">Khuyến dùng</span>' : ''}</div><p>${esc(e.desc)}</p>
    <div class="row">${e.status === 'ready' ? '<span class="badge ok">Sẵn sàng</span>' : e.status === 'missing' ? '<span class="badge error">Chưa cài Google Chrome</span>' : '<span class="badge stopped">Không có trên Mac</span>'}${e.id === 'chrome-cdp' ? `<span style="flex:1"></span><a href="#/profiles" class="small">Cấu hình ${I('arrow-right')}</a>` : ''}</div></div>`).join('')}</div>`;
}

// ---------- API
async function apiPage() {
  crumbs(['API & AI Agent']);
  const s = await api('GET', '/api/settings'); state.apiTab = state.apiTab || 'key';
  const profiles = await api('GET', '/api/profiles');
  const body = state.apiTab === 'key' ? `
    <div class="section"><div class="lbl" style="margin-top:0">Khoá API</div><div class="keyfield"><code id="keyText">${'•'.repeat(40)}</code><button class="sm" onclick="$('#keyText').textContent=$('#keyText').textContent.startsWith('•')?${j(s.api_key)}:'${'•'.repeat(40)}'">Hiện</button><button class="sm" onclick="copy(${j(s.api_key)})">Chép</button><button class="sm" onclick="if(confirm('Tạo khoá mới? Client cũ sẽ không gọi được nữa.'))api('POST','/api/settings/rotate-key').then(apiPage)">Tạo khoá mới</button></div></div>
    <div class="section"><div class="lbl" style="margin-top:0">Địa chỉ để gọi API</div><p class="small muted">Client bên ngoài dán địa chỉ này.</p><div class="keyfield"><code>${esc(s.public_url || s.local_url)}</code><button class="sm" onclick="copy(${j(s.public_url || s.local_url)})">Chép</button></div><p class="small muted">Địa chỉ trên máy: <code>${esc(s.local_url)}</code></p></div>
    <div class="section"><div class="lbl" style="margin-top:0">Hồ sơ cho AI API</div><p class="small muted">Một khoá API ứng với một hồ sơ. Hồ sơ cung cấp phiên trình duyệt và tài khoản ChatGPT/Gemini mà /v1/* điều khiển.</p><select onchange="api('POST','/api/settings',{ai_profile:this.value}).then(()=>toast('Đã lưu'))">${profiles.map(p => `<option ${p.name === (s.ai_profile || 'default') ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="section"><div class="lbl" style="margin-top:0">Gọi từ máy khác qua tên miền riêng</div><p class="small muted">Chỉ điền khi bạn đã có reverse proxy (ngrok, Cloudflare Tunnel…) trỏ tên miền về ${esc(s.local_url)}. Điền xong, ô "Địa chỉ để gọi API" ở trên sẽ đổi theo.</p><div class="row" style="flex-wrap:nowrap"><input type="text" id="pubUrl" value="${esc(s.public_url)}" placeholder="https://ten-mien-cua-ban.example"><button class="sm" onclick="api('POST','/api/settings',{public_url:$('#pubUrl').value.trim()}).then(apiPage)">Lưu</button><button class="sm" onclick="api('POST','/api/settings',{public_url:''}).then(apiPage)">Bỏ tên miền</button></div></div>`
  : state.apiTab === 'ai' ? `
    <div class="row" style="margin-bottom:6px"><b>AI API</b><button class="switch ${s.ai_api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{ai_api_enabled:${!s.ai_api_enabled}}).then(apiPage)"></button><span class="chip ${s.ai_api_enabled ? 'ok' : ''}">${s.ai_api_enabled ? '/v1/* đang mở' : '/v1/* đang đóng'}</span></div>
    <p class="small muted">Cho phép gọi ChatGPT/Gemini/Perplexity/Grok bạn đang đăng nhập qua /v1/* (OpenAI-compatible): <code>/v1/models</code>, <code>/v1/chat/completions</code>, <code>/v1/images/generations</code>. Chọn hồ sơ ở tab Khoá API.</p>
    <div class="lbl">Models khả dụng</div><div id="models"><span class="muted small">Đang tải…</span></div>
    <div class="lbl">Ví dụ</div><pre class="mono" style="white-space:pre-wrap">curl ${esc(s.local_url)}/v1/chat/completions \\
  -H "Authorization: Bearer &lt;khoá&gt;" -H "content-type: application/json" \\
  -d '{"model":"gpt-5.6","messages":[{"role":"user","content":"Xin chào"}]}'</pre>`
  : `
    <h2>Để AI tự viết workflow cho bạn</h2><p class="small">Cắm HPB Flow vào coding agent bạn đang dùng, rồi mô tả việc muốn tự động hoá bằng tiếng Việt. Agent tự đọc danh sách node, tự nhìn trang web đang mở để lấy selector thật, viết flow rồi chạy thử. Tiền LLM tính vào gói đăng ký agent của bạn.</p>
    <div class="lbl">Agent trên máy này</div><div id="agents"><span class="muted small">Đang kiểm tra…</span></div>
    <div class="lbl">Thử xem chạy chưa</div><ol class="steps small"><li>Khởi động lại agent vừa cài, vì nó chỉ nạp tool lúc mở.</li><li>Giữ HPB Flow đang chạy (app này).</li><li>Dán prompt sau vào agent: <code>dùng hpb-flow list_flows rồi chạy flow test-browser-echo</code></li><li>Thấy agent gọi tool <code>hpb-flow</code> và trả kết quả là xong.</li></ol>`;
  $('#main').innerHTML = pageHead('API & AI Agent', 'Gọi workflow từ nơi khác, dùng ChatGPT/Gemini bạn đang đăng nhập như một API, hoặc cắm vào coding agent.',
    `<a class="btnlink" href="/api/openapi.json" target="_blank">${I('file')} Tài liệu API</a>`) + `
  <section class="card flush"><div class="apibar">${I('plug')}<b>API đang ${s.api_enabled ? 'bật' : 'tắt'}</b><button class="switch ${s.api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{api_enabled:${!s.api_enabled}}).then(apiPage)"></button><span class="badge ${s.api_enabled ? 'ok' : 'stopped'}">${s.api_enabled ? 'Đang chạy' : 'Đang tắt'}</span><span style="flex:1"></span><code>${esc(s.local_url)}</code><button class="sm" onclick="copy(${j(s.local_url)})">Chép</button></div>
  <div class="apibody"><div class="subtabs">${[['key', 'key', 'Khoá API'], ['ai', 'bot', 'AI API'], ['agent', 'terminal', 'Coding Agent']].map(([k, ic, l]) => `<button class="${state.apiTab === k ? 'on' : ''}" onclick="state.apiTab='${k}';apiPage()">${I(ic)} ${l}</button>`).join('')}</div><div style="flex:1;min-width:0">${body}</div></div></section>`;
  if (state.apiTab === 'ai') { const m = await api('GET', '/api/ai-models'); $('#models').innerHTML = `<table class="tbl"><thead><tr><th>Model ID</th><th>Loại</th><th>Workflow</th></tr></thead><tbody>${m.map(x => `<tr><td class="mono">${esc(x.id)}</td><td><span class="chip ${x.surface === 'chat' ? 'ok' : 'info'}">${esc(x.surface)}</span></td><td><a href="#/flows/${x.flow}" class="small">${esc(x.flow)}</a></td></tr>`).join('')}</tbody></table>`; }
  if (state.apiTab === 'agent') renderAgents();
}
async function renderAgents() {
  const list = await api('GET', '/api/agents');
  $('#agents').innerHTML = `<table class="tbl"><thead><tr><th>Agent</th><th>Trạng thái</th><th>Cắm bằng</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td><b>${esc(a.name)}</b><div class="sub mono">${esc(a.file)}</div></td><td>${a.installed ? '<span class="badge ok">Đã cài</span>' : '<span class="badge stopped">Chưa cài</span>'}</td><td class="small mono">ghi ${a.format}</td><td style="text-align:right">${a.configured ? `<button class="sm" onclick="setAgent('${a.id}',false)">Gỡ</button>` : `<button class="sm primary" onclick="setAgent('${a.id}',true)" ${a.installed ? '' : 'disabled'}>Cài</button>`}</td></tr>`).join('')}</tbody></table><div class="row" style="margin-top:10px"><button class="sm" onclick="renderAgents()">${I('refresh')} Làm mới</button></div>`;
}
async function setAgent(id, on) { try { await api('POST', '/api/agents/' + id, { enabled: on }); toast(on ? 'Đã ghi cấu hình MCP. Khởi động lại agent để nhận tool.' : 'Đã gỡ'); renderAgents(); } catch (e) { toast(e.message); } }

// ---------- cài đặt
async function settings() {
  crumbs(['Cài đặt']);
  const s = await api('GET', '/api/settings');
  const row = (ic, title, desc, ctrl) => `<div class="srow"><span class="av off">${I(ic)}</span><div class="s-t"><b>${title}</b><div class="muted small">${desc}</div></div><div class="s-c">${ctrl}</div></div>`;
  $('#main').innerHTML = pageHead('Cài đặt', 'Khởi động, nơi lưu file và dữ liệu của app') + `
  <section class="card flush settings">
    ${row('zap', 'Khởi động cùng máy', 'Tự mở HPB Flow khi đăng nhập vào máy, để workflow và AI Agent luôn gọi được.', `<button class="switch ${s.launch_at_login ? 'on' : ''}" onclick="api('POST','/api/settings',{launch_at_login:${!s.launch_at_login}}).then(settings)"></button>`)}
    ${row('download', 'Nơi lưu kết quả', `<code>${esc(s.output_dir)}</code>`, `<button class="sm" onclick="api('POST','/api/choose-folder').then(r=>r.path&&api('POST','/api/settings',{output_dir:r.path}).then(settings))">Chọn thư mục</button><button class="sm" onclick="api('POST','/api/settings',{output_dir:'~/Downloads/HPBFlow'}).then(settings)">Đặt lại</button><button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.output_dir)}})">Mở</button>`)}
    ${row('users', 'Nơi lưu hồ sơ trình duyệt', `Dữ liệu đăng nhập của từng hồ sơ: <code>${esc(s.profiles_dir)}</code>`, `<button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.profiles_dir)}})">Mở</button>`)}
    ${row('image', 'Thư viện ảnh/video', '<code>~/Library/Application Support/HPBFlow/library/media</code>', '')}
    ${row('layers', 'Workflow mẫu', '41 workflow mẫu nằm ở <code>~/Library/Application Support/HPBFlow/flows</code>. Engine cloak/adspower trong flow tự chuyển sang Chrome CDP.', '')}
  </section>`;
}

// ---------- bảng lệnh ⌘K: nhảy nhanh tới trang, workflow, lệnh
const PAGES = [['Tổng quan', '#/overview', 'dashboard'], ['Workflow', '#/flows', 'workflow'], ['Lần chạy', '#/runs', 'activity'], ['Thư viện', '#/library', 'image'], ['Hồ sơ trình duyệt', '#/profiles', 'users'], ['Proxy', '#/proxies', 'shield'], ['Engine trình duyệt', '#/engines', 'monitor'], ['API & AI Agent', '#/api', 'plug'], ['Cài đặt', '#/settings', 'sliders']];
async function palette() {
  if (!state.flows.length) await loadFlows().catch(() => {});
  const d = $('#cmd'); d.innerHTML = `<div class="cmd-in">${I('search')}<input type="text" id="cmdq" placeholder="Gõ tên workflow hoặc trang…" autocomplete="off"><kbd>esc</kbd></div><div class="cmd-list" id="cmdl"></div><div class="cmd-f"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>↵</kbd> mở</span></div>`;
  d.showModal(); const q = $('#cmdq'); q.focus(); state.cmdSel = 0;
  const items = () => {
    const t = q.value.trim().toLowerCase();
    const acts = [['Tạo workflow mới', 'new', 'plus'], ['Thêm hồ sơ trình duyệt', 'profile', 'users']];
    const all = [...PAGES.map(([l, h, ic]) => ({ l, h, ic, k: 'Trang' })), ...acts.map(([l, h, ic]) => ({ l, h, ic, k: 'Lệnh' })), ...state.flows.map(f => ({ l: f.name || f.id, s: f.id, h: '#/flows/' + f.id, ic: 'workflow', k: 'Workflow' }))];
    return all.filter(x => !t || (x.l + ' ' + (x.s || '')).toLowerCase().includes(t)).slice(0, 40);
  };
  const draw = () => {
    const list = items(); state.cmdItems = list; state.cmdSel = Math.min(state.cmdSel, Math.max(0, list.length - 1));
    let last = ''; $('#cmdl').innerHTML = list.map((x, i) => (x.k !== last ? `<div class="cmd-g">${(last = x.k)}</div>` : '') + `<div class="cmd-i ${i === state.cmdSel ? 'on' : ''}" data-i="${i}">${I(x.ic)}<span>${esc(x.l)}</span>${x.s && x.s !== x.l ? `<small class="mono">${esc(x.s)}</small>` : ''}</div>`).join('') || '<p class="empty">Không tìm thấy.</p>';
    $('#cmdl .cmd-i.on')?.scrollIntoView({ block: 'nearest' });
  };
  const go = x => { d.close(); if (!x) return; if (x.h === 'new') newFlow(); else if (x.h === 'profile') { nav('#/profiles'); setTimeout(profileDialog, 300); } else nav(x.h); };
  q.oninput = () => { state.cmdSel = 0; draw(); };
  q.onkeydown = e => { if (e.key === 'ArrowDown') { state.cmdSel++; draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { state.cmdSel = Math.max(0, state.cmdSel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') go(state.cmdItems[state.cmdSel]); };
  $('#cmdl').onclick = e => { const it = e.target.closest('.cmd-i'); if (it) go(state.cmdItems[+it.dataset.i]); };
  draw();
}
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmd').open ? $('#cmd').close() : palette(); } });

// ---------- chú thích khi rê chuột (biểu đồ, thanh)
document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'), tip = $('#tip'); if (!t) { tip.classList.remove('show'); return; } tip.textContent = t.dataset.tip; tip.classList.add('show'); });
document.addEventListener('mousemove', e => { const tip = $('#tip'); if (tip.classList.contains('show')) { tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; } });

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
