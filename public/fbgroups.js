// ---------- Nhóm Facebook: các nhóm đang làm admin — việc chờ duyệt, tăng trưởng, bài nổi bật, việc admin gợi ý
// Số liệu do src/fbgroups.js đọc từ trang quản trị của nhóm (bằng hồ sơ trình duyệt của nick admin), chỉ đọc khi bấm cập nhật.
const fgNum = n => n == null ? '—' : Number(n).toLocaleString('vi-VN');
const fgAgo = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const fgChg = v => v == null ? '' : `<span class="fg-chg ${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''}${Math.abs(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}%</span>`;
const fgUrl = (g, p = '') => `https://www.facebook.com/groups/${g.slug || g.id}${p ? '/' + p + '/' : ''}`;
const fgToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function fbGroupsPage(id) {
  crumbs(['Nhóm Facebook']);
  const d = await api('GET', '/api/fbgroups'), st = d.status, gs = d.groups;
  state.fg = { ...state.fg, data: d };
  const cur = gs.find(g => g.id === (id || state.fg.sel)) || gs[0];
  if (cur) state.fg.sel = cur.id;
  const last = Math.max(0, ...Object.values(d.snaps).map(a => a.at(-1)?.at || 0));
  const sub = gs.length ? `${gs.length} nhóm bạn đang làm quản trị viên${last ? ` · số liệu cập nhật ${fgAgo(last)}` : ' · chưa có số liệu'}` : 'Thêm nhóm bạn đang làm admin để theo dõi việc chờ duyệt và tăng trưởng.';
  $('#main').innerHTML = `<div class="wrap fg">` + pageHead(`${appTile('facebook', 'lg')} Nhóm Facebook`, sub,
    `<button onclick="fgAdd()">${I('plus')} Thêm nhóm</button><button class="primary" ${st?.running || !gs.length ? 'disabled' : ''} onclick="fgRefresh(this)">${I(st?.running ? 'hourglass' : 'refresh')} ${st?.running ? 'Đang cập nhật…' : 'Cập nhật số liệu'}</button>`) +
    (st?.running ? `<div class="rs-run"><span class="rs-spin"></span><div><b>Đang đọc trang quản trị nhóm</b><span>${esc(st.step || '')} · khoảng 30 giây mỗi nhóm</span></div></div>` : '') +
    (st && !st.running && st.ok === false ? `<div class="rs-run err">${I('alert')}<div><b>Lần cập nhật trước có lỗi</b><span>${esc(st.step)}</span></div></div>` : '') +
    (gs.length ? fgTabs(d, cur) + fgDetail(d, cur) : `<section class="card emptyc"><p class="empty">Chưa có nhóm nào.</p><button class="primary" onclick="fgAdd()">${I('plus')} Thêm nhóm đầu tiên</button></section>`) + `</div>`;
  fbgBadge();
  clearTimeout(state.fgT);
  if (st?.running) state.fgT = setTimeout(() => { if (location.hash.startsWith('#/fbgroups')) fbGroupsPage(state.fg.sel); }, 4000);
}

// thẻ chọn nhóm: tên, số thành viên, chấm đỏ nếu có việc chờ duyệt
function fgTabs(d, cur) {
  return `<div class="fg-tabs">${d.groups.map(g => {
    const s = d.snaps[g.id]?.at(-1) || {}, todo = (s.pending_posts || 0) + (s.member_requests || 0) + (s.reported || 0) + (s.alerts || 0);
    return `<button class="fg-tab ${g.id === cur.id ? 'on' : ''}" onclick="state.fg.sel='${esc(g.id)}';fbGroupsPage('${esc(g.id)}')">
      <span class="fg-av">${esc((g.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase())}</span>
      <span class="fg-tn"><b>${esc(g.name || g.id)}</b><small>${s.members != null ? fgNum(s.members) + ' thành viên' : 'chưa có số liệu'}${g.note ? ' · ' + esc(g.note) : ''}</small></span>
      ${todo ? `<em class="fg-dot" title="${todo} việc chờ xử lý">${todo}</em>` : ''}${g.error ? `<em class="fg-dot err" title="${esc(g.error)}">!</em>` : ''}</button>`;
  }).join('')}</div>`;
}

function fgDetail(d, g) {
  const snaps = d.snaps[g.id] || [], s = snaps.at(-1);
  const links = [['pending_posts', 'Duyệt bài'], ...(s?.member_requests != null ? [['member-requests', 'Duyệt thành viên']] : []), ['spam', 'Spam'], ['scheduled_posts', 'Bài hẹn giờ'], ['members', 'Thành viên'], ['insights', 'Thống kê'], ['admin_assistant', 'Admin Assist'], ['manage_rules', 'Nội quy'], ['edit', 'Cài đặt nhóm']];
  const head = `<div class="fg-head"><div><h2><a href="${fgUrl(g)}" target="_blank">${esc(g.name || g.id)} ${I('external')}</a></h2>
    <p>${g.privacy ? `<span class="chip">${esc(g.privacy)}</span>` : ''}<span class="chip">${I('users')} Admin: hồ sơ <b>${esc(g.profile)}</b></span>${s ? `<span class="muted small">Số liệu lúc ${new Date(s.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>` : ''}</p></div>
    <div class="row"><button onclick="fgRefresh(this,'${esc(g.id)}')" ${d.status?.running ? 'disabled' : ''}>${I('refresh')} Cập nhật nhóm này</button><button onclick="fgEdit('${esc(g.id)}')">${I('edit')} Sửa</button></div></div>
    <div class="fg-links">${links.map(([p, l]) => `<a href="${fgUrl(g, p)}" target="_blank">${esc(l)}</a>`).join('')}</div>`;
  if (g.error && !s) return head + `<section class="card"><div class="note">${I('alert')}<span>${esc(g.error)}</span></div></section>`;
  if (!s) return head + `<section class="card"><p class="empty">Chưa có số liệu. Bấm "Cập nhật nhóm này" để đọc lần đầu (nick admin phải đăng nhập sẵn trong hồ sơ ${esc(g.profile)}).</p></section>`;
  return head + fgQueue(g, s) + fgKpis(snaps, s) + `<div class="rs-two">${fgTasks(g, s)}${fgGrowth(snaps)}</div>` + fgTop(g, s);
}

// việc chờ duyệt: bấm là mở thẳng trang duyệt trên Facebook
function fgQueue(g, s) {
  const q = [['pending_posts', 'Bài chờ duyệt', s.pending_posts, 'pending_posts'], ['member_requests', 'Yêu cầu vào nhóm', s.member_requests, 'member-requests'], ['reported', 'Thành viên báo cáo', s.reported, 'member_reported_content'], ['alerts', 'Cảnh báo kiểm duyệt', s.alerts, 'alerted'], ['violations', 'Vi phạm của admin', s.violations, 'group_quality']].filter(x => x[2] != null);
  const total = q.reduce((a, x) => a + (x[2] || 0), 0);
  return `<section class="card fg-queue ${total ? 'has' : ''}"><div class="fg-qh">${I(total ? 'alert' : 'check')}<b>${total ? `${total} việc đang chờ bạn xử lý` : 'Không có gì chờ duyệt'}</b></div>
    <div class="fg-qs">${q.map(([, l, n, p]) => `<a href="${fgUrl(g, p)}" target="_blank" class="${n ? 'on' : ''}"><b>${n}</b><span>${l}</span></a>`).join('')}</div></section>`;
}

function fgKpis(snaps, s) {
  // so với lần đo cách đây ≥ 6 ngày (nếu có) để thấy tăng trưởng tuần
  const old = [...snaps].reverse().find(x => x.at <= s.at - 6 * 864e5 && x.members != null), dm = old ? s.members - old.members : null;
  const ratio = s.members ? s.active28 / s.members * 100 : null;
  const k = (ic, l, v, sub) => `<div class="rs-kpi"><span class="ico">${I(ic)}</span><div><small>${l}</small><b>${v}</b><em>${sub}</em></div></div>`;
  return `<div class="rs-kpis">
    ${k('users', 'Thành viên', fgNum(s.members), dm != null ? `${dm >= 0 ? '+' : ''}${fgNum(dm)} so với tuần trước` : s.new_week ? `+${s.new_week} người mới tuần này` : s.visitors ? `${fgNum(s.visitors)} khách ghé chưa vào nhóm` : '')}
    ${k('activity', 'Người hoạt động (28 ngày)', fgNum(s.active28), `${ratio != null ? ratio.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '% thành viên' : 'đăng hoặc bình luận'} ${fgChg(s.active28_chg)}`)}
    ${k('eye', 'Người xem (28 ngày)', fgNum(s.viewed28), `so với 28 ngày trước ${fgChg(s.viewed28_chg)}`)}
    ${k('message', 'Bài viết (7 ngày)', fgNum(s.posts7), `${fgNum(s.comments7)} bình luận · ${fgNum(s.reactions7)} cảm xúc`)}
  </div>`;
}

// việc admin nên làm, suy ra từ số liệu; mỗi việc có nút đưa sang "Việc hôm nay"
function fgTaskList(g, s) {
  const t = [], ratio = s.members ? s.active28 / s.members : 0;
  if (s.pending_posts) t.push([1, `Duyệt ${s.pending_posts} bài chờ trong nhóm ${g.name}`, 'Bài để lâu người đăng nản, lần sau không đăng nữa.', 'pending_posts']);
  if (s.member_requests) t.push([1, `Duyệt ${s.member_requests} yêu cầu vào nhóm ${g.name}`, 'Lọc nick ảo/nước ngoài trước khi duyệt.', 'member-requests']);
  if (s.reported || s.alerts) t.push([1, `Xử lý ${(s.reported || 0) + (s.alerts || 0)} báo cáo/cảnh báo trong ${g.name}`, '', 'member_reported_content']);
  if (s.new_week) t.push([2, `Đăng bài chào ${s.new_week} thành viên mới tuần này (${g.name})`, 'Tag tên người mới + một câu hỏi dễ trả lời ("bạn đang dùng AI vào việc gì?") để họ bình luận lần đầu.', '']);
  if (s.posts7 != null && s.posts7 < 7) t.push([2, `Đăng thêm bài cho ${g.name}: tuần này mới có ${s.posts7} bài`, 'Mục tiêu tối thiểu 1 bài/ngày; tái dùng video Tin AI hằng ngày làm bài.', '']);
  if (s.posts7 && s.comments7 != null && s.comments7 < s.posts7) t.push([3, `Đăng 1 bài hỏi mở trong ${g.name} (bình luận đang ít hơn số bài)`, 'Câu hỏi chọn 1 trong 2 hoặc xin kinh nghiệm thật, không hỏi chung chung.', '']);
  if (s.members > 50 && ratio < 0.1) t.push([3, `Tăng người hoạt động ${g.name}: mới ${(ratio * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% thành viên có tương tác`, 'Trả lời mọi bình luận trong 24h, nhắc tên người hỏi, ghim bài hỏi đáp tuần.', '']);
  if (s.visitors > 20) t.push([4, `Mời ${s.visitors} khách đã bình luận nhưng chưa vào nhóm ${g.name}`, 'Vào Thành viên → Khách ghé, mời từng người.', 'members']);
  return t;
}
function fgTasks(g, s) {
  const t = fgTaskList(g, s);
  return `<section class="card rs-side win"><div class="rs-sh"><span class="ic">${I('check')}</span><div><h3>Việc admin nên làm</h3><p>Gợi ý từ số liệu mới nhất</p></div><em>${t.length}</em></div>
    ${t.length ? `<ul class="fg-tasks">${t.map(([p, txt, note, link], i) => `<li><span class="fg-p p${p}">P${p}</span><div><b>${esc(txt)}</b>${note ? `<p>${esc(note)}</p>` : ''}<div class="fg-ta">${link ? `<a href="${fgUrl(g, link)}" target="_blank">Mở trên Facebook ${I('external')}</a>` : ''}<button class="sm" onclick="fgTodo(this,${i})">${I('plus')} Thêm vào Việc hôm nay</button></div></div></li>`).join('')}</ul>` : '<p class="empty">Nhóm đang ổn, không có việc gấp.</p>'}</section>`;
}
async function fgTodo(btn, i) {
  const d = state.fg.data, g = d.groups.find(x => x.id === state.fg.sel), x = fgTaskList(g, d.snaps[g.id].at(-1))[i];
  btn.disabled = true;
  try { await api('POST', '/api/todos', { date: fgToday(), text: x[1], note: [x[2], x[3] ? fgUrl(g, x[3]) : fgUrl(g)].filter(Boolean).join('\n'), prio: x[0] }); btn.innerHTML = `${I('check')} Đã thêm`; todoBadge?.(); }
  catch (e) { toast(e.message); btn.disabled = false; }
}

// thành viên qua các lần đo (đường) — cần ≥ 2 lần đo khác ngày
function fgGrowth(snaps) {
  const byDay = new Map(); for (const x of snaps) if (x.members != null) byDay.set(new Date(x.at).toDateString(), x);
  const pts = [...byDay.values()].slice(-60);
  let body;
  if (pts.length < 2) body = `<p class="empty">Biểu đồ hiện khi có số liệu từ 2 ngày trở lên. Mỗi lần bấm "Cập nhật số liệu" là một điểm đo.</p>`;
  else {
    const W = 520, H = 150, P = 8, lo = Math.min(...pts.map(p => p.members)), hi = Math.max(...pts.map(p => p.members)), span = Math.max(hi - lo, 1);
    const xy = pts.map((p, i) => [P + i / (pts.length - 1) * (W - 2 * P), H - P - (p.members - lo) / span * (H - 2 * P - 14)]);
    const line = xy.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const dd = t => new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    body = `<svg class="fg-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line} L${xy.at(-1)[0]} ${H} L${xy[0][0]} ${H}Z" class="a"/><path d="${line}" class="l"/>${xy.map((c, i) => `<circle cx="${c[0]}" cy="${c[1]}" r="3"><title>${dd(pts[i].at)}: ${fgNum(pts[i].members)} thành viên</title></circle>`).join('')}</svg>
      <div class="fg-ax"><span>${dd(pts[0].at)} · ${fgNum(pts[0].members)}</span><span>${dd(pts.at(-1).at)} · ${fgNum(pts.at(-1).members)}</span></div>`;
  }
  return `<section class="card"><div class="c-h"><div><h3>Thành viên theo thời gian</h3><p>Mỗi điểm là một lần cập nhật số liệu</p></div></div>${body}</section>`;
}

function fgTop(g, s) {
  if (!s.top_posts?.length) return '';
  const mx = Math.max(...s.top_posts.map(p => p.reach || 0), 1);
  return `<section class="card"><div class="c-h"><div><h3>Bài nổi bật 28 ngày</h3><p>Theo Facebook: người tiếp cận và lượt tương tác. Học dạng bài này cho bài tiếp theo.</p></div><a class="small" href="${fgUrl(g, 'insights')}" target="_blank">Xem thống kê đầy đủ ${I('external')}</a></div>
    <ol class="fg-top">${s.top_posts.map(p => `<li><div class="fg-tt">${esc(p.text)}</div><div class="fg-tb"><i style="width:${Math.max(4, (p.reach || 0) / mx * 100)}%"></i></div><div class="fg-tm"><b>${fgNum(p.reach)}</b> tiếp cận · <b>${fgNum(p.engagement)}</b> tương tác${p.reach ? ` · ${(p.engagement / p.reach * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : ''}</div></li>`).join('')}</ol></section>`;
}

async function fgRefresh(btn, id) {
  btn.disabled = true;
  try { await api('POST', '/api/fbgroups/refresh', id ? { id } : {}); toast('Đang đọc số liệu nhóm…'); setTimeout(() => fbGroupsPage(state.fg.sel), 800); }
  catch (e) { toast(e.message); btn.disabled = false; }
}
async function fgAdd() {
  const profiles = await api('GET', '/api/profiles').catch(() => []);
  fgDialog('Thêm nhóm', `<label class="field"><span>Link nhóm</span><input id="fgUrl" placeholder="https://www.facebook.com/groups/..."></label>
    <label class="field"><span>Nick admin (hồ sơ trình duyệt đã đăng nhập)</span><select id="fgProf">${profiles.map(p => `<option ${p.name === 'fb-phu' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Ghi chú</span><input id="fgNote" placeholder="vd. nhóm chính, nhóm vệ tinh…"></label>`, async () => {
    const d = await api('POST', '/api/fbgroups', { url: $('#fgUrl').value, profile: $('#fgProf').value, note: $('#fgNote').value });
    const g = d.groups.at(-1); state.fg = { ...state.fg, sel: g.id };
    await api('POST', '/api/fbgroups/refresh', { id: g.id }).catch(() => {});
    fbGroupsPage(g.id);
  });
}
async function fgEdit(id) {
  const g = state.fg.data.groups.find(x => x.id === id), profiles = await api('GET', '/api/profiles').catch(() => []);
  fgDialog('Sửa nhóm', `<label class="field"><span>Tên hiển thị</span><input id="fgName" value="${esc(g.name || '')}"></label>
    <label class="field"><span>Nick admin (hồ sơ trình duyệt)</span><select id="fgProf">${profiles.map(p => `<option ${p.name === g.profile ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Ghi chú</span><input id="fgNote" value="${esc(g.note || '')}"></label>
    <button type="button" class="fg-del" onclick="fgRemove(this,'${esc(id)}')">${I('trash')} Bỏ nhóm khỏi danh sách</button>`, async () => {
    await api('PATCH', '/api/fbgroups/' + encodeURIComponent(id), { name: $('#fgName').value.trim(), profile: $('#fgProf').value, note: $('#fgNote').value.trim() });
    fbGroupsPage(id);
  });
}
// bấm 2 lần mới xoá (khung app không hiện hộp thoại confirm)
async function fgRemove(btn, id) {
  if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.innerHTML = `${I('trash')} Bấm lần nữa để bỏ nhóm (xoá cả lịch sử số liệu)`; return; }
  $('.fg-dlg')?.remove(); await api('DELETE', '/api/fbgroups/' + encodeURIComponent(id)); state.fg.sel = null; fbGroupsPage();
}
function fgDialog(title, body, onOk) {
  $('.fg-dlg')?.remove();
  const el = document.createElement('div'); el.className = 'fg-dlg';
  el.innerHTML = `<form class="card"><h3>${esc(title)}</h3>${body}<div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" onclick="this.closest('.fg-dlg').remove()">Huỷ</button><button class="primary">Lưu</button></div></form>`;
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  el.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const b = e.submitter; b.disabled = true; try { await onOk(); el.remove(); } catch (er) { toast(er.message); b.disabled = false; } });
  document.body.appendChild(el); setTimeout(() => el.querySelector('input')?.focus(), 60);
}
