/* HPB Flow Studio — giao diện web kiểu n8n. Khung: sidebar thu gọn được (không còn thanh trên), mỗi trang tự có đầu trang.
   Trang: Tổng quan, Workflow (danh sách + trình soạn sơ đồ kéo thả), Lần chạy, Báo cáo FB, Thư viện, Hồ sơ, Proxy, Engine, API, Cài đặt. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// JSON để nhúng vào thuộc tính onclick="…" / onclick='…': phải thoát cả nháy kép lẫn nháy đơn
const j = v => esc(JSON.stringify(v)).replace(/'/g, '&#39;');
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || d.error || r.statusText); return d;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
function copy(t) { navigator.clipboard.writeText(t).then(() => toast('Đã chép')); }
function ago(ts) { const s = (Date.now() - ts) / 1000; if (s < 60) return 'vừa xong'; if (s < 3600) return Math.floor(s / 60) + ' phút trước'; if (s < 86400) return Math.floor(s / 3600) + ' giờ trước'; return Math.floor(s / 86400) + ' ngày trước'; }
function secs(r) { return r.ended ? Math.round((r.ended - r.started) / 1000) : null; }
function fmtS(s) { return s == null ? '' : s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
function dur(r) { return fmtS(secs(r)); }
const STATUS = { running: 'Đang chạy', paused: 'Chờ bạn', ok: 'Xong', error: 'Lỗi', stopped: 'Dừng' };
const SRC = { canvas: 'Thủ công', agent: 'AI Agent', api: 'API', draft: 'Nháp', schedule: 'Lịch tự động' };
const I = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
// icon + nhóm màu của từng loại bước: nav = điều hướng, act = thao tác, data = dữ liệu, logic = điều khiển, end = kết thúc
const NODE_UI = { browser_session: ['globe', 'nav'], goto: ['link', 'nav'], wait: ['clock', 'logic'], wait_for_function: ['hourglass', 'logic'], eval_js: ['code', 'act'], click: ['pointer', 'act'], type: ['keyboard', 'act'], key_press: ['keyboard', 'act'], hover: ['mouse', 'act'], scroll: ['updown', 'act'], mouse_click: ['mouse', 'act'], mouse_drag: ['move', 'act'], resize_viewport: ['expand', 'nav'], screenshot: ['camera', 'data'], return: ['return', 'end'], condition: ['branch', 'logic'], loop: ['repeat', 'logic'], set_var: ['variable', 'logic'], emit_progress: ['message', 'data'], human_pause: ['hand', 'logic'], subflow: ['layers', 'logic'], claude_prompt: ['sparkles', 'data'], upload_file: ['clip', 'act'], upload_via_chooser: ['clip', 'act'], resolve_images: ['image', 'data'], save_images_to_library: ['image', 'data'], download_file: ['download', 'data'], poll_stream_text: ['message', 'data'], save_to_file: ['save', 'data'], read_from_txt: ['file', 'data'], save_to_excel: ['table', 'data'], read_from_excel: ['table', 'data'], get_cookies: ['cookie', 'nav'], set_cookies: ['cookie', 'nav'], clear_cookies: ['cookie', 'nav'], new_tab: ['tabs', 'nav'], switch_tab: ['tabs', 'nav'] };
const NODE_NAME = { browser_session: 'Mở trình duyệt', goto: 'Mở trang web', new_tab: 'Mở tab mới', switch_tab: 'Chuyển tab', resize_viewport: 'Đổi cỡ khung nhìn', get_cookies: 'Lấy cookie', set_cookies: 'Đặt cookie', clear_cookies: 'Xoá cookie',
  click: 'Bấm chuột', type: 'Gõ chữ', key_press: 'Nhấn phím', hover: 'Rê chuột', scroll: 'Cuộn trang', mouse_click: 'Bấm theo toạ độ', mouse_drag: 'Kéo chuột', eval_js: 'Chạy JavaScript', upload_file: 'Tải file lên', upload_via_chooser: 'Tải file qua hộp chọn',
  read_from_txt: 'Đọc file', save_to_file: 'Ghi file', read_from_excel: 'Đọc Excel', save_to_excel: 'Ghi Excel', screenshot: 'Chụp màn hình', download_file: 'Tải file về', resolve_images: 'Chuẩn bị ảnh', save_images_to_library: 'Lưu ảnh vào thư viện', poll_stream_text: 'Đọc chữ AI đang viết', emit_progress: 'Ghi nhật ký', claude_prompt: 'Hỏi Claude',
  condition: 'Rẽ nhánh (IF)', loop: 'Lặp (Loop)', set_var: 'Gán biến', wait: 'Chờ', wait_for_function: 'Chờ điều kiện trên trang', human_pause: 'Chờ bạn xác nhận', subflow: 'Gọi workflow con', return: 'Trả kết quả' };
const NODE_DEFAULTS = { goto: { url: 'https://', wait_until: 'domcontentloaded' }, wait: { ms: 1000 }, wait_for_function: { expression: 'document.readyState === "complete"', timeout: 15000 }, eval_js: { code: 'return document.title;', output_var: 'ket_qua' },
  click: { selector: '' }, type: { selector: '', value: '' }, key_press: { key: 'Enter' }, hover: { selector: '' }, scroll: { direction: 'down', amount: 800 }, mouse_click: { x: 0, y: 0 }, mouse_drag: { from_x: 0, from_y: 0, to_x: 100, to_y: 0 }, resize_viewport: { width: 1280, height: 800 },
  screenshot: { emit: true, output_var: 'shot' }, condition: { expression: '{{vars.x}} == yes' }, loop: { times: 3 }, set_var: { key: 'ten_bien', value: '' }, emit_progress: { message: '' }, human_pause: { message: 'Làm xong việc trên trình duyệt rồi bấm Tiếp tục' },
  subflow: { flow_id: '' }, claude_prompt: { prompt: '', output_var: 'ai' }, upload_file: { selector: 'input[type=file]', path: '' }, upload_via_chooser: { trigger_selector: '', path: '' }, resolve_images: { images_var: '', output_var: 'images' }, save_images_to_library: { selector: 'img', output_var: 'saved' },
  download_file: { target_var: '', output_var: 'file' }, poll_stream_text: { msg_selector: '' }, save_to_file: { path: '~/Downloads/HPBFlow/ket-qua.txt', content: '{{vars.ket_qua}}' }, read_from_txt: { path: '', output_var: 'noi_dung' }, save_to_excel: { path: '~/Downloads/HPBFlow/ket-qua.xlsx', rows: '{{vars.rows}}' },
  read_from_excel: { path: '', output_var: 'rows' }, get_cookies: { output_var: 'cookies' }, set_cookies: { cookies: {} }, new_tab: { url: '' }, switch_tab: { index: 0 } };
const CAT_NAME = { nav: 'Trình duyệt & điều hướng', act: 'Thao tác trên trang', data: 'Dữ liệu, file & AI', logic: 'Điều khiển luồng', end: 'Kết thúc' };
// bước có sẵn gắn với app: thêm vào sơ đồ là có logo app đó
const APP_PRESETS = [
  ['sheets', 'Google Sheets', 'Mở bảng tính có sẵn', 'goto', 'Mở Google Sheets', { url: 'https://docs.google.com/spreadsheets/d/…/edit', wait_until: 'domcontentloaded' }],
  ['sheets', 'Tạo Google Sheet mới', 'Mở sheets.new để tạo bảng tính trống', 'goto', 'Tạo Google Sheet', { url: 'https://sheets.new', wait_until: 'domcontentloaded' }],
  ['telegram', 'Telegram', 'Gửi tin nhắn qua bot Telegram', 'goto', 'Báo Telegram', { url: 'https://api.telegram.org/bot{{vars.tg_token}}/sendMessage?chat_id={{vars.chat_id}}&text={{vars.message}}' }],
  ['claude', 'Claude', 'Hỏi Claude trên máy (không cần API key)', 'claude_prompt', 'Claude viết nội dung', { prompt: '', output_var: 'ai' }],
  ['facebook', 'Facebook', 'Mở Facebook bằng phiên đã đăng nhập', 'goto', 'Mở Facebook', { url: 'https://www.facebook.com/', wait_until: 'domcontentloaded' }],
  ['messenger', 'Messenger', 'Mở hộp thư Messenger', 'goto', 'Mở Messenger', { url: 'https://www.messenger.com/' }],
  ['zalo', 'Zalo', 'Mở Zalo Web', 'goto', 'Mở Zalo', { url: 'https://chat.zalo.me/' }],
  ['gmail', 'Gmail', 'Mở hộp thư Gmail', 'goto', 'Mở Gmail', { url: 'https://mail.google.com/' }],
  ['drive', 'Google Drive', 'Mở Google Drive', 'goto', 'Mở Google Drive', { url: 'https://drive.google.com/' }],
  ['docs', 'Google Docs', 'Tạo tài liệu mới', 'goto', 'Tạo Google Docs', { url: 'https://docs.new' }],
  ['chatgpt', 'ChatGPT', 'Mở ChatGPT', 'goto', 'Mở ChatGPT', { url: 'https://chatgpt.com/' }],
  ['gemini', 'Gemini', 'Mở Gemini', 'goto', 'Mở Gemini', { url: 'https://gemini.google.com/app' }],
  ['perplexity', 'Perplexity', 'Mở Perplexity', 'goto', 'Mở Perplexity', { url: 'https://www.perplexity.ai/' }],
  ['notebooklm', 'NotebookLM', 'Mở NotebookLM', 'goto', 'Mở NotebookLM', { url: 'https://notebooklm.google.com/' }],
  ['tiktok', 'TikTok', 'Mở TikTok', 'goto', 'Mở TikTok', { url: 'https://www.tiktok.com/' }],
  ['youtube', 'YouTube', 'Mở YouTube', 'goto', 'Mở YouTube', { url: 'https://www.youtube.com/' }],
  ['instagram', 'Instagram', 'Mở Instagram', 'goto', 'Mở Instagram', { url: 'https://www.instagram.com/' }],
  ['canva', 'Canva', 'Mở Canva', 'goto', 'Mở Canva', { url: 'https://www.canva.com/' }],
  ['wordpress', 'WordPress', 'Vào trang quản trị WordPress', 'goto', 'Mở WordPress', { url: '{{vars.site}}/wp-admin/' }],
  ['cloudflare', 'Cloudflare', 'Mở bảng điều khiển Cloudflare', 'goto', 'Mở Cloudflare', { url: 'https://dash.cloudflare.com/' }],
  ['excel', 'Excel: đọc file', 'Đọc bảng .xlsx thành danh sách dòng', 'read_from_excel', 'Đọc Excel', { path: '', output_var: 'rows' }],
  ['excel', 'Excel: ghi file', 'Ghi danh sách dòng ra .xlsx', 'save_to_excel', 'Ghi Excel', { path: '~/Downloads/HPBFlow/ket-qua.xlsx', rows: '{{vars.rows}}' }],
];
const nIcon = t => I((NODE_UI[t] || ['zap'])[0]);
const nCat = t => (NODE_UI[t] || [0, 'nav'])[1];
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'h' + (h % 6); };
const state = { flows: [], runs: new Map(), filter: '', tag: '', group: '', sort: 'recent', runFilter: '', profiles: [], sel: null, canvas: null, ed: null };
const flowById = id => state.flows.find(f => f.id === id);

// ---------- khung: đường dẫn nằm trong đầu trang (không còn thanh trên)
function crumbs(...parts) { state.crumbs = [['HPB Flow', '#/overview'], ...parts]; }
function crumbHtml() { const c = state.crumbs || []; return c.length > 1 ? `<nav class="crumbs">${c.map(([t, h], i) => i === c.length - 1 ? `<span>${esc(t)}</span>` : `<a href="${h}">${esc(t)}</a><span class="sep">/</span>`).join('')}</nav>` : ''; }
function pageHead(title, sub, right = '') {
  return `<div class="ph"><div>${crumbHtml()}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="ph-r">${right}</div>` : ''}</div>`;
}
function toggleSide() { const on = document.body.classList.toggle('collapsed'); try { localStorage.setItem('hpbflow.side', on ? '1' : ''); } catch { /* không lưu được thì thôi */ } if (state.canvas) setTimeout(applyT, 50); }

// ---------- menu: khai báo ở đây, thêm module mới chỉ cần thêm một dòng.
// soon = module sắp làm (hiện nhãn "Sắp có", mở trang giới thiệu); when = chỉ hiện khi có dữ liệu (mục đang không dùng thì ẩn)
const NAV = [
  { g: 'Điều hành', items: [
    { page: 'overview', label: 'Bảng điều khiển', icon: 'dashboard' },
    { page: 'todo', label: 'Việc hôm nay', icon: 'check', badge: 'navTodo' },
    { page: 'flows', label: 'Quy trình tự động', icon: 'workflow' },
    { page: 'runs', label: 'Lịch sử chạy', icon: 'activity', badge: 'navRunning' },
    { page: 'schedule', label: 'Lịch tự động', icon: 'calendar', soon: true },
  ] },
  { g: 'Tăng trưởng', items: [
    { page: 'reports', label: 'Radar Facebook', logo: 'facebook' },
    { page: 'leads', label: 'Khách tiềm năng', icon: 'target', soon: true },
    { page: 'zalo', label: 'Chatbot Zalo', logo: 'zalo', soon: true },
    { page: 'studio', label: 'Nội dung AI', icon: 'sparkles', soon: true },
    { page: 'library', label: 'Kho ảnh & video', icon: 'image', when: 'library' },
  ] },
  { g: 'Kết nối', items: [
    { page: 'profiles', label: 'Trình duyệt & tài khoản', logo: 'chrome' },
    { page: 'connections', label: 'Kết nối ứng dụng', icon: 'plug', soon: true },
    { page: 'proxies', label: 'Proxy', icon: 'shield', when: 'proxies' },
  ] },
];
const NAV_FOOT = { page: 'settings', label: 'Cài đặt', icon: 'sliders' };
// tab đầu trang Cài đặt: Chung / AI Agent & API
const settingsTabs = cur => `<div class="stabs">${[['settings', 'sliders', 'Chung'], ['api', 'bot', 'AI Agent & API']].map(([k, ic, l]) => `<a href="#/${k}" class="${cur === k ? 'on' : ''}">${I(ic)} ${l}</a>`).join('')}</div>`;
const navLabel = page => NAV.flatMap(g => g.items).concat(NAV_FOOT).find(x => x.page === page)?.label;
function renderNav() {
  const has = state.navHas || {}, cur = (location.hash.split('/')[1] || 'overview').replace(/^run$/, 'runs');
  const item = x => `<a href="#/${x.page}" data-page="${x.page}" title="${esc(x.label)}${x.soon ? ' (sắp có)' : ''}" class="${x.page === cur ? 'active' : ''} ${x.soon ? 'soon' : ''}">${x.logo ? `<span class="nlogo">${logoSvg(x.logo)}</span>` : I(x.icon)}<span>${esc(x.label)}</span>${x.soon ? '<i class="soonb">Sắp có</i>' : ''}${x.badge ? `<em id="${x.badge}"></em>` : ''}</a>`;
  $('#nav').innerHTML = NAV.map(g => { const its = g.items.filter(x => !x.when || has[x.when]); return its.length ? `<div class="ngroup">${g.g}</div>` + its.map(item).join('') : ''; }).join('') + `<div class="nfoot">${item(NAV_FOOT)}</div>`;
  updateLive();
}
// mục "chỉ hiện khi có dữ liệu": kiểm tra một lần lúc mở app và khi quay lại các trang đó
async function refreshNavData() {
  const [lib, px] = await Promise.all([api('GET', '/api/library').catch(() => []), api('GET', '/api/proxies').catch(() => [])]);
  state.navHas = { library: lib.length > 0, proxies: px.length > 0 }; renderNav(); todoBadge();
}
// trang giới thiệu module sắp làm
const SOON = {
  schedule: { icon: 'calendar', title: 'Lịch tự động', lead: 'Hẹn giờ cho mọi quy trình ngay trong app, không cần đụng tới launchd.', now: 'Hiện có 1 lịch đang bật: "FB - Tự động quét nhóm & bình luận" chạy 7 lần/ngày (7:30, 10:00, 12:30, 15:00, 17:30, 20:00, 22:00), cài bằng launchd.',
    points: ['Xem mọi lịch đang bật, lần chạy kế tiếp và lần chạy gần nhất', 'Bật/tắt, đổi giờ chạy, chọn ngày trong tuần', 'Không chạy chồng khi lượt trước chưa xong; báo Telegram khi lỗi liên tiếp'], flow: 'fb-tu-dong-quet-binh-luan' },
  leads: { icon: 'target', title: 'Khách tiềm năng', lead: 'Gom mọi bài "cần làm web" mà Radar Facebook tìm được thành một danh sách khách để chăm sóc.',
    points: ['Mỗi khách một thẻ: nhóm, người đăng, nội dung, link bài, bình luận đã gửi', 'Trạng thái chăm sóc: Mới → Đã bình luận → Đã nhắn → Đang báo giá → Chốt / Bỏ', 'Nhắc việc theo ngày, xuất sang Google Sheet'], apps: ['facebook', 'sheets'] },
  zalo: { logo: 'zalo', title: 'Chatbot Zalo', lead: 'Trả lời tin nhắn Zalo bằng AI theo giọng của bạn, lead đổ về Khách tiềm năng.',
    points: ['Kết nối Zalo cá nhân hoặc Zalo OA', 'Kịch bản trả lời + Claude soạn câu trả lời, bạn duyệt trước khi gửi', 'Theo dõi hội thoại, gắn trạng thái khách'], apps: ['zalo', 'claude'] },
  studio: { icon: 'sparkles', title: 'Nội dung AI', lead: 'Tạo ảnh, banner, video ngắn và bài đăng bằng AI, lưu gọn vào Kho ảnh & video.',
    points: ['Tạo ảnh bằng ChatGPT / Gemini qua các quy trình có sẵn', 'Mẫu bài đăng Facebook, TikTok theo phong cách HPB', 'Lịch đăng nội dung'], apps: ['chatgpt', 'gemini', 'canva', 'tiktok'] },
  connections: { icon: 'plug', title: 'Kết nối ứng dụng', lead: 'Quản lý các tài khoản và khoá mà quy trình dùng ở một chỗ, thay cho các file token rời.',
    points: ['Google Sheets, Telegram bot, Zalo OA, Claude, ChatGPT', 'Kiểm tra kết nối còn sống hay đã hết hạn', 'Quy trình chọn kết nối thay vì dán đường dẫn file'], apps: ['sheets', 'telegram', 'zalo', 'claude', 'chatgpt'] },
};
function soonPage(key) {
  const x = SOON[key]; crumbs([x.title]);
  $('#main').innerHTML = `<div class="wrap">` + pageHead(`${x.logo ? appTile(x.logo, 'lg') : `<span class="tile lg" style="color:var(--brand)">${I(x.icon)}</span>`} ${esc(x.title)} <span class="chip info">Sắp có</span>`, esc(x.lead)) + `
  <section class="card soonc"><div class="soon-art">${I('rocket')}</div><div style="flex:1;min-width:0">
    <h3>Module này đang được xây dựng</h3>${x.now ? `<div class="note" style="margin:8px 0 4px">${I('clock')}<span>${esc(x.now)}</span></div>` : ''}
    <div class="lbl">Sẽ có</div><ul class="soonl">${x.points.map(p => `<li>${I('check')}<span>${esc(p)}</span></li>`).join('')}</ul>
    ${x.apps ? `<div class="lbl">Làm việc với</div>${appStack(x.apps, 6)}` : ''}
    <div class="row" style="margin-top:18px">${x.flow ? `<button class="primary" onclick="nav('#/flows/${x.flow}')">${I('workflow')} Mở quy trình đang chạy theo lịch</button>` : ''}<button onclick="nav('#/flows')">Xem các quy trình hiện có</button></div>
  </div></section></div>`;
}

// ---------- router
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', e => { if (state.ed?.dirty) { e.preventDefault(); e.returnValue = ''; } });
async function route() {
  if (state.skipRoute) { state.skipRoute = false; return; }
  // đang sửa sơ đồ mà chưa lưu: hỏi trước khi rời trang
  if (state.ed?.dirty && !confirm('Workflow có thay đổi chưa lưu. Bỏ thay đổi và rời trang?')) { if (location.hash !== state.ed.hash) { state.skipRoute = true; location.hash = state.ed.hash; } return; }
  state.ed = null; state.canvas = null; state.sel = null; state.runTl = null;
  const [, page = 'overview', a, b] = location.hash.split('/');
  const navPage = { run: 'runs', api: 'settings', engines: 'settings' }[page] || page;
  document.querySelectorAll('#nav a[data-page]').forEach(x => x.classList.toggle('active', x.dataset.page === navPage));
  const fn = SOON[page] ? () => soonPage(page) : { overview, todo: todoPage, reports: fbReport, flows: a ? flowDetail : flowList, runs: a ? runDetail : runList, run: runView, library, profiles, proxies, engines, api: apiPage, settings }[page] || overview;
  if (['library', 'proxies'].includes(page)) refreshNavData();
  const m = $('#main'); m.className = ''; m.scrollTop = 0; document.onkeydown = null;
  try { if (!state.flows.length) await loadFlows(); await fn(a, b); } catch (e) { m.innerHTML = `<div class="wrap"><div class="warn">${I('alert')}${esc(e.message)}</div></div>`; }
  void m.offsetWidth; m.classList.add('enter');
}
function nav(h) { location.hash = h; }
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });

// ---------- việc hôm nay: to-do cá nhân kiểu Todoist (ưu tiên P1–P4, mô tả, dời lịch) + Karma (XP, cấp, chuỗi ngày, huy hiệu).
// Dữ liệu ở todos.json trong thư mục dữ liệu của app; XP/cấp/huy hiệu tính lại từ danh sách việc nên không cần lưu thêm gì.
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const dayShift = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
const dayDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'], DOW_S = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const tdToday = () => dayKey(Date.now());
function dayTitle(k) { const t = tdToday(); if (k === t) return 'Hôm nay'; if (k === dayShift(t, -1)) return 'Hôm qua'; if (k === dayShift(t, 1)) return 'Ngày mai'; return DOW[dayDate(k).getDay()]; }
const dayVN = k => k.split('-').reverse().join('/');
const dayLong = k => { const d = dayDate(k); return `${DOW[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}`; };
function tdDateLabel(k) { const t = tdToday(), diff = Math.round((dayDate(k) - dayDate(t)) / 864e5); return diff === 0 ? 'Hôm nay' : diff === 1 ? 'Ngày mai' : diff === -1 ? 'Hôm qua' : diff > 1 && diff < 7 ? DOW[dayDate(k).getDay()] : dayVN(k).slice(0, 5); }
function tdDateCls(k) { const t = tdToday(); return k < t ? 'dl-late' : k === t ? 'dl-today' : k === dayShift(t, 1) ? 'dl-tmr' : 'dl-later'; }
const PRIO = { 1: 'Ưu tiên 1', 2: 'Ưu tiên 2', 3: 'Ưu tiên 3', 4: 'Ưu tiên 4' };
const tdP = t => t.prio || (t.star ? 1 : 4);
const tdXp = t => ({ 1: 20, 2: 15, 3: 12, 4: 10 })[tdP(t)];
const LEVEL_TITLES = [[1, 'Tập sự'], [2, 'Người khởi động'], [3, 'Người thực thi'], [4, 'Tay chạy đà'], [5, 'Chiến binh năng suất'], [7, 'Kẻ săn deadline'], [9, 'Cao thủ'], [12, 'Bậc thầy tập trung'], [16, 'Huyền thoại'], [20, 'Cỗ máy hoàn thành'], [30, 'Thần tốc']];
// sticker động: Noto Animated Emoji (Google, CC BY 4.0), đã thu nhỏ trong public/stickers/ — bản -s.webp là khung tĩnh
const stk = (c, anim) => `/stickers/${c}${anim ? '' : '-s'}.webp`;
const stkImg = (c, cls = '', anim = false) => `<img class="stk ${cls}" src="${stk(c, anim)}" alt="" draggable="false"${anim ? '' : ` onmouseenter="this.src='${stk(c, true)}'" onmouseleave="this.src='${stk(c)}'"`}>`;
const TODO_BADGES = [
  { id: 'first', stk: '1f680', name: 'Khởi động', how: 'Xong việc đầu tiên', goal: 1, val: s => s.done },
  { id: 'early', stk: '1f413', name: 'Dậy sớm', how: 'Xong một việc trước 8 giờ sáng', goal: 1, val: s => s.early },
  { id: 'full', stk: '1f3c6', name: 'Trọn vẹn', how: 'Xong 100% việc của một ngày (từ 3 việc)', goal: 1, val: s => s.full },
  { id: 'day5', stk: '26a1', name: 'Ngày bùng nổ', how: 'Xong 5 việc trong một ngày', goal: 5, val: s => s.maxDay },
  { id: 'star5', stk: '1f3af', name: 'Đúng trọng tâm', how: 'Xong 5 việc Ưu tiên 1', goal: 5, val: s => s.p1 },
  { id: 'combo5', stk: '1f929', name: 'Combo x5', how: 'Xong 5 việc liền nhau, mỗi việc cách nhau dưới 2 phút', goal: 5, val: s => s.combo },
  { id: 'streak3', stk: '1f525', name: 'Lửa 3 ngày', how: 'Chuỗi 3 ngày xong hết việc', goal: 3, val: s => s.best },
  { id: 'streak7', stk: '1f30b', name: 'Tuần rực lửa', how: 'Chuỗi 7 ngày xong hết việc', goal: 7, val: s => s.best },
  { id: 'weekend', stk: '1f60e', name: 'Chiến cuối tuần', how: 'Xong việc vào Thứ 7 hoặc Chủ nhật', goal: 1, val: s => s.weekend },
  { id: 't50', stk: '1f4aa', name: '50 việc', how: 'Tổng cộng xong 50 việc', goal: 50, val: s => s.done },
  { id: 'lv5', stk: '1f451', name: 'Cấp 5', how: 'Đạt cấp 5', goal: 5, val: s => s.level },
  { id: 't100', stk: '1f4af', name: 'Trăm việc', how: 'Tổng cộng xong 100 việc', goal: 100, val: s => s.done },
];
const tdOf = k => state.todos.filter(t => t.date === k);
const tdFind = id => state.todos.find(t => t.id === id);
function tdFull(k) { const a = tdOf(k); return a.length > 0 && a.every(x => x.done); }
function tdStreak() { const t = tdToday(); let k = tdFull(t) ? t : dayShift(t, -1), n = 0; while (tdFull(k)) { n++; k = dayShift(k, -1); } return n; }
function tdBestStreak() { const days = [...new Set(state.todos.map(t => t.date))].sort(); let best = 0, cur = 0, prev = null; for (const k of days) { if (tdFull(k)) { cur = prev && dayShift(prev, 1) === k ? cur + 1 : 1; best = Math.max(best, cur); } else cur = 0; prev = k; } return best; }
function tdLevel() {
  let xp = state.todos.filter(t => t.done).reduce((s, t) => s + tdXp(t), 0), total = xp, L = 1, need = 100;
  while (xp >= need) { xp -= need; L++; need = 100 + (L - 1) * 50; }
  return { L, xp, need, total, title: LEVEL_TITLES.filter(([l]) => L >= l).pop()[1] };
}
function tdStats() {
  const done = state.todos.filter(t => t.done), byDay = {}; for (const t of done) byDay[t.date] = (byDay[t.date] || 0) + 1;
  let combo = 0, run = 0, prev = 0; for (const x of done.map(t => t.doneAt || 0).filter(Boolean).sort((a, b) => a - b)) { run = x - prev < 120000 ? run + 1 : 1; prev = x; combo = Math.max(combo, run); }
  return { done: done.length, early: +done.some(t => t.doneAt && new Date(t.doneAt).getHours() < 8), maxDay: Math.max(0, ...Object.values(byDay)),
    full: +Object.keys(byDay).some(k => tdFull(k) && tdOf(k).length >= 3), p1: done.filter(t => tdP(t) === 1).length, best: tdBestStreak(),
    weekend: +done.some(t => [0, 6].includes(dayDate(t.date).getDay())), combo, level: tdLevel().L };
}
function tdBadges() { const st = tdStats(); return new Set(TODO_BADGES.filter(b => b.val(st) >= b.goal).map(b => b.id)); }
function tdBadgeGrid() {
  const st = tdStats(), got = state.todoBadgeSet || tdBadges();
  return TODO_BADGES.map(b => { const on = got.has(b.id), v = Math.min(b.val(st), b.goal);
    return `<div class="bd ${on ? 'on' : 'off'}" title="${esc(b.name + ': ' + b.how)}${on ? '' : ` · ${v}/${b.goal}`}">${stkImg(b.stk)}<small>${esc(b.name)}</small>${on ? '' : `<span class="bp"><i style="width:${v / b.goal * 100}%"></i></span>`}</div>`; }).join('');
}
const tdSoundOn = () => { try { return localStorage.getItem('hpbflow.sound') !== '0'; } catch { return true; } };
function tdSound(kind, combo = 1) {
  if (!tdSoundOn()) return;
  try {
    const ac = state.audio || (state.audio = new (window.AudioContext || window.webkitAudioContext)()), now = ac.currentTime, up = Math.pow(2, Math.min(combo - 1, 8) / 6);
    const notes = kind === 'level' ? [523, 659, 784, 1047] : kind === 'win' ? [659, 784, 988, 1319] : [784 * up, 1175 * up];
    notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; const t0 = now + i * (kind === 'tick' ? .06 : .1);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(kind === 'tick' ? .09 : .12, t0 + .01); g.gain.exponentialRampToValueAtTime(.001, t0 + .28); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + .3); });
  } catch { /* máy không phát được âm thanh thì thôi */ }
}
function todoSoundToggle(el) { const on = !tdSoundOn(); try { localStorage.setItem('hpbflow.sound', on ? '1' : '0'); } catch { /* bỏ qua */ } el?.classList.toggle('on', on); if (on) tdSound('tick'); }

const TD_CHECK = '<svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9"/></svg>';
async function todoPage() {
  crumbs(['Việc hôm nay']);
  state.todoDay = state.todoDay || tdToday(); state.tdEd = null; state.tdDraft = null;
  state.todos = await api('GET', '/api/todos');
  state.todoBadgeSet = tdBadges();
  const h = new Date().getHours(), hi = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  $('#main').classList.add('tdpage');
  // ô soạn việc (#tdAddBox) nằm cố định, danh sách vẽ lại không đụng tới nó: bộ gõ tiếng Việt (Telex, GoTiengViet) trên WebKit
  // mất ngữ cảnh nếu ô nhập bị xoá/tạo lại hoặc được focus ngay trong lúc bấm.
  $('#main').innerHTML = `<div class="wrap tdx"><div class="tdx-grid">
    <div class="tdx-main">
      <header class="tdx-head">
        <div class="tdx-title"><div class="tdx-hi">${hi}, Hưng</div><h1 id="tdTitle"></h1><span id="tdSub"></span></div>
        <div class="tdx-tools">
          <div class="tdx-nav"><button title="Ngày trước (←)" onclick="todoGo(-1)">‹</button><button id="tdTodayBtn" onclick="todoSet(tdToday())">Hôm nay</button><button title="Ngày sau (→)" onclick="todoGo(1)">›</button></div>
          <button class="karma" id="tdKarma" title="Karma: cấp độ, chuỗi ngày, huy hiệu" onclick="todoKarma(this)"></button>
        </div>
      </header>
      <div class="tdx-week" id="tdWeek"></div>
      <div id="tdOverBox"></div>
      <section class="tdx-sec"><div class="tdx-sech" id="tdMainHead"></div><div id="tdRows"></div><div id="tdAddBox"></div><div id="tdEmpty"></div></section>
      <div id="tdDoneBox"></div>
    </div>
    <aside class="tdx-side">
      <div class="sc sc-prog" id="sProg">
        <div class="sring"><svg viewBox="0 0 100 100"><defs><linearGradient id="tdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bf0"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs><circle cx="50" cy="50" r="42" class="rbg"/><circle cx="50" cy="50" r="42" class="rfg" id="tdRing"/></svg><div class="sv"><b><span id="sPct">0</span><i>%</i></b><small id="sCnt"></small></div></div>
        <div class="swin">${stkImg('1f3c6', '', true)}</div>
        <div class="sp-txt"><b id="sHead"></b><span id="sSub"></span></div>
        <div class="segs" id="sSegs"></div>
      </div>
      <div class="sc" id="sKarma"></div>
      <div class="sc" id="sChart"></div>
      <div class="sc" id="sBadges"></div>
      <div class="sfoot" id="sFoot"></div>
    </aside>
  </div></div>`;
  document.onkeydown = e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target.matches('input,textarea')) { if (e.key === 'Escape' && state.tdEd) todoCloseEd(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'q' || e.key === 'n') { e.preventDefault(); todoOpenAdd(); }
    else if (e.key === 'ArrowLeft') todoGo(-1); else if (e.key === 'ArrowRight') todoGo(1); else if (e.key === 'Escape') tdPopClose();
  };
  if (!tdOf(state.todoDay).length) { state.tdEd = 'new'; state.tdDraft = { date: state.todoDay, prio: 4 }; }
  todoDraw(); todoAddBox(); tdFocus();
}
function todoDraw() { todoHead(); todoWeek(); todoList(); }
function todoHead() {
  const day = state.todoDay, today = tdToday(), items = tdOf(day), n = items.length, done = items.filter(t => t.done).length;
  $('#tdTitle').textContent = dayTitle(day);
  $('#tdSub').textContent = dayLong(day) + (n ? ` · ${done}/${n} việc đã xong` : '');
  $('#tdTodayBtn').disabled = day === today;
  const lv = tdLevel(), st = tdStreak(), C = 2 * Math.PI * 10;
  $('#tdKarma').innerHTML = `<span class="kr"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" class="kb"/><circle cx="12" cy="12" r="10" class="kf" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - lv.xp / lv.need)}"/></svg><b>${lv.L}</b></span><span>${lv.total.toLocaleString('vi-VN')} XP</span>${st ? `<span class="ks">🔥 ${st}</span>` : ''}`;
  if (day === today) todoBadge(n - done);
  if ($('#tdRing')) todoSide();
}
function todoSide() {
  const day = state.todoDay, today = tdToday(), items = tdOf(day), n = items.length, done = items.filter(t => t.done).length, pct = n ? Math.round(done / n * 100) : 0, left = n - done;
  $('#tdRing').style.strokeDashoffset = 263.9 * (1 - pct / 100);
  const full = n > 0 && !left; $('#sProg').classList.toggle('full', full);
  $('#sPct').textContent = pct; $('#sCnt').textContent = n ? `${done}/${n} việc` : 'chưa có việc';
  const xpDay = items.filter(t => t.done).reduce((s, t) => s + tdXp(t), 0), xpLeft = items.filter(t => !t.done).reduce((s, t) => s + tdXp(t), 0);
  const lv = tdLevel(), st = tdStreak(), best = tdBestStreak();
  $('#sHead').innerHTML = full ? `<span class="okp">${I('check')} Hoàn thành 100%</span>${day === today ? 'Ngày trọn vẹn!' : 'Đã xong hết việc'}` : !n ? (day === today ? 'Bắt đầu ngày mới' : 'Chưa có việc') : left === 1 ? 'Còn 1 việc nữa thôi' : `Còn ${left} việc`;
  $('#sSub').innerHTML = full ? `${n}/${n} việc · <em>+${xpDay} XP</em>${st && day === today ? ` · chuỗi ${st} ngày` : ''}` : !n ? 'Thêm việc để bắt đầu kiếm XP' : `<em>+${xpDay} XP</em> đã nhận${xpLeft ? ` · còn ${xpLeft} XP chờ bạn` : ''}`;
  const seg = [...items].sort((a, b) => (b.done - a.done) || tdP(a) - tdP(b));
  $('#sSegs').innerHTML = n && n <= 14 ? seg.map(t => `<i class="${t.done ? 'on' : ''}"></i>`).join('') : n ? `<i class="on" style="flex:${done || .001}"></i><i style="flex:${left || .001}"></i>` : '';
  $('#sKarma').innerHTML = `<div class="sk-top"><div class="kp-lv">${lv.L}</div><div><small>Cấp ${lv.L}</small><b>${esc(lv.title)}</b></div></div>
    <div class="kp-bar"><i style="width:${lv.xp / lv.need * 100}%"></i></div><div class="kp-sub"><span>${lv.xp}/${lv.need} XP</span><span>Còn ${lv.need - lv.xp} XP lên cấp</span></div>
    <div class="sk-streak ${st ? 'hot' : ''}">${stkImg('1f525', 'fl', !!st)}<div><b>${st} ngày</b><small>${st ? 'liên tiếp xong hết việc' : 'Xong hết việc hôm nay để bắt đầu chuỗi'}</small></div><em title="Chuỗi dài nhất">Kỷ lục ${best}</em></div>`;
  const days = [...Array(7)].map((_, i) => dayShift(today, i - 6)), cnt = days.map(k => tdOf(k).filter(t => t.done).length), mx = Math.max(4, ...cnt), sum = cnt.reduce((a, b) => a + b, 0);
  $('#sChart').innerHTML = `<div class="sc-h">7 ngày qua <span>${sum} việc</span></div><div class="kp-chart">${days.map((k, i) => `<div title="${esc(dayLong(k))}: xong ${cnt[i]} việc">${cnt[i] ? `<em>${cnt[i]}</em>` : ''}<i style="height:${Math.max(cnt[i] / mx * 100, 5)}%" class="${k === today ? 'now' : ''}"></i><small>${DOW_S[dayDate(k).getDay()]}</small></div>`).join('')}</div>`;
  const got = state.todoBadgeSet || tdBadges();
  $('#sBadges').innerHTML = `<div class="sc-h">Huy hiệu <span>${got.size}/${TODO_BADGES.length} đã mở</span></div><div class="sb-grid">${tdBadgeGrid()}</div>`;
  $('#sFoot').innerHTML = `<span><kbd>Q</kbd> thêm việc</span><span><kbd>←</kbd><kbd>→</kbd> đổi ngày</span><button class="sw ${tdSoundOn() ? 'on' : ''}" title="Âm thanh khi hoàn thành" onclick="todoSoundToggle(this)"><i></i></button><a class="credit" href="https://googlefonts.github.io/noto-emoji-animation/" target="_blank" rel="noopener">Sticker: Noto Emoji (Google), CC BY 4.0</a>`;
}
function todoWeek() {
  const day = state.todoDay, today = tdToday(), mon = dayShift(day, -((dayDate(day).getDay() + 6) % 7));
  $('#tdWeek').innerHTML = `<button class="wa" title="Tuần trước" onclick="todoGo(-7)">‹</button>` + [...Array(7)].map((_, i) => {
    const k = dayShift(mon, i), a = tdOf(k), d = a.filter(t => t.done).length, p = a.length ? d / a.length : 0, C = 2 * Math.PI * 17;
    return `<button class="wd ${k === day ? 'on' : ''} ${k === today ? 'today' : ''} ${a.length ? 'has' : ''} ${tdFull(k) ? 'full' : ''}" onclick='todoSet(${j(k)})' title="${esc(dayLong(k))}${a.length ? ` · ${d}/${a.length} việc` : ''}"><span>${DOW_S[dayDate(k).getDay()]}</span><b><svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="17" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - p)}"/></svg><u>${+k.slice(8)}</u></b></button>`;
  }).join('') + `<button class="wa" title="Tuần sau" onclick="todoGo(7)">›</button>`;
}
function tdRow(t) {
  if (state.tdEd === t.id) return '<div id="tdEdSlot"></div>';
  const p = tdP(t), late = !t.done && t.date < state.todoDay;
  const meta = (t.date !== state.todoDay ? `<span class="${tdDateCls(t.date)}">${I('calendar')}${tdDateLabel(t.date)}</span>` : '') + (p < 4 && !t.done ? `<span class="pf${p}">${I('flag')}P${p}</span>` : '');
  return `<div class="tr p${p} ${t.done ? 'done' : ''} ${state.todoFlash === t.id ? 'flash' : ''}" data-id="${t.id}">
    <button class="tr-ck" title="${t.done ? 'Đánh dấu chưa xong' : `Hoàn thành (+${tdXp(t)} XP)`}" onclick='todoToggle(${j(t.id)}, event)'>${TD_CHECK}</button>
    <div class="tr-body" onclick='todoEdit(${j(t.id)})'><div class="tr-t">${esc(t.text)}</div>${t.note ? `<div class="tr-n">${esc(t.note)}</div>` : ''}${meta ? `<div class="tr-meta">${meta}</div>` : ''}</div>
    ${t.done ? '' : `<span class="tr-xp">+${tdXp(t)}</span>`}
    <div class="tr-act">
      ${t.done ? '' : `<button title="Sửa" onclick='todoEdit(${j(t.id)})'>${I('edit')}</button><button title="${late ? 'Dời lịch' : 'Đổi ngày'}" onclick='todoRowDate(${j(t.id)}, this)'>${I('calendar')}</button><button title="Mức ưu tiên" onclick='todoRowPrio(${j(t.id)}, this)'>${I('flag')}</button>`}
      <button class="del" title="Xoá" onclick='todoDel(${j(t.id)})'>${I('trash')}</button>
    </div></div>`;
}
function tdEditorEl(mode) {
  const d = state.tdDraft || {}, f = document.createElement('form'); f.className = 'tdx-ed'; f.onsubmit = todoSubmit;
  f.innerHTML = `<input class="et" id="tdIn" placeholder="${mode === 'edit' ? 'Tên việc' : 'Tên việc, ví dụ: Gọi khách chốt báo giá'}" maxlength="500" autocomplete="off" spellcheck="false">
    <input class="en" id="tdNote" placeholder="Mô tả" maxlength="1000" autocomplete="off" spellcheck="false">
    <div class="ed-chips"><button type="button" class="cb" id="tdDateChip" onclick="todoDraftDate(this)"></button><button type="button" class="cb" id="tdPrioChip" onclick="todoDraftPrio(this)"></button></div>
    <div class="ed-foot"><span class="muted small">${mode === 'edit' ? 'Esc để huỷ' : 'Enter để thêm · Esc để đóng'}</span><button type="button" onclick="todoCloseEd()">Huỷ</button><button type="submit" class="pri">${mode === 'edit' ? 'Lưu' : 'Thêm việc'}</button></div>`;
  f.querySelector('#tdIn').value = d.text || ''; f.querySelector('#tdNote').value = d.note || '';
  for (const i of f.querySelectorAll('input')) { i.addEventListener('compositionstart', () => { state.tdComposing = true; }); i.addEventListener('compositionend', () => { setTimeout(() => { state.tdComposing = false; }, 0); }); }
  state.tdEdEl = f; setTimeout(tdChips, 0); return f;
}
function tdFocus() { setTimeout(() => { const i = $('#tdIn'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 40); }
function todoAddBox() {
  const box = $('#tdAddBox'); if (!box) return;
  if (state.tdEd === 'new') { if (!box.contains(state.tdEdEl) || !state.tdEdEl) { box.innerHTML = ''; box.appendChild(tdEditorEl('new')); } }
  else box.innerHTML = `<button class="tdx-addbtn" onclick="todoOpenAdd()"><span class="pl">+</span>Thêm việc<kbd>Q</kbd></button>`;
  todoEmpty();
}
function todoEmpty() { const day = state.todoDay, items = tdOf(day), undone = items.filter(t => !t.done); $('#tdEmpty').innerHTML = !undone.length && state.tdEd !== 'new' ? tdEmpty(items.length > 0) : ''; }
function todoList() {
  const day = state.todoDay, today = tdToday(), items = tdOf(day), n = items.length, done = items.filter(t => t.done);
  const undone = items.filter(t => !t.done).sort((a, b) => tdP(a) - tdP(b) || a.created - b.created);
  const over = day === today ? state.todos.filter(t => !t.done && t.date < today).sort((a, b) => a.date < b.date ? -1 : 1) : [];
  const pct = n ? Math.round(done.length / n * 100) : 0, editingRow = state.tdEd && state.tdEd !== 'new';
  // đang sửa một việc thì không vẽ lại chỗ có ô nhập (giữ nguyên để gõ tiếng Việt không bị ngắt)
  const editIn = id => editingRow && document.querySelector(`#${id} .tdx-ed`);
  if (!editIn('tdOverBox')) $('#tdOverBox').innerHTML = over.length ? `<section class="tdx-sec sec-over"><div class="tdx-sech"><h2>Quá hạn <small>${over.length}</small></h2><button class="rs" onclick="todoMoveAll(this)">Dời lịch</button></div>${over.map(tdRow).join('')}</section>` : '';
  $('#tdMainHead').innerHTML = `<h2>${dayTitle(day)} <small>${dayVN(day).slice(0, 5)} · ${DOW[dayDate(day).getDay()]}</small></h2>${n ? `<div class="tdx-pg" title="${pct}% hoàn thành"><i><em style="width:${pct}%"></em></i>${done.length}/${n}</div>` : ''}`;
  if (!editIn('tdRows')) $('#tdRows').innerHTML = undone.map(tdRow).join('');
  $('#tdDoneBox').innerHTML = done.length ? `<section class="tdx-sec sec-done"><button class="tdx-donebtn ${state.todoFold ? 'fold' : ''}" onclick="todoFoldDone()"><span class="cv">▾</span>Đã hoàn thành <small>${done.length} việc · +${done.reduce((s, t) => s + tdXp(t), 0)} XP</small></button>${state.todoFold ? '' : done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).map(tdRow).join('')}</section>` : '';
  const slot = $('#tdEdSlot');
  if (slot) { let el = state.tdEdEl; if (!el || el.dataset.id !== state.tdEd) { el = tdEditorEl('edit'); el.dataset.id = state.tdEd; } slot.replaceWith(el); }
  todoEmpty(); state.todoFlash = null;
}
function tdEmpty(allDone) {
  const st = tdStreak();
  return `<div class="tdx-empty">${allDone ? stkImg('1f973', 'emstk', true) : stkImg('2728', 'emstk', true)}
    <h3>${allDone ? 'Xong hết việc rồi, làm tốt lắm!' : 'Ngày này chưa có việc nào'}</h3>
    <p>${allDone ? (st > 1 ? `Chuỗi ${st} ngày liên tiếp hoàn thành. Giữ nhịp nhé.` : 'Nghỉ ngơi một chút, hoặc lên việc cho ngày mai.') : 'Ghi ra vài việc quan trọng nhất. Mỗi việc xong được cộng XP vào Karma.'}</p></div>`;
}
function todoBadge(n) {
  const set = v => { const e = $('#navTodo'); if (e) { e.textContent = v || ''; e.style.display = v ? 'grid' : 'none'; } };
  if (n != null) return set(n);
  api('GET', '/api/todos?date=' + tdToday()).then(d => set(d.items.filter(t => !t.done).length)).catch(() => {});
}
function tdSync(p) { p.catch(e => { toast(e.message); todoPage(); }); }
function todoSet(k) { state.todoDay = k; tdPopClose(); if (state.tdEd === 'new') state.tdDraft.date = k; else { state.tdEd = null; state.tdEdEl = null; } todoDraw(); todoAddBox(); if (state.tdEd === 'new') tdChips(); }
const todoGo = n => todoSet(dayShift(state.todoDay || tdToday(), n));
function todoFoldDone() { state.todoFold = !state.todoFold; todoList(); }
// ----- khung soạn việc
function todoOpenAdd() {
  if (state.tdEd === 'new') return tdFocus();
  state.tdEd = 'new'; state.tdEdEl = null; state.tdDraft = { date: state.todoDay, prio: 4 }; todoList(); todoAddBox(); tdFocus();
}
function todoEdit(id) {
  const t = tdFind(id); if (!t || t.done) return; if (state.tdEd === id) return;
  state.tdEd = id; state.tdEdEl = null; state.tdDraft = { text: t.text, note: t.note || '', date: t.date, prio: tdP(t) };
  todoAddBox(); todoList(); tdFocus();
}
function todoCloseEd() { state.tdEd = null; state.tdEdEl = null; state.tdDraft = null; tdPopClose(); todoAddBox(); todoList(); }
function tdChips() { const d = state.tdDraft, c = $('#tdDateChip'), p = $('#tdPrioChip'); if (!d) return;
  if (c) { c.className = 'cb ' + tdDateCls(d.date); c.innerHTML = I('calendar') + tdDateLabel(d.date); }
  if (p) { p.className = 'cb pf' + d.prio; p.innerHTML = I('flag') + (d.prio < 4 ? 'P' + d.prio : 'Ưu tiên'); } }
function todoDraftDate(btn) { tdDateMenu(btn, state.tdDraft.date, k => { state.tdDraft.date = k; tdChips(); $('#tdIn')?.focus(); }); }
function todoDraftPrio(btn) { tdPrioMenu(btn, state.tdDraft.prio, p => { state.tdDraft.prio = p; tdChips(); $('#tdIn')?.focus(); }); }
async function todoSubmit(e) {
  e.preventDefault(); if (state.tdComposing) return;
  const inp = $('#tdIn'), text = inp.value.trim(), note = $('#tdNote').value.trim(), d = state.tdDraft;
  if (!text) { const f = e.target; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); inp.focus(); return; }
  if (state.tdEd === 'new') {
    try { const t = await api('POST', '/api/todos', { date: d.date, text, note, prio: d.prio }); state.todos.push(t); state.todoFlash = t.id;
      if (d.date !== state.todoDay) toast(`Đã thêm vào ${tdDateLabel(d.date).toLowerCase()}`);
      state.tdDraft = { date: d.date, prio: 4 }; inp.value = ''; $('#tdNote').value = ''; tdChips();
      todoHead(); todoWeek(); todoList(); inp.focus();
    } catch (er) { toast(er.message); }
  } else {
    const t = tdFind(state.tdEd); if (t) { Object.assign(t, { text, note, date: d.date, prio: d.prio, star: false }); tdSync(api('PATCH', '/api/todos/' + t.id, { text, note, date: d.date, prio: d.prio })); state.todoFlash = t.id; }
    state.tdEd = null; state.tdEdEl = null; state.tdDraft = null; todoDraw(); todoAddBox();
  }
}
// ----- menu nổi (chọn ngày, ưu tiên, Karma)
function tdPopClose() { state.tdPop?.remove(); state.tdPop = null; if (state.tdPopOff) { document.removeEventListener('mousedown', state.tdPopOff, true); state.tdPopOff = null; } }
function tdPop(anchor, html, cls = '', right = false) {
  const same = state.tdPop && state.tdPop._a === anchor; tdPopClose(); if (same) return null;
  const m = document.createElement('div'); m.className = 'tdmenu ' + cls; m.innerHTML = html; m._a = anchor; document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  let left = right ? r.right - w : r.left, top = r.bottom + 6;
  left = Math.max(8, Math.min(left, innerWidth - w - 8)); if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  m.style.left = left + 'px'; m.style.top = top + 'px';
  state.tdPop = m; state.tdPopOff = ev => { if (!m.contains(ev.target) && !anchor.contains(ev.target)) tdPopClose(); };
  setTimeout(() => document.addEventListener('mousedown', state.tdPopOff, true), 0);
  return m;
}
function tdDateMenu(anchor, cur, pick) {
  const t = tdToday(), dow = dayDate(t).getDay(), sat = dayShift(t, (6 - dow + 7) % 7 || 7), mon = dayShift(t, (8 - dow) % 7 || 7);
  const opts = [[t, 'Hôm nay', 'dl-today'], [dayShift(t, 1), 'Ngày mai', 'dl-tmr'], [sat, 'Cuối tuần này', 'dl-later'], [mon, 'Tuần sau', 'dl-later']];
  const m = tdPop(anchor, opts.map(([k, l, c]) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}"><span class="mi ${c}">${I('calendar')}</span>${l}<em>${DOW_S[dayDate(k).getDay()]} ${dayVN(k).slice(0, 5)}</em></button>`).join('') + `<hr><label>${I('calendar')}Chọn ngày<input type="date" value="${cur}"></label>`);
  if (!m) return;
  m.onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { pick(b.dataset.k); tdPopClose(); } };
  m.querySelector('input').onchange = e => { if (e.target.value) { pick(e.target.value); tdPopClose(); } };
}
function tdPrioMenu(anchor, cur, pick) {
  const m = tdPop(anchor, [1, 2, 3, 4].map(p => `<button data-p="${p}" class="${p === cur ? 'on' : ''}"><span class="mi pf${p}">${I('flag')}</span>${PRIO[p]}<em>+${({ 1: 20, 2: 15, 3: 12, 4: 10 })[p]} XP</em></button>`).join(''));
  if (m) m.onclick = e => { const b = e.target.closest('button[data-p]'); if (b) { pick(+b.dataset.p); tdPopClose(); } };
}
function todoRowDate(id, btn) { const t = tdFind(id); if (!t) return; tdDateMenu(btn, t.date, k => { t.date = k; tdSync(api('PATCH', '/api/todos/' + id, { date: k })); if (k !== state.todoDay) toast(`Đã dời sang ${tdDateLabel(k).toLowerCase()}`); else state.todoFlash = id; todoDraw(); }); }
function todoRowPrio(id, btn) { const t = tdFind(id); if (!t) return; tdPrioMenu(btn, tdP(t), p => { t.prio = p; t.star = false; tdSync(api('PATCH', '/api/todos/' + id, { prio: p })); state.todoFlash = id; todoList(); }); }
function todoMoveAll(btn) {
  tdDateMenu(btn, tdToday(), k => { const over = state.todos.filter(t => !t.done && t.date < tdToday()); over.forEach(t => { t.date = k; });
    tdSync(Promise.all(over.map(t => api('PATCH', '/api/todos/' + t.id, { date: k })))); toast(`Đã dời ${over.length} việc sang ${tdDateLabel(k).toLowerCase()}`); todoDraw(); });
}
function todoKarma(btn) {
  const lv = tdLevel(), got = state.todoBadgeSet || tdBadges(), today = tdToday(), days = [...Array(7)].map((_, i) => dayShift(today, i - 6));
  const cnt = days.map(k => tdOf(k).filter(t => t.done).length), mx = Math.max(4, ...cnt);
  const xpToday = tdOf(today).filter(t => t.done).reduce((s, t) => s + tdXp(t), 0);
  tdPop(btn, `<div class="kp-top"><div class="kp-lv">${lv.L}</div><div><b>${esc(lv.title)}</b><small>Cấp ${lv.L} · tổng ${lv.total.toLocaleString('vi-VN')} XP</small></div></div>
    <div class="kp-bar"><i style="width:${lv.xp / lv.need * 100}%"></i></div><div class="kp-sub"><span>${lv.xp}/${lv.need} XP</span><span>Còn ${lv.need - lv.xp} XP lên cấp ${lv.L + 1}</span></div>
    <div class="kp-stats"><div><b>🔥 ${tdStreak()}</b><small>Chuỗi hiện tại</small></div><div><b>${tdBestStreak()}</b><small>Chuỗi dài nhất</small></div><div><b>+${xpToday}</b><small>XP hôm nay</small></div></div>
    <div class="kp-h">7 ngày qua</div><div class="kp-chart">${days.map((k, i) => `<div title="${esc(dayLong(k))}: xong ${cnt[i]} việc"><i style="height:${Math.max(cnt[i] / mx * 100, 4)}%" class="${k === today ? 'now' : ''}"></i><small>${DOW_S[dayDate(k).getDay()]}</small></div>`).join('')}</div>
    <div class="kp-h">Huy hiệu <span>${got.size}/${TODO_BADGES.length}</span></div>
    <div class="sb-grid">${tdBadgeGrid()}</div>
    <div class="kp-foot"><span>Âm thanh khi hoàn thành</span><button class="sw ${tdSoundOn() ? 'on' : ''}" onclick="todoSoundToggle(this)"><i></i></button></div>`, 'kp', true);
}
// ----- hoàn thành / xoá, kèm hiệu ứng thưởng
function tdFloat(x, y, html, cls = '') { const s = document.createElement('div'); s.className = 'xpfloat ' + cls; s.innerHTML = html; s.style.left = x + 'px'; s.style.top = y + 'px'; document.body.appendChild(s); setTimeout(() => s.remove(), 1200); }
function tdBurst(x, y, color) {
  for (let i = 0; i < 10; i++) { const s = document.createElement('i'); s.className = 'spark'; const a = i / 10 * Math.PI * 2, d = 18 + Math.random() * 12;
    s.style.cssText = `left:${x}px;top:${y}px;background:${color};--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px`; document.body.appendChild(s); setTimeout(() => s.remove(), 600); }
}
function todoToggle(id, ev) {
  ev?.stopPropagation(); const t = tdFind(id); if (!t) return;
  const wasFull = tdFull(t.date), lvBefore = tdLevel().L;
  t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
  tdSync(api('PATCH', '/api/todos/' + id, { done: t.done }));
  const el = document.querySelector(`.tr[data-id="${id}"]`); el?.classList.toggle('done', t.done);
  if (t.done) {
    const now = Date.now(); state.todoCombo = now - (state.todoLast || 0) < 120000 ? (state.todoCombo || 1) + 1 : 1; state.todoLast = now;
    el?.classList.add('tdpop');
    const r = el?.querySelector('.tr-ck')?.getBoundingClientRect();
    if (r) { const cx = r.left + r.width / 2, cy = r.top + r.height / 2; tdBurst(cx, cy, getComputedStyle(el).getPropertyValue('--pc') || '#10b981');
      tdFloat(cx + 16, cy - 4, `+${tdXp(t)} XP${state.todoCombo > 1 ? ` <em>· combo x${state.todoCombo}</em>` : ''}`); }
    tdSound('tick', state.todoCombo);
  }
  const nb = tdBadges(), fresh = t.done ? [...nb].filter(b => !state.todoBadgeSet.has(b)) : []; state.todoBadgeSet = nb;
  todoHead(); todoWeek();
  if (t.done) {
    const lv = tdLevel();
    if (lv.L > lvBefore) setTimeout(() => tdLevelUp(lv), 450);
    else if (!wasFull && tdFull(t.date)) setTimeout(() => { tdSound('win'); confetti(); }, 300);
    fresh.forEach((b, i) => setTimeout(() => tdUnlock(TODO_BADGES.find(x => x.id === b)), 1000 + i * 1500));
  }
  clearTimeout(state.todoT); state.todoT = setTimeout(() => { state.todoFlash = t.done ? null : id; todoList(); }, 600);
}
function tdLevelUp(lv) {
  tdSound('level'); confetti(true);
  const o = document.createElement('div'); o.className = 'lvup';
  o.innerHTML = `<div class="lvcard">${stkImg(lv.L >= 5 ? '1f451' : '1f31f', 'lvstk', true)}<small>Lên cấp ${lv.L}</small><h2>${esc(lv.title)}</h2><p>Tổng ${lv.total.toLocaleString('vi-VN')} XP · giữ phong độ nhé</p><button onclick="this.closest('.lvup').remove()">Tiếp tục</button></div>`;
  o.onclick = e => { if (e.target === o) o.remove(); }; document.body.appendChild(o); setTimeout(() => o.classList.add('bye'), 3200); setTimeout(() => o.remove(), 3600);
}
function tdUnlock(b) {
  if (!b) return; tdSound('win');
  const o = document.createElement('div'); o.className = 'unlock'; o.innerHTML = `${stkImg(b.stk, '', true)}<div><small>Mở khoá huy hiệu</small><b>${esc(b.name)}</b><em>${esc(b.how)}</em></div>`;
  document.body.appendChild(o); setTimeout(() => o.classList.add('bye'), 3200); setTimeout(() => o.remove(), 3700);
}
function confetti(big) {
  const box = document.createElement('div'); box.className = 'confetti'; const C = ['#1a56db', '#7c3aed', '#f59e0b', '#10b981', '#ec4899', '#06b6d4'];
  for (let i = 0; i < (big ? 110 : 60); i++) { const s = document.createElement('i');
    s.style.cssText = `left:${Math.random() * 100}%;background:${C[i % 6]};animation-delay:${Math.random() * .4}s;animation-duration:${1.8 + Math.random() * 1.4}s;--dx:${(Math.random() - .5) * 240}px;--r:${Math.random() * 900}deg;width:${5 + Math.random() * 5}px;height:${7 + Math.random() * 8}px;border-radius:${Math.random() > .6 ? '50%' : '2px'}`;
    box.appendChild(s); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3800);
}
function todoDel(id) {
  const t = tdFind(id); if (!t) return; document.querySelector(`.tr[data-id="${id}"]`)?.classList.add('out');
  state.todos = state.todos.filter(x => x !== t); state.todoBadgeSet = tdBadges();
  const undo = setTimeout(() => tdSync(api('DELETE', '/api/todos/' + id)), 4000);
  setTimeout(() => { todoHead(); todoWeek(); todoList(); }, 230);
  tdUndo(`Đã xoá "${t.text.slice(0, 40)}"`, () => { clearTimeout(undo); state.todos.push(t); state.todoFlash = id; todoDraw(); });
}
function tdUndo(msg, fn) {
  document.querySelector('.tdundo')?.remove();
  const o = document.createElement('div'); o.className = 'tdundo'; o.innerHTML = `<span>${esc(msg)}</span><button>Hoàn tác</button>`;
  o.querySelector('button').onclick = () => { fn(); o.remove(); }; document.body.appendChild(o); setTimeout(() => o.remove(), 4000);
}

// ---------- báo cáo quét nhóm & bình luận Facebook
async function fbReport() {
  crumbs(['Radar Facebook']);
  const d = await api('GET', '/api/reports/fb');
  const DAY = 86400000, today = new Date().setHours(0, 0, 0, 0);
  const posted = d.comments.filter(c => c.posted);
  const inDays = (arr, n) => arr.filter(x => (x.t || 0) >= today - (n - 1) * DAY);
  const days = [...Array(14)].map((_, i) => { const t = today - (13 - i) * DAY; const cs = d.comments.filter(c => c.t >= t && c.t < t + DAY);
    return { t, n: cs.filter(c => c.posted).length, ok: cs.filter(c => c.posted).length, err: cs.filter(c => !c.posted).length }; });
  const leads7 = inDays(d.comments, 7).filter(c => !/Hỏi đáp/.test(c.loai || '')).length;
  const runs7 = inDays(d.runs, 7);
  const score = g => (g.lan_quet ? (g.lead_cao * 3 + g.lead_tb) / g.lan_quet * 10 : 0) + (g.tuong_tac != null ? Math.min(g.tuong_tac, 30) / 3 : 0) - (g.rac != null ? g.rac / 10 : 0);
  const groups = [...d.groups].sort((a, b) => score(b) - score(a));
  const st = c => c.pending ? '<span class="badge paused" data-tip="Nhóm bắt quản trị viên duyệt bình luận (thường với thành viên mới). Duyệt xong mọi người mới thấy.">Chờ nhóm duyệt</span>' : c.posted ? '<span class="badge ok">Đã bình luận</span>' : /^Bỏ qua/.test(c.trang_thai) ? `<span class="badge stopped" data-tip="${esc(c.trang_thai)}">Bỏ qua</span>` : /thử/.test(c.trang_thai) ? '<span class="badge paused">Chạy thử</span>' : `<span class="badge error" data-tip="${esc(c.trang_thai)}">Lỗi</span>`;
  $('#main').innerHTML = `<div class="wrap">` + pageHead(`${appStack(['facebook', 'claude', 'sheets', 'telegram'], 4)} Radar Facebook`, 'Tự động quét nhóm tiềm năng, Claude viết bình luận theo giọng của bạn, ghi Google Sheet và báo Telegram',
    `${d.sheet ? `<button onclick="window.open('${esc(d.sheet)}','_blank')">${logoSvg('sheets').replace('class="logo"', 'class="logo" style="width:16px;height:16px"')} Google Sheet nhật ký</button>` : ''}<button onclick="nav('#/flows/fb-tu-dong-quet-binh-luan')">${I('workflow')} Mở workflow</button><button class="primary" onclick="api('POST','/api/run',{flow:'fb-tu-dong-quet-binh-luan',source:'canvas'}).then(r=>nav('#/run/'+r.id))">${I('play')} Chạy ngay</button>`) + `
  <div class="kpis">
    <div class="kpi"><div class="k-l">${I('check')} Bình luận 7 ngày</div><div class="k-v">${inDays(posted, 7).length}</div><div class="k-s">Hôm nay ${inDays(posted, 1).length} · tổng ${posted.length}${d.comments.filter(c => c.pending).length ? ` · <span style="color:var(--warn)">${d.comments.filter(c => c.pending).length} chờ nhóm duyệt</span>` : ''}</div></div>
    <div class="kpi"><div class="k-l">${I('zap')} Lead cần làm web 7 ngày</div><div class="k-v">${leads7}</div><div class="k-s">${inDays(d.comments, 7).length - leads7} bài hỏi đáp</div></div>
    <div class="kpi"><div class="k-l">${I('activity')} Lượt quét 7 ngày</div><div class="k-v">${runs7.length}</div><div class="k-s">${runs7.reduce((a, r) => a + (r.nhom || 0), 0)} lượt nhóm · ${runs7.reduce((a, r) => a + (r.moi || 0), 0)} bài mới</div></div>
    <div class="kpi"><div class="k-l">${I('users')} Nhóm đã chấm điểm</div><div class="k-v">${d.groups.length}</div><div class="k-s">${d.groups.filter(g => g.lead_cao + g.lead_tb > 0).length} nhóm từng ra lead</div></div>
  </div>
  <div class="dash">
    <section class="card"><div class="c-h"><div><h3>Bình luận 14 ngày qua</h3><p>Rê chuột lên cột để xem số đã đăng và bỏ qua</p></div><span class="chip">${inDays(posted, 14).length} bình luận</span></div>${barChart(days).replace(/lượt · (\d+) xong · (\d+) lỗi/g, 'bình luận · $2 bỏ qua/lỗi')}</section>
    <section class="card"><div class="c-h"><div><h3>Nhóm ra lead nhiều nhất</h3><p>Lead cần làm web + bài hỏi đáp, mọi thời điểm</p></div></div>
      ${(() => { const top = [...d.groups].map(g => ({ ...g, n: g.lead_cao + g.lead_tb })).filter(g => g.n).sort((a, b) => b.n - a.n).slice(0, 6); return top.length ? `<div class="hbars">${top.map(g => `<a class="hb" href="https://www.facebook.com/groups/${esc(g.id)}" target="_blank" data-tip="${esc(g.name)}: ${g.lead_cao} lead · ${g.lead_tb} hỏi đáp · tương tác ${g.tuong_tac ?? '—'}/bài">${appTile('facebook')}<span class="hb-n">${esc(g.name || g.id)}</span><span class="hb-t"><i style="width:${Math.max(6, g.n / top[0].n * 100)}%"></i></span><span class="hb-v">${g.n}</span></a>`).join('')}</div>` : '<p class="empty">Chưa nhóm nào ra lead.</p>'; })()}</section>
  </div>
  <section class="card flush"><div class="c-h pad"><div><h3>Bình luận gần đây</h3><p>Mới nhất trước</p></div><span class="chip">${d.comments.length} bài</span></div>
    ${d.comments.length ? `<table class="tbl"><thead><tr><th>Thời gian</th><th>Nhóm / Bài</th><th>Bình luận</th><th>Trạng thái</th></tr></thead><tbody>${d.comments.slice(0, 60).map(c => `<tr><td class="muted small" style="white-space:nowrap">${esc(c.gio || '')}<div>${esc(c.ngay || '')}</div></td><td><b>${esc((c.nhom || '').slice(0, 40))}</b><div class="sub">${esc(c.loai || '')}${c.nguoi_dang ? ' · ' + esc(c.nguoi_dang) : ''}</div><div class="small muted">${esc((c.noi_dung || '').slice(0, 140))}</div>${c.link ? `<a class="small" href="${esc(c.link)}" target="_blank">Mở bài ↗</a>` : ''}</td><td>${esc(c.comment || '—')}${c.tai_khoan || c.tag ? `<div class="sub" style="white-space:normal;margin-top:4px">${c.tai_khoan ? `bởi <b>${esc(c.tai_khoan)}</b>` : ''}${c.tag ? ` · tag @Hưng Phạm ${c.tag_ok ? '<span class="t-ok">✓ đúng nick</span>' : '<span class="muted">(chưa kiểm tra)</span>'}` : ''}</div>` : ''}</td><td>${st(c)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Chưa có bình luận nào. Bấm "Chạy ngay" để chạy lượt đầu.</p>'}</section>
  <section class="card flush"><div class="c-h pad"><div><h3>Xếp hạng nhóm</h3><p>Nhóm ra lead, tương tác cao, ít rác được quét trước · số liệu đếm từ các lượt quét thật, tự cập nhật, lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p></div></div>
    ${groups.length ? `<table class="tbl"><thead><tr><th>Nhóm</th><th class="num">Lần quét</th><th class="num">Lead</th><th class="num">Hỏi đáp/khác</th><th class="num">Tương tác/bài</th><th class="num">% rác</th><th>Quét gần nhất</th></tr></thead><tbody>${groups.slice(0, 60).map(g => `<tr><td><div class="fcell">${appTile('facebook', 'sm')}<a href="https://www.facebook.com/groups/${esc(g.id)}" target="_blank"><b>${esc(g.name || g.id)}</b>${g.name ? '' : ' <span class="muted small">(chưa lấy được tên, sẽ có sau lượt quét tới)</span>'}</a></div></td><td class="num">${g.lan_quet}</td><td class="num">${g.lead_cao ? `<b class="t-ok">${g.lead_cao}</b>` : 0}</td><td class="num">${g.lead_tb}</td><td class="num">${g.tuong_tac ?? '—'}</td><td class="num">${g.rac == null ? '—' : `<span class="${g.rac >= 50 ? 't-err' : ''}">${g.rac}%</span>`}</td><td class="muted small">${esc(g.lan_cuoi)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Chưa có dữ liệu nhóm.</p>'}</section>
  <section class="card flush"><div class="c-h pad"><div><h3>Các lượt chạy tự động</h3></div></div>
    ${d.runs.length ? `<table class="tbl"><thead><tr><th>Thời gian</th><th class="num">Nhóm quét</th><th class="num">Bài mới</th><th class="num">Bình luận</th><th class="num">Bỏ qua</th><th class="num">Lỗi</th><th>Sheet lead lượt đó</th></tr></thead><tbody>${d.runs.slice(0, 40).map(r => `<tr><td class="small">${esc(r.gio)} ${esc(r.ngay)}${r.dry ? ' <span class="chip warn">thử</span>' : ''}</td><td class="num">${r.nhom}</td><td class="num">${r.moi}</td><td class="num"><b>${r.binh_luan}</b></td><td class="num">${r.bo_qua}</td><td class="num">${r.loi ? `<span class="t-err">${r.loi}</span>` : 0}</td><td>${r.sheet ? `<a class="small" href="${esc(r.sheet)}" target="_blank">Mở ↗</a>` : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Chưa có lượt chạy tự động nào.</p>'}</section></div>`;
}

// ---------- tổng quan: bảng điều khiển
async function overview() {
  crumbs(['Bảng điều khiển']);
  const [o, runs] = await Promise.all([api('GET', '/api/overview'), api('GET', '/api/runs?limit=1000')]);
  const DAY = 86400000, today = new Date().setHours(0, 0, 0, 0);
  const days = [...Array(14)].map((_, i) => { const t = today - (13 - i) * DAY; const rs = runs.filter(r => r.started >= t && r.started < t + DAY); return { t, n: rs.length, ok: rs.filter(r => r.status === 'ok').length, err: rs.filter(r => r.status === 'error').length }; });
  const last7 = runs.filter(r => r.started >= today - 6 * DAY), prev7 = runs.filter(r => r.started >= today - 13 * DAY && r.started < today - 6 * DAY);
  const done = runs.filter(r => ['ok', 'error'].includes(r.status)), rate = done.length ? Math.round(done.filter(r => r.status === 'ok').length / done.length * 100) : null;
  const ds = runs.map(secs).filter(x => x != null), avg = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  const delta = last7.length - prev7.length;
  const top = Object.entries(runs.reduce((m, r) => (m[r.flow_id] = (m[r.flow_id] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const h = new Date().getHours(), greet = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const apps = Object.entries(state.flows.flatMap(f => flowApps(f)).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  $('#main').innerHTML = `<div class="wrap">` + pageHead(`${greet}, Hưng`, `Hôm nay: <b>${o.runs_today}</b> lượt chạy · ${o.flows} workflow sẵn sàng · ${o.profiles} hồ sơ trình duyệt`,
    `<button onclick="newFlow()">${I('plus')} Quy trình mới</button><button class="primary" onclick="nav('#/flows')">${I('play')} Chạy quy trình</button>`) + `
  <div class="hero"><div><h3 style="font-size:15px">Ứng dụng đang tự động hoá</h3><p class="muted small" style="margin:2px 0 0">${apps.length} ứng dụng trong ${state.flows.length} workflow · bấm một logo để lọc workflow theo ứng dụng</p></div>
    <div class="apps">${apps.map(([k, n]) => `<a href="#/flows" onclick="state.group='';state.app='${k}'" data-tip="${esc(logoName(k))}: ${n} workflow">${appTile(k)}</a>`).join('')}</div></div>
  <div class="kpis">
    <div class="kpi"><div class="k-l">${I('zap')} Lượt chạy 7 ngày</div><div class="k-v">${last7.length}</div><div class="k-s ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta === 0 ? 'Bằng 7 ngày trước' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' so với 7 ngày trước'}</div></div>
    <div class="kpi"><div class="k-l">${I('check')} Tỉ lệ thành công</div><div class="k-v">${rate == null ? '—' : rate + '<small>%</small>'}</div><div class="meter"><i style="width:${rate || 0}%"></i></div><div class="k-s">${done.length} lượt đã kết thúc · ${o.runs_error} lỗi</div></div>
    <div class="kpi"><div class="k-l">${I('clock')} Thời gian trung bình</div><div class="k-v">${avg == null ? '—' : fmtS(avg).replace(/(\d+)(m|s)/g, '$1<small>$2</small>')}</div><div class="k-s">mỗi lượt chạy</div></div>
    <div class="kpi"><div class="k-l">${I('workflow')} Workflow</div><div class="k-v">${o.flows}</div><div class="k-s">${o.flow_errors ? `<span class="t-err">${o.flow_errors} cần sửa</span>` : 'Tất cả hợp lệ'} · ${o.media} file đã tạo</div></div>
  </div>
  <div class="dash">
    <section class="card"><div class="c-h"><div><h3>Lượt chạy 14 ngày qua</h3><p>Rê chuột lên cột để xem số lượt thành công và lỗi</p></div><span class="chip">${runs.filter(r => r.started >= today - 13 * DAY).length} lượt</span></div>${barChart(days)}</section>
    <section class="card"><div class="c-h"><div><h3>Chạy nhiều nhất</h3><p>Theo số lượt, mọi thời điểm</p></div></div>
      ${top.length ? `<div class="hbars">${top.map(([id, n]) => { const f = flowById(id); return `<a class="hb" href="#/flows/${esc(id)}" data-tip="${esc(id)}: ${n} lượt">${appTile(flowApps(f)[0] || 'hpb')}<span class="hb-n">${esc(f?.name || id)}</span><span class="hb-t"><i style="width:${Math.max(6, n / top[0][1] * 100)}%"></i></span><span class="hb-v">${n}</span></a>`; }).join('')}</div>` : '<p class="empty">Chưa có lượt chạy nào.</p>'}</section>
  </div>
  <section class="card flush"><div class="c-h pad"><div><h3>Hoạt động gần đây</h3></div><a href="#/runs" class="more">Xem tất cả ${I('arrow-right')}</a></div>${runTable(o.recent)}</section></div>`;
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
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Số lượt chạy mỗi ngày trong 14 ngày"><defs><linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#1a56db"/></linearGradient></defs>${grid}<line x1="${P.l}" x2="${W - P.r}" y1="${P.t + ih}" y2="${P.t + ih}" class="base"/>${bars}</svg>`;
}
function runTable(list) {
  if (!list.length) return '<p class="empty">Chưa có lượt chạy nào. Mở một workflow và bấm Chạy để bắt đầu.</p>';
  return `<table class="tbl"><thead><tr><th>Workflow</th><th>Trạng thái</th><th>Nguồn</th><th>Hồ sơ</th><th>Bắt đầu</th><th class="num">Thời gian</th></tr></thead><tbody>${list.map(r => `<tr class="click" onclick="nav('#/runs/${r.id}')"><td><div class="fcell">${appStack(flowApps(flowById(r.flow_id)), 2, 'sm')}<div style="min-width:0"><b>${esc(r.name)}</b><div class="sub mono">${esc(r.id)}</div></div></div></td><td><span class="badge ${r.status}">${STATUS[r.status] || r.status}</span></td><td><span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span></td><td class="muted">${esc(r.profile || 'default')}</td><td class="muted">${ago(r.started)}</td><td class="num muted">${dur(r)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- workflow: danh sách kiểu n8n, lọc theo ứng dụng bằng logo
async function loadFlows() { state.flows = await api('GET', '/api/flows'); }
async function flowList() {
  crumbs(['Quy trình tự động']);
  const [, profs, runs] = await Promise.all([loadFlows(), api('GET', '/api/profiles'), api('GET', '/api/runs?limit=1000')]);
  state.profiles = profs; state.lastRun = {};
  for (const r of runs) if (!state.lastRun[r.flow_id] || r.started > state.lastRun[r.flow_id].started) state.lastRun[r.flow_id] = r;
  state.runCount = runs.reduce((m, r) => (m[r.flow_id] = (m[r.flow_id] || 0) + 1, m), {});
  renderFlowList();
}
function renderFlowList() {
  const groups = Object.entries(state.flows.reduce((m, f) => (m[f.group] = (m[f.group] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const tags = [...new Set(state.flows.flatMap(f => f.tags || []))].sort();
  let list = state.flows.filter(f => (!state.filter || (f.id + ' ' + (f.name || '') + ' ' + (f.description || '')).toLowerCase().includes(state.filter.toLowerCase())) && (!state.tag || (f.tags || []).includes(state.tag)) && (!state.group || f.group === state.group) && (!state.app || flowApps(f).includes(state.app)));
  list = list.sort((a, b) => state.sort === 'name' ? (a.name || a.id).localeCompare(b.name || b.id) : state.sort === 'used' ? (state.lastRun[b.id]?.started || 0) - (state.lastRun[a.id]?.started || 0) : a.group.localeCompare(b.group) || a.id.localeCompare(b.id));
  const errs = state.flows.filter(f => f.errors || f._error).length;
  const chip = (label, val, n, key, logo) => `<button class="${state[key] === val ? 'on' : ''} ${logo ? '' : 'all'}" onclick="state.group='';state.app='';state.${key}=${j(val)};renderFlowList()">${logo ? appTile(logo) : ''}<span>${esc(label)}</span><em>${n}</em></button>`;
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Quy trình tự động', `${state.flows.length} quy trình · ${state.profiles.length} hồ sơ trình duyệt${errs ? ` · <span class="t-err">${errs} lỗi</span>` : ''}`,
    `<button class="primary" onclick="newFlow()">${I('plus')} Quy trình mới</button>`) + `
    <section class="card flush">
      <div class="toolbar"><div class="sbox">${I('search')}<input type="text" id="fsearch" placeholder="Tìm quy trình theo tên, mô tả…" value="${esc(state.filter)}" oninput="state.filter=this.value;renderFlowList();const e=$('#fsearch');e.focus();e.setSelectionRange(e.value.length,e.value.length)"></div>
        ${tags.length ? `<select style="width:auto;min-width:140px" onchange="state.tag=this.value;renderFlowList()"><option value="">Mọi nhãn</option>${tags.map(t => `<option value="${esc(t)}" ${state.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}</select>` : ''}
        <div class="seg">${[['recent', 'Theo nhóm'], ['used', 'Chạy gần đây'], ['name', 'Theo tên']].map(([k, l]) => `<button class="${state.sort === k ? 'on' : ''}" onclick="state.sort='${k}';renderFlowList()">${l}</button>`).join('')}</div>
        <span class="muted small" style="margin-left:auto">${list.length} kết quả</span></div>
      <div class="appchips">${chip('Tất cả', '', state.flows.length, 'group')}${groups.map(([g, n]) => chip(g, g, n, 'group', groupApp(g) || 'hpb')).join('')}</div>
      ${state.app ? `<div class="toolbar" style="padding:8px 16px"><span class="small muted">Đang lọc theo ứng dụng</span><span class="tag">${logoSvg(state.app)} ${esc(logoName(state.app))}</span><button class="sm ghost" onclick="state.app='';renderFlowList()">${I('x')} Bỏ lọc</button></div>` : ''}
      ${list.length ? `<div class="wfl">${list.map(f => { const lr = state.lastRun[f.id]; return `
        <div class="wf" onclick="nav('#/flows/${f.id}')">
          ${appStack(flowApps(f), 3)}
          <div class="wf-t"><b>${esc(f.name || f.id)}</b>${f.errors ? ' <span class="badge error">lỗi</span>' : ''}<div class="sub">${esc(f.description || f.id)}</div>
            <div class="meta"><span class="tag">${esc(f.group)}</span>${(f.tags || []).slice(0, 2).map(t => `<span class="tag ghost">#${esc(t)}</span>`).join('')}<span>${f.node_count} bước</span><i class="dot"></i><span>${f.input_count ? f.input_count + ' ô nhập' : 'không cần nhập'}</span><i class="dot"></i><span>${f._source === 'user' ? 'của bạn' : 'mẫu có sẵn'}</span></div></div>
          <div class="wf-run">${lr ? `<span class="badge ${lr.status}">${STATUS[lr.status]}</span><span class="muted">${ago(lr.started)}</span>` : '<span class="muted">Chưa chạy</span>'}</div>
          <div class="wf-n"><b>${state.runCount[f.id] || 0}</b>lượt chạy</div>
          <div class="wf-a"><button class="icon ghost" title="Nhân bản" onclick="event.stopPropagation();dupFlow('${f.id}')">${I('copy')}</button><button class="icon ghost" title="Sửa JSON" onclick="event.stopPropagation();nav('#/flows/${f.id}/json')">${I('code')}</button>${f._source === 'user' ? `<button class="icon ghost danger" title="Xoá" onclick="event.stopPropagation();delFlow('${f.id}')">${I('trash')}</button>` : ''}</div>
        </div>`; }).join('')}</div>` : '<p class="empty">Không có workflow nào khớp bộ lọc.</p>'}
    </section></div>`;
}
async function dupFlow(id) { try { await api('POST', `/api/flows/${id}/duplicate`); toast('Đã nhân bản'); await loadFlows(); if (location.hash === '#/flows') renderFlowList(); else nav('#/flows/' + id + '-copy'); } catch (e) { toast(e.message); } }
async function delFlow(id) { if (!confirm('Xoá flow ' + id + '?')) return; await api('DELETE', '/api/flows/' + id); if (state.ed) state.ed.dirty = false; toast('Đã xoá'); await loadFlows(); if (location.hash === '#/flows') renderFlowList(); else nav('#/flows'); }
// workflow mới: đặt tên → mở ngay trình soạn sơ đồ (vẫn có lối viết bằng JSON)
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow-moi';
function newFlow() {
  modal(`<h3>${logoSvg('hpb').replace('class="logo"', 'class="logo" style="width:26px;height:26px"')} Quy trình mới</h3>
    <div class="field"><label>Tên quy trình <span class="req">*</span></label><input type="text" id="nfName" placeholder="VD: Đăng bài Facebook mỗi sáng" oninput="$('#nfId').value=slug(this.value)"></div>
    <div class="field"><label>Mã (id)</label><input type="text" id="nfId" class="mono" placeholder="dang-bai-facebook-moi-sang"><div class="desc">Chỉ gồm chữ không dấu, số, dấu gạch ngang. Dùng khi gọi qua API/AI Agent.</div></div>
    <div class="field"><label>Mô tả</label><input type="text" id="nfDesc" placeholder="Workflow này làm gì?"></div>
    <div class="acts"><button class="ghost" style="margin-right:auto" onclick="$('#modal').close();newFlowJson()">${I('code')} Viết bằng JSON</button><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="createFlow()">${I('plus')} Tạo và mở sơ đồ</button></div>`);
  setTimeout(() => $('#nfName')?.focus(), 50);
}
async function createFlow() {
  const name = $('#nfName').value.trim(), id = ($('#nfId').value.trim() || slug(name));
  if (!name) return toast('Nhập tên workflow');
  const flow = { id, name, description: $('#nfDesc').value.trim(), tags: ['cua-toi'], inputs: [], vars: {},
    nodes: [{ id: 'n0', label: 'Mở trình duyệt', type: 'browser_session', params: {}, position: [CV.PAD, CV.TOP + 40] }] };
  try { await api('POST', '/api/flows', { flow, overwrite: false }); $('#modal').close(); await loadFlows(); toast('Đã tạo. Bấm + để thêm bước.'); nav('#/flows/' + id); } catch (e) { toast(e.message); }
}
function newFlowJson() {
  const tpl = { id: 'flow-moi', name: 'Flow mới', description: '', tags: ['cua-toi'], inputs: [{ name: 'url', type: 'string', required: true, description: 'Link cần mở' }], vars: { url: '' },
    nodes: [{ id: 'n0', label: 'Mở trình duyệt', type: 'browser_session', params: {}, next: 'n1' }, { id: 'n1', label: 'Vào trang', type: 'goto', params: { url: '{{vars.url}}', wait_until: 'domcontentloaded' }, next: 'n2' }, { id: 'n2', label: 'Chụp màn hình', type: 'screenshot', params: { emit: true, output_var: 'shot' }, next: 'n3' }, { id: 'n3', label: 'Trả kết quả', type: 'return', params: { shot_path: '{{vars.shot}}' } }] };
  jsonEditor(tpl, true);
}
function jsonEditor(flow, isNew) {
  const { _source, _file, ...clean } = flow;
  crumbs(['Workflow', '#/flows'], [isNew ? 'Workflow mới' : (flow.name || flow.id), isNew ? '#/flows' : '#/flows/' + flow.id], ['Sửa JSON']);
  $('#main').className = '';
  $('#main').innerHTML = `<div class="wrap">` + pageHead(isNew ? 'Workflow mới' : esc(flow.name || flow.id), 'Sửa JSON rồi Lưu. Nhanh hơn: trong Claude Code gõ "dùng hpb-flow tạo workflow …", Claude tự dò trang và viết flow qua MCP.',
    `<button onclick="history.back()">Huỷ</button><button onclick="validateJson()">${I('check')} Kiểm tra</button><button class="primary" onclick="saveJson()">${I('save')} Lưu workflow</button>`) + `
  <div class="editor"><div class="ed-bar"><span class="dots"><i></i><i></i><i></i></span><span class="mono">${esc(flow.id)}.json</span><span id="jsonMsg" class="small"></span></div>
  <textarea id="jsonText" spellcheck="false">${esc(JSON.stringify(clean, null, 2))}</textarea></div></div>`;
}
async function validateJson() { try { const r = await api('POST', '/api/flows/validate', { flow: JSON.parse($('#jsonText').value) }); $('#jsonMsg').textContent = r.errors.length ? 'Lỗi: ' + r.errors.join('; ') : 'Hợp lệ' + (r.warnings.length ? ' — cảnh báo: ' + r.warnings.join('; ') : ''); } catch (e) { $('#jsonMsg').textContent = e.message; } }
async function saveJson() { try { const f = JSON.parse($('#jsonText').value); const r = await api('POST', '/api/flows', { flow: f }); toast('Đã lưu' + (r.warnings?.length ? ' (có cảnh báo)' : '')); await loadFlows(); if (state.ed) state.ed.dirty = false; nav('#/flows/' + f.id); } catch (e) { $('#jsonMsg').textContent = e.message; } }

// ---------- ô nhập của form chạy
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

// ---------- trình soạn workflow toàn màn hình (như n8n): tab Sơ đồ / Lượt chạy / JSON, kéo thả bước, nối dây, lưu
async function flowDetail(id, mode) {
  const f = await api('GET', '/api/flows/' + id); state.flow = f;
  state.profiles = await api('GET', '/api/profiles');
  if (!state.nodeDocs) state.nodeDocs = await api('GET', '/api/nodes').catch(() => ({}));
  crumbs(['Quy trình tự động', '#/flows'], [f.name || f.id]);
  state.ed = { id, hash: location.hash, flow: structuredClone(f), dirty: false, hist: [], fut: [], tab: mode === 'json' ? 'json' : mode === 'runs' ? 'runs' : 'canvas' };
  const prof = state.profiles.find(p => p.name === (localStorage.getItem('hpbflow.profile') || 'default')) || state.profiles[0];
  const tabs = [['canvas', 'Sơ đồ', ''], ['runs', 'Lượt chạy', 'runs'], ['json', 'JSON', 'json']];
  $('#main').className = 'full';
  $('#main').innerHTML = `<div class="ed">
    <header class="ed-top">
      <div class="ed-l"><a class="ed-crumb" href="#/flows" title="Về danh sách quy trình">${I('workflow')} Quy trình</a><span class="ed-sep">/</span>
        <div class="ed-name"><input id="edName" value="${esc(f.name || f.id)}" size="${Math.max(8, (f.name || f.id).length)}" title="Bấm để đổi tên" oninput="this.size=Math.max(8,this.value.length);state.ed.flow.name=this.value;edDirty()"></div>
        <div class="menu left" id="edMenu"><button class="icon ghost" title="Thêm" onclick="event.stopPropagation();this.parentElement.classList.toggle('open')">${I('more')}</button><div class="pop">
          <button onclick="edUndo()">${I('undo')} Hoàn tác <kbd>⌘Z</kbd></button><button onclick="edRedo()">${I('redo')} Làm lại <kbd>⇧⌘Z</kbd></button><hr>
          <button onclick="dupFlow('${f.id}')">${I('copy')} Nhân bản quy trình</button><button onclick="edTab('json')">${I('code')} Sửa JSON</button><button onclick="edTidy()">${I('wand')} Tự sắp xếp sơ đồ</button><button onclick="copy(${j(f.id)})">${I('link')} Chép mã quy trình</button>
          ${f._source === 'user' ? `<hr><button class="danger" onclick="delFlow('${f.id}')">${I('trash')} Xoá quy trình</button>` : ''}</div></div>
        <div class="ed-tags">${(f.tags || []).slice(0, 3).map(t => `<span class="tag ghost">#${esc(t)}</span>`).join('')}</div></div>
      <nav class="ed-tabs">${tabs.map(([k, l]) => `<a href="#" data-tab="${k}" class="${state.ed.tab === k ? 'on' : ''}" onclick="edTab('${k}');return false">${l}${k === 'runs' ? ' <em id="runCnt"></em>' : ''}</a>`).join('')}</nav>
      <div class="ed-r"><span class="savest" id="saveSt"></span><button class="primary" id="saveBtn" onclick="edSave()">${I('save')} Lưu</button></div>
    </header>
    <div class="ed-body" id="edBody"></div></div>`;
  // ngăn chạy: form chạy cũ chuyển thành ngăn kéo bên phải, giữ nguyên các ô và nút
  state.edRunForm = `
    <p class="muted small" style="margin:0 0 14px">${esc(f.description || 'Workflow chưa có mô tả.')}</p>
    <div class="lbl" style="margin-top:0">Hồ sơ trình duyệt <span class="req">*</span></div>
    <div class="profilebox">${appTile('chrome')}<div style="flex:1;min-width:0"><b id="profName">${esc(prof.name)}</b><div class="muted small">${esc(prof.engine)}${prof.proxy ? ' · có proxy' : ''}</div></div><button class="sm" onclick="chooseProfile()">Đổi</button></div>
    <label class="check"><input type="checkbox" id="headless" ${prof.headless ? 'checked' : ''} onchange="setHeadless(this.checked)"> Chạy ẩn (không hiện cửa sổ trình duyệt)</label>
    <label class="check"><input type="checkbox" id="keeptab"> Giữ tab sau khi chạy</label>
    <div class="lbl">Thông tin cần nhập</div>
    <div oninput="checkReady()" onchange="checkReady()">${(f.inputs || []).map(i => fieldHtml(i, f.vars?.[i.name] || undefined)).join('') || '<p class="muted small">Workflow này không cần nhập gì.</p>'}</div>
    <div class="lbl">Lượt chạy gần đây <a href="#" onclick="edTab('runs');return false" style="margin-left:auto;text-transform:none;letter-spacing:0;font-weight:500">Tất cả</a></div><div class="hist" id="edHist"></div>`;
  edTab(state.ed.tab, true);
  edStatus(); edRefreshRuns();
  document.onkeydown = edKeys;
}
function closeMenus() { document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')); }
// đổi tab trong trình soạn mà không tải lại trang (giữ thay đổi chưa lưu)
function edTab(tab, first) {
  const ed = state.ed; if (!ed) return;
  if (!first && ed.tab === 'json' && tab !== 'json' && !edApplyJson()) return;
  ed.tab = tab; closeMenus();
  ed.hash = '#/flows/' + ed.id + (tab === 'canvas' ? '' : '/' + tab); history.replaceState(null, '', ed.hash);
  document.querySelectorAll('.ed-tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  const body = $('#edBody');
  if (tab === 'canvas') {
    body.innerHTML = `<div class="canvaswrap" id="cw">
      <div class="ctools"><button title="Thêm bước (Tab)" onclick="openNodePanel()">${I('plus')}</button><button title="Tìm bước (⌘F)" onclick="openFind()">${I('search')}</button><button title="Bảng chạy quy trình" onclick="openDrawer('runDrawer')">${I('panel')}</button></div>
      <div class="findbox" id="findBox"><div class="pn-s">${I('search')}<input type="text" id="findQ" placeholder="Tìm bước theo tên…" oninput="renderFind()" onkeydown="if(event.key==='Escape')closeFind();if(event.key==='Enter')$('#findL .fi')?.click()"></div><div id="findL"></div></div>
      <div class="canvas" id="canvas"></div>
      <button class="primary runbig" onclick="openDrawer('runDrawer')">${I('play')} Chạy quy trình <kbd>⌘↵</kbd></button>
      <div class="logbar ${localStorage.getItem('hpbflow.logs') === '1' ? 'open' : ''}" id="logBar"><div class="lb-h" onclick="toggleLogs()">${I('terminal')}<b>Nhật ký</b><span id="lbSt" class="small muted">Chưa chạy lần nào</span><span style="flex:1"></span><a href="#" id="lbOpen" class="small" onclick="event.stopPropagation()" style="display:none">Mở lượt chạy ${I('arrow-right')}</a><span class="lb-c">${I('updown')}</span></div><div class="log" id="lbLog"></div></div>
      <aside class="drawer" id="runDrawer"><div class="dr-h">${I('play')}<b>Chạy workflow</b><button class="icon ghost sm" title="Đóng" onclick="closeDrawer('runDrawer')">${I('x')}</button></div><div class="dr-b">${state.edRunForm}</div>
        <div class="dr-f"><button class="primary" id="runBtn" onclick="runFlow()">${I('play')} Chạy ngay <kbd>⌘↵</kbd></button></div><div class="small muted" id="runHint" style="padding:0 16px 10px"></div></aside>
      <aside class="drawer" id="nodePanel"><div class="dr-h">${I('plus')}<b>Thêm bước</b><button class="icon ghost sm" title="Đóng" onclick="closeDrawer('nodePanel')">${I('x')}</button></div>
        <div style="padding:12px 16px 0"><div class="pn-s">${I('search')}<input type="text" id="pnq" placeholder="Tìm ứng dụng, loại bước, workflow…" oninput="renderNodePanel()" onkeydown="if(event.key==='Enter'){const x=state.pnItems?.[0];if(x)pnPick(0)}"></div><p class="muted small" style="margin:4px 2px 0">Bấm để thêm, hoặc kéo thả vào sơ đồ.</p></div>
        <div class="dr-b" id="pnBody"></div></aside></div>`;
    drawFlowView(ed.flow, $('#canvas'), { ...edOpts(), keepView: false });
    checkReady(); edHistList(); loadLogBar();
    if (localStorage.getItem('hpbflow.runDrawer') === '1') openDrawer('runDrawer');
  } else if (tab === 'runs') {
    body.innerHTML = `<div class="ed-pane"><div class="wrap"><section class="card flush"><div class="c-h pad"><div><h3>Lượt chạy của workflow này</h3><p>Bấm một dòng để xem lại sơ đồ, kết quả và nhật ký của lượt đó</p></div><button class="sm primary" onclick="edTab('canvas');openDrawer('runDrawer')">${I('play')} Chạy workflow</button></div><div id="edRuns"><p class="empty">Đang tải…</p></div></section></div></div>`;
    edRefreshRuns();
  } else {
    const { _source, _file, ...clean } = ed.flow;
    body.innerHTML = `<div class="ed-pane"><div class="editor" style="height:100%"><div class="ed-bar"><span class="dots"><i></i><i></i><i></i></span><span class="mono">${esc(ed.id)}.json</span><span id="jsonMsg" class="small"></span><span style="flex:1"></span><button class="sm" onclick="edValidate()">${I('check')} Kiểm tra</button></div>
      <textarea id="jsonText" spellcheck="false" oninput="state.ed.jsonDirty=true">${esc(JSON.stringify(clean, null, 2))}</textarea></div></div>`;
    ed.jsonDirty = false;
  }
}
// JSON sửa tay trong tab JSON: áp vào bản đang soạn trước khi rời tab hoặc lưu
function edApplyJson() {
  const ed = state.ed; if (ed.tab !== 'json' || !ed.jsonDirty) return true;
  try { const f = JSON.parse($('#jsonText').value); if (f.id !== ed.id) throw new Error('Không đổi được id ở đây, hãy nhân bản workflow'); edSnap(); ed.flow = { ...f, _source: ed.flow._source }; ed.jsonDirty = false; edDirty(); return true; }
  catch (e) { $('#jsonMsg').textContent = 'JSON lỗi: ' + e.message; toast('JSON lỗi: ' + e.message); return false; }
}
async function edValidate() { try { const r = await api('POST', '/api/flows/validate', { flow: JSON.parse($('#jsonText').value) }); $('#jsonMsg').textContent = r.errors.length ? 'Lỗi: ' + r.errors.join('; ') : 'Hợp lệ' + (r.warnings.length ? ' — cảnh báo: ' + r.warnings.join('; ') : ''); } catch (e) { $('#jsonMsg').textContent = e.message; } }
async function edRefreshRuns() {
  const ed = state.ed; if (!ed) return;
  const runs = (await api('GET', '/api/runs?limit=200')).filter(r => r.flow_id === ed.id);
  if ($('#runCnt')) $('#runCnt').textContent = runs.length || '';
  if ($('#edRuns')) $('#edRuns').innerHTML = runTable(runs);
  ed.recent = runs.slice(0, 8); edHistList(); loadLogBar();
}
// thanh "Nhật ký" dưới sơ đồ (như Logs của n8n): lượt chạy gần nhất của quy trình này, cập nhật trực tiếp
async function loadLogBar() {
  const ed = state.ed, last = ed?.recent?.[0]; if (!last || !$('#logBar')) return;
  const r = state.runs.get(last.id)?.logs ? state.runs.get(last.id) : await api('GET', '/api/runs/' + last.id).catch(() => null);
  if (r) { state.runs.set(r.id, r); renderLogBar(r); }
}
function renderLogBar(r) {
  if (!$('#logBar')) return;
  $('#lbSt').innerHTML = `<span class="badge ${r.status}">${STATUS[r.status]}</span> <span class="muted">lượt ${ago(r.started)}${dur(r) ? ' · ' + dur(r) : ''}</span>`;
  const a = $('#lbOpen'); a.style.display = ''; a.href = (r.status === 'running' || r.status === 'paused' ? '#/run/' : '#/runs/') + r.id;
  const lg = $('#lbLog'), stick = lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 30;
  lg.textContent = (r.logs || []).slice(-250).join('\n'); if (stick) lg.scrollTop = lg.scrollHeight;
}
function toggleLogs() { const b = $('#logBar'), on = b.classList.toggle('open'); try { localStorage.setItem('hpbflow.logs', on ? '1' : ''); } catch { /* bỏ qua */ } if (on) { const lg = $('#lbLog'); lg.scrollTop = lg.scrollHeight; } }
// tìm bước trên sơ đồ
function openFind() { $('#findBox').classList.add('open'); $('#findQ').value = ''; renderFind(); setTimeout(() => $('#findQ').focus({ preventScroll: true }), 30); }
function closeFind() { $('#findBox')?.classList.remove('open'); }
function renderFind() {
  const q = $('#findQ').value.trim().toLowerCase(), L = state.canvas;
  const list = L.nodes.filter(n => !q || ((n.label || '') + ' ' + n.id + ' ' + (NODE_NAME[n.type] || n.type)).toLowerCase().includes(q)).slice(0, 12);
  $('#findL').innerHTML = list.map(n => { const a = L.app.get(n.id); return `<div class="fi" onclick="closeFind();flashNode(${j(n.id)});selNode(${j(n.id)})">${a ? appTile(a, 'xs') : `<span class="tile xs" style="color:var(--muted)">${nIcon(n.type)}</span>`}<span>${esc(n.label || n.id)}</span><small>${esc(NODE_NAME[n.type] || n.type)}</small></div>`; }).join('') || '<p class="muted small" style="padding:6px 8px">Không có bước nào khớp.</p>';
}
function edHistList() { const el = $('#edHist'); if (el) el.innerHTML = (state.ed?.recent || []).map(r => `<a class="hi" href="#/runs/${r.id}"><span class="badge ${r.status}">${STATUS[r.status]}</span><span class="muted small">${ago(r.started)}</span><span class="muted small" style="margin-left:auto">${dur(r)}</span></a>`).join('') || '<p class="muted small">Chưa chạy lần nào.</p>'; }
function openDrawer(id) { document.querySelectorAll('.drawer.open').forEach(d => d.id !== id && d.classList.remove('open')); $('#' + id)?.classList.add('open'); if (id === 'runDrawer') try { localStorage.setItem('hpbflow.runDrawer', '1'); } catch { /* bỏ qua */ } }
function closeDrawer(id) { $('#' + id)?.classList.remove('open'); if (id === 'runDrawer') try { localStorage.setItem('hpbflow.runDrawer', ''); } catch { /* bỏ qua */ } }
async function setHeadless(on) { const name = $('#profName').textContent; await api('PATCH', '/api/profiles/' + name, { headless: on }); toast(on ? 'Profile sẽ chạy ẩn ở lần mở Chrome tiếp theo' : 'Profile sẽ hiện cửa sổ'); }
function chooseProfile() {
  modal(`<h3>Chọn hồ sơ trình duyệt</h3>${state.profiles.map(p => `<div class="opt ${p.name === $('#profName').textContent ? 'on' : ''}" onclick="localStorage.setItem('hpbflow.profile',${j(p.name)});$('#profName').textContent=${j(p.name)};$('#modal').close()"><div class="row" style="flex-wrap:nowrap">${appTile('chrome', 'sm')}<b>${esc(p.name)}</b> <span class="muted small">${esc(p.engine)}${p.proxy ? ' · proxy ' + esc(p.proxy) : ''}</span></div><small>${esc(p.note || '')}</small></div>`).join('')}<div class="acts"><button onclick="$('#modal').close();nav('#/profiles')">Quản lý hồ sơ</button></div>`);
}
async function runFlow() {
  const ed = state.ed, f = state.flow;
  // có thay đổi chưa lưu thì lưu trước, để lượt chạy dùng đúng sơ đồ đang thấy
  if (ed?.dirty) { if (!await edSave()) return; toast('Đã lưu thay đổi trước khi chạy'); }
  try {
    const r = await api('POST', '/api/run', { flow: f.id, vars: readInputs(f), profile: $('#profName').textContent, keep_tab: $('#keeptab').checked, source: 'canvas' });
    state.runs.set(r.id, r); nav('#/run/' + r.id);
  } catch (e) { toast(e.message); }
}

// ---------- sửa sơ đồ: lịch sử hoàn tác, lưu, thao tác trên bước và dây nối
function edOpts() { return { edit: true, keepView: true }; }
function edSnap() { const ed = state.ed; ed.hist.push(JSON.stringify(ed.flow.nodes)); if (ed.hist.length > 100) ed.hist.shift(); ed.fut = []; }
function edDirty() { if (!state.ed) return; state.ed.dirty = true; edStatus(); }
function edChanged() { edDirty(); if (state.ed.tab === 'canvas') { drawFlowView(state.ed.flow, $('#canvas'), edOpts()); if (state.sel) $('#nd-' + CSS.escape(state.sel))?.classList.add('sel'); } }
function edStatus() {
  const ed = state.ed, s = $('#saveSt'); if (!ed || !s) return;
  s.textContent = ed.dirty ? 'Chưa lưu' : 'Đã lưu'; s.classList.toggle('dirty', ed.dirty);
  $('#saveBtn').disabled = !ed.dirty && ed.tab !== 'json';
}
function edUndo() { const ed = state.ed; if (!ed?.hist.length) return; ed.fut.push(JSON.stringify(ed.flow.nodes)); ed.flow.nodes = JSON.parse(ed.hist.pop()); edChanged(); }
function edRedo() { const ed = state.ed; if (!ed?.fut.length) return; ed.hist.push(JSON.stringify(ed.flow.nodes)); ed.flow.nodes = JSON.parse(ed.fut.pop()); edChanged(); }
async function edSave() {
  const ed = state.ed; if (!ed) return false;
  if (ed.tab === 'json' && !edApplyJson()) return false;
  try {
    const r = await api('POST', '/api/flows', { flow: ed.flow });
    ed.dirty = false; ed.flow._source = 'user'; state.flow = structuredClone(ed.flow); edStatus(); loadFlows();
    toast('Đã lưu' + (r.warnings?.length ? ` · ${r.warnings.length} cảnh báo:\n${r.warnings.slice(0, 3).join('\n')}` : '')); return true;
  } catch (e) { toast(e.message); return false; }
}
const nodeOf = id => state.ed.flow.nodes.find(n => n.id === id);
function setLink(n, kind, v) {
  const p = n.params ||= {}; const put = (o, k) => { if (v) o[k] = v; else delete o[k]; };
  ({ next: () => put(n, 'next'), err: () => put(n, 'on_error'), yes: () => put(p, 'if_true'), no: () => put(p, 'if_false'), body: () => put(p, 'first_body_node') })[kind]?.();
}
function edConnect(from, kind, to) { if (from === to) return; edSnap(); setLink(nodeOf(from), kind, to); edChanged(); }
function edDisconnect(i) { const e = state.canvas.edges[i]; if (!e) return; edSnap(); setLink(nodeOf(e.from), e.kind, ''); hideEdgeTools(); edChanged(); }
// sơ đồ đang tự xếp: chốt vị trí hiện tại của mọi bước trước khi kéo/thêm, để không bị nhảy lung tung
// (xem một nhóm thì vị trí lưu riêng ở gpos, không đụng bố cục Toàn bộ)
function freezePositions() { const L = state.canvas; if (!L || L.overview) return; const K = L.PK || 'position'; for (const n of state.ed.flow.nodes) if (!Array.isArray(n[K])) { const p = L.pos.get(n.id); if (p) n[K] = [Math.round(p.x), Math.round(p.y)]; } }
function uniqueId(type) { const base = { browser_session: 'mo', claude_prompt: 'ai', condition: 'if', read_from_txt: 'doc', save_to_file: 'ghi' }[type] || type.split('_')[0].slice(0, 6); let k = 1; while (nodeOf(base + k)) k++; return base + k; }
function edAddNode(spec, ctx = {}) {
  const ed = state.ed, L = state.canvas; edSnap(); freezePositions();
  const type = spec.type, id = uniqueId(type);
  let at = ctx.at;
  if (!at) {
    const src = ctx.from ? L.pos.get(ctx.from) : state.sel ? L.pos.get(state.sel) : L.pos.get(ed.flow.nodes[ed.flow.nodes.length - 1]?.id);
    at = src ? [src.x + CV.CX, src.y] : (() => { const c = L; return [Math.round((c.el.clientWidth / 2 - c.tx) / c.scale - CV.W / 2), Math.round((c.el.clientHeight / 2 - c.ty) / c.scale - CV.H / 2)]; })();
  }
  // tránh đè lên bước khác
  const K = L.PK || 'position', busy = ([x, y]) => ed.flow.nodes.some(n => n[K] && Math.abs(n[K][0] - x) < CV.W && Math.abs(n[K][1] - y) < CV.H + 40);
  for (let k = 0; k < 12 && busy(at); k++) at = [at[0], at[1] + CV.LY / 2];
  const n = { id, label: spec.label || NODE_NAME[type] || type, type, params: structuredClone(spec.params ?? NODE_DEFAULTS[type] ?? {}) };
  n[K] = [Math.round(at[0]), Math.round(at[1])];
  if (state.canvas?.view?.mode === 'group') n.group = state.canvas.view.gid;
  else if (ctx.from && nodeOf(ctx.from)?.group) n.group = nodeOf(ctx.from).group;
  ed.flow.nodes.push(n);
  if (ctx.from) { const src = nodeOf(ctx.from); setLink(src, ctx.kind || 'next', id); if (ctx.to) n.next = ctx.to; }
  else if (!ctx.at && state.sel) { const s = nodeOf(state.sel); if (s && !s.next && !['return', 'condition'].includes(s.type)) s.next = id; }
  state.sel = id; closeDrawer('nodePanel'); edChanged();
  setTimeout(() => openNDV(id), 60);
}
function edDelete(id) {
  const ed = state.ed, n = nodeOf(id); if (!n) return; edSnap();
  const inc = ed.flow.nodes.filter(m => m.next === id);
  // bỏ bước giữa chuỗi: nối bước trước sang bước sau như n8n
  if (inc.length === 1 && n.next && n.next !== id) inc[0].next = n.next; else inc.forEach(m => delete m.next);
  for (const m of ed.flow.nodes) { if (m.on_error === id) delete m.on_error; const p = m.params || {}; for (const k of ['if_true', 'if_false', 'first_body_node']) if (p[k] === id) delete p[k]; }
  ed.flow.nodes = ed.flow.nodes.filter(m => m.id !== id);
  if (state.sel === id) state.sel = null; edChanged();
}
function edDuplicate(id) {
  const n = nodeOf(id); if (!n) return; edSnap(); freezePositions();
  const c = structuredClone(n); c.id = uniqueId(n.type); c.label = (n.label || n.id) + ' (bản sao)'; delete c.next; delete c.on_error;
  for (const k of ['if_true', 'if_false', 'first_body_node']) delete c.params?.[k];
  const K = state.canvas.PK || 'position'; if (n[K]) c[K] = [n[K][0] + 40, n[K][1] + CV.LY / 2];
  state.ed.flow.nodes.push(c); state.sel = c.id; edChanged();
}
function edTidy() { const ed = state.ed; if (!ed) return; closeMenus(); edSnap(); for (const n of ed.flow.nodes) { delete n.position; delete n.gpos; } if (ed.tab !== 'canvas') edTab('canvas'); edChanged(); cfit(); toast('Đã tự sắp xếp. Kéo thả để chỉnh tiếp.'); }
function edKeys(e) {
  const ed = state.ed; if (!ed) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('#modal').open || $('#cmd').open;
  const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); edSave(); return; }
  if (mod && k === 'f' && ed.tab === 'canvas') { e.preventDefault(); openFind(); return; }
  if (mod && k === 'enter') { e.preventDefault(); if (ed.tab !== 'canvas') edTab('canvas'); const b = $('#runBtn'); if ($('#runDrawer')?.classList.contains('open') && b && !b.disabled) runFlow(); else openDrawer('runDrawer'); return; }
  if (k === 'escape' && document.activeElement?.closest?.('.drawer')) { document.activeElement.blur(); document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open')); return; }
  if (typing || ed.tab !== 'canvas') return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? edRedo() : edUndo(); }
  else if (mod && k === 'y') { e.preventDefault(); edRedo(); }
  else if (mod && k === 'd' && state.sel) { e.preventDefault(); edDuplicate(state.sel); }
  else if ((k === 'delete' || k === 'backspace') && state.sel) { e.preventDefault(); edDelete(state.sel); }
  else if (k === 'tab') { e.preventDefault(); openNodePanel(); }
  else if (k === 'enter' && state.sel) { e.preventDefault(); openNDV(state.sel); }
  else if (k === 'escape') { document.querySelectorAll('.drawer.open').forEach(d => d.classList.remove('open')); clearSel(); }
  else if (k === '1') cfit(); else if (k === '0') cz(1 / state.canvas.scale); else if (k === '=' || k === '+') cz(1.2); else if (k === '-') cz(0.8);
}

// ---------- bảng "Thêm bước": ứng dụng, loại bước lõi, workflow con — bấm để thêm hoặc kéo vào sơ đồ
function openNodePanel(ctx = {}) { if (!state.ed) return; if (state.canvas?.overview) setView({ mode: 'full' }); state.pn = ctx; openDrawer('nodePanel'); $('#pnq').value = ''; renderNodePanel(); setTimeout(() => { $('#pnq')?.focus({ preventScroll: true }); $('#cw').scrollLeft = 0; }, 60); }
function renderNodePanel() {
  const q = ($('#pnq')?.value || '').trim().toLowerCase(), docs = state.nodeDocs || {};
  const all = [
    ...APP_PRESETS.map(([app, t, s, type, label, params]) => ({ g: 'Ứng dụng', ic: logoSvg(app), t, s, spec: { type, label, params } })),
    ...Object.keys(NODE_NAME).map(type => ({ g: CAT_NAME[nCat(type)], ic: `<span data-cat="${nCat(type)}" style="display:grid;place-items:center;color:var(--c)">${nIcon(type)}</span>`, t: NODE_NAME[type], s: docs[type]?.desc || type, spec: { type }, cat: nCat(type) })),
    ...state.flows.filter(f => f.id !== state.ed.id).map(f => ({ g: 'Gọi workflow con', ic: logoSvg(flowApps(f)[0] || 'hpb'), t: f.name || f.id, s: f.description || f.id, spec: { type: 'subflow', label: f.name || f.id, params: { flow_id: f.id } } })),
  ].filter(x => !q || (x.t + ' ' + x.s + ' ' + x.spec.type + ' ' + x.g).toLowerCase().includes(q));
  state.pnItems = all; let last = '';
  $('#pnBody').innerHTML = all.map((x, i) => (x.g !== last ? `<div class="pn-g">${esc((last = x.g))}</div>` : '') + `<div class="pn-i" draggable="true" data-i="${i}" onclick="pnPick(${i})" ondragstart="event.dataTransfer.setData('text/hpb-node','${i}');event.dataTransfer.effectAllowed='copy'"><span class="ic" ${x.cat ? `data-cat="${x.cat}"` : ''}>${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(String(x.s).slice(0, 110))}</small></div></div>`).join('') || '<p class="empty">Không tìm thấy.</p>';
}
function pnPick(i) { const x = state.pnItems[i]; if (x) edAddNode(x.spec, state.pn || {}); }

// ---------- bảng tham số của một bước (như cửa sổ node của n8n): tên, tham số dạng ô nhập hoặc JSON, nối dây, ghi chú
const LINK_KEYS = ['if_true', 'if_false', 'first_body_node'];
function openNDV(id) {
  const ed = state.ed; const n = ed && nodeOf(id); if (!n) return;
  state.ndv = { id, mode: 'form' };
  const app = detectApp(n), doc = state.nodeDocs?.[n.type] || {}, others = ed.flow.nodes.filter(x => x.id !== id);
  const sel = (key, label, val, cls = '') => `<div class="field"><label class="${cls}">${label}</label><select data-link="${key}"><option value="">— không nối —</option>${others.map(o => `<option value="${esc(o.id)}" ${o.id === val ? 'selected' : ''}>${esc(o.label || o.id)} · ${esc(o.id)}</option>`).join('')}</select></div>`;
  const p = n.params || {};
  const links = (n.type === 'condition' ? sel('if_true', '<span class="t-ok">●</span> Nếu ĐÚNG → bước', p.if_true) + sel('if_false', '<span class="t-err">●</span> Nếu SAI → bước', p.if_false) : '')
    + (n.type === 'loop' ? sel('first_body_node', 'Thân vòng lặp bắt đầu từ', p.first_body_node) : '')
    + (n.type !== 'return' && n.type !== 'condition' ? sel('next', n.type === 'loop' ? 'Lặp xong → bước' : 'Bước tiếp theo', n.next) : '')
    + (n.type !== 'return' ? sel('on_error', '<span class="t-err">●</span> Khi lỗi → bước', n.on_error) : '');
  const form = Object.entries(p).filter(([k]) => !LINK_KEYS.includes(k)).map(([k, v]) => pfield(k, v)).join('');
  modal(`<div class="ndv-h">${app ? appTile(app, 'lg') : `<span class="tile lg" data-cat="${nCat(n.type)}" style="color:var(--c)"><span data-cat="${nCat(n.type)}" style="color:var(--c);display:grid">${nIcon(n.type)}</span></span>`}
      <div style="flex:1;min-width:0"><input type="text" id="ndvLabel" value="${esc(n.label || n.id)}"><div class="muted small" style="padding-left:8px">${esc(NODE_NAME[n.type] || n.type)} · <span class="mono">${esc(n.type)}</span> · mã bước <span class="mono">${esc(n.id)}</span>${app ? ' · ' + esc(logoName(app)) : ''}</div></div>
      <div class="seg"><button class="on" id="ndvF" onclick="ndvMode('form')">Ô nhập</button><button id="ndvJ" onclick="ndvMode('json')">JSON</button></div>
      <button class="icon ghost" title="Đóng" onclick="$('#modal').close()">${I('x')}</button></div>
    <div class="ndv-b"><div>
        <div class="lbl" style="margin-top:0">Tham số</div>
        <div id="pfs">${form || '<p class="muted small" id="pfEmpty">Bước này chưa có tham số.</p>'}</div>
        <textarea id="pjson" class="mono" style="display:none;min-height:320px;font-size:12.5px"></textarea>
        <div class="addp" id="addp"><input type="text" id="pkey" placeholder="Tên tham số mới, VD: timeout" onkeydown="if(event.key==='Enter')addParam()"><button onclick="addParam()">${I('plus')} Thêm tham số</button></div>
      </div><div>
        ${doc.desc ? `<div class="doc"><b>${esc(NODE_NAME[n.type] || n.type)}:</b> ${esc(doc.desc)}<div style="margin-top:6px"><b>Tham số:</b> <span class="mono">${esc(doc.params || '')}</span></div></div>` : ''}
        <div class="lbl" style="margin-top:0">Nối dây</div>${links || '<p class="muted small">Bước kết thúc, không nối tiếp.</p>'}
        <div class="field"><label>Ghi chú</label><textarea id="ndvNote" style="min-height:60px" placeholder="Ghi chú cho bước này (không ảnh hưởng khi chạy)">${esc(n.note || '')}</textarea></div>
      </div></div>
    <div class="ndv-f"><button class="danger" onclick="$('#modal').close();edDelete(${j(id)})">${I('trash')} Xoá bước</button><button onclick="$('#modal').close();edDuplicate(${j(id)})">${I('copy')} Nhân bản</button><span style="flex:1"></span><button onclick="$('#modal').close()">Huỷ</button><button class="primary" onclick="applyNDV()">${I('check')} Áp dụng</button></div>`, 'ndv');
}
function pfield(k, v) {
  const t = typeof v; let input;
  if (t === 'boolean') input = `<label class="check" style="margin:0"><input type="checkbox" data-p="${esc(k)}" data-t="bool" ${v ? 'checked' : ''}> Bật</label>`;
  else if (t === 'number') input = `<input type="number" data-p="${esc(k)}" data-t="num" value="${v}">`;
  else if (v !== null && t === 'object') input = `<textarea data-p="${esc(k)}" data-t="json">${esc(JSON.stringify(v, null, 2))}</textarea>`;
  else { const s = String(v ?? ''); const long = /code|expression|prompt|system|content|message|script|rows/i.test(k) || s.length > 60 || s.includes('\n');
    input = long ? `<textarea data-p="${esc(k)}" data-t="str" spellcheck="false">${esc(s)}</textarea>` : `<input type="text" data-p="${esc(k)}" data-t="str" value="${esc(s)}">`; }
  return `<div class="pf"><label>${esc(k)}<button class="x" title="Bỏ tham số này" onclick="this.closest('.pf').remove()">${I('x')}</button></label>${input}</div>`;
}
function addParam() { const k = $('#pkey').value.trim(); if (!k) return; $('#pfEmpty')?.remove(); $('#pfs').insertAdjacentHTML('beforeend', pfield(k, '')); $('#pkey').value = ''; $('#pfs .pf:last-child [data-p]')?.focus(); }
function readPF() {
  const out = {};
  for (const el of document.querySelectorAll('#pfs [data-p]')) {
    const k = el.dataset.p, t = el.dataset.t;
    if (t === 'bool') out[k] = el.checked; else if (t === 'num') out[k] = el.value === '' ? '' : Number(el.value);
    else if (t === 'json') { try { out[k] = JSON.parse(el.value || 'null'); } catch (e) { throw new Error(`${k}: ${e.message}`); } }
    else out[k] = el.value;
  }
  return out;
}
function ndvMode(m) {
  if (m === state.ndv.mode) return;
  try {
    if (m === 'json') $('#pjson').value = JSON.stringify(readPF(), null, 2);
    else { const o = JSON.parse($('#pjson').value || '{}'); $('#pfs').innerHTML = Object.entries(o).filter(([k]) => !LINK_KEYS.includes(k)).map(([k, v]) => pfield(k, v)).join(''); }
  } catch (e) { return toast('Tham số lỗi: ' + e.message); }
  state.ndv.mode = m; $('#pfs').style.display = $('#addp').style.display = m === 'json' ? 'none' : ''; $('#pjson').style.display = m === 'json' ? '' : 'none';
  $('#ndvF').classList.toggle('on', m === 'form'); $('#ndvJ').classList.toggle('on', m === 'json');
}
function applyNDV() {
  const n = nodeOf(state.ndv.id); let params;
  try { params = state.ndv.mode === 'json' ? JSON.parse($('#pjson').value || '{}') : readPF(); } catch (e) { return toast('Tham số lỗi: ' + e.message); }
  edSnap();
  for (const k of LINK_KEYS) delete params[k];
  n.label = $('#ndvLabel').value.trim() || n.id;
  const note = $('#ndvNote').value.trim(); if (note) n.note = note; else delete n.note;
  n.params = params;
  document.querySelectorAll('#modal [data-link]').forEach(s => { const k = s.dataset.link, v = s.value; if (k === 'next' || k === 'on_error') { if (v) n[k] = v; else delete n[k]; } else if (v) n.params[k] = v; });
  $('#modal').close(); edChanged();
}

// ---------- xem theo tầng (quy trình dài có chia nhóm): Tổng quan mỗi giai đoạn một thẻ → bấm thẻ xem chi tiết giai đoạn → Toàn bộ
const GC = { W: 216, H: 124, GX: 124, PAD: 70, TOP: 96, RY: 270 };
const canGroup = f => (f?.groups || []).length > 1 && (f.nodes || []).length > 0 && f.nodes.every(n => n.group);
function viewOf(f) {
  let v = state.views?.[f.id];
  if (!v) try { v = JSON.parse(localStorage.getItem('hpbflow.view.' + f.id) || 'null'); } catch { v = null; }
  if (v && v.mode !== 'full' && !canGroup(f)) v = null;
  if (v?.mode === 'group' && !f.nodes.some(n => n.group === v.gid)) v = null;
  return v || { mode: canGroup(f) && f.nodes.length > 12 ? 'overview' : 'full' };
}
function setView(v, focusId) {
  const c = state.canvas, f = c?.flow0; if (!f) return;
  (state.views ||= {})[f.id] = v; try { localStorage.setItem('hpbflow.view.' + f.id, JSON.stringify(v)); } catch { /* bỏ qua */ }
  drawFlowView(f, c.el, { ...c.opts0, keepView: false });
  if (state.runTl?.r) { state.lastFollow = null; paintRun(state.runTl.r); }
  if (focusId) setTimeout(() => flashNode(focusId), 80);
}
function drawFlowView(f, el, opts = {}) {
  const v = viewOf(f);
  state.flowGroups = new Map((f.groups || []).map(g => [g.id, g.label || g.id]));
  if (v.mode === 'overview') drawOverview(f, el, opts);
  else if (v.mode === 'group') {
    const inG = f.nodes.filter(n => n.group === v.gid), ids = new Set(inG.map(n => n.id));
    drawCanvas({ ...f, nodes: inG, _ext: new Map(f.nodes.filter(n => !ids.has(n.id)).map(n => [n.id, n])), _start: f.nodes[0]?.id, _back: loopBackIds(f.nodes) }, el, opts);
  } else drawCanvas(f, el, opts);
  Object.assign(state.canvas, { flow0: f, opts0: opts, view: v });
  renderViewBar(f, v, el);
}
function renderViewBar(f, v, el) {
  const wrap = el.parentElement; wrap.querySelector('.vbar')?.remove();
  if (!canGroup(f)) return;
  const gs = f.groups.filter(g => f.nodes.some(n => n.group === g.id)), i = gs.findIndex(g => g.id === v.gid), g = gs[i];
  wrap.insertAdjacentHTML('afterbegin', `<div class="vbar"><div class="seg"><button class="${v.mode !== 'full' ? 'on' : ''}" onclick="setView({mode:'overview'})" title="Mỗi giai đoạn một thẻ">${I('dashboard')} Tổng quan</button><button class="${v.mode === 'full' ? 'on' : ''}" onclick="setView({mode:'full'})" title="Hiện mọi bước">${I('workflow')} Toàn bộ</button></div>
    ${g ? `<div class="vcrumb"><a href="#" onclick="setView({mode:'overview'});return false">${I('back')} Tổng quan</a><span class="sep">/</span><b class="gdot s${f.groups.indexOf(g) % 5}">${esc(g.label || g.id)}</b><span class="muted small">${i + 1}/${gs.length}</span>
      <button class="icon ghost sm" title="Giai đoạn trước" ${i ? '' : 'disabled'} onclick="setView({mode:'group',gid:${j(gs[i - 1]?.id || '')}})">‹</button><button class="icon ghost sm" title="Giai đoạn sau" ${i < gs.length - 1 ? '' : 'disabled'} onclick="setView({mode:'group',gid:${j(gs[i + 1]?.id || '')}})">›</button></div>` : ''}</div>`);
}
function drawOverview(f, el, opts) {
  const prev = state.canvas, keep = opts.keepView && prev?.el === el && prev.overview;
  const nodes = f.nodes, byId = new Map(nodes.map(n => [n.id, n])), edges = flowEdges(nodes).filter(e => byId.has(e.to)), gOf = id => byId.get(id)?.group;
  const groups = f.groups.filter(g => nodes.some(n => n.group === g.id));
  const perRow = Math.max(3, Math.floor(((el.clientWidth || 1100) / .82 - GC.PAD * 2 + GC.GX) / (GC.W + GC.GX)));
  const pos = new Map(); groups.forEach((g, i) => pos.set(g.id, { x: GC.PAD + (i % perRow) * (GC.W + GC.GX), y: GC.TOP + Math.floor(i / perRow) * GC.RY, i, row: Math.floor(i / perRow) }));
  // gộp dây nối giữa các giai đoạn; nhánh rẽ ghi điều kiện
  const agg = new Map(), errs = {}, back = loopBackIds(nodes);
  for (const e of edges) {
    const a = gOf(e.from), b = gOf(e.to); if (!a || !b || a === b) continue;
    if (e.kind === 'err') { errs[a] = (errs[a] || 0) + 1; continue; }
    const src = byId.get(e.from), k = a + '>' + b, x = agg.get(k) || { a, b, kinds: new Set(), labels: new Set() };
    x.kinds.add(e.kind);
    if (e.kind === 'yes' || e.kind === 'no') x.labels.add(`${src.label || src.id} · ${e.kind === 'yes' ? 'đúng' : 'sai'}`);
    if (e.kind === 'next' && src.type === 'loop') x.labels.add('xong vòng lặp');
    if (e.kind === 'body') x.labels.add('mỗi vòng');
    agg.set(k, x);
  }
  const inLoop = new Set(); for (const lp of nodes.filter(n => n.type === 'loop' && n.params?.first_body_node)) { const st = [lp.params.first_body_node], seen = new Set(); while (st.length) { const id = st.pop(); if (seen.has(id) || id === lp.id || !byId.has(id)) continue; seen.add(id); inLoop.add(gOf(id)); edges.filter(e => e.from === id).forEach(e => st.push(e.to)); } }
  const { W, H } = GC;
  let lane = 0;
  const paths = [...agg.values()].map(x => {
    const a = pos.get(x.a), b = pos.get(x.b); if (!a || !b) return '';
    const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2; let d, lx, ly, lw = 200, short = false, back = false;
    if (a.row === b.row && b.i === a.i + 1) { d = bez(x1, y1, x2, y2); lx = (x1 + x2) / 2; ly = y1 - 20; lw = GC.GX - 14; short = true; }
    else if (a.row === b.row && b.i > a.i) { const top = a.y - 30 - (b.i - a.i) * 10; d = orthPath([[x1, y1], [x1 + 30, y1], [x1 + 30, top], [x2 - 30, top], [x2 - 30, y2], [x2, y2]]); lx = x2 - 30 - 100; ly = top; }
    else if (b.row > a.row) { const gy = a.y + H + (GC.RY - H) / 2 + ((lane++ % 5) - 2) * 12; d = orthPath([[x1, y1], [x1 + 30, y1], [x1 + 30, gy], [x2 - 30, gy], [x2 - 30, y2], [x2, y2]]); lx = Math.max(x2 - 30 + 110, x2 + 80); ly = gy; }
    else { back = true; const gy = Math.max(a.y, b.y) + H + 34 + ((lane++ % 4)) * 10; d = orthPath([[x1, y1], [x1 + 30, y1], [x1 + 30, gy], [x2 - 30, gy], [x2 - 30, y2], [x2, y2]]); }
    const kind = x.kinds.has('no') && !x.kinds.has('next') && !x.kinds.has('yes') ? 'no' : x.kinds.has('yes') && x.kinds.size === 1 ? 'yes' : 'next';
    const full = [...x.labels].join(' / ');
    // dây ngắn chỉ ghi "đúng/sai", rê chuột xem đủ; dây quay ngược vẽ nét đứt, không nhãn
    const lab = back || !full ? '' : short ? [...new Set([...x.labels].map(t => t.includes(' · ') ? t.split(' · ').pop() : t))].join(' / ') : full;
    return `<path class="edge k-${kind}${back ? ' back' : ''}" data-a="${x.a}" data-b="${x.b}" d="${d}" stroke="${EDGE_COLOR[kind]}" marker-end="url(#arr-${kind})"><title>${esc(full || '')}</title></path>${lab ? `<foreignObject x="${lx - lw / 2}" y="${ly - 12}" width="${lw}" height="24"><div class="elab k-${kind}" title="${esc(full)}" style="max-width:${lw}px">${esc(lab)}</div></foreignObject>` : ''}`;
  }).join('');
  const markers = Object.entries(EDGE_COLOR).map(([k, c]) => `<marker id="arr-${k}" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M2,2 L10,6 L2,10 Q4,6 2,2z" fill="${c}"/></marker>`).join('');
  const cards = groups.map((g, gi) => {
    const p = pos.get(g.id), gn = nodes.filter(n => n.group === g.id);
    const apps = [...new Set(gn.map(detectApp).filter(Boolean))]; const shown = apps.filter(a => a !== 'chrome').length ? apps.filter(a => a !== 'chrome') : apps;
    const cats = gn.reduce((m, n) => (m[nCat(n.type)] = (m[nCat(n.type)] || 0) + 1, m), {}), cat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0];
    const icon = shown.length ? appStack(shown, 4, 'sm') : `<span class="tile sm" data-cat="${cat}" style="color:var(--c)"><span data-cat="${cat}" style="display:grid;color:var(--c)">${nIcon(gn.find(n => nCat(n.type) === cat).type)}</span></span>`;
    const hasLoop = gn.some(n => n.type === 'loop'), isStart = gn.some(n => n.id === nodes[0].id);
    return `<div class="gnode s${f.groups.indexOf(g) % 5}${isStart ? ' start' : ''}" id="gn-${esc(g.id)}" data-g="${esc(g.id)}" style="left:${p.x}px;top:${p.y}px" onclick="if(!state.canvas.panMoved)setView({mode:'group',gid:${j(g.id)}})" title="Bấm để xem ${gn.length} bước của giai đoạn này">
      ${isStart ? `<i class="trig">${I('zap')}</i>` : ''}<div class="gn-top">${icon}<span class="gn-n">${gn.length} bước</span></div>
      <b>${esc(g.label || g.id)}</b>${g.note ? `<span class="gn-note">${esc(g.note)}</span>` : ''}
      <div class="gn-tags">${hasLoop ? '<em class="t-loop">↻ vòng lặp</em>' : inLoop.has(g.id) ? '<em class="t-loop">↻ mỗi vòng</em>' : ''}${errs[g.id] ? `<em class="t-err" title="Các bước có nhánh xử lý khi lỗi">⚠ ${errs[g.id]} xử lý lỗi</em>` : ''}</div>
      ${!isStart ? '<i class="port in"></i>' : ''}<i class="port out"></i><span class="gst"></span><span class="gn-open">${I('arrow-right')}</span></div>`;
  }).join('');
  const ps = [...pos.values()], width = Math.max(...ps.map(p => p.x)) + W + GC.PAD, height = Math.max(...ps.map(p => p.y)) + H + 120;
  state.canvas = { opts, el, overview: true, pos, nodes, byId, edges: [], app: new Map(nodes.map(n => [n.id, detectApp(n)])), notes: new Map(), width, height, flow: f,
    scale: keep ? prev.scale : 1, tx: keep ? prev.tx : 0, ty: keep ? prev.ty : 0 };
  el.classList.remove('edit');
  el.innerHTML = `<div class="layer" id="layer" style="width:${width}px;height:${height}px"><svg id="esvg" width="${width}" height="${height}"><defs>${markers}</defs>${paths}</svg>${cards}</div>`;
  el.parentElement.querySelector('.minimap')?.remove();
  bindCanvas(el);
  if (keep) applyT(); else cfit();
}
// tô trạng thái chạy lên thẻ giai đoạn
function paintOverview(r, cnt, cur, tl, seq) {
  const L = state.canvas, curG = cur && L.byId.get(cur)?.group, lastG = r.status === 'error' && seq.length ? L.byId.get(seq[seq.length - 1])?.group : null;
  document.querySelectorAll('.gnode').forEach(c => {
    const g = c.dataset.g, ids = L.nodes.filter(n => n.group === g).map(n => n.id), done = ids.filter(id => cnt[id]).length;
    const ms = ids.reduce((a, id) => a + (tl.per.get(id)?.total || 0), 0);
    c.classList.toggle('now', g === curG); c.classList.toggle('done', !!done && g !== curG && g !== lastG); c.classList.toggle('err', g === lastG);
    c.querySelector('.livecap')?.remove();
    const st = c.querySelector('.gst');
    if (g === curG) { const x = tl.per.get(cur); st.innerHTML = `⏱ <b data-start="${x?.start || Date.now()}">${fmtClock(Date.now() - (x?.start || Date.now()))}</b> · ${done}/${ids.length}`; st.className = 'gst on';
      c.insertAdjacentHTML('beforeend', `<div class="livecap"><i></i>▶ ${esc(L.byId.get(cur)?.label || cur)}${tl.sub ? ' › ' + esc(tl.sub) : ''}</div>`); }
    else if (done) { st.textContent = `${done}/${ids.length} bước · ${fmtClock(ms)}`; st.className = 'gst'; }
    else { st.textContent = ''; st.className = 'gst'; }
  });
  const passedG = new Set(); seq.forEach((id, i) => { if (!i) return; const a = L.byId.get(seq[i - 1])?.group, b = L.byId.get(id)?.group; if (a && b && a !== b) passedG.add(a + '>' + b); });
  const prevG = seq.length > 1 ? L.byId.get(seq[seq.length - 2])?.group : null;
  document.querySelectorAll('#layer .edge').forEach(e => { const k = e.dataset.a + '>' + e.dataset.b; e.classList.toggle('ran', passedG.has(k)); e.classList.toggle('live', !!curG && prevG !== curG && k === prevG + '>' + curG); });
}

// ---------- canvas kiểu n8n: bước đi trái → phải theo cột, nhánh phụ (sai/lỗi) rẽ xuống làn dưới, dây nối cong, logo app thật.
// Bước có "position" (đã kéo thả) thì đứng đúng chỗ đó; chưa có thì tự xếp và tự xuống hàng theo nhóm cho vừa khung.
const CV = { W: 96, H: 96, CX: 188, LY: 206, PAD: 64, TOP: 84, GUT: 88, RGAP: 150 };
const EDGE_COLOR = { next: '#9aa3b5', yes: '#12a150', body: '#7c3aed', no: '#e5484d', err: '#e5484d' };
const OUT_LABEL = { yes: 'đúng', no: 'sai', err: 'lỗi', body: 'lặp' };
// các bước thao tác trên trang đang mở: mang huy hiệu app của trang đó (vd. "Dán vào A1" trên Google Sheets)
const PAGE_STEP = new Set(['eval_js', 'click', 'type', 'key_press', 'hover', 'scroll', 'mouse_click', 'mouse_drag', 'wait_for_function', 'wait', 'screenshot', 'set_var', 'poll_stream_text', 'upload_file', 'upload_via_chooser', 'resolve_images']);
function flowEdges(nodes) {
  const edges = [];
  for (const n of nodes) {
    const p = n.params || {};
    if (n.type === 'condition') { if (p.if_true) edges.push({ from: n.id, to: p.if_true, kind: 'yes' }); if (p.if_false) edges.push({ from: n.id, to: p.if_false, kind: 'no' }); }
    if (n.type === 'loop' && p.first_body_node) edges.push({ from: n.id, to: p.first_body_node, kind: 'body' });
    if (n.next) edges.push({ from: n.id, to: n.next, kind: 'next' });
    if (n.on_error && n.on_error !== n.next) edges.push({ from: n.id, to: n.on_error, kind: 'err' });
  }
  return edges;
}
function layoutFlow(f, maxCols = 99) {
  const nodes = f.nodes || [], byId = new Map(nodes.map(n => [n.id, n])), allE = flowEdges(nodes), edges = allE.filter(e => byId.has(e.to));
  // cột = đường dài nhất tính từ bước đầu (bỏ qua cạnh quay lui)
  const rank = { next: 0, yes: 1, body: 1, no: 2, err: 3 };
  const level = new Map(), order = [];
  // nhánh "xong" của vòng lặp đi sau toàn bộ thân vòng (như n8n: done ở cuối), không chen vào giữa
  const loopDone = e => e.kind === 'next' && byId.get(e.from)?.type === 'loop', deferred = [];
  const visit = (id, lv, path) => {
    if (!byId.has(id) || path.has(id)) return;
    if (level.has(id) && level.get(id) >= lv) return;
    level.set(id, lv); if (!order.includes(id)) order.push(id);
    for (const e of edges.filter(e => e.from === id).sort((a, b) => rank[a.kind] - rank[b.kind])) {
      if (loopDone(e)) { deferred.push(e); continue; }
      visit(e.to, lv + 1, new Set([...path, id]));
    }
  };
  if (nodes[0]) visit(nodes[0].id, 0, new Set());
  while (deferred.length) { const e = deferred.shift(); if (!level.has(e.to)) visit(e.to, Math.max(0, ...level.values()) + 1, new Set([e.from])); }
  let extra = Math.max(0, ...level.values()) + 1;
  for (const n of nodes) if (!level.has(n.id)) { level.set(n.id, extra++); order.push(n.id); }
  // làn: bước nối bằng "tiếp/đúng" ở cùng làn với bước trước, nhánh "sai/lỗi" rẽ xuống làn dưới; trùng chỗ thì dời xuống
  const lane = new Map(), taken = new Set();
  const sorted = [...order].sort((a, b) => level.get(a) - level.get(b) || order.indexOf(a) - order.indexOf(b));
  for (const id of sorted) {
    const inc = edges.filter(e => e.to === id && lane.has(e.from) && level.get(e.from) < level.get(id));
    const main = inc.filter(e => e.kind === 'next' || e.kind === 'yes' || e.kind === 'body').map(e => lane.get(e.from));
    if (!main.length && inc.some(loopDone)) main.push(0);
    let l = main.length ? Math.min(...main) : inc.length ? Math.min(...inc.map(e => lane.get(e.from))) + 1 : 0;
    while (taken.has(level.get(id) + ':' + l)) l++;
    lane.set(id, l); taken.add(level.get(id) + ':' + l);
  }
  // xuống dòng cho vừa khung: ngắt ở ranh giới nhóm (cả nhóm sang hàng mới nếu không đủ chỗ), nhóm quá dài thì ngắt giữa chừng
  const maxLv = Math.max(0, ...level.values()), colGroup = [];
  for (const id of order) colGroup[level.get(id)] ??= byId.get(id).group || '';
  const rowOf = [], colOf = []; let r = 0, c = 0;
  for (let lv = 0; lv <= maxLv; lv++) {
    if (c && colGroup[lv] !== colGroup[lv - 1]) { let len = 1; while (lv + len <= maxLv && colGroup[lv + len] === colGroup[lv]) len++; if (c + Math.min(len, maxCols) > maxCols) { r++; c = 0; } }
    if (c >= maxCols) { r++; c = 0; }
    rowOf[lv] = r; colOf[lv] = c++;
  }
  const rows = r + 1, rowLanes = Array(rows).fill(0), rowTop = [];
  for (const id of order) { const rr = rowOf[level.get(id)]; rowLanes[rr] = Math.max(rowLanes[rr], lane.get(id)); }
  for (let i = 0, y = CV.TOP; i < rows; i++) { rowTop[i] = y; y += rowLanes[i] * CV.LY + CV.H + CV.GUT + CV.RGAP; }
  let pos = new Map();
  for (const id of order) { const lv = level.get(id), row = rowOf[lv]; pos.set(id, { x: CV.PAD + colOf[lv] * CV.CX, y: rowTop[row] + lane.get(id) * CV.LY, lv, lane: lane.get(id), row }); }
  // workflow chia nhóm đầy đủ: mỗi nhóm tự xếp thành một khối gọn, các khối nối tiếp nhau và xuống hàng khi hết chỗ
  let gl = null;
  if ((f.groups || []).length && nodes.length && nodes.every(n => n.group)) { gl = groupLayout(f, nodes, edges, loopDone, rank, maxCols); pos = gl.pos; taken.clear(); gl.taken.forEach(k => taken.add(k)); rowTop.length = 0; rowTop.push(...gl.rowTop); rowLanes.length = 0; rowLanes.push(...gl.rowLanes); }
  // vị trí kéo thả tay (xem một nhóm thì dùng gpos riêng)
  const PK = f._ext ? 'gpos' : 'position', manual = nodes.some(n => Array.isArray(n[PK]));
  if (manual) {
    let mx = Math.max(CV.PAD - CV.CX, ...nodes.filter(n => Array.isArray(n[PK])).map(n => n[PK][0]));
    for (const n of nodes) { const p = pos.get(n.id); p.row = 0; if (Array.isArray(n[PK])) { p.x = n[PK][0]; p.y = n[PK][1]; } else { mx += CV.CX; p.x = mx; p.y = CV.TOP; } }
  }
  // app của trang đang mở, truyền theo chuỗi "tiếp" sang các bước thao tác trên trang
  const app = new Map(nodes.map(n => [n.id, detectApp(n)])), ctx = new Map();
  for (const n of nodes) {
    const a = app.get(n.id); if (n.type !== 'goto' || !a || a === 'chrome') continue;
    for (let m = byId.get(n.next); m && PAGE_STEP.has(m.type) && !ctx.has(m.id); m = byId.get(m.next)) ctx.set(m.id, a);
  }
  // dây lỗi đi xa (khác hàng, cách hơn 1 cột, hoặc quay lui) không vẽ thành đường dài chằng chịt:
  // thay bằng ghi chú đỏ dưới tên bước "lỗi → …", bấm vào để nhảy tới bước đó
  const near = (a, b) => manual ? b.x > a.x && b.x - a.x < CV.CX * 1.6 && Math.abs(b.y - a.y) < CV.LY * 1.2 : a.row === b.row && b.lv - a.lv === 1;
  const notes = new Map(), addNote = (id, x) => { if (!notes.has(id)) notes.set(id, []); notes.get(id).push(x); };
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (e.kind === 'err' && !near(a, b)) { e.far = true; addNote(e.from, { k: 'err', to: e.to }); }
    // dây quay ngược lên hàng trên / sang trái (vd. "mở lại bài"): ghi chú thay cho đường vòng dài
    else if (e.kind === 'next' && (b.row < a.row || (a.row === b.row && b.x <= a.x))) { e.far = true; addNote(e.from, { k: 'jump', to: e.to }); }
    // nhánh "xong" của vòng lặp nằm tận cuối sơ đồ
    else if (loopDone(e) && b.row > a.row) { e.far = true; addNote(e.from, { k: 'done', to: e.to }); }
    // nhánh nhảy qua từ 2 hàng trở lên sẽ cắt ngang các khối ở giữa: cũng thành ghi chú
    else if (!manual && e.kind !== 'body' && b.row - a.row >= 2) { e.far = true; addNote(e.from, { k: 'jump', pre: { yes: 'đúng → ', no: 'sai → ', next: '→ ' }[e.kind], to: e.to }); }
  }
  // bước cuối của thân vòng lặp (không nối tiếp) quay về vòng lặp để làm bài kế tiếp
  for (const id of f._back || loopBackIds(nodes)) if (byId.has(id)) addNote(id, { k: 'back' });
  // đang xem một nhóm: dây nối sang bước ở nhóm khác thành ghi chú bấm được (nhảy sang nhóm đó)
  if (f._ext) for (const e of allE) if (!byId.has(e.to) && f._ext.has(e.to)) addNote(e.from, { k: e.kind === 'err' ? 'err' : 'jump', pre: { err: '⚠ lỗi → ', yes: 'đúng → ', no: 'sai → ', next: '→ ', body: 'lặp → ' }[e.kind], to: e.to });
  const ps = [...pos.values()];
  const width = Math.max(400, ...ps.map(p => p.x)) + CV.W + CV.PAD, height = Math.max(200, ...ps.map(p => p.y)) + CV.H + CV.GUT + CV.PAD;
  return { nodes, edges, pos, byId, app, ctx, taken, rowTop, rowLanes, width, height, manual, notes, ext: f._ext, PK };
}
// các bước cuối thân vòng lặp (không nối tiếp): chạy xong thì quay về vòng lặp
function loopBackIds(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n])), edges = flowEdges(nodes), out = new Set();
  for (const lp of nodes.filter(n => n.type === 'loop' && n.params?.first_body_node)) {
    const seen = new Set(), st = [lp.params.first_body_node];
    while (st.length) { const id = st.pop(); if (seen.has(id) || id === lp.id || !byId.has(id)) continue; seen.add(id); edges.filter(e => e.from === id).forEach(e => st.push(e.to)); }
    for (const id of seen) if (byId.get(id).type !== 'return' && !edges.some(e => e.from === id)) out.add(id);
  }
  return out;
}
// xếp theo nhóm: trong mỗi nhóm tính cột/làn riêng, rồi xếp các nhóm nối tiếp nhau, nhóm dài quá một hàng thì cắt khúc
function groupLayout(f, nodes, edges, loopDone, rank, maxCols) {
  const gids = [...new Set([...(f.groups || []).map(g => g.id), ...nodes.map(n => n.group)])];
  const blocks = [];
  for (const gid of gids) {
    const gn = nodes.filter(n => n.group === gid); if (!gn.length) continue;
    const ids = new Set(gn.map(n => n.id)), ge = edges.filter(e => ids.has(e.from) && ids.has(e.to) && !loopDone(e));
    const lv = new Map(), ord = [];
    const vis = (id, l, path) => {
      if (path.has(id) || (lv.has(id) && lv.get(id) >= l)) return;
      lv.set(id, l); if (!ord.includes(id)) ord.push(id);
      for (const e of ge.filter(e => e.from === id).sort((a, b) => rank[a.kind] - rank[b.kind])) vis(e.to, l + 1, new Set([...path, id]));
    };
    const entries = gn.filter(n => !ge.some(e => e.to === n.id));
    (entries.length ? entries : [gn[0]]).forEach(n => vis(n.id, 0, new Set()));
    for (const n of gn) if (!lv.has(n.id)) { lv.set(n.id, Math.max(0, ...lv.values()) + 1); ord.push(n.id); }
    const ln = new Map(), tk = new Set();
    for (const id of [...ord].sort((a, b) => lv.get(a) - lv.get(b) || ord.indexOf(a) - ord.indexOf(b))) {
      const inc = ge.filter(e => e.to === id && ln.has(e.from) && lv.get(e.from) < lv.get(id));
      const main = inc.filter(e => e.kind === 'next' || e.kind === 'yes' || e.kind === 'body').map(e => ln.get(e.from));
      let l = main.length ? Math.min(...main) : inc.length ? Math.min(...inc.map(e => ln.get(e.from))) + 1 : 0;
      while (tk.has(lv.get(id) + ':' + l)) l++;
      ln.set(id, l); tk.add(lv.get(id) + ':' + l);
    }
    blocks.push({ ord, lv, ln, cols: Math.max(...lv.values()) + 1 });
  }
  // xếp khối vào hàng
  const GAPX = 40, place = new Map(), rowLanes = [];
  let row = 0, col = 0, gap = 0, gcol = 0;
  for (const b of blocks) for (let s = 0; s < b.cols; s += maxCols) {
    const w = Math.min(maxCols, b.cols - s);
    if (col && col + w > maxCols) { row++; col = 0; gap = 0; }
    for (const id of b.ord) { const l = b.lv.get(id); if (l < s || l >= s + w) continue; place.set(id, { row, col: col + l - s, gap, g: gcol + l - s, lane: b.ln.get(id) }); rowLanes[row] = Math.max(rowLanes[row] ?? 0, b.ln.get(id)); }
    col += w; gap++; gcol += w;
  }
  const rowTop = [];
  for (let i = 0, y = CV.TOP; i <= row; i++) { rowTop[i] = y; y += (rowLanes[i] ?? 0) * CV.LY + CV.H + CV.GUT + CV.RGAP; }
  const pos = new Map(), taken = new Set();
  for (const [id, q] of place) { pos.set(id, { x: CV.PAD + q.col * CV.CX + q.gap * GAPX, y: rowTop[q.row] + q.lane * CV.LY, lv: q.g, lane: q.lane, row: q.row }); taken.add(q.g + ':' + q.lane); }
  return { pos, taken, rowTop, rowLanes };
}
// đường gấp khúc bo góc qua các điểm
function orthPath(pts, r = 18) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy), k = Math.min(r, l1 / 2, l2 / 2);
    if (!k) { d += ` L${cx},${cy}`; continue; }
    d += ` L${cx - (cx - px) / l1 * k},${cy - (cy - py) / l1 * k} Q${cx},${cy} ${cx + (nx - cx) / l2 * k},${cy + (ny - cy) / l2 * k}`;
  }
  const [lx, ly] = pts[pts.length - 1]; return d + ` L${lx},${ly}`;
}
const bez = (x1, y1, x2, y2) => { const c = Math.max(40, Math.min(160, Math.abs(x2 - x1) * .5)); return `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`; };
// vị trí (tỉ lệ theo chiều cao) các cổng ra bên phải của một bước
function outPorts(n) {
  if (n.type === 'condition') return { yes: .32, no: .68 };
  if (n.type === 'loop') return { body: .32, next: .68 };
  if (n.type === 'return') return {};
  if (n.on_error && n.on_error !== n.next) return { next: .36, err: .7 };
  // trong trình soạn có thêm cổng "lỗi" mờ, rê chuột vào bước mới hiện, để kéo dây xử lý lỗi
  return state.canvas?.opts?.edit ? { next: .5, err: .84 } : { next: .5 };
}
function edgePath(L, e) {
  const a = L.pos.get(e.from), b = L.pos.get(e.to); if (!a || !b) return '';
  const { W, H, CX, LY, GUT } = CV, gap = (CX - W) / 2;
  const x1 = a.x + W, y1 = a.y + H * (outPorts(L.byId.get(e.from))[e.kind] ?? .5), x2 = b.x, y2 = b.y + H / 2;
  if (L.manual) {
    // vị trí tự do: đi tới thì cong mềm, quay lui thì vòng qua khe giữa hai hàng hoặc dưới cả hai bước
    if (x2 - x1 >= 40) return bez(x1, y1, x2, y2);
    let gy;
    if (b.y - (a.y + H) > 120) gy = (a.y + H + 62 + b.y - 56) / 2; else if (a.y - (b.y + H) > 120) gy = (b.y + H + 62 + a.y - 56) / 2; else gy = Math.max(a.y, b.y) + H + GUT;
    return orthPath([[x1, y1], [x1 + 36, y1], [x1 + 36, gy], [x2 - 36, gy], [x2 - 36, y2], [x2, y2]]);
  }
  // sang hàng khác: đi xuống rãnh giữa hai hàng rồi vòng về cột của bước đích
  if (a.row !== b.row) { const gy = L.rowTop[a.row] + L.rowLanes[a.row] * LY + H + GUT + 38; return orthPath([[x1, y1], [x1 + gap, y1], [x1 + gap, gy], [x2 - gap, gy], [x2 - gap, y2], [x2, y2]]); }
  const free = l => { for (let c = a.lv + 1; c < b.lv; c++) if (L.taken.has(c + ':' + l)) return false; return true; };
  const gutter = L.rowTop[a.row] + Math.max(a.lane, b.lane) * LY + H + GUT;
  if (b.lv === a.lv + 1) return bez(x1, y1, x2, y2);
  if (b.lv > a.lv && free(b.lane)) return orthPath(Math.abs(y1 - y2) < 1 ? [[x1, y1], [x2, y2]] : [[x1, y1], [x1 + gap, y1], [x1 + gap, y2], [x2, y2]]);
  if (b.lv > a.lv && free(a.lane)) return orthPath([[x1, y1], [x2 - gap, y1], [x2 - gap, y2], [x2, y2]]);
  // bị chắn hoặc quay lui: đi vòng qua rãnh dưới làn thấp hơn
  return orthPath([[x1, y1], [x1 + gap, y1], [x1 + gap, gutter], [x2 - gap, gutter], [x2 - gap, y2], [x2, y2]]);
}
function renderEdges() {
  const L = state.canvas, edit = L.opts.edit;
  const markers = Object.entries(EDGE_COLOR).map(([k, c]) => `<marker id="arr-${k}" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M2,2 L10,6 L2,10 Q4,6 2,2z" fill="${c}"/></marker>`).join('');
  const paths = L.edges.map((e, i) => {
    const d = e.far ? '' : edgePath(L, e); if (!d) return '';
    return `<path class="edge k-${e.kind}" id="eg-${i}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${d}" stroke="${EDGE_COLOR[e.kind]}" marker-end="url(#arr-${e.kind})"/>${edit ? `<path class="ehit" data-i="${i}" d="${d}"/>` : ''}`;
  }).join('');
  $('#esvg').innerHTML = `<defs>${markers}</defs>${paths}<path class="tmpedge" id="tmpEdge" d=""/>`;
}
// ghi chú dán (sticky) của từng nhóm bước, như n8n; nhóm bị ngắt sang hàng sau thì mỗi hàng một mảnh
function renderStickies() {
  const L = state.canvas, f = L.flow, { W, H } = CV;
  $('#stk').innerHTML = (f.groups || []).map((g, gi) => {
    const all = L.nodes.filter(n => n.group === g.id).map(n => L.pos.get(n.id));
    return [...new Set(all.map(p => p.row))].map((row, k) => {
      const ps = all.filter(p => p.row === row);
      const x0 = Math.min(...ps.map(p => p.x)) - 34, y0 = Math.min(...ps.map(p => p.y)) - 56, x1 = Math.max(...ps.map(p => p.x)) + W + 46, y1 = Math.max(...ps.map(p => p.y)) + H + 70;
      return `<div class="gcap s${g.color ?? gi % 5}" style="left:${x0 + 20}px;top:${y0 + 2}px;width:${x1 - x0 - 40}px" title="${esc(g.note || '')}"><b>${esc(g.label || g.id)}</b>${g.note && !k ? `<span>${esc(g.note)}</span>` : ''}</div>`;
    }).join('');
  }).join('');
}
function drawCanvas(f, el, opts = {}) {
  const prev = state.canvas, keep = opts.keepView && prev && prev.el === el;
  // số cột mỗi hàng khi tự xếp: đủ để xem ở cỡ ~80%
  const maxCols = 999; // như n8n: một mạch trái → phải, kéo/cuộn ngang để xem tiếp
  state.canvas = { opts, el }; // outPorts đọc opts.edit qua state.canvas
  const L = layoutFlow(f, maxCols); Object.assign(state.canvas, L, { scale: keep ? prev.scale : 1, tx: keep ? prev.tx : 0, ty: keep ? prev.ty : 0, flow: f });
  const { W, H } = CV, last = L.nodes.length - 1, edit = !!opts.edit;
  const nodesHtml = L.nodes.map((n, idx) => {
    const p = L.pos.get(n.id), app = L.app.get(n.id), ctx = L.ctx.get(n.id), ports = outPorts(n);
    const icon = app ? logoSvg(app) : `<span class="core" data-cat="${nCat(n.type)}">${nIcon(n.type)}</span>`;
    const ghost = k => k === 'err' && !(n.on_error && n.on_error !== n.next);
    const outs = Object.entries(ports).map(([k, y]) => `<i class="port out k-${k}${ghost(k) ? ' ghost' : ''}" data-k="${k}" style="top:${y * 100}%" title="${edit ? (k === 'err' ? 'Kéo để nối nhánh khi lỗi' : 'Kéo để nối dây') : ''}"></i>${(n.type === 'loop' && k === 'next' ? 'xong' : OUT_LABEL[k]) && !ghost(k) && !(k === 'err' && L.notes.get(n.id)?.some(x => x.k === 'err')) ? `<em class="olab k-${k}" style="top:${y * 100}%">${n.type === 'loop' && k === 'next' ? 'xong' : OUT_LABEL[k]}</em>` : ''}`).join('');
    const isStart = n.id === (f._start ?? L.nodes[0]?.id);
    const shape = isStart ? ' start' : n.type === 'return' || idx === last && !n.next ? ' end' : '';
    return `<div class="node${shape}" data-cat="${nCat(n.type)}" data-id="${esc(n.id)}" id="nd-${esc(n.id)}" style="left:${p.x}px;top:${p.y}px" title="${esc((n.label || n.id) + ' · #' + (idx + 1) + ' · ' + n.type + (app ? ' · ' + logoName(app) : '') + (n.note ? '\n' + n.note : ''))}">${isStart ? `<i class="trig" title="Bước bắt đầu">${I('zap')}</i>` : ''}
      ${edit ? `<div class="ntools"><button title="Sửa tham số (Enter)" data-act="edit">${I('edit')}</button><button title="Nhân bản (⌘D)" data-act="dup">${I('copy')}</button><button class="danger" title="Xoá (Delete)" data-act="del">${I('trash')}</button></div>` : ''}
      <div class="box">${icon}${ctx ? `<span class="ctx" title="Trên ${esc(logoName(ctx))}">${logoSvg(ctx)}</span>` : ''}${n.type === 'subflow' ? `<span class="sub" title="Gọi workflow con">${I('layers')}</span>` : ''}<span class="st"></span></div>
      ${!isStart ? '<i class="port in"></i>' : ''}${outs}${edit && !(L.notes.get(n.id) || []).some(x => x.k === 'back') ? Object.entries(ports).filter(([k]) => k !== 'err' && !({ next: n.next, yes: n.params?.if_true, no: n.params?.if_false, body: n.params?.first_body_node })[k]).map(([k, y]) => `<span class="addst" style="top:${y * 100}%"><i></i><button data-k="${k}" title="Thêm bước tiếp theo">${I('plus')}</button></span>`).join('') : ''}
      <div class="cap"><b>${esc(n.label || n.id)}</b>${(NODE_NAME[n.type] || n.type) !== n.label ? `<small>${esc(NODE_NAME[n.type] || n.type)}</small>` : ''}${(L.notes.get(n.id) || []).map(x => `<a class="jump k-${x.k}" data-to="${esc(x.to || '')}" title="Bấm để tới bước này">${(x.pre || { err: '⚠ lỗi → ', jump: '↩ quay về: ', done: '✓ xong → ' }[x.k] || '') + (x.k === 'back' ? '↺ quay lại vòng lặp' : esc((L.byId.get(x.to) || L.ext?.get(x.to))?.label || x.to) + (L.ext?.has(x.to) ? ` · ${esc(state.flowGroups?.get(L.ext.get(x.to).group) || '')}` : ''))}</a>`).join('')}</div></div>`;
  }).join('');
  el.classList.toggle('edit', edit);
  el.innerHTML = `<div class="layer" id="layer" style="width:${L.width}px;height:${L.height}px"><div id="stk"></div><svg id="esvg" width="${L.width}" height="${L.height}"></svg>${nodesHtml}
    <div class="etools" id="etools"><button title="Chèn bước vào giữa" data-eact="add">${I('plus')}</button><button class="danger" title="Xoá dây nối" data-eact="del">${I('trash')}</button></div></div>
    ${edit && !L.nodes.length ? `<div class="emptyc"><button onclick="openNodePanel()">${I('plus')}<b>Thêm bước đầu tiên</b><span class="small">hoặc nhấn Tab</span></button></div>` : ''}`;
  renderStickies(); renderEdges(); if (!edit) drawMinimap(L, el); else el.parentElement.querySelector('.minimap')?.remove();
  bindCanvas(el);
  if (keep) applyT(); else cfit();
}
function toLayer(e) { const c = state.canvas, r = c.el.getBoundingClientRect(); return [(e.clientX - r.left - c.tx) / c.scale, (e.clientY - r.top - c.ty) / c.scale]; }
function bindCanvas(el) {
  // cuộn = di chuyển; Ctrl/⌘ + cuộn (hoặc chụm 2 ngón) = phóng to tại con trỏ
  el.onwheel = e => {
    e.preventDefault(); const c = state.canvas;
    if (e.ctrlKey || e.metaKey) { const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = Math.exp(-e.deltaY * 0.01), ns = Math.min(2, Math.max(.2, c.scale * k)); c.tx = mx - (mx - c.tx) * ns / c.scale; c.ty = my - (my - c.ty) * ns / c.scale; c.scale = ns; }
    else { c.tx -= e.deltaX; c.ty -= e.deltaY; }
    stopFollow(); applyT();
  };
  el.onmousedown = e => {
    if (e.button !== 0) return; const c = state.canvas;
    const tb = e.target.closest('.ntools button, .etools button, .jump, .addst');
    if (tb) { e.stopPropagation(); return; }
    const port = e.target.closest('.port.out'), nodeEl = e.target.closest('.node');
    if (c.opts.edit && port && nodeEl) { e.preventDefault(); c.drag = { t: 'link', from: nodeEl.dataset.id, kind: port.dataset.k }; return; }
    if (nodeEl) { const p = c.pos.get(nodeEl.dataset.id); c.drag = { t: 'node', id: nodeEl.dataset.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, el: nodeEl }; return; }
    c.panMoved = false; c.drag = { t: 'pan', x: e.clientX - c.tx, y: e.clientY - c.ty, sx: e.clientX, sy: e.clientY }; el.classList.add('panning');
  };
  el.onclick = e => {
    const jp = e.target.closest('.jump'); if (jp) { e.stopPropagation(); flashNode(jp.dataset.to); return; }
    const ad = e.target.closest('.addst button'); if (ad) { e.stopPropagation(); openNodePanel({ from: ad.closest('.node').dataset.id, kind: ad.dataset.k }); return; }
    const tb = e.target.closest('.ntools button'); if (tb) { const id = tb.closest('.node').dataset.id; ({ edit: () => openNDV(id), dup: () => edDuplicate(id), del: () => edDelete(id) })[tb.dataset.act]?.(); return; }
    const eb = e.target.closest('.etools button'); if (eb) { const i = state.canvas.hotEdge, ed = state.canvas.edges[i]; if (eb.dataset.eact === 'del') edDisconnect(i); else if (ed) openNodePanel({ from: ed.from, kind: ed.kind, to: ed.to }); }
  };
  el.ondblclick = e => { const n = e.target.closest('.node'); if (n && state.canvas.opts.edit) openNDV(n.dataset.id); };
  el.onmouseover = e => {
    const c = state.canvas; if (!c?.opts.edit || c.drag) return;
    const h = e.target.closest?.('.ehit'), t = e.target.closest?.('.etools');
    clearTimeout(c.etT);
    if (h) showEdgeTools(+h.dataset.i, h); else if (!t) c.etT = setTimeout(hideEdgeTools, 250);
  };
  // kéo từ bảng "Thêm bước" thả vào sơ đồ
  el.ondragover = e => { if (state.canvas?.opts.edit && !state.canvas.overview) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
  el.ondrop = e => { e.preventDefault(); const i = e.dataTransfer.getData('text/hpb-node'); const x = state.pnItems?.[+i]; if (!x) return; const [lx, ly] = toLayer(e); edAddNode(x.spec, { at: [Math.round((lx - CV.W / 2) / 20) * 20, Math.round((ly - CV.H / 2) / 20) * 20] }); };
  window.onmousemove = e => {
    const c = state.canvas, d = c?.drag; if (!d) return;
    if (d.t === 'pan') { c.tx = e.clientX - d.x; c.ty = e.clientY - d.y; if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) stopFollow(); applyT(); return; }
    if (d.t === 'node') {
      const dx = (e.clientX - d.sx) / c.scale, dy = (e.clientY - d.sy) / c.scale;
      if (!c.opts.edit || (!d.moved && Math.hypot(dx, dy) < 4)) return;
      if (!d.moved) { d.moved = true; edSnap(); d.el.classList.add('dragging'); hideEdgeTools(); if (!c.manual) { freezePositions(); c.manual = true; } }
      const p = c.pos.get(d.id); p.x = Math.max(0, Math.round((d.ox + dx) / 20) * 20); p.y = Math.max(0, Math.round((d.oy + dy) / 20) * 20);
      d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px'; p.row = 0; renderEdges(); renderStickies(); return;
    }
    if (d.t === 'link') {
      const [lx, ly] = toLayer(e), n = c.byId.get(d.from), p = c.pos.get(d.from);
      $('#tmpEdge').setAttribute('d', bez(p.x + CV.W, p.y + CV.H * (outPorts(n)[d.kind] ?? .5), lx, ly));
      document.querySelectorAll('.node.linktarget').forEach(x => x.classList.remove('linktarget'));
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node'); if (t && t.dataset.id !== d.from) t.classList.add('linktarget');
    }
  };
  window.onmouseup = e => {
    const c = state.canvas, d = c?.drag; if (!d) return; c.drag = null; el.classList.remove('panning');
    if (d.t === 'pan') { c.panMoved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 4; if (!c.panMoved) clearSel(); return; }
    if (d.t === 'node') {
      d.el.classList.remove('dragging');
      if (d.moved) { const K = c.PK || 'position'; for (const n of state.ed.flow.nodes) { const p = c.pos.get(n.id); if (p) n[K] = [p.x, p.y]; } edChanged(); }
      else selNode(d.id);
      return;
    }
    if (d.t === 'link') {
      $('#tmpEdge')?.setAttribute('d', ''); document.querySelectorAll('.node.linktarget').forEach(x => x.classList.remove('linktarget'));
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
      if (t && t.dataset.id !== d.from) edConnect(d.from, d.kind, t.dataset.id);
      else if (!t && e.target.closest('#canvas')) { const [lx, ly] = toLayer(e); openNodePanel({ from: d.from, kind: d.kind, at: [Math.round(lx / 20) * 20 + 20, Math.round((ly - CV.H / 2) / 20) * 20] }); }
    }
  };
}
function flashNode(id) {
  const c = state.canvas, p = c.pos.get(id), el = $('#nd-' + CSS.escape(id));
  if (!p || !el) { const f0 = c.flow0, n = f0?.nodes.find(x => x.id === id); if (n?.group && canGroup(f0)) setView({ mode: 'group', gid: n.group }, id); else if (f0 && c.view?.mode !== 'full') setView({ mode: 'full' }, id); return; }
  c.tx = c.el.clientWidth / 2 - (p.x + CV.W / 2) * c.scale; c.ty = c.el.clientHeight / 2 - (p.y + CV.H / 2) * c.scale; applyT();
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
function showEdgeTools(i, hit) {
  const c = state.canvas, t = $('#etools'); if (!t) return;
  const len = hit.getTotalLength(), pt = hit.getPointAtLength(len / 2);
  document.querySelectorAll('.edge.hot').forEach(x => x.classList.remove('hot')); $('#eg-' + i)?.classList.add('hot');
  c.hotEdge = i; t.style.left = pt.x + 'px'; t.style.top = pt.y + 'px'; t.classList.add('on');
}
function hideEdgeTools() { $('#etools')?.classList.remove('on'); document.querySelectorAll('.edge.hot').forEach(x => x.classList.remove('hot')); }
function clearSel() { document.querySelectorAll('.node.sel').forEach(n => n.classList.remove('sel')); state.sel = null; }
// bản đồ thu nhỏ góc phải dưới: thấy toàn bộ flow, bấm/kéo để nhảy tới
function drawMinimap(L, el) {
  const wrap = el.parentElement; wrap.querySelector('.minimap')?.remove();
  if (!L.nodes.length) return;
  const mw = 168, mh = Math.max(48, Math.min(104, mw * L.height / L.width)), k = Math.min(mw / L.width, mh / L.height);
  const ox = (mw - L.width * k) / 2, oy = (mh - L.height * k) / 2;
  const rects = L.nodes.map(n => { const p = L.pos.get(n.id); return `<rect data-id="${esc(n.id)}" x="${ox + p.x * k}" y="${oy + p.y * k}" width="${Math.max(3, CV.W * k)}" height="${Math.max(3, CV.H * k)}" rx="1.5"/>`; }).join('');
  wrap.insertAdjacentHTML('beforeend', `<div class="minimap" style="width:${mw}px;height:${mh}px"><svg width="${mw}" height="${mh}">${rects}<rect class="vp" id="mmvp" rx="3"/></svg></div>`);
  const mm = wrap.querySelector('.minimap'); state.canvas.mm = { k, ox, oy };
  const go = e => { const r = mm.getBoundingClientRect(), c = state.canvas, gx = (e.clientX - r.left - ox) / k, gy = (e.clientY - r.top - oy) / k; c.tx = el.clientWidth / 2 - gx * c.scale; c.ty = el.clientHeight / 2 - gy * c.scale; applyT(); };
  mm.onmousedown = e => { e.stopPropagation(); go(e); const mv = ev => go(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
}
function applyT() {
  const c = state.canvas; if (!c || !$('#layer')) return;
  $('#layer').style.transform = `translate(${c.tx}px,${c.ty}px) scale(${c.scale})`;
  // lưới chấm chạy theo sơ đồ
  const g = 22 * c.scale; c.el.style.backgroundSize = `${g}px ${g}px`; c.el.style.backgroundPosition = `${c.tx}px ${c.ty}px`;
  const vp = $('#mmvp'); if (vp && c.mm) { const { k, ox, oy } = c.mm; vp.setAttribute('x', ox - c.tx / c.scale * k); vp.setAttribute('y', oy - c.ty / c.scale * k); vp.setAttribute('width', c.el.clientWidth / c.scale * k); vp.setAttribute('height', c.el.clientHeight / c.scale * k); }
}
function cz(k) { const c = state.canvas; if (!c) return; const w = c.el.clientWidth / 2, h = c.el.clientHeight / 2, ns = Math.min(2, Math.max(.2, c.scale * k)); c.tx = w - (w - c.tx) * ns / c.scale; c.ty = h - (h - c.ty) * ns / c.scale; c.scale = ns; applyT(); }
function cfit() {
  const c = state.canvas; if (!c) return; const w = c.el.clientWidth, h = c.el.clientHeight, top = 70, bottom = c.opts.edit ? 130 : 80;
  const ps = [...c.pos.values()], minX = ps.length ? Math.min(...ps.map(p => p.x)) - 40 : 0, minY = ps.length ? Math.min(...ps.map(p => p.y)) - 70 : 0;
  const bw = c.width - minX, bh = c.height - minY, fitW = (w - 40) / bw, fitH = (h - top - bottom) / bh;
  // vừa cả sơ đồ nếu còn đọc được; sơ đồ dài (như n8n) thì giữ cỡ đọc được và bắt đầu từ bước đầu, kéo/cuộn ngang để xem tiếp
  c.scale = Math.min(1, fitW, fitH);
  if (c.scale < .55) { c.scale = Math.min(.9, Math.max(.55, fitH)); c.tx = 36 - minX * c.scale; }
  else c.tx = Math.max(12, (w - bw * c.scale) / 2) - minX * c.scale;
  c.ty = top + Math.max(0, (h - top - bottom - bh * c.scale) / 2) - minY * c.scale; applyT();
}
function selNode(id) {
  clearSel(); $('#nd-' + CSS.escape(id))?.classList.add('sel'); state.sel = id;
  const n = state.canvas.byId.get(id);
  if (state.canvas.opts.onSelect) return state.canvas.opts.onSelect(n);
}
// ---------- xem lượt chạy "sống": dây đang chạy có hiệu ứng chảy, đồng hồ trên bước hiện tại, trạng thái bước con,
// thời gian + số lần chạy của từng bước (đọc từ nhật ký), camera bám theo bước đang chạy, minimap tô màu
const LOG_STEP = /^(\d{1,2}):(\d\d):(\d\d) ▶ (.+) \(([^()\s]+)\)$/;
const fmtClock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : Math.floor(s / 3600) + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0'); };
function runTimeline(r) {
  const L = state.canvas, logs = r.logs || [], ev = [];
  const day0 = new Date(r.started); day0.setHours(0, 0, 0, 0); let prev = 0, add = 0, waitFor = null;
  logs.forEach((line, i) => {
    const m = line.match(LOG_STEP); if (!m) return;
    const n = L.byId.get(m[5]); if (!n || (n.label || n.type) !== m[4]) return; // dòng của workflow con thì bỏ qua
    // đang trong workflow con: chỉ nhận lại khi gặp bước kế tiếp của chính bước gọi workflow con (tránh trùng mã như n0)
    if (waitFor && !waitFor.has(m[5])) return;
    waitFor = n.type === 'subflow' ? new Set([n.next, n.on_error].filter(Boolean)) : null;
    let t = day0.getTime() + add + ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) * 1000;
    if (t < prev - 3600000) { add += 86400000; t += 86400000; } prev = t;
    ev.push({ id: m[5], t, i });
  });
  const end = r.ended || Date.now(), per = new Map();
  ev.forEach((e, k) => { const d = (ev[k + 1]?.t ?? end) - e.t, x = per.get(e.id) || { total: 0, last: 0, start: 0 }; x.total += d; x.last = d; x.start = e.t; per.set(e.id, x); });
  // trạng thái trực tiếp của bước đang chạy: bước con gần nhất, vòng lặp, dòng thông báo gần nhất
  let sub = '';
  if (r.status === 'running' || r.status === 'paused') {
    const from = ev.length ? ev[ev.length - 1].i + 1 : 0; let child = '', loop = '', msg = '';
    for (const line of logs.slice(from)) {
      const m = line.match(LOG_STEP); if (m) { child = m[4]; continue; }
      const v = line.match(/vòng (\d+\/\d+)/); if (v) { loop = v[1]; continue; }
      const t = line.replace(/^\d{1,2}:\d\d:\d\d\s+/, ''); if (t && !/^[▶✅❌⏹⏸]/.test(t)) msg = t.trim();
    }
    sub = [child && '▶ ' + child, loop && 'vòng ' + loop].filter(Boolean).join(' · ') || msg;
  }
  return { ev, per, sub };
}
function paintRun(r) {
  const L = state.canvas; if (!L) return;
  const live = r.status === 'running' || r.status === 'paused';
  document.querySelectorAll('.node').forEach(n => { n.classList.remove('now', 'done', 'err'); n.querySelector('.rb')?.remove(); n.querySelector('.livecap')?.remove(); });
  // trình tự bước của workflow này đọc từ nhật ký (trail của engine lẫn cả bước của workflow con)
  const tl = runTimeline(r); state.runTl = { r, tl };
  const seq = tl.ev.length ? tl.ev.map(e => e.id) : (r.trail || []).filter(id => L.byId.has(id));
  const trail = seq, cnt = seq.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
  // lượt rất dài: nhật ký chỉ giữ ~300 dòng cuối → bù các bước đầu từ trail (chỉ khi thiếu, vì trail lẫn mã bước của workflow con)
  if ((r.logs || []).length >= 290) for (const id of (r.trail || []).filter(id => L.byId.has(id))) cnt[id] ||= 1;
  for (const id of Object.keys(cnt)) $('#nd-' + CSS.escape(id))?.classList.add('done');
  const cur = live ? (seq[seq.length - 1] || (L.byId.has(r.current_node) ? r.current_node : null)) : null;
  if (cur) { const el = $('#nd-' + CSS.escape(cur)); el?.classList.remove('done'); el?.classList.add('now'); }
  // dây nối đã đi qua (xanh) và dây đang chạy tới bước hiện tại (chảy)
  const passed = new Set(seq.slice(1).map((id, i) => seq[i] + '>' + id));
  const prevId = cur && seq.length > 1 ? seq[seq.length - 2] : null;
  document.querySelectorAll('#layer .edge').forEach(e => { const k = e.dataset.from + '>' + e.dataset.to; e.classList.toggle('ran', passed.has(k)); e.classList.toggle('live', !!cur && k === prevId + '>' + cur); });
  if (r.status === 'error' && trail.length) { const last = $('#nd-' + CSS.escape(trail[trail.length - 1])); last?.classList.remove('done', 'now'); last?.classList.add('err'); }
  // thời gian + số lần chạy của từng bước
  for (const [id, x] of tl.per) {
    const el = $('#nd-' + CSS.escape(id)); if (!el) continue;
    const isCur = cur === id, c = cnt[id] || 1;
    el.insertAdjacentHTML('beforeend', `<span class="rb ${isCur ? 'on' : ''}" data-start="${x.start}" title="${c > 1 ? `Chạy ${c} lần, tổng ${fmtClock(x.total)}, lần cuối ${fmtClock(x.last)}` : `Chạy ${fmtClock(x.total)}`}">${isCur ? '⏱ <b>' + fmtClock(Date.now() - x.start) + '</b>' : fmtClock(x.total)}${c > 1 ? ` · ×${c}` : ''}</span>`);
  }
  if (cur && tl.sub) $('#nd-' + CSS.escape(cur))?.insertAdjacentHTML('beforeend', `<div class="livecap" title="${esc(tl.sub)}"><i></i>${esc(tl.sub)}</div>`);
  // minimap theo trạng thái
  document.querySelectorAll('.minimap rect[data-id]').forEach(m => { const id = m.dataset.id; m.setAttribute('class', id === cur ? 'now' : r.status === 'error' && id === trail[trail.length - 1] ? 'err' : cnt[id] ? 'done' : ''); });
  // thanh tiến độ trên đầu trang
  const pr = $('#runProg');
  if (pr) {
    const total = L.nodes.length, done = Object.keys(cnt).length, pct = Math.round(done / Math.max(1, total) * 100);
    pr.innerHTML = `<div class="pg-t"><span class="badge ${r.status}">${STATUS[r.status]}</span><span><b>${done}</b>/${total} bước</span><span class="muted" id="runElapsed">${fmtClock((r.ended || Date.now()) - r.started)}</span>${cur ? `<span class="pg-now" title="${esc(tl.sub)}">▶ ${esc(L.byId.get(cur)?.label || cur)}${tl.sub ? ' <em>› ' + esc(tl.sub) + '</em>' : ''}</span>` : ''}</div><div class="pg-bar ${live ? 'going' : ''}"><i style="width:${r.status === 'ok' ? 100 : pct}%"></i></div>`;
  }
  if (L.overview) paintOverview(r, cnt, cur, tl, seq);
  // camera bám theo bước đang chạy
  if (cur && state.follow !== false && cur !== state.lastFollow) { state.lastFollow = cur; followNode(L.overview ? L.byId.get(cur)?.group : cur); }
  if (state.showSS !== false) for (const s of r.shots || []) { const el = $('#nd-' + CSS.escape(s.node || '')); if (el && !el.querySelector('.shot')) el.insertAdjacentHTML('beforeend', `<img class="shot" src="${s.url}" onclick="event.stopPropagation();view('${s.url}')">`); }
  if (state.showSS === false) document.querySelectorAll('.node .shot').forEach(i => i.remove());
}
// lướt mượt tới bước nếu nó nằm ngoài vùng giữa khung nhìn
function followNode(id) {
  const c = state.canvas, p = c?.pos.get(id); if (!p) return;
  const NW = c.overview ? GC.W : CV.W, NH = c.overview ? GC.H : CV.H;
  const w = c.el.clientWidth, h = c.el.clientHeight, sx = c.tx + (p.x + NW / 2) * c.scale, sy = c.ty + (p.y + NH / 2) * c.scale;
  if (sx > w * .18 && sx < w * .82 && sy > h * .2 && sy < h * .75) return;
  const tx0 = c.tx, ty0 = c.ty, tx1 = w / 2 - (p.x + NW / 2) * c.scale, ty1 = h * .45 - (p.y + NH / 2) * c.scale, t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3); c.tx = tx0 + (tx1 - tx0) * e; c.ty = ty0 + (ty1 - ty0) * e; applyT(); if (k < 1 && state.canvas === c) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function stopFollow() { if (state.follow !== false && $('#followBtn')) { state.follow = false; $('#followBtn').classList.remove('on'); } }
function toggleFollow(btn) { state.follow = state.follow === false; btn.classList.toggle('on', state.follow); if (state.follow) { state.lastFollow = null; const r = state.runTl?.r; if (r?.current_node) followNode(r.current_node); } }
// trang Radar Facebook tự làm mới mỗi 45 giây khi đang mở (giữ nguyên vị trí cuộn), số liệu luôn sát với lượt quét
setInterval(() => {
  if (document.hidden || !/^#\/reports/.test(location.hash) || !$('#main')) return;
  const y = $('#main').scrollTop; fbReport().then(() => { $('#main').scrollTop = y; }).catch(() => {});
}, 45000);
// đồng hồ chạy từng giây khi đang có lượt chạy
setInterval(() => {
  const x = state.runTl; if (!x || !state.canvas || !(x.r.status === 'running' || x.r.status === 'paused')) return;
  document.querySelectorAll('.node .rb.on').forEach(b => { const t = b.querySelector('b'); if (t) t.textContent = fmtClock(Date.now() - +b.dataset.start); });
  document.querySelectorAll('.gnode .gst.on b').forEach(t => { t.textContent = fmtClock(Date.now() - +t.dataset.start); });
  const el = $('#runElapsed'); if (el) el.textContent = fmtClock(Date.now() - x.r.started);
}, 1000);

// ---------- đang chạy (canvas trực tiếp)
async function runView(id) {
  let r = state.runs.get(id);
  // danh sách lượt chạy không kèm sơ đồ lúc chạy → tải bản đầy đủ (cần cho workflow nháp chưa lưu)
  if (!r?.flow_snapshot) r = await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || await api('GET', '/api/flows/' + r.flow_id); state.flow = f; state.runTab = state.runTab || 'detail';
  crumbs(['Workflow', '#/flows'], [f.name || f.id, '#/flows/' + f.id], ['Lượt chạy']);
  $('#main').className = 'full';
  $('#main').innerHTML = `<div class="ed"><header class="ed-top">
      <div class="ed-l"><button class="back" title="Về workflow" onclick="nav('#/flows/${f.id}')">${I('back')}</button>${appStack(flowApps(f), 3, 'sm')}<div class="ed-name"><small>Lượt chạy · <span class="mono">${esc(id)}</span></small><b>${esc(f.name || f.id)}</b></div></div>
      <div id="runStatus" class="runprog"><div id="runProg"></div></div>
      <div class="ed-r"><button onclick="state.showSS=state.showSS===false;paintRun(state.runs.get('${id}'));this.innerHTML=state.showSS===false?I('eye')+' Hiện ảnh':I('eye-off')+' Ẩn ảnh'">${state.showSS === false ? I('eye') + ' Hiện ảnh' : I('eye-off') + ' Ẩn ảnh'}</button>
        <button id="finishBtn" title="Quét xong nhóm đang dở rồi xuất báo cáo, bỏ các nhóm còn lại" onclick="api('POST','/api/runs/${id}/finish');this.disabled=true;this.innerHTML=I('flag')+' Đang chốt kết quả…'">${I('flag')} Dừng & lấy kết quả</button><button class="danger" id="stopBtn" title="Huỷ ngay, không xuất kết quả" onclick="api('POST','/api/runs/${id}/stop')">${I('stop')} Huỷ</button>
        <button class="primary" id="rerun" onclick="nav('#/flows/${f.id}')">${I('play')} Chạy lại</button></div></header>
    <div class="ed-body"><div class="runview"><div class="canvaswrap" id="cw"><div class="zoom"><button id="followBtn" class="follow on" title="Tự bám theo bước đang chạy" onclick="toggleFollow(this)">${I('eye')} Bám theo</button></div><div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="tabs">${['detail', 'output', 'log', 'api'].map(t => `<button data-tab="${t}" class="${state.runTab === t ? 'on' : ''}" onclick="state.runTab='${t}';renderSide()">${{ detail: 'Chi tiết', output: 'Kết quả', log: 'Nhật ký', api: 'API' }[t]}</button>`).join('')}</div><div class="body" id="sideBody"></div></div></div></div></div>`;
  state.follow = true; state.lastFollow = null;
  drawFlowView(f, $('#canvas'), { onSelect: n => { state.runTab = 'detail'; renderSide(); } });
  renderSide(); paintRun(r);
}
function renderSide() {
  const id = location.hash.split('/')[2]; const r = state.runs.get(id); if (!r || !$('#sideBody')) return;
  if (!$('#runProg')) $('#runStatus').innerHTML = `<span class="badge ${r.status}">${STATUS[r.status]}</span>`;
  if ($('#stopBtn')) $('#stopBtn').disabled = !(r.status === 'running' || r.status === 'paused');
  if ($('#finishBtn')) { const on = r.status === 'running' || r.status === 'paused'; $('#finishBtn').disabled = !on || !!r.finish_requested; if (r.finish_requested && on) $('#finishBtn').innerHTML = I('flag') + ' Đang chốt kết quả…'; }
  document.querySelectorAll('.side .tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.runTab));
  const pause = r.status === 'paused' ? `<div class="pausebox"><div class="row" style="flex-wrap:nowrap;align-items:flex-start;color:var(--warn)">${I('hand')}<b>${esc(r.pause_message)}</b></div><div class="row" style="margin-top:8px"><button class="primary sm" onclick="api('POST','/api/runs/${r.id}/continue')">Tiếp tục</button><button class="danger sm" onclick="api('POST','/api/runs/${r.id}/stop')">Dừng</button></div></div>` : '';
  let html = pause;
  if (state.runTab === 'detail') {
    const n = state.sel ? state.canvas.byId.get(state.sel) : null, app = n && detectApp(n);
    html += n ? `<div class="row" style="margin-bottom:12px;flex-wrap:nowrap">${app ? appTile(app) : `<span class="av off">${nIcon(n.type)}</span>`}<div><b>${esc(n.label || n.id)}</b><div class="muted small mono">${esc(n.type)} · ${esc(n.id)}</div></div></div>
      <button class="sm" style="width:100%;margin-bottom:12px" onclick="runToHere(${j(n.id)})">${I('play')} Chạy tới bước này</button>
      <div class="kv"><div class="k">Tham số</div><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre></div>${n.note ? `<p class="muted small">${esc(n.note)}</p>` : ''}`
      : `<div class="kv"><div class="k">Lượt chạy</div><div class="small">${esc(r.name)} · <span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span> · hồ sơ <b>${esc(r.profile)}</b></div></div>
      <div class="kv"><div class="k">Đầu vào</div><pre>${esc(JSON.stringify(r.vars || {}, null, 2))}</pre></div>
      <div class="kv"><div class="k">Đang ở bước</div><div class="small">${r.current_node ? esc((c => state.canvas?.byId.get(c)?.label || c)(state.runTl?.tl.ev.at(-1)?.id || r.current_node)) + (state.runTl?.tl.sub ? ' <span class="muted">› ' + esc(state.runTl.tl.sub) + '</span>' : '') : r.status === 'running' ? '…' : 'đã kết thúc'}</div></div>
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
  crumbs(['Lịch sử chạy']);
  const list = await api('GET', '/api/runs?limit=200'); state.runListData = list;
  const cnt = s => list.filter(r => !s || r.status === s).length;
  const shown = list.filter(r => !state.runFilter || r.status === state.runFilter);
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Lịch sử chạy', 'Mọi lượt chạy quy trình: chạy tay, từ AI Agent, theo lịch hay qua REST API') + `
  <section class="card flush"><div class="toolbar"><div class="seg">${[['', 'Tất cả'], ['ok', 'Xong'], ['error', 'Lỗi'], ['running', 'Đang chạy'], ['stopped', 'Dừng']].map(([k, l]) => `<button class="${state.runFilter === k ? 'on' : ''}" onclick="state.runFilter='${k}';runList()">${l} <em>${cnt(k)}</em></button>`).join('')}</div></div>${runTable(shown)}</section></div>`;
}
async function runDetail(id) {
  const r = await api('GET', '/api/runs/' + id); state.runs.set(id, r);
  const f = r.flow_snapshot || {}; state.flow = f;
  crumbs(['Lần chạy', '#/runs'], [r.name]);
  let changed = false; try { const cur = await api('GET', '/api/flows/' + r.flow_id); changed = JSON.stringify(cur.nodes) !== JSON.stringify(f.nodes); } catch { /* flow đã xoá */ }
  $('#main').innerHTML = `<div class="wrap">` + pageHead(`${appStack(flowApps(f.nodes ? f : flowById(r.flow_id)), 3)} ${esc(r.name)} <span class="badge ${r.status}">${STATUS[r.status]}</span>`, `<span class="badge src src-${r.source}">${SRC[r.source] || r.source}</span> · hồ sơ <b>${esc(r.profile)}</b> · ${ago(r.started)}${dur(r) ? ' · chạy ' + dur(r) : ''} · <span class="mono">${esc(id)}</span>`,
    `<button onclick="nav('#/flows/${r.flow_id}')">${I('workflow')} Mở workflow</button><button class="primary" onclick="rerunDialog('${id}')">${I('play')} Chạy lại…</button>`) + `
  ${changed ? '<div class="warn">' + I('alert') + ' Flow đã đổi kể từ lần chạy này. Sơ đồ dưới đây vẽ theo bản lúc chạy.</div>' : ''}
  <div class="runview boxed">
    <div class="canvaswrap"><div class="head">${I('eye')} Chỉ xem lại, không chạy gì</div><div class="runprog floating" id="runProgWrap"><div id="runProg"></div></div><div class="canvas" id="canvas"></div></div>
    <div class="side"><div class="body">
      <div class="kv"><div class="k">Đầu vào</div>${Object.entries(r.vars || {}).map(([k, v]) => `<div class="small"><span class="muted">${esc(k)}</span> &nbsp;${esc(typeof v === 'string' ? v : JSON.stringify(v))}</div>`).join('') || '<span class="muted small">—</span>'}</div>
      <div class="kv"><div class="k">Kết quả trả về</div>${r.error ? `<div class="warn">${I('alert')}${esc(r.error)}</div>` : ''}${Object.entries(r.output || {}).map(([k, v]) => `<div class="small" style="margin-bottom:6px"><span class="muted">${esc(k)}</span><pre>${esc(typeof v === 'string' ? (v.length > 1200 ? v.slice(0, 1200) + '…' : v) : JSON.stringify(v, null, 1).slice(0, 1500))}</pre></div>`).join('') || '<span class="muted small">—</span>'}</div>
      ${r.output_paths?.length ? `<div class="kv"><div class="k">File</div>${r.output_paths.map(p => `<div class="small"><a href="#" onclick="api('POST','/api/open-path',{path:${j(p)}});return false">${I('file')} ${esc(p.replace(/\/+$/, '').split('/').pop() || p)}</a></div>`).join('')}</div>` : ''}
      ${r.shots?.length ? `<div class="kv"><div class="k">Ảnh chụp</div><div class="shots">${r.shots.map(s => `<img src="${s.url}" onclick="view('${s.url}')">`).join('')}</div></div>` : ''}
      <div class="kv"><div class="k">Chi tiết bước</div><div id="nodeDetail" class="muted small">Bấm một bước trên sơ đồ để xem.</div></div>
      <div class="kv"><div class="k">Nhật ký</div><div class="log" style="max-height:200px;overflow:auto">${esc((r.logs || []).slice(-60).join('\n'))}</div></div>
      <button class="sm danger" onclick="if(confirm('Xoá lượt chạy này?'))api('DELETE','/api/runs/${id}').then(()=>nav('#/runs'))">${I('trash')} Xoá lượt chạy</button>
    </div></div></div></div>`;
  if (f.nodes) { drawFlowView(f, $('#canvas'), { onSelect: n => { $('#nodeDetail').innerHTML = `<b>${esc(n.label || n.id)}</b> <span class="mono">${esc(n.type)}</span><pre>${esc(JSON.stringify(n.params || {}, null, 2))}</pre>`; } }); paintRun(r); }
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
  crumbs(['Kho ảnh & video']);
  const items = await api('GET', '/api/library'); state.lib = state.lib || { q: '', kind: '' };
  const list = items.filter(i => (!state.lib.q || i.name.toLowerCase().includes(state.lib.q.toLowerCase())) && (!state.lib.kind || (state.lib.kind === 'video') === i.video));
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Kho ảnh & video', `Ảnh và video các workflow đã tạo ra · ${items.filter(i => !i.video).length} ảnh · ${items.filter(i => i.video).length} video`,
    `<button onclick="api('POST','/api/open-path',{path:'~/Library/Application Support/HPBFlow/library/media'})">${I('folder')} Mở thư mục</button>`) + `
  <section class="card flush"><div class="toolbar"><div class="sbox">${I('search')}<input type="text" id="lsearch" placeholder="Tìm theo tên file…" value="${esc(state.lib.q)}" oninput="state.lib.q=this.value;library().then(()=>{const e=$('#lsearch');e.focus();e.setSelectionRange(e.value.length,e.value.length)})"></div>
    <div class="seg"><button class="${!state.lib.kind ? 'on' : ''}" onclick="state.lib.kind='';library()">Tất cả</button><button class="${state.lib.kind === 'image' ? 'on' : ''}" onclick="state.lib.kind='image';library()">Ảnh</button><button class="${state.lib.kind === 'video' ? 'on' : ''}" onclick="state.lib.kind='video';library()">Video</button></div>
    <span class="muted small" style="margin-left:auto">Tạo bằng ${appStack(['chatgpt', 'gemini', 'meta', 'canva'], 4, 'xs')}</span></div>
  <div class="mgrid">${list.map(i => `<figure onclick='previewMedia(${j(i)})'>${i.video ? `<video src="/api/file?path=${encodeURIComponent(i.path)}" muted></video>` : `<img src="/api/file?path=${encodeURIComponent(i.path)}" loading="lazy">`}<figcaption>${esc(i.name)}<br><span class="muted">${(i.size / 1024).toFixed(0)} KB</span></figcaption></figure>`).join('') || '<p class="empty">Chưa có gì. Chạy workflow tạo ảnh (chatgpt-image, gemini-image) để có kết quả ở đây.</p>'}</div></section></div>`;
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
  crumbs(['Trình duyệt & tài khoản']);
  const list = await api('GET', '/api/profiles/status'); state.profiles = list;
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Trình duyệt & tài khoản', 'Mỗi hồ sơ là một Chrome riêng với phiên đăng nhập riêng, có thể gắn proxy.', `<button class="primary" onclick="profileDialog()">${I('plus')} Thêm hồ sơ</button>`) + `
  <section class="card flush"><div class="toolbar"><div class="sbox">${I('search')}<input type="text" placeholder="Tìm theo tên hồ sơ…" oninput="document.querySelectorAll('#ptab tr[data-n]').forEach(t=>t.hidden=!t.dataset.n.includes(this.value.toLowerCase()))"></div><span class="muted small">${list.length} hồ sơ · ${list.filter(p => p.running).length} đang mở</span></div>
  <table class="tbl" id="ptab"><thead><tr><th>Hồ sơ</th><th>Proxy</th><th>Cửa sổ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${list.map(p => `<tr data-n="${esc(p.name.toLowerCase())}"><td><div class="fcell">${appTile('chrome')}<div><b>${esc(p.name)}</b><div class="sub">${esc(p.engine)}${p.note ? ' · ' + esc(p.note) : ''}</div></div></div></td>
    <td>${p.proxy ? `<span class="mono small">${esc(p.proxy)}</span>` : `<a href="#" class="small" onclick="editProfile(${j(p.name)});return false">+ Gán proxy</a>`}</td>
    <td class="small">${p.headless ? I('eye-off') + ' Chạy ẩn' : I('eye') + ' Hiện cửa sổ'}</td>
    <td>${p.running ? '<span class="badge ok">Đang mở</span>' : '<span class="badge stopped">Đang nghỉ</span>'}</td>
    <td class="acts" style="opacity:1"><button class="sm" onclick="api('POST','/api/profiles/${p.name}/open',{}).then(()=>profiles())">Mở</button> ${p.running ? `<button class="sm" onclick="api('POST','/api/profiles/${p.name}/close').then(()=>profiles())">Đóng</button>` : ''} <button class="icon ghost" title="Sửa" onclick="editProfile(${j(p.name)})">${I('edit')}</button>${p.name !== 'default' ? ` <button class="icon ghost danger" title="Xoá" onclick="if(confirm('Xoá hồ sơ ${p.name} và toàn bộ phiên đăng nhập của nó?'))api('DELETE','/api/profiles/${p.name}').then(()=>profiles())">${I('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></section>
  <div class="note">${I('shield')}<span>Mật khẩu bạn tự gõ trong Chrome, app không lưu hay đọc. Đăng nhập ${appStack(['facebook', 'tiktok', 'chatgpt', 'google'], 4, 'xs')} Facebook, TikTok, ChatGPT, Google… một lần trong cửa sổ của hồ sơ; các workflow dùng lại phiên đó.</span></div></div>`;
}
async function profileDialog() {
  const proxies = await api('GET', '/api/proxies');
  modal(`<h3>${appTile('chrome')} Tạo hồ sơ trình duyệt</h3>
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
  modal(`<h3>${appTile('chrome')} Sửa hồ sơ ${esc(name)}</h3>
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
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Proxy', 'Đặt tên proxy để gán cho hồ sơ. Chrome của hồ sơ sẽ đi qua proxy này (dạng host:port, socks5://host:port…).', `<button class="primary" onclick="proxyDialog()">${I('plus')} Thêm proxy</button>`) + `
  <section class="card flush"><table class="tbl"><thead><tr><th>Tên</th><th>Địa chỉ</th><th>Tài khoản</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td><div class="fcell"><span class="av off">${I('shield')}</span><b>${esc(p.name)}</b></div></td><td class="mono">${esc(p.server)}</td><td class="small muted">${esc(p.username || '—')}</td><td class="acts" style="opacity:1"><button class="icon ghost danger" title="Xoá" onclick="api('DELETE','/api/proxies/${encodeURIComponent(p.name)}').then(proxies)">${I('trash')}</button></td></tr>`).join('') || '<tr><td colspan="4"><p class="empty">Chưa có proxy nào.</p></td></tr>'}</tbody></table></section>
  <div class="note">${I('alert')}<span>Proxy có tài khoản/mật khẩu: Chrome sẽ hỏi đăng nhập ở lần mở đầu; nên dùng proxy whitelist IP để chạy tự động không bị chặn.</span></div></div>`;
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
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Engine trình duyệt', 'Hồ sơ trình duyệt dùng engine bạn gán cho nó.', `<button onclick="engines()">${I('refresh')} Kiểm tra lại</button>`) + `
  <div class="engines">${list.map(e => `<div class="ecard ${e.recommended ? 'rec' : ''}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div class="row" style="flex-wrap:nowrap">${e.id === 'chrome-cdp' ? appTile('chrome', 'lg') : `<span class="tile lg" style="color:var(--muted)">${I('monitor')}</span>`}<div><h3>${esc(e.name)}</h3><div class="muted small">${esc(e.vendor)}</div></div></div>${e.recommended ? '<span class="chip info">Khuyến dùng</span>' : ''}</div><p>${esc(e.desc)}</p>
    <div class="row">${e.status === 'ready' ? '<span class="badge ok">Sẵn sàng</span>' : e.status === 'missing' ? '<span class="badge error">Chưa cài Google Chrome</span>' : '<span class="badge stopped">Không có trên Mac</span>'}${e.id === 'chrome-cdp' ? `<span style="flex:1"></span><a href="#/profiles" class="small">Cấu hình ${I('arrow-right')}</a>` : ''}</div></div>`).join('')}</div></div>`;
}

// ---------- API
const AGENT_LOGO = { 'claude-code': 'claude', 'claude-desktop': 'claude', 'gemini-cli': 'gemini', codex: 'chatgpt', cursor: 'cursor', antigravity: 'google' };
async function apiPage() {
  crumbs(['Cài đặt', '#/settings'], ['AI Agent & API']);
  const s = await api('GET', '/api/settings'); state.apiTab = state.apiTab || 'key';
  const profiles = await api('GET', '/api/profiles');
  const body = state.apiTab === 'key' ? `
    <div class="section"><div class="lbl" style="margin-top:0">Khoá API</div><div class="keyfield"><code id="keyText">${'•'.repeat(40)}</code><button class="sm" onclick="$('#keyText').textContent=$('#keyText').textContent.startsWith('•')?${j(s.api_key)}:'${'•'.repeat(40)}'">Hiện</button><button class="sm" onclick="copy(${j(s.api_key)})">Chép</button><button class="sm" onclick="if(confirm('Tạo khoá mới? Client cũ sẽ không gọi được nữa.'))api('POST','/api/settings/rotate-key').then(apiPage)">Tạo khoá mới</button></div></div>
    <div class="section"><div class="lbl" style="margin-top:0">Địa chỉ để gọi API</div><p class="small muted">Client bên ngoài dán địa chỉ này.</p><div class="keyfield"><code>${esc(s.public_url || s.local_url)}</code><button class="sm" onclick="copy(${j(s.public_url || s.local_url)})">Chép</button></div><p class="small muted">Địa chỉ trên máy: <code>${esc(s.local_url)}</code></p></div>
    <div class="section"><div class="lbl" style="margin-top:0">Hồ sơ cho AI API</div><p class="small muted">Một khoá API ứng với một hồ sơ. Hồ sơ cung cấp phiên trình duyệt và tài khoản ChatGPT/Gemini mà /v1/* điều khiển.</p><select onchange="api('POST','/api/settings',{ai_profile:this.value}).then(()=>toast('Đã lưu'))">${profiles.map(p => `<option ${p.name === (s.ai_profile || 'default') ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="section"><div class="lbl" style="margin-top:0">Gọi từ máy khác qua tên miền riêng</div><p class="small muted">Chỉ điền khi bạn đã có reverse proxy (${appStack(['ngrok', 'cloudflare'], 2, 'xs')} ngrok, Cloudflare Tunnel…) trỏ tên miền về ${esc(s.local_url)}. Điền xong, ô "Địa chỉ để gọi API" ở trên sẽ đổi theo.</p><div class="row" style="flex-wrap:nowrap"><input type="text" id="pubUrl" value="${esc(s.public_url)}" placeholder="https://ten-mien-cua-ban.example"><button class="sm" onclick="api('POST','/api/settings',{public_url:$('#pubUrl').value.trim()}).then(apiPage)">Lưu</button><button class="sm" onclick="api('POST','/api/settings',{public_url:''}).then(apiPage)">Bỏ tên miền</button></div></div>`
  : state.apiTab === 'ai' ? `
    <div class="row" style="margin-bottom:6px"><b>AI API</b><button class="switch ${s.ai_api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{ai_api_enabled:${!s.ai_api_enabled}}).then(apiPage)"></button><span class="chip ${s.ai_api_enabled ? 'ok' : ''}">${s.ai_api_enabled ? '/v1/* đang mở' : '/v1/* đang đóng'}</span><span style="flex:1"></span>${appStack(['chatgpt', 'gemini', 'perplexity', 'x'], 4, 'sm')}</div>
    <p class="small muted">Cho phép gọi ChatGPT/Gemini/Perplexity/Grok bạn đang đăng nhập qua /v1/* (OpenAI-compatible): <code>/v1/models</code>, <code>/v1/chat/completions</code>, <code>/v1/images/generations</code>. Chọn hồ sơ ở tab Khoá API.</p>
    <div class="lbl">Models khả dụng</div><div id="models"><span class="muted small">Đang tải…</span></div>
    <div class="lbl">Ví dụ</div><pre class="mono" style="white-space:pre-wrap">curl ${esc(s.local_url)}/v1/chat/completions \\
  -H "Authorization: Bearer &lt;khoá&gt;" -H "content-type: application/json" \\
  -d '{"model":"gpt-5.6","messages":[{"role":"user","content":"Xin chào"}]}'</pre>`
  : `
    <h2 style="font-size:17px">Để AI tự viết workflow cho bạn</h2><p class="small">Cắm HPB Flow vào coding agent bạn đang dùng, rồi mô tả việc muốn tự động hoá bằng tiếng Việt. Agent tự đọc danh sách node, tự nhìn trang web đang mở để lấy selector thật, viết flow rồi chạy thử. Tiền LLM tính vào gói đăng ký agent của bạn.</p>
    <div class="lbl">Agent trên máy này</div><div id="agents"><span class="muted small">Đang kiểm tra…</span></div>
    <div class="lbl">Thử xem chạy chưa</div><ol class="steps small"><li>Khởi động lại agent vừa cài, vì nó chỉ nạp tool lúc mở.</li><li>Giữ HPB Flow đang chạy (app này).</li><li>Dán prompt sau vào agent: <code>dùng hpb-flow list_flows rồi chạy flow test-browser-echo</code></li><li>Thấy agent gọi tool <code>hpb-flow</code> và trả kết quả là xong.</li></ol>`;
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Cài đặt', 'Gọi quy trình từ nơi khác, dùng ChatGPT/Gemini bạn đang đăng nhập như một API, hoặc cắm vào coding agent.',
    `<a class="btnlink" href="/api/openapi.json" target="_blank">${I('file')} Tài liệu API</a>`) + settingsTabs('api') + `
  <section class="card flush"><div class="apibar">${I('plug')}<b>API đang ${s.api_enabled ? 'bật' : 'tắt'}</b><button class="switch ${s.api_enabled ? 'on' : ''}" onclick="api('POST','/api/settings',{api_enabled:${!s.api_enabled}}).then(apiPage)"></button><span class="badge ${s.api_enabled ? 'ok' : 'stopped'}">${s.api_enabled ? 'Đang chạy' : 'Đang tắt'}</span><span style="flex:1"></span><code>${esc(s.local_url)}</code><button class="sm" onclick="copy(${j(s.local_url)})">Chép</button></div>
  <div class="apibody"><div class="subtabs">${[['key', 'key', 'Khoá API'], ['ai', 'bot', 'AI API'], ['agent', 'terminal', 'Coding Agent']].map(([k, ic, l]) => `<button class="${state.apiTab === k ? 'on' : ''}" onclick="state.apiTab='${k}';apiPage()">${I(ic)} ${l}</button>`).join('')}</div><div style="flex:1;min-width:0">${body}</div></div></section></div>`;
  if (state.apiTab === 'ai') { const m = await api('GET', '/api/ai-models'); $('#models').innerHTML = `<table class="tbl"><thead><tr><th>Model ID</th><th>Loại</th><th>Workflow</th></tr></thead><tbody>${m.map(x => `<tr><td><div class="fcell">${appTile(flowApps(flowById(x.flow))[0] || groupApp(x.flow.split('-')[0]) || 'hpb', 'sm')}<span class="mono">${esc(x.id)}</span></div></td><td><span class="chip ${x.surface === 'chat' ? 'ok' : 'info'}">${esc(x.surface)}</span></td><td><a href="#/flows/${x.flow}" class="small">${esc(x.flow)}</a></td></tr>`).join('')}</tbody></table>`; }
  if (state.apiTab === 'agent') renderAgents();
}
async function renderAgents() {
  const list = await api('GET', '/api/agents');
  $('#agents').innerHTML = `<table class="tbl"><thead><tr><th>Agent</th><th>Trạng thái</th><th>Cắm bằng</th><th></th></tr></thead><tbody>${list.map(a => `<tr><td><div class="fcell">${appTile(AGENT_LOGO[a.id] || 'hpb')}<div><b>${esc(a.name)}</b><div class="sub mono">${esc(a.file)}</div></div></div></td><td>${a.installed ? '<span class="badge ok">Đã cài</span>' : '<span class="badge stopped">Chưa cài</span>'}</td><td class="small mono">ghi ${a.format}</td><td style="text-align:right">${a.configured ? `<button class="sm" onclick="setAgent('${a.id}',false)">Gỡ</button>` : `<button class="sm primary" onclick="setAgent('${a.id}',true)" ${a.installed ? '' : 'disabled'}>Cài</button>`}</td></tr>`).join('')}</tbody></table><div class="row" style="margin-top:10px"><button class="sm" onclick="renderAgents()">${I('refresh')} Làm mới</button></div>`;
}
async function setAgent(id, on) { try { await api('POST', '/api/agents/' + id, { enabled: on }); toast(on ? 'Đã ghi cấu hình MCP. Khởi động lại agent để nhận tool.' : 'Đã gỡ'); renderAgents(); } catch (e) { toast(e.message); } }

// ---------- cài đặt
async function settings() {
  crumbs(['Cài đặt']);
  const s = await api('GET', '/api/settings');
  const row = (ic, title, desc, ctrl) => `<div class="srow"><span class="av off">${I(ic)}</span><div class="s-t"><b>${title}</b><div class="muted small">${desc}</div></div><div class="s-c">${ctrl}</div></div>`;
  $('#main').innerHTML = `<div class="wrap">` + pageHead('Cài đặt', 'Khởi động, nơi lưu file, dữ liệu của app và kết nối AI Agent') + settingsTabs('settings') + `
  <section class="card flush settings">
    ${row('zap', 'Khởi động cùng máy', 'Tự mở HPB Flow khi đăng nhập vào máy, để workflow và AI Agent luôn gọi được.', `<button class="switch ${s.launch_at_login ? 'on' : ''}" onclick="api('POST','/api/settings',{launch_at_login:${!s.launch_at_login}}).then(settings)"></button>`)}
    ${row('download', 'Nơi lưu kết quả', `<code>${esc(s.output_dir)}</code>`, `<button class="sm" onclick="api('POST','/api/choose-folder').then(r=>r.path&&api('POST','/api/settings',{output_dir:r.path}).then(settings))">Chọn thư mục</button><button class="sm" onclick="api('POST','/api/settings',{output_dir:'~/Downloads/HPBFlow'}).then(settings)">Đặt lại</button><button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.output_dir)}})">Mở</button>`)}
    ${row('users', 'Nơi lưu hồ sơ trình duyệt', `Dữ liệu đăng nhập của từng hồ sơ: <code>${esc(s.profiles_dir)}</code>`, `<button class="sm" onclick="api('POST','/api/open-path',{path:${j(s.profiles_dir)}})">Mở</button>`)}
    ${row('shield', 'Proxy', 'Gắn proxy cho hồ sơ trình duyệt. Mục này ẩn khỏi menu khi chưa có proxy nào.', `<button class="sm" onclick="nav('#/proxies')">Mở</button>`)}
    ${row('monitor', 'Engine trình duyệt', 'Trên Mac chỉ dùng Google Chrome (Chrome CDP); các engine khác chỉ để tham khảo.', `<button class="sm" onclick="nav('#/engines')">Xem</button>`)}
    ${row('image', 'Kho ảnh & video', 'Hiện trên menu khi các quy trình tạo ra ảnh/video.', `<button class="sm" onclick="nav('#/library')">Mở</button>`)}
    ${row('layers', 'Workflow mẫu', '41 workflow mẫu nằm ở <code>~/Library/Application Support/HPBFlow/flows</code>. Engine cloak/adspower trong flow tự chuyển sang Chrome CDP.', '')}
  </section></div>`;
}

// ---------- bảng lệnh ⌘K: nhảy nhanh tới trang, workflow, lệnh
const PAGES = [...NAV.flatMap(g => g.items), NAV_FOOT].map(x => [x.label + (x.soon ? ' (sắp có)' : ''), '#/' + x.page, x.icon || 'zap']).concat([['AI Agent & API', '#/api', 'bot'], ['Engine trình duyệt', '#/engines', 'monitor'], ['Kho ảnh & video', '#/library', 'image'], ['Proxy', '#/proxies', 'shield']]).filter((x, i, a) => a.findIndex(y => y[1] === x[1]) === i);
async function palette() {
  if (!state.flows.length) await loadFlows().catch(() => {});
  const d = $('#cmd'); d.innerHTML = `<div class="cmd-in">${I('search')}<input type="text" id="cmdq" placeholder="Gõ tên workflow, ứng dụng hoặc trang…" autocomplete="off"><kbd>esc</kbd></div><div class="cmd-list" id="cmdl"></div><div class="cmd-f"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>↵</kbd> mở</span></div>`;
  d.showModal(); const q = $('#cmdq'); q.focus(); state.cmdSel = 0;
  const items = () => {
    const t = q.value.trim().toLowerCase();
    const acts = [['Tạo workflow mới', 'new', 'plus'], ['Thêm hồ sơ trình duyệt', 'profile', 'users']];
    const all = [...PAGES.map(([l, h, ic]) => ({ l, h, ic, k: 'Trang' })), ...acts.map(([l, h, ic]) => ({ l, h, ic, k: 'Lệnh' })), ...state.flows.map(f => ({ l: f.name || f.id, s: f.id, h: '#/flows/' + f.id, apps: flowApps(f), k: 'Workflow' }))];
    return all.filter(x => !t || (x.l + ' ' + (x.s || '') + ' ' + (x.apps || []).map(logoName).join(' ')).toLowerCase().includes(t)).slice(0, 40);
  };
  const draw = () => {
    const list = items(); state.cmdItems = list; state.cmdSel = Math.min(state.cmdSel, Math.max(0, list.length - 1));
    let last = ''; $('#cmdl').innerHTML = list.map((x, i) => (x.k !== last ? `<div class="cmd-g">${(last = x.k)}</div>` : '') + `<div class="cmd-i ${i === state.cmdSel ? 'on' : ''}" data-i="${i}">${x.apps ? appTile(x.apps[0] || 'hpb') : I(x.ic)}<span>${esc(x.l)}</span>${x.s && x.s !== x.l ? `<small class="mono">${esc(x.s)}</small>` : ''}</div>`).join('') || '<p class="empty">Không tìm thấy.</p>';
    $('#cmdl .cmd-i.on')?.scrollIntoView({ block: 'nearest' });
  };
  const go = x => { d.close(); if (!x) return; if (x.h === 'new') newFlow(); else if (x.h === 'profile') { nav('#/profiles'); setTimeout(profileDialog, 300); } else nav(x.h); };
  q.oninput = () => { state.cmdSel = 0; draw(); };
  q.onkeydown = e => { if (e.key === 'ArrowDown') { state.cmdSel++; draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { state.cmdSel = Math.max(0, state.cmdSel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') go(state.cmdItems[state.cmdSel]); };
  $('#cmdl').onclick = e => { const it = e.target.closest('.cmd-i'); if (it) go(state.cmdItems[+it.dataset.i]); };
  draw();
}
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#cmd').open ? $('#cmd').close() : palette(); } });

// ---------- chú thích khi rê chuột (biểu đồ, thanh, logo)
document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'), tip = $('#tip'); if (!t) { tip.classList.remove('show'); return; } tip.textContent = t.dataset.tip; tip.classList.add('show'); });
document.addEventListener('mousemove', e => { const tip = $('#tip'); if (tip.classList.contains('show')) { tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; } });

// ---------- số lượt đang chạy: huy hiệu ở menu + khối trạng thái chân sidebar
function updateLive() {
  const act = [...state.runs.values()].filter(r => r.status === 'running' || r.status === 'paused');
  const n = act.length;
  const em = $('#navRunning'); if (em) { em.textContent = n || ''; em.classList.toggle('on', n > 0); }
  $('#liveDot').classList.toggle('busy', n > 0);
  $('#footState').textContent = n ? `Đang chạy ${n} workflow` : 'Sẵn sàng';
  $('#footSub').textContent = n ? act.map(r => r.name).slice(0, 2).join(' · ') : 'Máy chủ 127.0.0.1:4719';
}

// ---------- chung
function modal(html, cls = '') { const m = $('#modal'); m.className = cls; m.innerHTML = `<div class="box">${html}</div>`; m.showModal(); }
(async () => {
  try { if (localStorage.getItem('hpbflow.side') === '1') document.body.classList.add('collapsed'); } catch { /* bỏ qua */ }
  $('#brandLogo').innerHTML = logoSvg('hpb');
  renderNav(); refreshNavData();
  (await api('GET', '/api/runs?limit=100')).forEach(r => state.runs.set(r.id, r));
  new EventSource('/api/events').onmessage = e => {
    const r = JSON.parse(e.data); state.runs.set(r.id, r); updateLive();
    const [, page, a] = location.hash.split('/');
    if (page === 'run' && a === r.id) { paintRun(r); renderSide(); if (['ok', 'error', 'stopped'].includes(r.status) && !state.notified?.has(r.id)) { (state.notified ||= new Set()).add(r.id); state.runTab = 'output'; renderSide(); } }
    // đang mở trình soạn: chỉ làm mới danh sách lượt chạy, không vẽ lại (giữ thay đổi chưa lưu)
    else if (page === 'flows' && a && r.flow_id === a) { if (state.ed && state.ed.recent?.[0]?.id !== r.id) state.ed.recent = [r, ...(state.ed.recent || [])]; renderLogBar(r); if (['ok', 'error', 'stopped'].includes(r.status)) edRefreshRuns(); }
    else if (page === 'runs' && !a) runList();
    // Radar Facebook / Bảng điều khiển: tự tải lại khi một lượt FB chạy xong (không cần bấm ↻)
    else if ((page === 'reports' || page === 'overview' || !page) && ['ok', 'error', 'stopped'].includes(r.status) && !state.notified?.has('rep' + r.id)) { (state.notified ||= new Set()).add('rep' + r.id); const y = $('#main').scrollTop; (page === 'reports' ? fbReport() : overview()).then(() => { $('#main').scrollTop = y; toast('Đã cập nhật: ' + (r.name || r.flow_id) + ' vừa chạy xong'); }).catch(() => {}); }
  };
  updateLive();
  if (!location.hash) location.hash = '#/overview';
  route();
})();
