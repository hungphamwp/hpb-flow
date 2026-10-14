// ---------- trang Quản lý Bông (#/pet): xem trước pet, bật/tắt tính năng, chọn giọng, giai đoạn, trí nhớ, lịch sử chat, mẹo.
// Không sửa app.js: tự gắn mục vào menu trái và tự bắt hashchange (#/pet) trước router của app. Cần pet.js (window.hpbPet).
(() => {
  if (document.documentElement.classList.contains('desk') || !window.hpbPet) return;
  const P = window.hpbPet, NATIVE = window.webkit?.messageHandlers?.bong;
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const STAGE_N = ['', 'Bé Bông', 'Bông Trợ lý', 'Bông Chuyên gia', 'Bông Huyền thoại'];
  const STAGE_HINT = ['', 'Mèo con nhỏ xinh', 'Có vầng sáng tím', 'Vầng sáng rực hơn, lớn hơn', 'Vầng sáng vàng + hạt lấp lánh'];
  const FACE_DEMO = [['wave', 'Vẫy tay'], ['happy', 'Cười tít'], ['love', 'Mắt tim'], ['wow', 'Ngạc nhiên'], ['think', 'Đang nghĩ'], ['sad', 'Buồn'], ['sleep', 'Ngủ']];

  // gắn mục "Linh vật Bông" vào menu trái (menu được app vẽ lại nhiều lần nên theo dõi và gắn lại)
  const ICON = '<svg class="i" viewBox="0 0 24 24"><path d="M4 10V4l4 3h8l4-3v6a8 8 0 0 1-16 0z"/><circle cx="9.5" cy="12" r=".6" fill="currentColor"/><circle cx="14.5" cy="12" r=".6" fill="currentColor"/><path d="M10.5 15.5q1.5 1 3 0"/></svg>';
  function navLink() {
    const navEl = document.getElementById('nav'); if (!navEl || navEl.querySelector('[data-page="pet"]')) return;
    const a = document.createElement('a'); a.href = '#/pet'; a.dataset.page = 'pet'; a.title = 'Linh vật Bông';
    a.innerHTML = `${ICON}<span>Linh vật Bông</span><span class="pm-new">MỚI</span>`;
    const anchor = navEl.querySelector('[data-page="todo"]'); anchor ? anchor.after(a) : navEl.prepend(a);
    a.classList.toggle('active', location.hash.startsWith('#/pet'));
  }
  const navEl = document.getElementById('nav'); if (navEl) new MutationObserver(navLink).observe(navEl, { childList: true }); navLink();

  // cho router của app tự gọi trang này: route() gặp trang có trong SOON thì gọi soonPage(key) → mình bọc soonPage để vẽ trang Bông
  if (typeof SOON === 'object' && typeof soonPage === 'function') {
    SOON.pet = SOON.pet || { title: 'Linh vật Bông' };
    const orig = soonPage;
    window.soonPage = function (key) { return key === 'pet' ? render() : orig.apply(this, arguments); };
  }
  addEventListener('hashchange', () => document.querySelectorAll('#nav a[data-page="pet"]').forEach(a => a.classList.toggle('active', location.hash.startsWith('#/pet'))));
  if (location.hash.startsWith('#/pet') && typeof route === 'function') setTimeout(route, 0);

  let S = {}, V = [], st = {}, usage = {}, demoI = 0, demoT = 0;
  const save = async patch => { S = await api('POST', '/api/pet/settings', patch); if (NATIVE) NATIVE.postMessage({ cmd: 'settings' }); await P.loadSettings(); return S; };
  const preview = (voiceId, text) => { const a = new Audio(`/api/pet/tts?text=${encodeURIComponent(text || 'Chào anh Hưng, em là Bông nè! Hôm nay mình làm gì trước đây?')}&voice=${encodeURIComponent(voiceId)}&speed=${S.speed}`); a.play().catch(() => {}); return a; };

  async function render() {
    if (typeof crumbs === 'function') crumbs(['Linh vật Bông']);
    const m = document.getElementById('main'); m.classList.add('pmpage'); m.scrollTop = 0;
    let tasks, kn, stt; [S, V, st, tasks, kn, stt] = await Promise.all([api('GET', '/api/pet/settings'), api('GET', '/api/pet/voices'), api('GET', '/api/pet/state'), api('GET', '/api/pet/tasks').catch(() => []), api('GET', '/api/pet/knowledge').catch(() => ({})), api('GET', '/api/pet/stt').catch(() => ({}))]);
    const k = P.karma(), en = P.energy(), sk = P.streaks ? P.streaks() : { cur: 0, best: 0 };
    m.innerHTML = `<div class="wrap pm">
      ${typeof pageHead === 'function' ? pageHead('Linh vật Bông', 'Trợ lý AI dạng thú cưng: nghe giọng nói, trả lời bằng giọng thật, làm việc trong app và lớn lên theo năng suất của anh.') : '<h1>Linh vật Bông</h1>'}
      <section class="pm-hero">
        <div class="pm-stage" data-stage="${k.stage}"><div class="pm-aura"></div><div class="pm-halo"></div><img id="pmFace" src="pet/meo-wave.webp" alt="Bông"><div class="pm-floor"></div></div>
        <div class="pm-id">
          <div class="pm-tag">${e(k.name)} · giai đoạn ${k.stage}/4</div>
          <h2>${e(S.name || 'Bông')}<small> · mèo cyber chibi</small></h2>
          <p>${k.next ? `Còn <b>${k.left} XP</b> nữa tiến hoá thành <b>${e(k.next.n)}</b>.` : 'Đã tiến hoá tối đa.'} Bông lớn lên khi anh hoàn thành việc trong "Việc hôm nay".</p>
          <div class="pm-bar"><i style="width:${Math.max(3, k.pct)}%"></i></div>
          <div class="pm-stats">
            <div><b>⚡ ${en}%</b><span>Năng lượng</span></div>
            <div><b>🔥 ${sk.cur}</b><span>Chuỗi ngày · kỷ lục ${sk.best}</span></div>
            <div><b>💜 ${st.bond || 0}</b><span>Thân thiết</span></div>
            <div><b>💬 ${st.chats || 0}</b><span>Câu đã trò chuyện</span></div>
          </div>
          <div class="pm-btns"><button class="primary" id="pmTalk">🎙 Gọi Bông</button><button id="pmHear">🔊 Nghe giọng</button><button id="pmFaces">😺 Xem biểu cảm</button></div>
        </div>
      </section>

      <div class="pm-grid">
        <section class="card pm-card"><h3>Hoạt động</h3>
          ${[['desk', 'Hiện trên màn hình', 'Bông nổi trên mọi app, mọi màn hình (chỉ app Mac). Tắt thì Bông chỉ ở trong cửa sổ HPB Flow.'],
             ['wake', 'Luôn nghe "Bông ơi"', 'Gọi "Bông ơi…" là Bông nghe lệnh, không cần bấm. Nhận dạng chạy ngay trên máy, không gửi âm thanh đi đâu.'],
             ['speakAll', 'Đọc to mọi câu trả lời', 'Tắt thì Bông chỉ đọc to khi anh nói bằng giọng.']].map(([key, t, d]) =>
            `<div class="pm-row"><div><b>${t}</b><p>${d}</p></div><button class="switch ${S[key] ? 'on' : ''}" data-set="${key}" aria-label="${t}"></button></div>`).join('')}
        </section>

        <section class="card pm-card"><h3>Giọng nói</h3>
          <div class="pm-seg"><button data-voice="eleven" class="${S.voice === 'eleven' ? 'on' : ''}">ElevenLabs (giọng thật)</button><button data-voice="system" class="${S.voice !== 'eleven' ? 'on' : ''}">Giọng máy macOS</button></div>
          <div class="pm-voices ${S.voice === 'eleven' ? '' : 'off'}">${V.map(v => `<label class="pm-voice ${v.id === S.voiceId ? 'on' : ''}"><input type="radio" name="pmv" value="${v.id}" ${v.id === S.voiceId ? 'checked' : ''}><span><b>${e(v.name)}</b><small>${e(v.note)}</small></span><button type="button" data-play="${v.id}" title="Nghe thử">▶</button></label>`).join('')}</div>
          <div class="pm-row pm-speed"><div><b>Tốc độ nói</b><p>${S.speed.toFixed(2)}×</p></div><input type="range" min="0.8" max="1.2" step="0.05" value="${S.speed}" id="pmSpeed"></div>
          <div class="pm-usage" id="pmUsage">Đang xem mức dùng ElevenLabs…</div>
        </section>

        <section class="card pm-card pm-wide"><h3>Nhận dạng giọng nói</h3>
          <p class="pm-sub">Chờ "Bông ơi" luôn chạy ngay trên máy. Phần câu lệnh có thể dùng <b>Soniox</b>, cùng dịch vụ mà app Tocky Voice của anh đang dùng, chính xác hơn nhiều với tiếng Việt xen tiếng Anh. Soniox tính phí theo phút nghe; Apple miễn phí nhưng kém hơn.</p>
          <div class="pm-row"><div><b>Khi nào Bông nghe?</b><p>"Nghe mọi câu": anh nói gì Bông cũng trả lời, không cần gọi tên (người khác nói gần đó cũng có thể bị nghe). "Gọi tên": chỉ khi anh nói "Bông ơi…".</p></div>
            <div class="pm-seg" style="margin:0"><button data-wm="any" class="${S.wakeMode !== 'name' ? 'on' : ''}">Nghe mọi câu</button><button data-wm="name" class="${S.wakeMode === 'name' ? 'on' : ''}">Gọi "Bông ơi"</button></div></div>
          <div class="pm-seg"><button data-stt="soniox" class="${S.stt !== 'apple' ? 'on' : ''}">Soniox (chính xác)</button><button data-stt="apple" class="${S.stt === 'apple' ? 'on' : ''}">Apple (trên máy, miễn phí)</button></div>
          <div class="pm-row"><div><b>Khoá Soniox</b><p>${stt.hasKey ? '✅ Đã lưu trên máy (chỉ chủ máy đọc được).' : 'Chưa có. Copy khoá từ Tocky Voice (Cài đặt → Soniox) hoặc console.soniox.com, dán vào đây.'}</p></div>
            <form id="pmSx" class="pm-add" style="min-width:320px"><input type="password" autocomplete="off" placeholder="${stt.hasKey ? 'Dán khoá mới để thay' : 'snx_…'}" id="pmSxKey"><button>Lưu</button>${stt.hasKey ? '<button type="button" id="pmSxDel">Xoá</button>' : ''}</form></div>
        </section>

        <section class="card pm-card pm-wide"><h3>Giai đoạn tiến hoá</h3>
          <p class="pm-sub">Giai đoạn tự lên theo cấp Karma (cấp 2 → Trợ lý, cấp 4 → Chuyên gia, cấp 7 → Huyền thoại). Chọn một ô để đặt mức tối thiểu.</p>
          <div class="pm-stages">${[1, 2, 3, 4].map(n => `<button class="pm-st ${n === (S.stageMin || 1) ? 'on' : ''} ${n <= k.stage ? 'got' : ''}" data-stage-min="${n}"><div class="pm-stage mini" data-stage="${n}"><div class="pm-aura"></div><div class="pm-halo"></div><img src="pet/meo-base.webp" alt=""></div><b>${STAGE_N[n]}</b><small>${STAGE_HINT[n]}</small></button>`).join('')}</div>
        </section>

        <section class="card pm-card pm-wide"><h3>Bộ não thứ hai</h3>
          <p class="pm-sub">Bông nạp sẵn <b>${kn.memories || 0} ghi chú</b> trong bộ nhớ dài hạn và <b>${kn.projects || 0} dự án</b> đang chạy (việc mở, hạn chót, ngân sách) mỗi lần khởi động. Việc nặng thì Bông giao cho <b>Claude Code chạy nền</b>: đọc dự án, tra web, viết báo cáo, xong thì báo bằng giọng. Claude chạy nền chỉ đọc, kết quả ghi vào <code>~/Project/HPBFlow/bong-viec</code>.</p>
          <div class="pm-tasks">${tasks.length ? tasks.slice(0, 8).map(t => `<div class="pm-task ${t.status}"><span class="dot"></span><div><b>${e(t.title)}</b><p>${t.status === 'running' ? `Đang làm ${Math.round((Date.now() - t.started) / 60e3)} phút${t.steps?.length ? ' · <i>' + e(t.steps[t.steps.length - 1].text) + '</i>' : '…'}` : e((t.result || '').slice(0, 220))}</p></div>
            ${t.status === 'running' ? `<button data-stop="${t.id}">Dừng</button>` : `<button data-open="${t.id}">Mở kết quả</button>`}</div>`).join('') : '<p class="pm-sub">Chưa giao việc nào. Thử nói: "Bông ơi, nghiên cứu 3 đối thủ của máy cán ren rồi tóm tắt cho anh".</p>'}</div>
        </section>

        <section class="card pm-card"><h3>Trí nhớ của Bông</h3>
          <p class="pm-sub">Những điều anh dặn Bông nhớ. Bông dùng chúng mỗi lần trả lời.</p>
          <ul class="pm-facts">${(st.facts || []).map((f, i) => `<li><span>${e(f)}</span><button data-forget="${i}" title="Quên điều này">×</button></li>`).join('') || '<li class="empty">Chưa có. Thử nói: "Bông ơi, nhớ là anh thích làm việc buổi sáng".</li>'}</ul>
          <form class="pm-add" id="pmAdd"><input placeholder="Thêm điều Bông cần nhớ…" maxlength="200"><button>Thêm</button></form>
        </section>

        <section class="card pm-card"><h3>Gọi Bông thế nào?</h3>
          <ul class="pm-tips">
            <li><kbd>Bông ơi</kbd> … rồi nói lệnh. Trả lời xong anh nói tiếp luôn, không cần gọi lại.</li>
            <li><kbd>⌥⌘B</kbd> ở bất cứ app nào để Bông nghe ngay.</li>
            <li>"<i>nhắc anh 3 giờ chiều gọi khách</i>" → ghi việc + hẹn giờ.</li>
            <li>"<i>xong việc chuyển hosting rồi</i>" → tick việc, cộng XP.</li>
            <li>"<i>tập trung 25 phút</i>" → hẹn giờ, vòng đếm ngược quanh mèo.</li>
            <li>"<i>chạy quy trình quét bình luận Facebook</i>" → hỏi lại rồi chạy.</li>
            <li>"<i>mở tin tức AI</i>", "<i>mấy giờ rồi</i>", "<i>thôi</i>" → làm ngay, không cần AI.</li>
          </ul>
          <div class="pm-row"><div><b>Lịch sử trò chuyện</b><p>${(st.history || []).length} tin gần nhất được lưu</p></div><button id="pmClear">Xoá lịch sử</button></div>
        </section>
      </div>
    </div>`;
    bind();
    api('GET', '/api/pet/usage').then(u => { usage = u; const el = document.getElementById('pmUsage'); if (!el) return;
      el.innerHTML = u.limit ? `<div class="pm-bar sm"><i style="width:${Math.min(100, u.used / u.limit * 100)}%"></i></div><span>ElevenLabs ${e(u.tier || '')}: đã dùng <b>${u.used.toLocaleString('vi-VN')}</b> / ${u.limit.toLocaleString('vi-VN')} ký tự · đặt lại ${new Date(u.reset * 1000).toLocaleDateString('vi-VN')}</span>` : 'Chưa đọc được mức dùng ElevenLabs.'; }).catch(() => {});
  }

  function bind() {
    const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
    $$('[data-set]').forEach(b => b.onclick = async () => { b.classList.toggle('on'); await save({ [b.dataset.set]: b.classList.contains('on') }); });
    $$('[data-voice]').forEach(b => b.onclick = async () => { await save({ voice: b.dataset.voice }); render(); });
    $$('input[name="pmv"]').forEach(r => r.onchange = async () => { const v = V.find(x => x.id === r.value); await save({ voiceId: r.value, voiceName: v?.name || '' });
      $$('.pm-voice').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); preview(r.value, `Dạ, từ giờ em nói giọng ${v?.name || 'này'} nha anh!`); });
    $$('[data-play]').forEach(b => b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); const a = new Audio(`pet/voice/${b.dataset.play}.mp3`); a.onerror = () => preview(b.dataset.play); a.play().catch(() => preview(b.dataset.play)); });
    const sp = $('#pmSpeed'); if (sp) { sp.oninput = () => { sp.closest('.pm-row').querySelector('p').textContent = (+sp.value).toFixed(2) + '×'; }; sp.onchange = () => save({ speed: +sp.value }).then(() => preview(S.voiceId, 'Tốc độ này được không anh?')); }
    $$('[data-stage-min]').forEach(b => b.onclick = async () => { await save({ stageMin: +b.dataset.stageMin }); render(); });
    $$('[data-forget]').forEach(b => b.onclick = async () => { await api('POST', '/api/pet/facts', { remove: +b.dataset.forget }); render(); });
    const f = $('#pmAdd'); if (f) f.onsubmit = async ev => { ev.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; await api('POST', '/api/pet/facts', { add: v }); render(); };
    $$('[data-open]').forEach(b => b.onclick = () => api('POST', `/api/pet/tasks/${b.dataset.open}/open`));
    $$('[data-stop]').forEach(b => b.onclick = async () => { await api('POST', `/api/pet/tasks/${b.dataset.stop}/stop`); setTimeout(render, 800); });
    $$('[data-wm]').forEach(b => b.onclick = async () => { await save({ wakeMode: b.dataset.wm }); render(); });
    $$('[data-stt]').forEach(b => b.onclick = async () => { await save({ stt: b.dataset.stt }); render(); });
    const sx = $('#pmSx'); if (sx) sx.onsubmit = async ev => { ev.preventDefault(); const k = $('#pmSxKey').value.trim(); if (!k) return;
      try { await api('POST', '/api/pet/stt', { key: k }); if (typeof toast === 'function') toast('Đã lưu khoá Soniox'); if (NATIVE) NATIVE.postMessage({ cmd: 'settings' }); render(); } catch (e) { if (typeof toast === 'function') toast(e.message); } };
    const sxd = $('#pmSxDel'); if (sxd) sxd.onclick = async () => { await api('POST', '/api/pet/stt', { remove: true }); render(); };
    const c = $('#pmClear'); if (c) c.onclick = async () => { await api('POST', '/api/pet/clear'); if (typeof toast === 'function') toast('Đã xoá lịch sử trò chuyện'); render(); };
    $('#pmTalk').onclick = () => { if (NATIVE) NATIVE.postMessage({ cmd: 'listen' }); else P.openChat(); };
    $('#pmHear').onclick = () => preview(S.voice === 'eleven' ? S.voiceId : '', `Chào anh Hưng! Em là ${S.name || 'Bông'}, mèo cyber của anh nè. Gọi "Bông ơi" là em có mặt liền!`);
    // xem lần lượt các biểu cảm trên ảnh lớn
    $('#pmFaces').onclick = () => { clearInterval(demoT); demoI = 0; const img = $('#pmFace'), lab = document.createElement('div'); lab.className = 'pm-facelab'; img.parentNode.appendChild(lab);
      demoT = setInterval(() => { if (!document.body.contains(img) || demoI >= FACE_DEMO.length) { clearInterval(demoT); lab.remove(); img.src = 'pet/meo-wave.webp'; return; }
        const [f, l] = FACE_DEMO[demoI++]; img.src = `pet/meo-${f === 'think' ? 'base' : f}.webp`; lab.textContent = l; }, 900); };
  }
})();
