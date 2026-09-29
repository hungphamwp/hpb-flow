// ---------- Nghiên cứu nội dung: số liệu thật YouTube/TikTok + kênh mình + kết luận Claude
// Dữ liệu do ~/websites/hpb-ai-news/scripts/research.mjs thu và ghi ra; trang này chỉ hiển thị + bấm chạy lại.
const rsNum = n => n == null ? '—' : Number(n).toLocaleString('vi-VN');
const rsMedian = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const rsAgo = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };

// TikTok không trả ngày đăng, nhưng id video là snowflake: 32 bit cao = giây Unix lúc đăng
const rsTtDate = url => { const m = String(url || '').match(/video\/(\d{15,20})/); if (!m) return null; try { const t = Number(BigInt(m[1]) >> 32n) * 1000; return t > 1.4e12 && t < Date.now() + 864e5 ? t : null; } catch { return null; } };
const rsDay = t => t ? new Date(t).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const rsWhen = t => t ? `<span class="rs-date">${I('calendar')}${rsDay(t)}</span>` : '';
const rsBad = n => n != null && n > 2e9; // số bị đọc sai từ TikTok (vd. 564 tỷ thích)
const rsN = n => rsBad(n) ? '<span title="Số liệu TikTok đọc sai, bỏ qua">?</span>' : rsNum(n);
async function researchPage() {
  crumbs(['Nghiên cứu nội dung']);
  const r = await api('GET', '/api/research'), d = r.data, st = r.status;
  state.rs = { kw: 0, ...state.rs };
  const running = st?.running && Date.now() - new Date(st.at) < 30 * 60e3;
  const sub = d ? `Số liệu thật YouTube &amp; TikTok · cập nhật ${rsAgo(d.updated)} (${new Date(d.updated).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}) · ${d.market.length} từ khoá · ${d.competitors.length} kênh đối thủ` : 'Chưa có dữ liệu. Bấm "Chạy nghiên cứu" để thu lần đầu (khoảng 10 phút).';
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

// bằng chứng dài → tách từng dẫn chứng, in đậm con số lượt xem/thích cho dễ quét mắt
const rsEv = t => String(t || '').split(/;\s+/).filter(Boolean).map(p => `<li>${esc(p).replace(/(\d[\d.,]*)(\s*(?:view|lượt xem|thích|\/\s*\d[\d.,]*\s*\/\s*\d[\d.,]*\s*thích))/g, '<mark>$1$2</mark>')}</li>`).join('');
function rsKpis(d) {
  const own = d.own || [], ownBest = Math.max(0, ...own.flatMap(v => [v.yt || 0, v.tt || 0]));
  const all = d.competitors.flatMap(c => c.rows.map(v => v.n || 0)).filter(n => !rsBad(n)), rivalTop = Math.max(0, ...all), med = rsMedian(all);
  const ratio = ownBest ? Math.round(rivalTop / ownBest) : null;
  const tile = (ic, l, v, s, cls = '') => `<div class="rs-kpi ${cls}"><span class="ico">${I(ic)}</span><div><small>${l}</small><b>${v}</b><em>${s}</em></div></div>`;
  return `<div class="rs-kpis">${tile('play', 'Video của bạn', own.length, 'đã đăng, đang đo tự động')}${tile('eye', 'View cao nhất của bạn', rsNum(ownBest), 'trên YouTube/TikTok')}${tile('zap', 'View cao nhất đối thủ', rsNum(rivalTop), med ? `mức thường ~${rsNum(med)} view/video` : '', 'hot')}${tile('activity', 'Khoảng cách', ratio ? '×' + rsNum(ratio) : '—', 'đối thủ top so với bạn', ratio > 50 ? 'warn' : '')}</div>`;
}
function rsInsight(d) {
  const x = d.insight;
  if (!x) return `<section class="card"><p class="muted">Chưa có kết luận${d.insight_error ? ': ' + esc(d.insight_error) : ''}.</p></section>`;
  const list = (arr, cls) => (arr || []).map((i, n) => `<li class="${cls}"><span class="rs-n">${n + 1}</span><div><b>${esc(i.dang)}</b><ul class="rs-evl">${rsEv(i.bang_chung)}</ul>${i.vi_sao ? `<p class="rs-why">${I('sparkles')}<span>${esc(i.vi_sao)}</span></p>` : ''}</div></li>`).join('');
  const act = (t, sub, arr, cls) => `<section class="card rs-act ${cls}"><div class="rs-acth"><h3>${t}</h3><p>${sub}</p></div><ol>${(arr || []).map(m => `<li><span></span><p>${esc(m)}</p></li>`).join('')}</ol></section>`;
  return `${rsKpis(d)}
  <section class="card rs-sum"><div class="lbl">${I('sparkles')} Kết luận từ số liệu</div><p>${esc(x.tom_tat)}</p></section>
  <div class="rs-two">
    <section class="card rs-side win"><div class="rs-sh"><span class="ic">${I('check')}</span><div><h3>Đang thắng</h3><p>Dạng nội dung đang ăn view, nên học</p></div><em>${(x.dang_thang || []).length}</em></div><ul class="rs-list">${list(x.dang_thang, 'win')}</ul></section>
    <section class="card rs-side lose"><div class="rs-sh"><span class="ic">${I('alert')}</span><div><h3>Đang thua</h3><p>Dạng nội dung nên tránh</p></div><em>${(x.dang_thua || []).length}</em></div><ul class="rs-list">${list(x.dang_thua, 'lose')}</ul></section>
  </div>
  <div class="rs-three">
    ${act('Tuần tới nên làm', 'Việc cụ thể, làm ngay', x.tuan_toi, 'a1')}
    ${act('Chủ đề nên làm ngay', 'Đề tài có khả năng ăn view', x.chu_de_goi_y, 'a2')}
    ${act('Khuôn móc câu', 'Rút từ video thắng, dùng lại được', x.moc_cau, 'a3')}
  </div>
  ${x.kenh_minh ? `<section class="card rs-note"><div class="lbl">${I('radar')} Kênh của bạn so với thị trường</div><p>${esc(x.kenh_minh)}</p></section>` : ''}`;
}

function rsOwn(d) {
  const rows = d.own || [];
  return `<section class="card flush"><div class="c-h pad"><div><h3>Kênh của bạn</h3><p>Video đã đăng, số liệu đo tự động mỗi ngày</p></div><span class="chip">${rows.length} video</span></div>
  ${rows.length ? `<div class="rs-scroll"><table class="tbl"><thead><tr><th>Video</th><th>Ngày đăng</th><th>Chuyên mục</th><th class="num">YouTube xem</th><th class="num">TikTok xem</th><th class="num">Thích</th><th class="num">Bình luận</th></tr></thead><tbody>
  ${rows.map(v => `<tr><td><b>${esc(v.title)}</b><div class="sub">${Object.entries(v.links || {}).map(([k, u]) => u ? `<a href="${esc(u)}" target="_blank">${k} ↗</a>` : '').join(' ')}</div></td>
    <td class="rs-when">${v.created ? `<b>${rsDay(v.created)}</b><div class="sub">${new Date(v.created).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>` : '—'}</td><td><span class="chip">${esc(v.series)}</span><div class="sub">${esc(v.fmt)}</div></td><td class="num">${rsNum(v.yt)}</td><td class="num">${rsNum(v.tt)}</td><td class="num">${rsNum(v.likes)}</td><td class="num">${rsNum(v.comments)}</td></tr>`).join('')}</tbody></table></div>`
  : '<p class="empty">Chưa có video nào đã đăng.</p>'}</section>`;
}

function rsMarket(d) {
  const k = d.market[state.rs.kw] || d.market[0]; if (!k) return '';
  const yt = [...k.youtube].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 15), tt = [...(k.tiktok?.rows || [])].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 12);
  const ytMax = Math.max(1, ...yt.map(v => v.views || 0)), ttMax = Math.max(1, ...tt.filter(v => !rsBad(v.n)).map(v => v.n || 0));
  const bar = (n, max) => `<i class="rs-bar"><em style="width:${Math.max(2, (n || 0) / max * 100)}%"></em></i>`;
  return `<section class="card flush"><div class="c-h pad"><div><h3>Thị trường theo từ khoá</h3><p>Video đang được xem nhiều nhất khi người Việt tìm từ khoá này</p></div></div>
  <div class="rs-kw">${d.market.map((m, i) => `<button class="${(state.rs.kw === i) ? 'on' : ''}" onclick="state.rs.kw=${i};researchPage()">${esc(m.keyword)}</button>`).join('')}</div>
  <div class="rs-two flat">
    <div><div class="rs-colh">${appTile('youtube', 'sm')} YouTube <span class="muted small">lượt xem</span></div>
      <ol class="rs-rank">${yt.map(v => `<li><span class="n">${rsNum(v.views)}</span>${bar(v.views, ytMax)}<a href="${esc(v.url)}" target="_blank">${esc(v.title)}</a><span class="meta">${v.kind === 'short' ? '<span class="chip">Shorts</span>' : `<span>${esc(v.len)}</span>`}${v.channel ? `<span>${esc(v.channel)}</span>` : ''}${v.age ? `<span class="rs-date">${I('calendar')}${esc(v.age)}</span>` : (v.kind === 'short' ? '' : '')}${v.delta ? ` <b class="t-ok">+${rsNum(v.delta)} từ lần trước</b>` : ''}</span></li>`).join('') || '<p class="empty">Không có dữ liệu</p>'}</ol></div>
    <div><div class="rs-colh">${appTile('tiktok', 'sm')} TikTok <span class="muted small">lượt thích</span></div>
      <ol class="rs-rank">${tt.map(v => `<li><span class="n">${rsN(v.n)}</span>${bar(rsBad(v.n) ? 0 : v.n, ttMax)}<a href="${esc(v.url)}" target="_blank">${esc(v.text)}</a><span class="meta"><span>@${esc(v.author)}</span>${rsWhen(rsTtDate(v.url))}</span></li>`).join('') || '<p class="empty">Không có dữ liệu (trình duyệt bận hoặc TikTok chặn)</p>'}</ol></div>
  </div></section>`;
}

function rsRivals(d) {
  if (!d.competitors.length) return '';
  return `<section class="card flush"><div class="c-h pad"><div><h3>Kênh đối thủ trên TikTok</h3><p>Lượt xem thật các video gần nhất: video nào vượt xa mức thường của kênh là dạng đáng học</p></div></div>
  <div class="rs-rivals">${d.competitors.map(c => {
    const med = rsMedian(c.rows.map(v => v.n).filter(n => !rsBad(n))), top = [...c.rows].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5);
    return `<div class="rs-rival"><div class="rs-rh"><a href="https://www.tiktok.com/@${esc(c.handle)}" target="_blank"><b>@${esc(c.handle)}</b></a><span class="muted small">${rsNum(c.info?.followers)} theo dõi · trung vị ${rsNum(med)} xem/video</span></div>
      <ol class="rs-rank sm">${top.map(v => `<li><span class="n">${rsN(v.n)}</span>${med && v.n > med * 3 ? `<span class="chip ok">×${Math.round(v.n / med)}</span>` : ''}<a href="${esc(v.url)}" target="_blank">${esc(v.text)}</a>${rsWhen(rsTtDate(v.url))}</li>`).join('')}</ol></div>`;
  }).join('')}</div></section>`;
}
