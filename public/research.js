// ---------- Nghiên cứu nội dung: số liệu thật YouTube/TikTok + kênh mình + kết luận Claude
// Dữ liệu do ~/websites/hpb-ai-news/scripts/research.mjs thu và ghi ra; trang này chỉ hiển thị + bấm chạy lại.
const rsNum = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' Tr' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' N' : String(n);
const rsMedian = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const rsAgo = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

async function researchPage() {
  crumbs(['Nghiên cứu nội dung']);
  const r = await api('GET', '/api/research'), d = r.data, st = r.status;
  state.rs = { kw: 0, ...state.rs };
  const running = st?.running && Date.now() - new Date(st.at) < 30 * 60e3;
  const sub = d ? `Số liệu thật YouTube &amp; TikTok · cập nhật ${rsAgo(d.updated)} · ${d.market.length} từ khoá · ${d.competitors.length} kênh đối thủ` : 'Chưa có dữ liệu. Bấm "Chạy nghiên cứu" để thu lần đầu (khoảng 10 phút).';
  $('#main').innerHTML = `<div class="wrap rs">` + pageHead('Nghiên cứu nội dung', sub,
    `<button class="primary" ${running ? 'disabled' : ''} onclick="researchRun(this)">${I(running ? 'hourglass' : 'radar')} ${running ? 'Đang nghiên cứu…' : 'Chạy nghiên cứu'}</button>`) +
    (running ? `<div class="rs-run"><span class="rs-spin"></span><div><b>Đang thu số liệu</b><span>${esc(st.step || '')} · trang tự cập nhật khi xong</span></div></div>` : '') +
    (st && !st.running && st.ok === false ? `<div class="rs-run err">${I('alert')}<div><b>Lần chạy trước bị lỗi</b><span>${esc(st.step)}</span></div></div>` : '') +
    (d ? rsInsight(d) + rsOwn(d) + rsMarket(d) + rsRivals(d) : '') + `</div>`;
  clearTimeout(state.rsT);
  if (running) state.rsT = setTimeout(() => { if (location.hash.startsWith('#/research')) researchPage(); }, 5000);
}
async function researchRun(btn) {
  btn.disabled = true;
  try { await api('POST', '/api/research/run'); toast('Đã bắt đầu nghiên cứu, khoảng 10 phút'); setTimeout(researchPage, 1500); }
  catch (e) { toast(e.message); btn.disabled = false; }
}

function rsInsight(d) {
  const x = d.insight;
  if (!x) return `<section class="card"><p class="muted">Chưa có kết luận${d.insight_error ? ': ' + esc(d.insight_error) : ''}.</p></section>`;
  const list = (arr, cls) => (arr || []).map(i => `<li class="${cls}"><b>${esc(i.dang)}</b><span class="rs-ev">${esc(i.bang_chung)}</span>${i.vi_sao ? `<span class="muted small">${esc(i.vi_sao)}</span>` : ''}</li>`).join('');
  return `<section class="card rs-sum"><div class="lbl">Kết luận từ số liệu</div><p>${esc(x.tom_tat)}</p></section>
  <div class="rs-two">
    <section class="card"><div class="c-h"><div><h3>${I('check')} Đang thắng</h3></div></div><ul class="rs-list">${list(x.dang_thang, 'win')}</ul></section>
    <section class="card"><div class="c-h"><div><h3>${I('alert')} Đang thua</h3></div></div><ul class="rs-list">${list(x.dang_thua, 'lose')}</ul></section>
  </div>
  <div class="rs-three">
    <section class="card"><div class="c-h"><div><h3>Khuôn móc câu</h3><p>Rút từ video thắng, dùng lại được</p></div></div><ol class="rs-ol">${(x.moc_cau || []).map(m => `<li>${esc(m)}</li>`).join('')}</ol></section>
    <section class="card"><div class="c-h"><div><h3>Tuần tới nên làm</h3></div></div><ol class="rs-ol">${(x.tuan_toi || []).map(m => `<li>${esc(m)}</li>`).join('')}</ol></section>
    <section class="card"><div class="c-h"><div><h3>Chủ đề nên làm ngay</h3></div></div><ol class="rs-ol">${(x.chu_de_goi_y || []).map(m => `<li>${esc(m)}</li>`).join('')}</ol></section>
  </div>
  ${x.kenh_minh ? `<section class="card rs-note"><div class="lbl">Kênh của bạn so với thị trường</div><p>${esc(x.kenh_minh)}</p></section>` : ''}`;
}

function rsOwn(d) {
  const rows = d.own || [];
  return `<section class="card flush"><div class="c-h pad"><div><h3>Kênh của bạn</h3><p>Video đã đăng, số liệu đo tự động mỗi ngày</p></div><span class="chip">${rows.length} video</span></div>
  ${rows.length ? `<div class="rs-scroll"><table class="tbl"><thead><tr><th>Video</th><th>Chuyên mục</th><th class="num">YouTube xem</th><th class="num">TikTok xem</th><th class="num">Thích</th><th class="num">Bình luận</th></tr></thead><tbody>
  ${rows.map(v => `<tr><td><b>${esc(v.title)}</b><div class="sub">${v.created ? new Date(v.created).toLocaleDateString('vi-VN') : ''} ${Object.entries(v.links || {}).map(([k, u]) => u ? `<a href="${esc(u)}" target="_blank">${k} ↗</a>` : '').join(' ')}</div></td>
    <td><span class="chip">${esc(v.series)}</span><div class="sub">${esc(v.fmt)}</div></td><td class="num">${rsNum(v.yt)}</td><td class="num">${rsNum(v.tt)}</td><td class="num">${rsNum(v.likes)}</td><td class="num">${rsNum(v.comments)}</td></tr>`).join('')}</tbody></table></div>`
  : '<p class="empty">Chưa có video nào đã đăng.</p>'}</section>`;
}

function rsMarket(d) {
  const k = d.market[state.rs.kw] || d.market[0]; if (!k) return '';
  const yt = [...k.youtube].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 15), tt = [...(k.tiktok?.rows || [])].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 12);
  const ytMax = Math.max(1, ...yt.map(v => v.views || 0)), ttMax = Math.max(1, ...tt.map(v => v.n || 0));
  const bar = (n, max) => `<i class="rs-bar"><em style="width:${Math.max(2, (n || 0) / max * 100)}%"></em></i>`;
  return `<section class="card flush"><div class="c-h pad"><div><h3>Thị trường theo từ khoá</h3><p>Video đang được xem nhiều nhất khi người Việt tìm từ khoá này</p></div></div>
  <div class="rs-kw">${d.market.map((m, i) => `<button class="${(state.rs.kw === i) ? 'on' : ''}" onclick="state.rs.kw=${i};researchPage()">${esc(m.keyword)}</button>`).join('')}</div>
  <div class="rs-two flat">
    <div><div class="rs-colh">${appTile('youtube', 'sm')} YouTube <span class="muted small">lượt xem</span></div>
      <ol class="rs-rank">${yt.map(v => `<li><span class="n">${rsNum(v.views)}</span>${bar(v.views, ytMax)}<a href="${esc(v.url)}" target="_blank">${esc(v.title)}</a><span class="meta">${v.kind === 'short' ? '<span class="chip">Shorts</span>' : `${esc(v.len)}`} ${esc(v.channel)} ${esc(v.age)}${v.delta ? ` <b class="t-ok">+${rsNum(v.delta)} từ lần trước</b>` : ''}</span></li>`).join('') || '<p class="empty">Không có dữ liệu</p>'}</ol></div>
    <div><div class="rs-colh">${appTile('tiktok', 'sm')} TikTok <span class="muted small">lượt thích</span></div>
      <ol class="rs-rank">${tt.map(v => `<li><span class="n">${rsNum(v.n)}</span>${bar(v.n, ttMax)}<a href="${esc(v.url)}" target="_blank">${esc(v.text)}</a><span class="meta">@${esc(v.author)}</span></li>`).join('') || '<p class="empty">Không có dữ liệu (trình duyệt bận hoặc TikTok chặn)</p>'}</ol></div>
  </div></section>`;
}

function rsRivals(d) {
  if (!d.competitors.length) return '';
  return `<section class="card flush"><div class="c-h pad"><div><h3>Kênh đối thủ trên TikTok</h3><p>Lượt xem thật các video gần nhất: video nào vượt xa mức thường của kênh là dạng đáng học</p></div></div>
  <div class="rs-rivals">${d.competitors.map(c => {
    const med = rsMedian(c.rows.map(v => v.n)), top = [...c.rows].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5);
    return `<div class="rs-rival"><div class="rs-rh"><a href="https://www.tiktok.com/@${esc(c.handle)}" target="_blank"><b>@${esc(c.handle)}</b></a><span class="muted small">${rsNum(c.info?.followers)} theo dõi · trung vị ${rsNum(med)} xem/video</span></div>
      <ol class="rs-rank sm">${top.map(v => `<li><span class="n">${rsNum(v.n)}</span>${med && v.n > med * 3 ? `<span class="chip ok">×${Math.round(v.n / med)}</span>` : ''}<a href="${esc(v.url)}" target="_blank">${esc(v.text)}</a></li>`).join('')}</ol></div>`;
  }).join('')}</div></section>`;
}
