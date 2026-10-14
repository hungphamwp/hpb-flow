// ---------- Tin tức AI: sự kiện đã gom từ 17 nguồn (đếm nguồn xác nhận, tóm tắt từ nội dung bài) + video + toàn bộ bài. Tự làm mới mỗi ngày lúc 23:00.
const anDur = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const anAgo = t => { if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

async function aiNewsPage() {
  crumbs(['Tin tức AI']);
  const r = await api('GET', '/api/ainews'), d = r.data, st = r.status;
  state.an = { tab: 'su_kien', vf: 'all', vs: 'views', nf: 'all', sf: 'all', ...state.an }; if (!['su_kien', 'video', 'news'].includes(state.an.tab)) state.an.tab = 'su_kien';
  const running = st?.running && Date.now() - new Date(st.at) < 12 * 60e3;
  const sub = d ? `Cập nhật ${anAgo(+new Date(d.updated))} (${fmtPostedAt(+new Date(d.updated))}) · ${d.sources ?? '?'}/${d.sources_total ?? '?'} nguồn · ${d.news.length} bài trong 48 giờ · ${(d.stories || []).length} sự kiện · tự làm mới mỗi ngày lúc 23:00` : 'Chưa có dữ liệu. Bấm "Làm mới" để lấy tin và video AI mới nhất.';
  $('#main').innerHTML = `<div class="wrap an">` + pageHead('Tin tức AI', sub, `<button class="primary" ${running ? 'disabled' : ''} onclick="aiNewsRun(this)">${running ? '<span class="rs-spin" style="width:14px;height:14px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span>' : I('refresh')} ${running ? 'Đang làm mới…' : 'Làm mới'}</button>`) +
    (running ? `<div class="rs-run"><span class="rs-spin"></span><div><b>${esc(st.step || 'Đang lấy dữ liệu')}</b><span>Trang tự cập nhật khi xong, có thể xem bản cũ trong lúc chờ</span></div></div>` : '') +
    (st && !st.running && st.ok === false ? `<div class="rs-run err">${I('alert')}<div><b>Lần làm mới trước không thành công</b><span>${esc(st.step)}</span></div></div>` : '') +
    (d ? anDigest(d, running) + anTabs(d) : '') + `</div>`;
  clearTimeout(state.anT);
  if (running) state.anT = setTimeout(() => { if (location.hash.startsWith('#/ainews')) { const y = $('#main').scrollTop; aiNewsPage().then(() => { $('#main').scrollTop = y; }); } }, 3000);
}
async function aiNewsRun(btn) {
  btn.disabled = true;
  try { await api('POST', '/api/ainews/refresh'); setTimeout(aiNewsPage, 800); } catch (e) { toast(e.message); btn.disabled = false; }
}
function anSet(k, v) { state.an[k] = v; const y = $('#main').scrollTop; aiNewsPage().then(() => { $('#main').scrollTop = y; }); }

const AN_NHOM = { mo_hinh: 'Mô hình', san_pham: 'Sản phẩm', doanh_nghiep: 'Doanh nghiệp', chinh_sach: 'Chính sách', nghien_cuu: 'Nghiên cứu', bao_mat: 'Bảo mật', viet_nam: 'Việt Nam', khac: 'Khác' };
// độ tin cậy: hãng tự công bố > nhiều nguồn khác nhau > một nguồn
const anTrust = s => s.chinh_thuc ? ['ok', `${I('check')} Hãng công bố`] : s.so_nguon >= 2 ? ['ok', `${I('check')} ${s.so_nguon} nguồn xác nhận`] : ['warn', 'Mới 1 nguồn'];
function anSrc(s) {
  const seen = new Set();
  return `<div class="an-src">${s.nguon.filter(n => !seen.has(n.source + n.title) && seen.add(n.source + n.title)).map(n => `<a href="${esc(n.url)}" target="_blank" rel="noopener" title="${esc(n.title)}" class="${n.kind}">${n.kind === 'official' ? I('check') : ''}${esc(n.source)}<em>${anAgo(n.at)}</em></a>`).join('')}</div>`;
}
function anDigest(d, running) {
  const x = d.digest, top = (d.stories || []).filter(s => s.viet).slice(0, 12);
  if (!x || !top.length) return `<section class="card an-dg"><div class="lbl">${I('sparkles')} Tin AI quan trọng</div><p class="muted">${running ? 'Đang gom và tóm tắt tin, vài phút nữa là có…' : 'Chưa có tóm tắt cho lần này. Bấm "Làm mới".'}</p></section>`;
  return `<section class="card an-dg"><div class="an-dgh"><div class="lbl">${I('sparkles')} Tin AI quan trọng · tóm tắt từ nội dung bài gốc</div><span class="muted small">${d.digest_at ? fmtPostedAt(+new Date(d.digest_at)) : ''}</span></div>
    ${x.tom_tat ? `<p class="an-sum">${esc(x.tom_tat)}</p>` : ''}
    <div class="an-pts">${top.map((s, i) => { const v = s.viet, t = anTrust(s); return `<div class="an-pt"><span class="rs-n">${i + 1}</span><div>
      <div class="an-ptm"><span class="an-badge ${t[0]}">${t[1]}</span><span class="an-badge">${esc(AN_NHOM[s.nhom] || 'Khác')}</span><span class="muted small">${anAgo(s.at)}</span></div>
      <b>${esc(v.tieu_de || s.tieu_de)}</b><p>${esc(v.tom_tat || '')}</p>
      ${(v.chi_tiet || []).length ? `<ul class="an-ct">${v.chi_tiet.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${v.luu_y ? `<p class="an-luu">${I('alert')}<span>${esc(v.luu_y)}</span></p>` : ''}
      ${v.cho_hung ? `<p class="an-for">${I('zap')}<span>${esc(v.cho_hung)}</span></p>` : ''}
      ${anSrc(s)}</div></div>`; }).join('')}</div></section>`;
}

function anTabs(d) {
  const a = state.an, seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${a[k] === v ? 'on' : ''}" onclick="anSet('${k}','${v}')">${l}</button>`).join('')}</div>`;
  const ns = (d.stories || []).length;
  return `<div class="toolbar an-bar"><div class="seg"><button class="${a.tab === 'su_kien' ? 'on' : ''}" onclick="anSet('tab','su_kien')">${I('layers')} Tất cả sự kiện <em>${ns}</em></button><button class="${a.tab === 'video' ? 'on' : ''}" onclick="anSet('tab','video')">${I('play')} Video <em>${d.videos.length}</em></button><button class="${a.tab === 'news' ? 'on' : ''}" onclick="anSet('tab','news')">${I('file')} Từng bài <em>${d.news.length}</em></button></div>
    ${a.tab === 'video' ? seg('vf', [['all', 'Tất cả'], ['short', 'Shorts'], ['long', 'Video dài']]) + seg('vs', [['views', 'Xem nhiều'], ['new', 'Mới nhất']]) : a.tab === 'news' ? seg('nf', [['all', 'Tất cả'], ['official', 'Hãng công bố'], ['press', 'Báo quốc tế'], ['vn', 'Báo Việt']]) : seg('sf', [['all', 'Tất cả'], ['xac_nhan', 'Đã xác nhận'], ['vn', 'Liên quan Việt Nam']])}</div>`
    + (a.tab === 'video' ? anVideos(d) : a.tab === 'news' ? anNews(d) : anStories(d));
}
// danh sách mọi sự kiện (kể cả ngoài top được tóm tắt), xếp theo độ quan trọng
function anStories(d) {
  const a = state.an; let list = d.stories || [];
  if (a.sf === 'xac_nhan') list = list.filter(s => s.chinh_thuc || s.so_nguon >= 2); else if (a.sf === 'vn') list = list.filter(s => s.viet_nam || s.nhom === 'viet_nam');
  if (!list.length) return '<p class="empty">Không có sự kiện nào khớp bộ lọc.</p>';
  return `<section class="card flush an-ng">${list.map(s => { const t = anTrust(s); return `<div class="an-sk"><div class="an-skh"><b>${esc(s.viet?.tieu_de || s.tieu_de)}</b><span class="an-badge ${t[0]}">${t[1]}</span><span class="an-badge">${esc(AN_NHOM[s.nhom] || 'Khác')}</span><span class="muted small">${anAgo(s.at)}</span></div>${s.viet?.tom_tat ? `<p>${esc(s.viet.tom_tat)}</p>` : ''}${anSrc(s)}</div>`; }).join('')}</section>`;
}

function anVideos(d) {
  const a = state.an;
  let list = d.videos.filter(v => a.vf === 'all' || (a.vf === 'short') === v.short);
  list = [...list].sort((x, y) => a.vs === 'new' ? y.at - x.at : y.views - x.views);
  if (!list.length) return '<p class="empty">Không có video nào khớp bộ lọc.</p>';
  return `<div class="an-vgrid">${list.map(v => `<article class="an-v" onclick='anPlay(${j(v)})'>
    <div class="an-th"><img src="${esc(v.thumb)}" loading="lazy" onerror="this.style.opacity=0"><span class="an-dur">${v.short ? 'Shorts · ' : ''}${anDur(v.sec)}</span><span class="an-play">${I('play')}</span></div>
    <div class="an-vb"><b>${esc(v.title)}</b><div class="an-ch">${esc(v.channel)}</div>
      <div class="an-meta"><span><b>${fmtN(v.views)}</b> xem</span>${v.likes ? `<span>${fmtN(v.likes)} thích</span>` : ''}<span class="rs-date">${I('calendar')}${fmtPostedAt(v.at)}</span></div></div></article>`).join('')}</div>`;
}
function anPlay(v) {
  modal(`<div class="an-pv"><div class="an-frame ${v.short ? 'vert' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
    <h3>${esc(v.title)}</h3><p class="small muted">${esc(v.channel)} · ${fmtN(v.views)} lượt xem · ${fmtN(v.likes)} thích · ${fmtN(v.comments)} bình luận · đăng ${fmtPostedAt(v.at)}</p>
    <div class="acts"><a class="btnlink" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${appTile('youtube', 'xs')} Mở trên YouTube</a><button class="primary" onclick="$('#modal').close()">Đóng</button></div></div>`);
}

function anNews(d) {
  const a = state.an, list = d.news.filter(n => a.nf === 'all' || (n.kind ? n.kind === a.nf : n.lang === a.nf));
  if (!list.length) return '<p class="empty">Không có tin nào khớp bộ lọc.</p>';
  const day = t => { if (!t) return 'Không rõ ngày'; const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 864e5); return diff <= 0 ? 'Hôm nay' : diff === 1 ? 'Hôm qua' : rsDay(t); };
  const groups = []; for (const n of list) { const g = day(n.at); (groups.find(x => x[0] === g) || (groups.push([g, []]), groups.at(-1)))[1].push(n); }
  return groups.map(([g, items]) => `<section class="card flush an-ng"><div class="an-nh">${esc(g)} <em>${items.length}</em></div>${items.map(n => `<a class="an-n" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="an-nt">${n.at ? new Date(n.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</span><div><b>${esc(n.title)}</b><div class="an-ns"><span>${esc(n.source)}</span><span class="chip">${n.kind === 'official' ? 'Hãng công bố' : n.lang === 'vn' ? 'Báo Việt' : 'Báo quốc tế'}</span></div></div><span class="an-go">${I('arrow-right')}</span></a>`).join('')}</section>`).join('');
}
