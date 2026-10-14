// ---------- linh vật Bông v2: robot AI mặt kính, mắt LED đổi nét mặt, lớn dần theo cấp Karma của Hưng (4 giai đoạn).
// Bấm vào Bông (hoặc ⌘J) mở khung chat: trả lời bằng Claude qua /api/pet/chat (src/pet.js), tự thêm việc / mở trang khi được nhờ.
// Ngoài chat: chào theo buổi, nhắc trước giờ hẹn, mừng khi tick xong việc, nói chuyện phiếm, tự diễn, ngủ khi máy để yên.
// Bọc todoToggle / todoSubmit / todoDel / tdLevelUp của app.js để biết chuyện gì vừa xảy ra; không sửa app.js.
(() => {
  const NAME = 'Bông', KEY = 'hpbflow.pet';
  const store = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* bỏ qua */ } };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const short = (s, n = 42) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const today = () => (typeof tdToday === 'function' ? tdToday() : new Date().toISOString().slice(0, 10));
  const hasState = () => typeof state !== 'undefined' && state;
  // DESK = đang chạy trong cửa sổ pet nổi (desk.html); SET = cài đặt pet lưu trên server (/api/pet/settings)
  const DESK = document.documentElement.classList.contains('desk');
  let SET = { voice: 'eleven', voiceId: '', speed: 1.05, speakAll: false, wake: false, desk: false };

  // ---------- hình: đầu ngọc trai + mặt kính tối + mắt LED; giai đoạn 2 có thân + tay, 3 có vòng lõi + hào quang, 4 hào quang vàng + hạt quay quanh
  const CY = '#6ef3ff';
  // Mèo cyber chibi (Nano Banana, đã tách nền): mỗi nét mặt một ảnh public/pet/meo-<mặt>.webp cùng khung hình, đổi mặt = mờ chéo giữa các ảnh.
  // Giai đoạn lớn lên vẽ bằng CSS trên cùng nhân vật (cỡ người, vầng sáng, hào quang, hạt lấp lánh) để không lệch với bộ nét mặt.
  const FACES = ['normal', 'wave', 'happy', 'love', 'think', 'sleep', 'wow', 'sad'];
  const faceSrc = f => `pet/meo-${f === 'normal' ? 'base' : f}.webp`;
  const FIG = `<div class="p-glow"></div><div class="p-root"><div class="p-aura"></div><div class="p-halo"></div><div class="p-spark"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="p-act"><div class="p-float"><div class="p-dots"><i></i><i></i><i></i></div><div class="p-look">${FACES.map(f => `<img class="p-img" data-f="${f}" src="${faceSrc(f)}" alt="" draggable="false">`).join('')}<div class="p-facebox"><span class="p-mouth"><i></i></span></div></div></div></div></div>`;
  const AVATAR = `<img src="pet/meo-base.webp" alt="">`;
  const ICO = { send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>', x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>', fresh: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    spk: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="m" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>' };

  // ---------- giai đoạn lớn lên theo cấp Karma; public/pet/config.json có thể đặt giai đoạn tối thiểu (stageMin), cùng công thức XP với trang Việc hôm nay
  let cfg = {};
  const STAGES = [null, { n: 'Bé Bông', min: 1 }, { n: 'Bông Trợ lý', min: 2 }, { n: 'Bông Chuyên gia', min: 4 }, { n: 'Bông Huyền thoại', min: 7 }];
  const xpOf = t => ({ 1: 20, 2: 15, 3: 12, 4: 10 })[t.prio || (t.star ? 1 : 4)];
  const xpForLevel = L => { let s = 0; for (let k = 1; k < L; k++) s += 100 + (k - 1) * 50; return s; };
  function karma() {
    const total = live().filter(t => t.done).reduce((s, t) => s + xpOf(t), 0); let L = 1; while (total >= xpForLevel(L + 1)) L++;
    const stage = Math.max(L >= 7 ? 4 : L >= 4 ? 3 : L >= 2 ? 2 : 1, SET.stageMin || cfg.stageMin || 1), next = STAGES[stage + 1];
    const from = xpForLevel(STAGES[stage].min), to = next ? xpForLevel(next.min) : from;
    return { L, total, stage, name: STAGES[stage].n, next, pct: next ? Math.max(0, Math.min(100, (total - from) / (to - from) * 100)) : 100, left: next ? Math.max(0, to - total) : 0 };
  }

  // ---------- dựng
  const el = document.createElement('div'); el.id = 'pet'; el.dataset.face = 'normal'; el.dataset.stage = String(store.stage || 1);
  el.innerHTML = `${FIG}<span class="zz">z</span><span class="zz">z</span><span class="zz">Z</span><button class="pet-hit" title="${NAME}: bấm để trò chuyện (⌘J), kéo để dời chỗ" aria-label="Trò chuyện với ${NAME}"></button>`;
  const bub = document.createElement('div'); bub.className = 'pet-bub'; bub.setAttribute('role', 'status');
  const chat = document.createElement('div'); chat.className = 'pet-chat'; chat.setAttribute('role', 'dialog'); chat.setAttribute('aria-label', 'Trò chuyện với ' + NAME);
  chat.innerHTML = `<div class="pc-head"><div class="pc-av">${AVATAR}</div><div class="pc-t"><b>${NAME}</b><span class="pc-sub"><i class="dot"></i><span class="pc-status">Online</span></span></div>
      <span class="pc-streak zero" title="Chuỗi ngày xong hết việc"><svg viewBox="0 0 24 24"><path d="M12 2c.6 3.2 4.6 5.4 4.6 10.2A4.8 4.8 0 0 1 12 17a4.8 4.8 0 0 1-4.6-4.8c0-2 1-3.4 2-4.4.2 1.4.9 2.4 1.9 2.8C11 8 11 4.8 12 2z" fill="#fff6c2"/><path d="M12 22a6.5 6.5 0 0 1-6.5-6.5c0-1.7.6-3.2 1.5-4.4-.1 3.4 2.3 6 5 6s5.1-2.6 5-6c.9 1.2 1.5 2.7 1.5 4.4A6.5 6.5 0 0 1 12 22z" fill="#fff"/></svg><b>0</b><span class="st">ngày</span></span>
      <button data-k="tts" title="Bông đọc to câu trả lời">${ICO.spk}</button><button data-k="fresh" title="Cuộc trò chuyện mới">${ICO.fresh}</button><button data-k="moon" title="Cho Bông ngủ 1 tiếng">${ICO.moon}</button><button data-k="x" title="Đóng (Esc)">${ICO.x}</button></div>
    <div class="pc-stage"></div><div class="pc-msgs"></div><div class="pc-quick"></div>
    <form class="pc-in"><button type="button" class="pc-mic" title="Nói với ${NAME} (⌥⌘B)">${ICO.mic}<span class="pc-wave"><i></i><i></i><i></i><i></i><i></i></span></button><textarea rows="1" placeholder="Nhắn hoặc bấm mic để nói…"></textarea><button type="submit" class="pc-send" title="Gửi (Enter)" disabled>${ICO.send}</button></form>`;
  document.body.append(el, bub, chat);
  // vị trí kéo thả chỉ áp cho pet trong cửa sổ chính; cửa sổ nổi thì cả cửa sổ di chuyển (vỏ app nhớ vị trí)
  if (store.x != null && !DESK) Object.assign(el.style, { left: store.x + 'px', top: store.y + 'px', right: 'auto', bottom: 'auto' });
  const $c = s => chat.querySelector(s), msgs = $c('.pc-msgs'), ta = $c('textarea'), sendBtn = $c('.pc-send'), micBtn = $c('.pc-mic');

  function reportHits() {
    if (!DESK) return;
    const rs = [el, bub.classList.contains('show') && bub, isOpen() && chat].filter(Boolean).map(n => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    try { window.webkit.messageHandlers.bong.postMessage({ cmd: 'hit', rects: rs }); } catch { /* bỏ qua */ }
  }
  if (DESK) setInterval(reportHits, 250);

  // ---------- nét mặt + động tác
  let faceT, actT = {}, sleeping = false;
  const base = () => (sleeping ? 'sleep' : 'normal');
  function face(f, ms = 2200) { f = { dizzy: 'wow', wink: 'happy', cool: 'happy' }[f] || f; /* chưa có ảnh nháy mắt / kính ngầu */ if (!FACES.includes(f)) f = 'normal'; el.dataset.face = f; clearTimeout(faceT); if (ms) faceT = setTimeout(() => { el.dataset.face = base(); }, ms); }
  function act(cls, ms = 1400) { if (/\bwave\b/.test(cls) && !sleeping) face('wave', ms); cls.split(' ').forEach(c => { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); clearTimeout(actT[c]); actT[c] = setTimeout(() => el.classList.remove(c), ms); }); }
  function fx(chars, n = 3) {
    const r = el.getBoundingClientRect();
    for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.className = 'pet-fx'; s.textContent = pick(chars);
      s.style.left = r.left + r.width / 2 - 9 + (Math.random() * 36 - 18) + 'px'; s.style.top = r.top + 14 + 'px'; s.style.setProperty('--dx', (Math.random() * 26 - 13) + 'px'); s.style.animationDelay = i * .14 + 's';
      document.body.appendChild(s); setTimeout(() => s.remove(), 1600 + i * 140); }
  }
  let talkT; const talk = ms => { el.classList.add('talk'); clearTimeout(talkT); talkT = setTimeout(() => el.classList.remove('talk'), ms); };

  // ---------- dữ liệu việc + bối cảnh gửi cho não AI
  let todos = [], bond = 0;
  async function loadTodos() { try { todos = await api('GET', '/api/todos'); } catch { /* server chưa lên */ } return todos; }
  const live = () => (hasState() && Array.isArray(state.todos) && state.todos.length ? state.todos : todos);
  function info() {
    const k = today(), all = live(), items = all.filter(t => t.date === k), open = items.filter(t => !t.done);
    open.sort((a, b) => ((a.prio || 4) - (b.prio || 4)) || ((a.remind || '99') < (b.remind || '99') ? -1 : 1));
    const over = all.filter(t => !t.done && t.date < k);
    let streak = 0; try { streak = typeof tdStreak === 'function' && hasState() && state.todos ? tdStreak() : 0; } catch { /* chưa nạp */ }
    return { items, open, over, next: open[0], streak };
  }
  let flows = [], recentRuns = [];
  const agoTxt = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'vừa xong' : m < 60 ? m + ' phút trước' : Math.round(m / 60) + ' giờ trước'; };
  async function loadMeta() {
    try { flows = (hasState() && state.flows?.length ? state.flows : await api('GET', '/api/flows')).map(f => ({ id: f.id, name: f.name })); } catch { /* bỏ qua */ }
    try { recentRuns = (await api('GET', '/api/runs?limit=8')).map(r => ({ id: r.id, flow_id: r.flow_id, name: r.name, status: r.status, started: r.started })); } catch { /* bỏ qua */ }
  }
  function ctx(voice) {
    const { items, over, streak } = info(), k = karma(), lt = typeof LEVEL_TITLES !== 'undefined' ? (LEVEL_TITLES.filter(([l]) => k.L >= l).pop() || [])[1] : '';
    return { page: (location.hash.split('/')[1] || 'overview'), todos: items.map(t => ({ text: t.text, done: !!t.done, remind: t.remind || '', prio: t.prio || 4 })),
      overdue: over.length, level: k.L, levelTitle: lt, streak, runs: document.getElementById('footSub')?.textContent || '', stage: k.stage, stageName: k.name,
      flows, recentRuns: recentRuns.map(r => ({ name: r.name, status: r.status, ago: agoTxt(r.started) })), voice: !!voice };
  }
  const goTodo = () => nav('#/todo');
  const syncTodoPage = () => { try { if (location.hash.startsWith('#/todo') && typeof todoDraw === 'function') todoDraw(); if (typeof todoBadge === 'function') todoBadge(); } catch { /* bỏ qua */ } };

  // ---------- bong bóng nói nhanh (bấm vào thì mở chat)
  let bubT, lastSay = 0;
  const away = () => store.awayUntil && Date.now() < store.awayUntil;
  const isOpen = () => chat.classList.contains('show');
  function placeNear(box, gap = 10) {
    const r = el.getBoundingClientRect(), left = r.left + r.width / 2 < innerWidth / 2, bw = box.offsetWidth, bh = box.offsetHeight;
    box.classList.toggle('left', left);
    let x = left ? r.left + 8 : r.right - bw - 8, y = r.top - bh - gap + (el.classList.contains('away') ? 100 : 0);
    if (y < 10) { y = Math.max(10, Math.min(innerHeight - bh - 10, r.bottom - bh)); x = left ? r.right + gap : r.left - bw - gap; }
    box.style.left = Math.max(10, Math.min(innerWidth - bw - 10, x)) + 'px'; box.style.top = Math.max(10, y) + 'px';
  }
  function say(html, o = {}) {
    if ((away() && !o.force) || isOpen() || !VISIBLE() || (liveOn && !o.live)) return false;   // đang có lượt nói bằng giọng thì không chen lời khác
    if (sleeping) wake(true);
    el.classList.remove('away');
    const acts = o.acts || [], k = karma();
    bub.dataset.state = ''; bub.innerHTML = `<div class="pb-head"><img class="pb-av" src="pet/meo-base.webp" alt=""><span class="pb-n">${NAME}</span><span class="pb-st">${k.name}</span><span class="pb-live"><i></i><i></i><i></i><b></b></span></div><button class="pb-x" title="Đóng">×</button><div class="pb-body">${html}</div>${acts.length ? `<div class="pb-acts">${acts.map(([t, , p], i) => `<button data-i="${i}" class="${p ? 'pri' : ''}">${escH(t)}</button>`).join('')}</div>` : ''}`;
    bub.querySelector('.pb-x').onclick = e => { e.stopPropagation(); hush(); };
    bub.querySelectorAll('.pb-acts button').forEach(b => b.onclick = e => { e.stopPropagation(); hush(); acts[+b.dataset.i][1](); });
    bub.onclick = () => { hush(); openChat(); };
    placeNear(bub); bub.classList.add('show'); lastSay = Date.now(); reportHits(); talk(Math.min(2400, 600 + html.length * 14));
    if (o.face) face(o.face, o.faceMs || 2400); if (o.act) act(o.act, o.actMs);
    if (o.note) api('POST', '/api/pet/note', { text: html.replace(/<[^>]+>/g, '') }).catch(() => {});
    // nói thành tiếng cả lời tự nói (chào, mừng, nhắc, chuyện phiếm) khi bật "đọc to mọi câu" — trừ lúc đang nghe anh / đang nghĩ
    if (SET.speakAll && !o.live && !o.quiet && !listening && !busy) speak(html.replace(/<[^>]+>/g, ' '), { follow: false, mood: o.face });
    clearTimeout(bubT); bubT = setTimeout(hush, o.ms || Math.min(14000, 5000 + html.length * 45));
    return true;
  }
  // bong bóng "sống" cho lượt nói bằng giọng khi khung chat đang đóng: cập nhật chữ liên tục, không tự ẩn cho tới khi xong
  const MIC = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  const LIVE = { listen: 'Đang nghe', think: 'Đang nghĩ', speak: 'Đang trả lời' };
  function vb(state, you, reply) {
    return `<div class="vb" data-s="${state}">`
      + (you || state === 'listen' ? `<div class="vb-you"><span class="vb-mic">${MIC}</span><span class="vb-said">${you ? escH(you) : '<em>Em đang nghe anh nói…</em>'}</span></div>` : '')
      + (reply ? `<div class="vb-reply">${reply}${state === 'speak' ? '<span class="vb-caret"></span>' : ''}</div>`
        : state === 'think' ? '<div class="vb-think"><i></i><i></i><i></i></div>' : '')
      + '</div>';
  }
  let liveOn = false;
  function liveBub(html, done) {
    if (!VISIBLE()) return;
    if (!liveOn || !bub.classList.contains('show')) { liveOn = false; say(html, { force: true, live: true, ms: 120000 }); liveOn = true; }
    else { bub.querySelector('.pb-body').innerHTML = html; placeNear(bub); reportHits(); }
    const st = (String(html).match(/data-s="(\w+)"/) || [])[1] || ''; bub.dataset.state = done ? '' : st; const lv = bub.querySelector('.pb-live b'); if (lv) lv.textContent = LIVE[st] || '';
    if (done) { liveOn = false; clearTimeout(bubT); bubT = setTimeout(hush, Math.min(15000, 4000 + String(html).length * 55)); }
  }
  function hush() { liveOn = false; bub.classList.remove('show'); clearTimeout(bubT); if (away()) el.classList.add('away'); reportHits(); }
  bub.addEventListener('mouseenter', () => clearTimeout(bubT));
  bub.addEventListener('mouseleave', () => { bubT = setTimeout(hush, 2500); });

  // ---------- khung chat
  let loaded = false, busy = false;
  const md = s => { const lines = escH(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n'); let h = '', ul = false;
    for (const l of lines) { const m = l.match(/^\s*[-•*]\s+(.*)/); if (m) { if (!ul) { h += '<ul>'; ul = true; } h += `<li>${m[1]}</li>`; } else { if (ul) { h += '</ul>'; ul = false; } if (l.trim()) h += `<p>${l}</p>`; } }
    return h + (ul ? '</ul>' : ''); };
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
  function addMsg(role, text, cls = '') { const d = document.createElement('div'); d.className = `pc-m ${role} ${cls}`; d.innerHTML = role === 'user' ? escH(text).replace(/\n/g, '<br>') : md(text); msgs.appendChild(d); scroll(); return d; }
  function addChip(html, undo) { const d = document.createElement('div'); d.className = 'pc-act'; d.innerHTML = html + (undo ? ' <button>Hoàn tác</button>' : ''); if (undo) d.querySelector('button').onclick = async () => { await undo(); d.classList.add('undone'); d.querySelector('button').remove(); }; msgs.appendChild(d); scroll(); }
  function stageBar() { const k = karma(); $c('.pc-stage').innerHTML = `<div class="row1"><span><b>${k.name}</b> · ${k.stage}/4 · <span class="en" title="Năng lượng: xong việc thì tăng, bỏ bê lâu thì giảm">⚡ ${energy()}%</span></span><span>${k.next ? `còn ${k.left} XP → ${k.next.n.replace('Bông ', '')}` : 'đã tiến hoá tối đa'}</span></div><div class="bar"><i style="width:${k.pct}%"></i></div>`; }
  const setBond = n => { bond = n; };
  // chuỗi ngày xong hết việc (tính như trang Việc hôm nay, đọc từ danh sách việc Bông tự tải nên trang nào cũng có)
  function streaks() {
    const all = live(), full = k => { const a = all.filter(t => t.date === k); return a.length > 0 && a.every(t => t.done); };
    const shift = (k, n) => { const [y, m, d] = k.split('-').map(Number), x = new Date(y, m - 1, d + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    let k = full(today()) ? today() : shift(today(), -1), cur = 0; while (full(k)) { cur++; k = shift(k, -1); }
    let best = 0, run = 0, prev = null; for (const d of [...new Set(all.map(t => t.date))].sort()) { if (full(d)) { run = prev && shift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); } else run = 0; prev = d; }
    return { cur, best, todayDone: full(today()) };
  }
  function streakBadge() {
    const { cur, best, todayDone } = streaks(), b = $c('.pc-streak');
    b.classList.toggle('zero', !cur); b.classList.toggle('hot', cur >= 3);
    b.querySelector('b').textContent = cur; b.querySelector('.st').textContent = cur ? 'ngày' : 'bắt đầu chuỗi';
    b.title = cur ? `Chuỗi ${cur} ngày xong hết việc · kỷ lục ${best}${todayDone ? ' · hôm nay đã giữ chuỗi' : ' · xong hết việc hôm nay để lên ' + (cur + 1)}` : 'Xong hết việc hôm nay để bắt đầu chuỗi';
  }
  const QUICK = [['Hôm nay làm gì trước?'], ['Nhắc anh…', 'Nhắc anh '], ['Tóm tắt ngày của anh'], ['Gợi ý ý tưởng video'], ['Động viên anh chút'], ['Kể chuyện vui đi'], ['Bông làm được gì?', null, 'help']];
  function quick() { const q = $c('.pc-quick'); q.innerHTML = QUICK.map(([t], i) => `<button data-i="${i}">${escH(t)}</button>`).join('');
    q.querySelectorAll('button').forEach(b => b.onclick = () => { const [t, fill, local] = QUICK[+b.dataset.i];
      if (local === 'help') { addMsg('user', t); addMsg('pet', `Em làm được mấy việc này nè:\n- Trò chuyện, góp ý, động viên anh (em dùng Claude làm não)\n- **Ghi việc + nhắc giờ**: "nhắc anh 3h chiều gọi khách"\n- **Mở trang**: "mở tin tức AI"\n- **Nhớ điều anh dặn**: "nhớ là anh thích làm việc buổi sáng"\n- Nhắc trước giờ hẹn 10 phút, mừng khi anh xong việc\nAnh càng xong nhiều việc em càng lớn, có 4 giai đoạn lận.`); face('wink'); return; }
      if (fill) { ta.value = fill; ta.focus(); autosize(); sendBtn.disabled = false; return; } send(t); }); }
  async function openChat(byVoice) {
    if (sleeping) wake(true); hush(); el.classList.remove('away');
    if (away()) { store.awayUntil = 0; save(); }
    api('POST', '/api/pet/warm').catch(() => {}); loadMeta();
    stageBar(); streakBadge(); if (!loaded) { loaded = true; quick();
      try { const s = await api('GET', '/api/pet/state'); setBond(s.bond || 0);
        if (s.history?.length) s.history.slice(-24).forEach(h => addMsg(h.role === 'user' ? 'user' : 'pet', h.text));
        else hello(); } catch { hello(); } }
    chatSize(); placeNear(chat, 12); chat.classList.add('show'); reportHits();
    if (!byVoice) { face('happy', 1500); act('wave', 1600); if (DESK) try { window.webkit.messageHandlers.bong.postMessage({ cmd: 'focus' }); } catch { /* bỏ qua */ } setTimeout(() => ta.focus(), 60); }
    scroll();
  }
  function hello() { const k = karma(); msgs.insertAdjacentHTML('beforeend', `<div class="pc-hello"><b>Chào anh Hưng 👋</b>Em là ${NAME} nè. Hỏi gì cũng được, nhờ ghi việc, nhắc giờ cũng ok luôn ✨</div>`); }
  function closeChat() { chat.classList.remove('show'); ta.blur(); reportHits(); }
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => { autosize(); sendBtn.disabled = !ta.value.trim() || busy; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(ta.value); } if (e.key === 'Escape') closeChat(); });
  $c('.pc-in').addEventListener('submit', e => { e.preventDefault(); send(ta.value); });
  chat.querySelector('[data-k="x"]').onclick = closeChat;
  chat.querySelector('[data-k="moon"]').onclick = () => { closeChat(); snooze(); };
  chat.querySelector('[data-k="fresh"]').onclick = async () => { await api('POST', '/api/pet/clear').catch(() => {}); msgs.innerHTML = ''; hello(); face('happy'); };
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); isOpen() ? closeChat() : openChat(); } });
  document.addEventListener('mousedown', e => { if (isOpen() && !chat.contains(e.target) && !el.contains(e.target)) closeChat(); });
  // cửa sổ nổi chỉ cao 640px: khung chat nằm gọn phía trên mèo
  const chatSize = () => { chat.style.height = (DESK ? Math.max(300, el.getBoundingClientRect().top - 22) : Math.min(560, innerHeight - 40)) + 'px'; };
  addEventListener('resize', () => { if (isOpen()) { chatSize(); placeNear(chat, 12); } });

  // gửi tin: nhận chữ chảy dần từ /api/pet/chat-stream (SSE). voice = tin đến từ giọng nói → đọc to câu trả lời
  let curCtrl = null;
  let lastAsk = '';   // câu anh vừa nói/gõ — để kiểm tra các lệnh nhạy cảm như tắt nghe
  const askedStopListen = () => /(tắt|ngừng|thôi|đừng)\s*(nghe|micro|mic|lắng nghe)|tắt luôn nghe|không nghe nữa/i.test(lastAsk);
  async function send(raw, voice = false) {
    const text = String(raw || '').trim(); if (!text) return;
    if (busy) { if (!voice) return; curCtrl?.abort(); hushVoice(true); await new Promise(r => setTimeout(r, 30)); }   // nói câu mới khi Bông đang nghĩ/nói → bỏ câu cũ
    const inBub = voice && !isOpen();   // nói bằng giọng, khung chat đóng → trả lời trong bong bóng, không mở khung chat
    lastAsk = text;
    if (localCmd(text, voice)) return;
    if (inBub) liveBub(vb('think', text, ''));
    busy = true; ta.value = ''; autosize(); sendBtn.disabled = true; addMsg('user', text); hushVoice();
    const typing = document.createElement('div'); typing.className = 'pc-typing'; typing.innerHTML = '<i></i><i></i><i></i>'; msgs.appendChild(typing); scroll();
    chat.classList.add('busy'); $c('.pc-status').textContent = 'Đang nghĩ…'; face('think', 0);
    let d = null, got = '', r = null;
    try {
      const ctrl = curCtrl = new AbortController(), talkOut = voice || SET.speakAll; let said = 0;
      if (talkOut) { hushVoice(true); qFollow = voice; qOpen = true; saying = ''; }
      logV(`gửi AI (${voice ? 'giọng' : 'gõ'}): ${text}`);
      const res = await fetch('/api/pet/chat-stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text, ctx: ctx(voice) }), signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).replace(/^data: ?/, ''); buf = buf.slice(i + 2); if (!line) continue;
          let o; try { o = JSON.parse(line); } catch { continue; }
          if (o.d) { if (!d) { typing.remove(); d = addMsg('pet', ''); face('normal', 0); el.classList.add('talk'); } got += o.d; d.textContent = got; scroll(); if (inBub) liveBub(vb('speak', text, escH(got)));
            // đọc ngay từng câu đã trọn (kết thúc bằng . ! ? … hoặc xuống dòng), câu quá ngắn thì gộp với câu sau
            if (talkOut) { const rest = got.slice(said), m = rest.match(/^[\s\S]*?[.!?…\n](?=\s|$)/); if (m && (m[0].trim().length >= 18 || (!said && m[0].trim().length >= 4))) { said += m[0].length; enqueue(m[0]); } } }
          else if (o.error) throw new Error(o.error);
          else if (o.done) r = o;
        }
      }
      if (!r) throw new Error('mất kết nối giữa chừng');
      logV(`AI trả lời: ${r.reply.slice(0, 90)} | hành động: ${JSON.stringify(r.actions || []).slice(0, 120)}`);
      typing.remove(); if (!d) d = addMsg('pet', ''); d.innerHTML = md(r.reply); el.classList.remove('talk'); scroll();
      if (inBub) liveBub(vb('done', text, md(r.reply)), true);
      if (talkOut) lipMood = r.mood || 'happy'; else face(r.mood || 'happy', 3200); if (r.mood === 'love') fx(['💜', '💗'], 2); if (r.mood === 'wow') act('jump', 1300);
      if (typeof r.bond === 'number') setBond(r.bond);
      if (talkOut) { const tail = r.reply.slice(Math.min(said, r.reply.length)); if (tail.trim()) enqueue(tail, r.mood); endTurn(voice); }
      for (const a of r.actions || []) { if (inBub && ['run_flow', 'task'].includes(a.type) && !isOpen()) { hush(); await openChat(true); } await doAction(a); }
      for (const f of r.remembered || []) addChip(`💜 Em sẽ nhớ: ${escH(f)}`);
    } catch (e) { logV(`lỗi gửi AI: ${e.name} ${e.message}`); if (e.name === 'AbortError') { typing.remove(); el.classList.remove('talk'); busy = false; chat.classList.remove('busy'); return; }   // bị ngắt lời: lượt mới (nếu có) tự đặt lại trạng thái
      typing.remove(); el.classList.remove('talk'); addMsg('pet', `Ơ, não em vừa đứng hình: ${e.message}. Anh thử lại giúp em nha.`, 'err'); face('sad', 3000); if (inBub) liveBub(vb('done', text, `Ơ, não em vừa đứng hình: ${escH(e.message)}`), true); }
    busy = false; chat.classList.remove('busy'); $c('.pc-status').textContent = 'Online'; sendBtn.disabled = !ta.value.trim(); if (isOpen() && !listening) ta.focus();
  }
  // lệnh làm ngay tại chỗ, không cần hỏi AI
  const PAGE_WORDS = [[/linh vật|pet|quản lý (bông|pet)|cài đặt bông/, 'pet'], [/việc hôm nay|to ?do|công việc/, 'todo'], [/bảng điều khiển|tổng quan|dashboard|trang chủ/, 'overview'], [/quy trình|workflow|flow/, 'flows'], [/lịch sử|lượt chạy/, 'runs'],
    [/tin (tức )?ai|tin ai/, 'ainews'], [/nhóm (facebook|fb)/, 'fbgroups'], [/radar/, 'reports'], [/bài đăng/, 'posts'], [/nghiên cứu/, 'research'], [/cài đặt|setting/, 'settings']];
  function localCmd(text, voice) {
    const t = text.toLowerCase().normalize('NFC').replace(/[.!?]+$/, '');
    if (/^(im|thôi|dừng|stop|ngừng)( (lại|nói|đi|nha|đọc))*$/.test(t)) { hushVoice(); addMsg('user', text); addMsg('pet', 'Dạ em im nè 🤐'); face('wink', 1500); return true; }
    const reply = (msg, f = 'happy') => { addMsg('user', text); addMsg('pet', msg); face(f, 1800); if (voice && !isOpen()) liveBub(vb('done', text, escH(msg)), true); if (voice || SET.speakAll) speak(msg, { follow: false }); return true; };
    // xác nhận bằng giọng cho nút đang chờ duyệt (chạy quy trình, giao việc): "ok làm đi" / "huỷ"
    const pend = [...msgs.querySelectorAll('.pc-confirm:not(.done)')].pop();
    if (pend && /^(ok|oke|okay|ô kê|được|đồng ý|làm đi|chạy đi|giao đi|triển|triển khai|có|ừ|uh|ừ làm đi)( (đi|luôn|nha|em|làm đi|luôn đi))*$/.test(t)) { pend.querySelector('.go')?.click(); return reply('Dạ, em làm luôn nè!', 'happy'); }
    if (pend && /^(huỷ|hủy|thôi|khỏi|không|đừng)( (đi|nha|em|làm|nữa))*$/.test(t)) { pend.querySelector('.no')?.click(); return reply('Ok, em huỷ rồi.', 'wink'); }
    if (/(tắt|đóng|thu|ẩn|cất|dẹp)\s*(cái\s*)?(hộp thoại|khung chat|khung trò chuyện|cửa sổ chat|chat|tin nhắn|hộp chat)/.test(t)) { closeChat(); hush(); return reply('Dạ, em cất khung chat rồi nè.'); }
    if (/(mở|bật|hiện)\s*(cái\s*)?(hộp thoại|khung chat|khung trò chuyện|cửa sổ chat|hộp chat)/.test(t)) { openChat(); return reply('Đây nè anh.'); }
    if (/^(đi\s*)?ngủ( đi| nha| thôi)*$|^(bông\s*)?(đi ngủ|ngủ đi)/.test(t)) { closeChat(); setTimeout(snooze, 1800); return reply('Dạ, em đi ngủ một tiếng nha. Cần thì gọi em.', 'sleep'); }
    if (/(đừng|thôi|khỏi)\s*đọc|tắt (giọng|tiếng|đọc to)/.test(t)) { api('POST', '/api/pet/settings', { speakAll: false }).then(x => { SET = x; ttsUi(); }); hushVoice(); return reply('Ok, em chỉ đọc khi anh nói bằng giọng thôi.'); }
    if (/(bật|luôn) đọc( to)?|đọc to (hết|mọi)/.test(t)) { api('POST', '/api/pet/settings', { speakAll: true }).then(x => { SET = x; ttsUi(); }); return reply('Dạ, từ giờ câu nào em cũng đọc to nha.'); }
    const tm = t.match(/(tập trung|hẹn giờ|đếm ngược|pomodoro|bấm giờ|đặt giờ)\D{0,12}(\d{1,3})?\s*(phút|p\b)?/);
    if (tm && !/(tắt|dừng|huỷ|hủy|bỏ)/.test(t)) { const msg = timerStart(tm[2] || 25, /tập trung|pomodoro/.test(tm[1]) || !tm[2] ? 'Tập trung' : 'Hẹn giờ'); act('jump', 900); return reply(msg, 'cool'); }
    if (/(tắt|dừng|huỷ|hủy|bỏ) (hẹn giờ|đếm ngược|bấm giờ|pomodoro)/.test(t)) { timerStop(true); return reply('Tắt hẹn giờ rồi nha.'); }
    if (/^(bây giờ |giờ )?(là )?mấy giờ( rồi)?( em)?$/.test(t)) { const d = new Date(); return reply(`Giờ là ${d.getHours()} giờ ${d.getMinutes()} phút nè anh.`); }
    const m = t.match(/^(mở|vào|qua|chuyển (sang|qua|tới)|đi tới|xem)\s+(trang |tab |mục )?(.+)$/);
    if (m) { const hit = PAGE_WORDS.find(([re]) => re.test(m[4])); if (hit) { nav('#/' + hit[1]); return reply(`Mở ${PAGES[hit[1]]} rồi nè!`); } }
    return false;
  }
  const PAGES = { pet: 'Quản lý Bông', todo: 'Việc hôm nay', overview: 'Bảng điều khiển', flows: 'Quy trình tự động', runs: 'Lịch sử chạy', ainews: 'Tin tức AI', fbgroups: 'Nhóm Facebook', posts: 'Bài đăng', research: 'Nghiên cứu nội dung', settings: 'Cài đặt', reports: 'Radar Facebook' };
  async function doAction(a) {
    if (a.type === 'add_todo' && a.text) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : today(), remind = /^\d{1,2}:\d{2}$/.test(a.remind || '') ? a.remind.padStart(5, '0') : '';
      try { const t = await api('POST', '/api/todos', { date, text: String(a.text).slice(0, 300), prio: [1, 2, 3, 4].includes(+a.prio) ? +a.prio : 4, remind });
        todos.push(t); if (hasState() && Array.isArray(state.todos) && state.todos !== todos) state.todos.push(t); syncTodoPage(); act('jump', 1300); fx(['✨', '✅'], 2);
        addChip(`✓ Đã thêm việc: <b>${escH(short(t.text, 50))}</b>${date !== today() ? ' · ' + date.split('-').reverse().slice(0, 2).join('/') : ''}${remind ? ' · nhắc ' + remind : ''}`, async () => {
          await api('DELETE', '/api/todos/' + t.id).catch(() => {}); todos = todos.filter(x => x.id !== t.id); if (hasState() && Array.isArray(state.todos)) state.todos = state.todos.filter(x => x.id !== t.id); syncTodoPage(); });
      } catch (e) { addChip(`Không thêm được việc: ${escH(e.message)}`); }
    } else if (a.type === 'nav' && PAGES[a.page]) { nav('#/' + a.page); addChip(`→ Đã mở ${PAGES[a.page]}`); }
    else if (a.type === 'ui') {
      const d = a.do;
      if (d === 'close_chat') { setTimeout(() => { closeChat(); }, 1200); }
      else if (d === 'open_chat') openChat();
      else if (d === 'sleep') { setTimeout(() => { closeChat(); snooze(); }, 1500); }
      else if (d === 'wake' && away()) { store.awayUntil = 0; save(); el.classList.remove('away'); }
      else if (d === 'hide') { setTimeout(async () => { SET = await api('POST', '/api/pet/settings', { desk: false }); if (NATIVE) native('settings'); }, 1800); }
      else if (d === 'show') { SET = await api('POST', '/api/pet/settings', { desk: true }); if (NATIVE) native('settings'); }
      else if (d === 'mute') hushVoice();
      else if (d === 'stop_listening' && askedStopListen()) { SET = await api('POST', '/api/pet/settings', { wake: false }); if (NATIVE) native('settings'); }
    }
    else if (a.type === 'setting' && a.key) {
      const ok = { speakAll: 'boolean', wake: 'boolean', voiceId: 'string', speed: 'number' }[a.key];
      if (a.key === 'wake' && a.value === false && !askedStopListen()) return;   // không tự tắt "luôn nghe" nếu anh không nói rõ
      if (ok && typeof a.value === ok) { SET = await api('POST', '/api/pet/settings', { [a.key]: a.value }).catch(() => SET); ttsUi(); if (NATIVE) native('settings'); addChip(`⚙️ Đã đổi cài đặt: ${escH(a.key)}`); }
    }
    else if (a.type === 'mac' && a.do) {
      try { const r = await api('POST', '/api/pet/mac', { do: a.do, arg: a.arg });
        addChip(`💻 ${escH({ open_app: 'Đã mở ' + (a.arg || ''), open_path: 'Đã mở ' + short(a.arg || '', 40), volume: 'Âm lượng ' + a.arg + '%', mute: 'Đã tắt tiếng', unmute: 'Đã bật tiếng', screenshot: 'Đã chụp màn hình ra Desktop' }[a.do] || a.do)}`);
        if (r.file) addChip(`📸 ${escH(r.file.replace(/^.*\/Desktop\//, 'Desktop/'))}`);
      } catch (e) { addChip(`Không làm được: ${escH(e.message)}`); }
    }
    else if (a.type === 'task_more' && a.id && a.prompt) {
      try { await api('POST', `/api/pet/tasks/${a.id}/continue`, { prompt: a.prompt }); tasksKnown.set(a.id, 'running'); addChip('🔁 Claude đang làm tiếp việc đó, xong em báo.'); }
      catch (e) { addChip(`Không làm tiếp được: ${escH(e.message)}`); }
    }
    else if (a.type === 'open_url' && /^https?:\/\//.test(a.url || '')) { await api('POST', '/api/pet/open-url', { url: a.url }).catch(() => {}); addChip(`🌐 Đã mở ${escH(short(a.url, 50))}`); }
    else if (a.type === 'timer' && +a.minutes) { timerStart(a.minutes, a.label || 'Tập trung'); addChip(`⏱ Đã hẹn ${Math.round(+a.minutes)} phút`, async () => timerStop(true)); }
    else if (a.type === 'task' && a.title && a.prompt) {
      const d = document.createElement('div'); d.className = 'pc-confirm';
      d.innerHTML = `<span>Giao cho <b>Claude chạy nền</b>: <b>${escH(a.title)}</b>?</span><button class="go">Giao việc</button><button class="see">Xem đề bài</button><button class="no">Huỷ</button><small class="pc-hint">Hoặc nói "ok làm đi" / "huỷ"</small>`;
      d.querySelector('.see').onclick = () => addMsg('pet', a.prompt);
      d.querySelector('.no').onclick = () => { d.innerHTML = '<span>Đã huỷ.</span>'; d.classList.add('done'); };
      d.querySelector('.go').onclick = async () => {
        try { const t = await api('POST', '/api/pet/tasks', { title: a.title, prompt: a.prompt }); tasksKnown.set(t.id, 'running');
          d.innerHTML = `<span>🚀 Đã giao: <b>${escH(a.title)}</b>. Claude đang làm, xong em báo anh nha.</span>`; d.classList.add('done'); act('jump', 1200); fx(['🚀', '✨'], 3);
        } catch (e) { d.innerHTML = `<span>Không giao được: ${escH(e.message)}</span>`; }
      };
      msgs.appendChild(d); scroll();
    }
    else if (a.type === 'complete_todo' && a.text) {
      const norm = x => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const q = norm(a.text), cand = info().open, t = cand.find(x => norm(x.text) === q) || cand.find(x => norm(x.text).includes(q) || q.includes(norm(x.text)))
        || cand.map(x => ({ x, n: q.split(' ').filter(w => w.length > 1 && norm(x.text).includes(w)).length })).sort((u, v) => v.n - u.n).find(o => o.n >= 2)?.x;
      if (!t) return addChip(`Em chưa tìm thấy việc "${escH(short(a.text, 40))}" trong hôm nay`);
      if (hasState() && state.todos?.some(x => x.id === t.id) && typeof todoToggle === 'function') todoToggle(t.id);
      else { await api('PATCH', '/api/todos/' + t.id, { done: true }).catch(() => {}); t.done = true; t.doneAt = Date.now(); syncTodoPage(); }
      fx(['✅', '✨'], 3); addChip(`✓ Xong việc: <b>${escH(short(t.text, 50))}</b>`, async () => { await api('PATCH', '/api/todos/' + t.id, { done: false }).catch(() => {}); t.done = false; syncTodoPage(); });
    } else if (a.type === 'run_flow' && (a.id || a.name)) {
      const f = flows.find(x => x.id === a.id) || flows.find(x => x.name === a.name);
      if (!f) return addChip(`Không thấy quy trình "${escH(a.name || a.id)}"`);
      const d = document.createElement('div'); d.className = 'pc-confirm';
      d.innerHTML = `<span>Chạy quy trình <b>${escH(f.name)}</b>?</span><button class="go">Chạy ngay</button><button class="no">Huỷ</button><small class="pc-hint">Hoặc nói "ok làm đi" / "huỷ"</small>`;
      d.querySelector('.no').onclick = () => { d.innerHTML = '<span>Đã huỷ.</span>'; d.classList.add('done'); };
      d.querySelector('.go').onclick = async () => {
        d.innerHTML = '<span>Đang chạy…</span>'; d.classList.add('done');
        try {
          const last = recentRuns.find(r => r.flow_id === f.id), prev = last ? await api('GET', '/api/runs/' + last.id).catch(() => null) : null;
          const run = await api('POST', '/api/run', { flow: f.id, vars: prev?.vars || {}, profile: prev?.profile, source: 'canvas' });
          d.innerHTML = `<span>▶ Đã chạy <b>${escH(f.name)}</b>${prev ? ' (như lần trước)' : ''}.</span> <button class="go">Xem</button>`; d.querySelector('.go').onclick = () => nav('#/run/' + run.id);
          act('jump', 1300); fx(['🚀'], 2);
        } catch (e) { d.innerHTML = `<span>Không chạy được: ${escH(e.message)}</span>`; }
      };
      msgs.appendChild(d); scroll();
    }
  }
  const snooze = () => { store.awayUntil = Date.now() + 3600e3; save(); hush(); face('sleep', 0); el.classList.add('away'); fx(['💤'], 1); };

  // ---------- giọng nói
  // Nghe: trong app Mac do vỏ app lo (mac/main.swift: nhận dạng tiếng Việt trên máy, luôn nghe "Bông ơi"), ngoài trình duyệt dùng Web Speech.
  // Nói: giọng ElevenLabs qua /api/pet/tts (server giữ khoá, có bộ đệm), mèo nhún theo âm lượng; không được thì dùng giọng máy.
  const NATIVE = window.webkit?.messageHandlers?.bong;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = false, webRec = null, partial = '', followMode = false;
  const native = (cmd, extra = {}) => { try { NATIVE.postMessage({ cmd, ...(typeof extra === 'string' ? { text: extra } : extra) }); } catch { /* bỏ qua */ } };
  const clean = t => String(t).replace(/\*\*/g, '').replace(/^[-•]\s*/gm, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  // chuẩn hoá chữ cho giọng đọc: số tiền, giờ, phần trăm, ký hiệu → cách nói tự nhiên
  const spoken = t => clean(t)
    .replace(/(\d+(?:[.,]\d+)?)\s?tr\b/gi, '$1 triệu').replace(/(\d+(?:[.,]\d+)?)\s?k\b/gi, '$1 nghìn').replace(/(\d[\d.]*)\s?(đ|vnđ|vnd)(?=[\s.,!?;:)]|$)/gi, '$1 đồng').replace(/\+(\d)/g, 'thêm $1')
    .replace(/\b(\d{1,2}):00\b/g, '$1 giờ').replace(/\b(\d{1,2}):(\d{2})\b/g, '$1 giờ $2').replace(/(\d)\s?%/g, '$1 phần trăm')
    .replace(/(ngày\s+)?\b(\d{1,2})\/(\d{1,2})\b/g, 'ngày $2 tháng $3').replace(/\s*[→>]\s*/g, ', rồi ').replace(/&/g, ' và ').replace(/[#*_`~|]/g, '')
    .replace(/\bXP\b/g, 'điểm').replace(/\bAI\b/g, 'ây ai').replace(/\bOK\b/gi, 'ô kê');
  const audio = new Audio(); audio.preload = 'auto';
  let actx = null, analyser = null, ampRaf = 0;
  function meter() {   // mèo nhún theo âm lượng giọng đang phát
    try { if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); const src = actx.createMediaElementSource(audio); analyser = actx.createAnalyser(); analyser.fftSize = 256; src.connect(analyser); analyser.connect(actx.destination); }
      actx.resume?.(); } catch { return; }
    const data = new Uint8Array(analyser.frequencyBinCount), flo = el.querySelector('.p-float');
    cancelAnimationFrame(ampRaf);
    const step = () => { analyser.getByteTimeDomainData(data); let m = 0; for (const v of data) m = Math.max(m, Math.abs(v - 128)); const a = Math.min(1, m / 60);
      flo.style.setProperty('--amp', a.toFixed(3)); if (!audio.paused) ampRaf = requestAnimationFrame(step); else flo.style.setProperty('--amp', 0); };
    step();
  }
  // hàng đợi giọng: mỗi câu một file âm thanh, tải trước câu sau trong lúc đang đọc câu trước → câu đầu cất lên sớm, các câu nối liền
  let speakSeq = 0, queue = [], playing = null, qFollow = true, qOpen = false;
  const ttsUrl = (t, mood) => `/api/pet/tts?text=${encodeURIComponent(t)}&voice=${encodeURIComponent(SET.voiceId || '')}&speed=${SET.speed || 1}&mood=${encodeURIComponent(mood || el.dataset.face || '')}`;
  // trong app Mac: gửi từng câu cho vỏ app phát (có khử tiếng vọng → anh nói chen được); ngoài trình duyệt: phát bằng <audio>
  let NATIVE_PLAY = !!NATIVE, watchT = 0, watchList = [];
  // chống tự nghe chính mình: nhớ chữ Bông đã nói trong 30 giây gần nhất; câu nghe được trùng phần lớn với đó là tiếng vọng
  let recentSaid = [], heardHits = 0, heardLen = 0, spokeEnd = 0, turnFrom = '';
  const words = s => String(s).toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(x => x.length > 1);
  function echoRatio(ws) {
    recentSaid = recentSaid.filter(([t]) => Date.now() - t < 30e3);
    const said = new Set(recentSaid.flatMap(([, w]) => w)); if (!said.size || !ws.length) return 0;
    return ws.filter(x => said.has(x)).length / ws.length;
  }
  const isEcho = s => {
    const ws = words(s), r = echoRatio(ws); if (!ws.length) return false;
    if (ws.length >= 3) return r >= 0.5;
    const last = Math.max(spokeEnd, recentSaid.length ? recentSaid[recentSaid.length - 1][0] : 0);   // câu cực ngắn: chỉ coi là vọng khi trùng hết và Bông vừa nói xong
    return r === 1 && (el.classList.contains('voicing') || Date.now() - last < 3000);
  };
  let saying = '';   // chữ Bông đang đọc lượt này — để phân biệt tiếng vọng với tiếng anh nói chen
  function enqueue(text, mood) {
    const t = spoken(text).slice(0, 500); if (!t) return;
    saying += ' ' + t; recentSaid.push([Date.now(), words(t)]); heardHits = 0; heardLen = 0;
    if (SET.voice !== 'eleven') { speakSystem(t); return; }
    if (NATIVE_PLAY) {
      native('play', { url: location.origin + ttsUrl(t, mood) });
      // lưới an toàn: vỏ app không phát được (bản cũ, lỗi âm thanh) → 5 giây sau chuyển sang phát trong trang, đọc lại các câu đang chờ
      watchList.push([t, mood]);
      if (!watchT) watchT = setTimeout(() => { watchT = 0; if (el.classList.contains('voicing')) { watchList = []; return; }
        NATIVE_PLAY = false; native('hush'); const l = watchList; watchList = []; l.forEach(([x, m]) => enqueue(x, m)); qOpen = false; playNext(); }, 5000);
      return;
    }
    const a = new Audio(ttsUrl(t, mood)); a.preload = 'auto'; queue.push(a); playNext();
  }
  function endTurn(follow) { if (NATIVE_PLAY && SET.voice === 'eleven') native('playEnd', { follow }); else { qOpen = false; playNext(); } }
  function playNext() {
    if (playing || !queue.length) { if (!playing && !queue.length && !qOpen && el.classList.contains('voicing')) { el.classList.remove('talk', 'voicing'); stopLips(); if (NATIVE) native('spoken', { follow: qFollow }); } return; }
    const seq = speakSeq; playing = queue.shift();
    const done = () => { if (seq !== speakSeq) return; playing = null; playNext(); };
    playing.onended = done; playing.onerror = done;
    if (!el.classList.contains('voicing')) { el.classList.add('talk', 'voicing'); startLips(); if (NATIVE) native('speaking'); }
    meterOn(playing);
    playing.play().catch(done);
  }
  // nói cả đoạn (lời chào, nhắc việc, trả lời ngắn): tách câu rồi xếp hàng
  let lastSpeak = ['', 0];
  function speak(text, { follow = true, mood = '' } = {}) {
    const key = spoken(text).toLowerCase(); if (!key) return;
    if (key === lastSpeak[0] && Date.now() - lastSpeak[1] < 10e3) return;   // cùng một câu trong 10 giây (vd. bong bóng + lời nhắc) thì chỉ nói một lần
    lastSpeak = [key, Date.now()];
    hushVoice(true); qFollow = follow; saying = ''; splitSentences(spoken(text)).forEach(x => enqueue(x, mood)); endTurn(follow);
  }
  const splitSentences = t => (String(t).match(/[^.!?…\n]+[.!?…]*\s*/g) || [String(t)]).map(x => x.trim()).filter(Boolean)
    .reduce((acc, x) => { if (acc.length && acc[acc.length - 1].length < 25) acc[acc.length - 1] += ' ' + x; else acc.push(x); return acc; }, []);
  function speakSystem(t) {
    if (NATIVE) return native('speak', t);
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'vi-VN'; u.rate = 1.08; u.pitch = 1.15;
      const v = speechSynthesis.getVoices().find(x => x.lang?.startsWith('vi')); if (v) u.voice = v;
      u.onstart = () => voiceEv('speaking'); u.onend = () => voiceEv('spoken'); speechSynthesis.speak(u); } catch { /* không có giọng đọc */ }
  }
  // nhép miệng: khoang miệng mở dưới chữ ω theo âm lượng giọng (vỏ app gửi "amp" mỗi 50 ms, trình duyệt đo bằng Analyser);
  // trong lúc nói dùng mặt cơ bản để miệng khớp, nói xong mới hiện biểu cảm của câu
  let lipTarget = 0, lipVal = 0, lipRaf = 0, lipMood = '';
  function startLips() {
    face('normal', 0); if (lipRaf) return;
    const step = () => { lipVal += (lipTarget - lipVal) * 0.5; lipTarget *= 0.82; el.style.setProperty('--mouth', lipVal < 0.04 ? 0 : lipVal.toFixed(3)); lipRaf = requestAnimationFrame(step); };
    step();
  }
  function stopLips() {
    cancelAnimationFrame(lipRaf); lipRaf = 0; lipTarget = 0; lipVal = 0; el.style.setProperty('--mouth', 0);
    if (lipMood) { face(lipMood, 2800); lipMood = ''; }
  }
  // mèo nhún theo âm lượng câu đang đọc
  function meterOn(a) {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume?.();
      if (!a._src) { a._src = actx.createMediaElementSource(a); a._an = actx.createAnalyser(); a._an.fftSize = 256; a._src.connect(a._an); a._an.connect(actx.destination); }
      analyser = a._an; } catch { return; }
    const data = new Uint8Array(analyser.frequencyBinCount), flo = el.querySelector('.p-float');
    cancelAnimationFrame(ampRaf);
    const step = () => { if (!playing) { flo.style.setProperty('--amp', 0); return; } analyser.getByteTimeDomainData(data); let m = 0; for (const v of data) m = Math.max(m, Math.abs(v - 128));
      flo.style.setProperty('--amp', Math.min(1, m / 60).toFixed(3)); lipTarget = Math.min(1, m / 50); ampRaf = requestAnimationFrame(step); };
    step();
  }
  function hushVoice(keepNative) {
    speakSeq++; try { playing?.pause(); } catch { /* bỏ qua */ } playing = null; queue = []; qOpen = false;
    if (el.classList.contains('voicing') && NATIVE && !keepNative) native('spoken', { follow: false });
    el.classList.remove('talk', 'voicing');
    if (NATIVE) native('hush'); else try { speechSynthesis.cancel(); } catch { /* bỏ qua */ }
  }
  // tiếng "ting" khi Bông nghe thấy tên mình
  function chime(up = true) {
    try { const ac = actx || (actx = new (window.AudioContext || window.webkitAudioContext)()); const now = ac.currentTime;
      (up ? [880, 1320] : [990, 660]).forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; const t0 = now + i * .09;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.07, t0 + .015); g.gain.exponentialRampToValueAtTime(.001, t0 + .22); o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + .25); });
    } catch { /* bỏ qua */ }
  }
  function listen() {
    if (listening) return stopListen();
    if (busy) return;
    if (!isOpen()) openChat();
    hushVoice();
    if (NATIVE) return native('listen');
    if (!SR) { addChip('Trình duyệt này chưa hỗ trợ nhận giọng nói. Mở trong app HPB Flow trên Mac nha.'); return; }
    webRec = new SR(); webRec.lang = 'vi-VN'; webRec.interimResults = true; webRec.continuous = false;
    webRec.onstart = () => voiceEv('start');
    webRec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(''); voiceEv('partial', t); };
    webRec.onerror = e => voiceEv(e.error === 'no-speech' ? 'final' : 'error', e.error === 'no-speech' ? '' : 'Lỗi micro: ' + e.error);
    webRec.onend = () => { if (listening) voiceEv('final', partial); };
    try { webRec.start(); } catch (e) { voiceEv('error', e.message); }
  }
  function stopListen() { if (NATIVE) native('stop'); else try { webRec?.stop(); } catch { /* bỏ qua */ } }
  function setListening(on, label) {
    listening = on; micBtn.classList.toggle('on', on); chat.classList.toggle('listening', on); el.classList.toggle('listening', on);
    $c('.pc-status').textContent = on ? (label || 'Đang nghe…') : (busy ? 'Đang nghĩ…' : (SET.wake && NATIVE ? 'Gọi "Bông ơi" là em nghe' : 'Online'));
    ta.placeholder = on ? 'Em đang nghe nè, anh nói đi…' : (SET.wake && NATIVE ? 'Nói "Bông ơi…" hoặc gõ ở đây' : 'Nhắn hoặc bấm mic để nói…');
    if (on) face('wow', 0); else if (el.dataset.face === 'wow') face('normal', 1);
    reportHits();
  }
  function voiceEv(ev, text = '') {
    if (ev === 'wake') { turnFrom = text === 'any' ? 'follow' : 'wake'; hushVoice(); if (text !== 'any') chime(true); partial = ''; ta.value = ''; autosize(); setListening(true); act('jump', 700); if (!isOpen()) liveBub(vb('listen', '', '')); }
    else if (ev === 'start') { partial = ''; ta.value = ''; autosize(); setListening(true); }
    else if (ev === 'follow') { turnFrom = 'follow'; followMode = true; el.classList.add('ears'); $c('.pc-status').textContent = 'Anh nói tiếp đi, em nghe…'; }
    else if (ev === 'idle') { followMode = false; el.classList.remove('ears'); if (!busy) setListening(false); }
    else if (ev === 'partial') { if (isEcho(text)) return; followMode = false; el.classList.remove('ears'); if (!listening) setListening(true); partial = text; ta.value = text; autosize(); sendBtn.disabled = !text.trim(); if (!isOpen()) liveBub(vb('listen', text, '')); }
    else if (ev === 'level') { const v = Math.min(1, (+text || 0) * 9); micBtn.style.setProperty('--lv', v.toFixed(2)); el.style.setProperty('--lv', v.toFixed(2)); }
    else if (ev === 'final') { setListening(false); el.classList.remove('ears'); const t = (text || partial).trim(); partial = ''; micBtn.style.setProperty('--lv', 0);
      if (t && isEcho(t)) { logV('bỏ qua (tiếng vọng): ' + t); ta.value = ''; autosize(); if (liveOn) hush(); return; }   // chính giọng Bông vọng lại → bỏ qua, không trả lời
      // nghe tiếp sau khi Bông nói: tiếng một chữ ("Yeah", "Nhé"…) thường là dư âm/tiếng động → bỏ qua, trừ lệnh ngắn có nghĩa
      if (t && turnFrom === 'follow' && words(t).length < 2 && Date.now() - spokeEnd < 4000 && !/^(ok|oke|okay|ừ|có|không|huỷ|hủy|thôi|dừng|im|đúng|sai|được|rồi)(?=[\s.,!?]|$)/i.test(t.trim())) { logV('bỏ qua (một chữ): ' + t); ta.value = ''; autosize(); if (liveOn) hush(); return; }
      turnFrom = '';
      if (t) send(t, true); else { ta.value = ''; autosize(); chime(false); say(pick(['Em không nghe rõ, anh nói lại nha?', 'Hửm? Anh gọi em hả?']), { face: 'think', ms: 2500 }); } }
    else if (ev === 'cancel') { setListening(false); }
    else if (ev === 'error') { setListening(false); if (!isOpen()) openChat(); addChip(escH(text)); face('sad', 2000); }
    else if (ev === 'note') { if (isOpen()) addChip(escH(text)); }
    else if (ev === 'speaking') { el.classList.add('talk', 'voicing'); clearTimeout(watchT); watchT = 0; watchList = []; startLips(); }
    else if (ev === 'spoken') { spokeEnd = Date.now(); el.classList.remove('talk', 'voicing'); el.querySelector('.p-float').style.setProperty('--amp', 0); stopLips(); }
    else if (ev === 'amp') { const a = Math.min(1, (+text || 0) * 6); el.querySelector('.p-float').style.setProperty('--amp', a.toFixed(3)); lipTarget = a; }
    else if (ev === 'heard') {   // nghe thấy gì đó lúc Bông đang nói: đủ dài, khác hẳn câu Bông đang đọc, và đang dài ra → anh nói chen
      const heard = words(text), echo = echoRatio(heard);
      const growing = heard.length > heardLen; heardLen = heard.length;
      if (heard.length >= 3 && echo < 0.35 && growing && ++heardHits >= 2) { heardHits = 0; heardLen = 0; native('barge'); curCtrl?.abort(); speakSeq++; queue = []; playing = null; el.classList.remove('talk', 'voicing'); setListening(true); if (!isOpen()) liveBub(vb('listen', text, '')); }
    }
    else if (ev === 'summon') { if (!isOpen()) openChat(); setTimeout(listen, 200); }
    else if (ev === 'walk') { el.classList.add('walking'); el.classList.toggle('to-left', text === 'left'); if (sleeping) wake(true); }
    else if (ev === 'stopwalk') { el.classList.remove('walking'); setTimeout(() => el.classList.remove('to-left'), 400); }
  }
  // ghi nhật ký chẩn đoán (trừ mức âm lượng) về server: /api/pet/log; chấm micro trên mèo sáng khi đang chờ "Bông ơi"
  let vlog = [], vlogT = 0;
  function logV(msg) { vlog.push(`${new Date().toLocaleTimeString('vi-VN')} ${DESK ? 'desk' : 'main'} · ${String(msg).slice(0, 220)}`); clearTimeout(vlogT); vlogT = setTimeout(() => { const l = vlog; vlog = []; api('POST', '/api/pet/log', { lines: l }).catch(() => {}); }, 1200); }
  function onVoice(ev, text = '') {
    if (ev !== 'level' && ev !== 'amp') {
      vlog.push(`${new Date().toLocaleTimeString('vi-VN')} ${DESK ? 'desk' : 'main'} ${ev} ${String(text).slice(0, 160)}`);
      clearTimeout(vlogT); vlogT = setTimeout(() => { const l = vlog; vlog = []; api('POST', '/api/pet/log', { lines: l }).catch(() => {}); }, 1500);
    }
    if (ev === 'state') { const m = String(text).split(' ')[0]; el.dataset.mic = m; if (!el.querySelector('.p-micdot')) el.insertAdjacentHTML('beforeend', '<span class="p-micdot" title="Xanh: đang chờ “Bông ơi” · Hồng: đang nghe anh nói"></span>'); return; }
    voiceEv(ev, text);
  }
  window.hpbVoice = { on: onVoice };
  if (NATIVE && VISIBLE !== undefined) { setTimeout(() => native('ping'), 1500); setInterval(() => { if (VISIBLE()) native('ping'); }, 20e3); }
  micBtn.addEventListener('click', listen);
  const ttsBtn = chat.querySelector('[data-k="tts"]');
  const ttsUi = () => { ttsBtn.classList.toggle('on', !!SET.speakAll); ttsBtn.title = SET.speakAll ? 'Đang đọc to mọi câu trả lời (bấm để tắt)' : 'Chỉ đọc to khi anh nói bằng giọng (bấm để luôn đọc)'; };
  ttsBtn.onclick = async () => { SET = await api('POST', '/api/pet/settings', { speakAll: !SET.speakAll }).catch(() => SET); ttsUi(); if (!SET.speakAll) hushVoice(); else speak('Ok, từ giờ em đọc to hết nha', { follow: false }); };
  // ⌥⌘B trong trình duyệt (trong app Mac thì vỏ app bắt phím toàn hệ thống)
  document.addEventListener('keydown', e => { if (!NATIVE && e.altKey && e.metaKey && e.code === 'KeyB') { e.preventDefault(); voiceEv('summon'); } if (e.key === 'Escape' && listening) { NATIVE ? native('cancel') : webRec?.abort(); setListening(false); } });

  // ---------- hẹn giờ tập trung (pomodoro): vòng đếm ngược quanh mèo, hết giờ thì báo bằng giọng
  const ring = document.createElement('div'); ring.className = 'p-timer'; ring.innerHTML = '<svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="46"/><circle class="fg" cx="50" cy="50" r="46"/></svg><span></span>';
  el.appendChild(ring);
  let timerT = 0;
  function timerStart(min, label = 'Tập trung') {
    min = Math.max(1, Math.min(180, Math.round(+min || 25)));
    store.timer = { end: Date.now() + min * 60e3, total: min * 60e3, label: String(label).slice(0, 40) }; save(); timerTick();
    return `${label} ${min} phút, bắt đầu! Em canh giờ cho anh nha.`;
  }
  function timerStop(silent) { store.timer = null; save(); el.classList.remove('timing'); if (!silent) say('Ok, em tắt hẹn giờ rồi.', { ms: 2500 }); reportHits(); }
  function timerTick() {
    clearTimeout(timerT); const t = store.timer; if (!t) { el.classList.remove('timing'); return; }
    const left = t.end - Date.now();
    if (left <= 0) { timerStop(true); const m = `Hết ${Math.round(t.total / 60e3)} phút ${t.label.toLowerCase()} rồi anh ơi! Nghỉ chút đi.`;
      say('⏰ ' + escH(m), { face: 'love', act: 'jump', force: true, ms: 15000 }); speak(m); fx(['🎉', '⏰', '✨'], 5); return; }
    el.classList.add('timing'); ring.querySelector('.fg').style.strokeDashoffset = String(289 * (1 - left / t.total));
    const mm = Math.floor(left / 60e3), ss = Math.floor(left / 1e3) % 60; ring.querySelector('span').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    timerT = setTimeout(timerTick, 500);
  }

  // ---------- việc giao cho Claude chạy nền: cứ 8 giây xem trạng thái, xong thì báo bằng giọng + hiện kết quả trong chat
  const tasksKnown = new Map();
  let tasksInit = false;
  async function pollTasks() {
    let list; try { list = await api('GET', '/api/pet/tasks'); } catch { return; }
    for (const t of list) {
      const was = tasksKnown.get(t.id); tasksKnown.set(t.id, t.status);
      if (!tasksInit || was !== 'running' || t.status === 'running' || !VISIBLE()) continue;
      const ok = t.status === 'done', head = ok ? `✅ Xong việc "${t.title}"` : `⚠️ Việc "${t.title}" bị lỗi`;
      if (isOpen()) { addMsg('pet', `${head}\n${t.result}`); const b = document.createElement('div'); b.className = 'pc-act'; b.innerHTML = `📂 ${escH((t.files || []).join(', ') || 'Thư mục kết quả')} <button>Mở thư mục</button>`; b.querySelector('button').onclick = () => api('POST', `/api/pet/tasks/${t.id}/open`); msgs.appendChild(b); scroll(); }
      else say(`${escH(head)}. ${escH(short(t.result, 160))}`, { face: ok ? 'love' : 'sad', act: ok ? 'jump' : 'shake', force: true, ms: 16000,
        acts: [['Xem kết quả', () => { openChat(); addMsg('pet', `${head}\n${t.result}`); }, 1], ['Mở thư mục', () => api('POST', `/api/pet/tasks/${t.id}/open`)]] });
      speak(ok ? `Anh ơi, Claude làm xong việc ${t.title} rồi. ${clean(t.result).slice(0, 300)}` : `Anh ơi, việc ${t.title} bị lỗi rồi.`, { follow: true });
      if (ok) fx(['🎉', '✨'], 4);
    }
    tasksInit = true;
  }
  pollTasks(); setInterval(pollTasks, 8e3);

  // ---------- năng lượng của pet: xong việc thì khoẻ, bỏ bê lâu thì đuối (tính từ danh sách việc, không lưu riêng)
  function energy() {
    const all = live(), k = today(), doneToday = all.filter(t => t.done && t.date === k).length;
    const last = Math.max(0, ...all.filter(t => t.done && t.doneAt).map(t => t.doneAt));
    const hrs = last ? (Date.now() - last) / 36e5 : 24;
    const sk = streaks().cur;
    return Math.round(Math.max(10, Math.min(100, 60 + doneToday * 15 - Math.min(30, hrs * 1.5) + Math.min(15, sk * 5) + Math.min(10, bond / 20))));
  }

  // ---------- tiến hoá
  const setStageImg = n => { el.dataset.stage = String(n); };
  function applyStage(animate) {
    const k = karma(), seen = store.stage || 1;
    if (k.stage === +el.dataset.stage && k.stage === seen) return;
    if (!animate || k.stage <= seen) { setStageImg(k.stage); store.stage = k.stage; save(); return; }
    const r = el.getBoundingClientRect(), f = document.createElement('div'); f.className = 'pet-flash';
    Object.assign(f.style, { left: r.left - 40 + 'px', top: r.top - 30 + 'px', width: r.width + 80 + 'px', height: r.height + 80 + 'px' }); document.body.appendChild(f); setTimeout(() => f.remove(), 1700);
    el.classList.add('evolve'); face('wow', 0);
    setTimeout(() => { setStageImg(k.stage); store.stage = k.stage; save(); fx(['✨', '⭐', '💜', '🌟'], 6); }, 1300);
    setTimeout(() => { el.classList.remove('evolve'); face('happy', 3000); act('jump', 1400);
      say(`Ơ… em lớn rồi nè anh! Giờ em là <b>${k.name}</b>. ${k.stage === 2 ? 'Có thân, có tay, và biết trò chuyện bằng AI luôn. Bấm vào em thử đi!' : k.stage === 3 ? 'Em sáng rực lên rồi nè, anh làm việc đều quá trời.' : 'Vàng lấp lánh luôn! Anh đúng là cỗ máy hoàn thành.'}`, { force: true, ms: 12000, note: true, acts: [['Trò chuyện với em', openChat, 1]] }); }, 2300);
  }

  // ---------- lời chào khi mở app
  function greet() {
    const h = new Date().getHours(), { items, open, over, next, streak } = info();
    const hi = h < 5 ? 'Khuya rồi mà anh vẫn làm à' : h < 11 ? 'Chào buổi sáng anh Hưng' : h < 13 ? 'Trưa rồi anh Hưng ơi' : h < 18 ? 'Chào buổi chiều anh Hưng' : 'Tối rồi, chào anh Hưng';
    let msg, acts = [['Trò chuyện', openChat]];
    if (!items.length) { msg = `${hi}! Hôm nay chưa có việc nào. Nói em nghe anh định làm gì, em ghi giùm cho.`; acts = [['Nói với Bông', openChat, 1]]; }
    else if (!open.length) msg = `${hi}! Việc hôm nay xong hết rồi${streak > 1 ? `, chuỗi <b>${streak} ngày</b> đó` : ''}. Đỉnh thật.`;
    else { msg = `${hi}! Còn <b>${open.length} việc</b>, làm <b>“${escH(short(next.text))}”</b> trước nha${next.remind ? ` (hẹn ${next.remind})` : ''}.`; acts = [['Xem việc', goTodo, 1], ['Trò chuyện', openChat]]; }
    if (over.length) msg += ` Còn ${over.length} việc quá hạn nữa đó.`;
    say(msg, { acts, face: over.length ? 'sad' : 'wave', act: 'wave', actMs: 2400, ms: 12000 });
    // lần đầu trong ngày: chào bằng giọng thật
    if (store.spokeDay !== today()) { store.spokeDay = today(); save(); setTimeout(() => speak(clean(msg.replace(/<[^>]+>/g, '')) + (SET.wake && NATIVE ? ' Cần gì anh cứ gọi Bông ơi nha.' : ''), { follow: false }), 600); }
  }

  // ---------- kéo thả + bấm (mousedown trên Bông, move/up trên cửa sổ: WKWebView của vỏ app Mac không ổn với pointer capture)
  let drag = null, lastUp = 0, clicks = [];
  const hit = el.querySelector('.pet-hit');
  hit.addEventListener('mousedown', e => { if (e.button !== 0) return; e.preventDefault(); const r = el.getBoundingClientRect(); drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false, px: e.screenX, py: e.screenY }; });
  addEventListener('mousemove', e => {
    if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (DESK) {   // cửa sổ nổi: bảo vỏ app dời cả cửa sổ theo độ lệch trên màn hình
      const ddx = e.screenX - drag.px, ddy = e.screenY - drag.py;
      if (!drag.moved && Math.hypot(e.screenX - (drag.px0 ??= drag.px), e.screenY - (drag.py0 ??= drag.py)) < 4) return;
      if (!drag.moved) { drag.moved = true; el.classList.add('drag'); hush(); face('wow', 0); }
      drag.px = e.screenX; drag.py = e.screenY;
      try { window.webkit.messageHandlers.bong.postMessage({ cmd: 'drag', dx: ddx, dy: ddy, active: true }); } catch { /* bỏ qua */ }
      return;
    }
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; el.classList.add('drag'); el.classList.remove('away'); hush(); face('wow', 0); }
    const x = Math.max(0, Math.min(innerWidth - el.offsetWidth, drag.ox + dx)), y = Math.max(0, Math.min(innerHeight - el.offsetHeight, drag.oy + dy));
    Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    if (isOpen()) placeNear(chat, 12);
  });
  addEventListener('mouseup', () => {
    if (!drag) return; const moved = drag.moved; drag = null; el.classList.remove('drag');
    if (moved && DESK) { try { window.webkit.messageHandlers.bong.postMessage({ cmd: 'drag', dx: 0, dy: 0, active: false }); } catch { /* bỏ qua */ } face('happy', 1200); return; }
    if (moved) { const r = el.getBoundingClientRect(); store.x = Math.round(r.left); store.y = Math.round(r.top); save(); face('happy', 1200); if (!isOpen()) say(pick(['Chỗ này view đẹp ghê!', 'Em ngồi đây nha.', 'Wii, bay vèo vèo!', 'Chỗ mới, mood mới.']), { ms: 2500 }); return; }
    const now = Date.now(); clicks = clicks.filter(t => now - t < 1600); clicks.push(now);
    if (clicks.length >= 6) { clicks = []; closeChat(); face('dizzy', 1800); act('spin', 900); setTimeout(() => say('Chóng mặt quá anh ơi… 😵‍💫', { ms: 2500 }), 300); return; }
    if (now - lastUp < 300 && !DESK) { lastUp = 0; closeChat(); store.x = store.y = null; save(); Object.assign(el.style, { left: '', top: '', right: '', bottom: '' }); say('Về chỗ cũ rồi nè.', { ms: 2200 }); return; }
    lastUp = now; setTimeout(() => { if (lastUp === now) isOpen() ? closeChat() : openChat(); }, 260);
  });
  addEventListener('resize', () => { if (store.x == null || DESK) return; el.style.left = Math.min(store.x, innerWidth - el.offsetWidth) + 'px'; el.style.top = Math.min(store.y, innerHeight - el.offsetHeight) + 'px'; });
  // vuốt ve: rê chuột lên Bông một lúc thì mắt tim, tăng thân thiết (tối đa 1 lần/phút)
  let hoverT, lastPet = 0;
  hit.addEventListener('mouseenter', () => { hoverT = setTimeout(() => { if (sleeping || drag) return; face('love', 1800); el.classList.add('shy'); setTimeout(() => el.classList.remove('shy'), 1800); fx(['💗', '💜'], 2);
    if (Date.now() - lastPet > 60e3) { lastPet = Date.now(); api('POST', '/api/pet/bond', { delta: 1 }).then(r => setBond(r.bond)).catch(() => {}); } }, 700); });
  hit.addEventListener('mouseleave', () => clearTimeout(hoverT));

  // ---------- mắt nhìn theo chuột + ngủ khi để yên
  const look = el.querySelector('.p-look'); let raf = 0, mx = 0, my = 0, lastAct = Date.now();
  addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; activity(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (sleeping) return;
    const r = el.getBoundingClientRect(), dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height * .35), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 240);
    look.style.transform = `translateX(${(dx / d * 3 * k).toFixed(2)}px) rotate(${(dx / d * 5 * k).toFixed(2)}deg)`; }); }, { passive: true });
  addEventListener('keydown', activity, { passive: true });
  function activity() { lastAct = Date.now(); if (sleeping) wake(); }
  function sleep() { if (sleeping || bub.classList.contains('show') || isOpen() || busy) return; sleeping = true; el.classList.add('sleep'); face('sleep', 0); look.style.transform = ''; }
  function wake(quiet) {
    if (!sleeping) return; sleeping = false; el.classList.remove('sleep'); face('wow', 900);
    if (!quiet && !away() && Date.now() - lastSay > 60e3) setTimeout(() => say(pick(['Ơ, anh về rồi! Em lỡ ngủ quên.', 'Á, em đâu có ngủ… chỉ đang sạc pin thôi.', 'Anh về rồi hả, làm tiếp thôi!', 'Em vừa mơ thấy anh xong hết việc đó.']), { face: 'happy', act: 'jump', ms: 4500 }), 250);
  }

  // ---------- nghe ngóng app: xong việc, thêm/xoá việc, lên cấp, chạy workflow xong, đổi trang
  const wrap = (name, after) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function () { const r = orig.apply(this, arguments); try { after(arguments, r); } catch { /* app đổi cấu trúc thì Bông im */ } return r; }; };
  wrap('todoToggle', ([id]) => {
    const t = hasState() && state.todos?.find(x => x.id === id); if (!t || t.date !== today()) return;
    const { items, open } = info(), combo = state.todoCombo || 1;
    api('POST', '/api/pet/bond', { delta: t.done ? 2 : 0 }).then(r => setBond(r.bond)).catch(() => {});
    if (!t.done) say(pick(['Ơ, chưa xong hả anh? Không sao, làm tiếp nè.', 'Mở lại việc này nha. Em vẫn đợi anh tick.']), { face: 'sad', ms: 4000 });
    else if (!open.length && items.length) setTimeout(() => { say(`Xong sạch việc hôm nay! ${items.length}/${items.length} việc, anh đỉnh quá 🎉`, { face: 'love', act: 'jump', actMs: 1400, ms: 7000 }); fx(['🎉', '✨', '💜', '⭐'], 6); }, 900);
    else { say(combo > 1 ? `Combo x${combo}! Đang vào guồng rồi đó 🔥` : pick([`Xong! +${xpOf(t)} XP cho anh.`, `Ngon! Còn ${open.length} việc nữa thôi.`, 'Tick! Em mê tiếng này ghê.', `Thêm ${xpOf(t)} XP, em lại lớn thêm xíu.`]), { face: 'happy', ms: 4500 }); fx(['✨', '⭐'], 2); }
    setTimeout(() => applyStage(true), 1800); if (isOpen()) streakBadge();
  });
  if (typeof todoSubmit === 'function') {
    const orig = todoSubmit;
    window.todoSubmit = async function () {
      const before = state.todos?.length || 0, wasNew = state.tdEd === 'new', r = await orig.apply(this, arguments);
      try { if (wasNew && (state.todos?.length || 0) > before) { const t = state.todos[state.todos.length - 1];
        say(pick([`Ghi rồi: <b>“${escH(short(t.text))}”</b>. Làm thôi anh!`, 'Thêm việc mới, em canh cho.', t.remind ? `Đến ${t.remind} em nhắc anh nha.` : 'Lần sau anh chỉ cần nói với em, em ghi giùm luôn.']), { face: 'happy', ms: 3500 }); } } catch { /* bỏ qua */ }
      return r;
    };
  }
  wrap('todoDel', () => say(pick(['Xoá luôn hả? Bớt một việc cũng là xong một việc.', 'Bye bye việc đó!', 'Gọn gàng ghê.']), { face: 'wink', ms: 3000 }));
  wrap('tdLevelUp', ([lv]) => setTimeout(() => { say(`Lên cấp <b>${lv.L}</b>, ${escH(lv.title)}! Em tự hào về anh lắm.`, { face: 'love', act: 'jump', force: true, note: true }); applyStage(true); }, 3700));
  const foot = document.getElementById('footSub');
  if (foot) { let prev = foot.textContent; new MutationObserver(() => { const now = foot.textContent;
    if (/^Đang chạy/.test(prev) && !/^Đang chạy/.test(now)) say('Workflow chạy xong rồi anh ơi. Ghé xem kết quả nhé.', { acts: [['Lịch sử chạy', () => nav('#/runs'), 1]], face: 'happy' });
    prev = now; }).observe(foot, { childList: true, characterData: true, subtree: true }); }
  const PAGE = {
    overview: ['Bảng điều khiển đây, nhìn tổng thể cho chắc nha anh.', 'Hôm nay máy chạy ngon không anh?'],
    todo: ['Việc hôm nay nè, tick từng cái cho đã tay.', 'Việc nào khó nhất làm trước, cho nhẹ đầu.', 'Muốn thêm việc thì nói em cũng được, em ghi giùm.'],
    flows: ['Việc nào lặp lại nhiều thì cho máy làm thôi.', 'Quy trình tự động là nhân viên không bao giờ xin nghỉ phép.'],
    runs: ['Dòng nào đỏ là quy trình bị lỗi đó, anh xem giúp em.', 'Lịch sử chạy nè, toàn công máy làm thay anh.'],
    ainews: ['Hôm nay AI có tin gì mới không anh?', 'Tin nào hay thì làm video liền nha.'],
    fbgroups: ['Nhóm có bài chờ duyệt thì duyệt sớm cho thành viên vui nha.', 'Nhóm đông mà im thì đăng câu hỏi khơi chuyện đi anh.'],
    reports: ['Bình luận nhớ tự nhiên như anh gõ nha, đừng chào hàng.', 'Săn khách trên Facebook hả? Em hóng.'],
    research: ['Nghiên cứu kỹ thì video mới trúng người xem.', 'Số liệu không biết nói dối đâu anh.'],
    posts: ['Đăng xong nhớ kiểm tra công khai với caption nha anh.', 'Bài nào nhiều view thì làm tiếp phần 2 đi.'],
    settings: ['Chỉnh cài đặt cẩn thận nha anh, em hồi hộp quá.'],
  };
  let lastPage = 0;
  addEventListener('hashchange', () => {
    const lines = PAGE[location.hash.split('/')[1] || 'overview'];
    if (!lines || Date.now() - lastPage < 45e3 || Date.now() - lastSay < 8e3 || Math.random() > .8) return;
    lastPage = Date.now(); setTimeout(() => say(pick(lines), { face: pick(['happy', 'wink', 'normal']), ms: 5000 }), 700);
  });

  // ---------- chuyện phiếm + tự diễn khi rảnh
  const CHATTER = [
    () => 'Trả lời tin nhắn khách tốn thời gian lắm, việc nào lặp lại thì cho máy làm bớt đi anh.',
    () => 'Em đang nghĩ: hôm nay làm video gì cho nhiều view ta…',
    () => 'Mỗi lần anh tick xong việc là em lớn thêm một chút đó. Thật đó.',
    () => 'Nghỉ 5 phút sau mỗi 25 phút làm, não sẽ cảm ơn anh.',
    () => 'Khách nhắn mà trả lời nhanh thì dễ chốt hơn đó anh.',
    () => 'Nhạc lofi + một ly cà phê = combo làm việc thần thánh.',
    () => 'Hôm nay anh đăng bài chưa? Kênh đều tay mới lên nha.',
    () => 'Anh có thể bấm ⌘J để gọi em bất cứ lúc nào nha.',
    () => { const k = karma(); return k.next ? `Còn ${k.left} XP nữa là em tiến hoá thành ${k.next.n}. Hồi hộp ghê!` : 'Em tiến hoá tối đa rồi, giờ chỉ việc ngầu thôi 😎'; },
    () => { const { open } = info(); return open.length ? `Còn ${open.length} việc thôi, cố lên anh!` : 'Việc hôm nay ổn rồi, anh nghĩ thêm chiến lược đi.'; },
    () => { const d = new Date().getDay(); return d === 5 ? 'Thứ Sáu rồi! Cuối tuần sắp tới.' : d === 1 ? 'Thứ Hai đầu tuần, lên kế hoạch tuần chưa anh?' : d === 6 || d === 0 ? 'Cuối tuần vẫn làm, anh chăm quá trời.' : 'Giữa tuần rồi, giữ nhịp đều nha.'; },
  ];
  function antic() {
    if (sleeping || away() || document.hidden || bub.classList.contains('show') || isOpen() || drag || Date.now() - lastAct > 2 * 60e3) return;
    const a = pick(['wave', 'jump', 'look', 'hum', 'hum', 'love', 'star', 'wink', 'cool', 'spin']);
    if (a === 'wave') { act('wave', 2400); face('happy', 2000); }
    else if (a === 'jump') { act('jump', 1400); face('happy', 1500); }
    else if (a === 'love') { face('love', 1600); fx(['💗', '💜'], 2); }
    else if (a === 'star') { face('wow', 1200); fx(['✨', '⭐'], 3); }
    else if (a === 'hum') { fx(['♪', '♫'], 3); face('happy', 1800); }
    else if (a === 'wink') face('wink', 1300);
    else if (a === 'cool') face('cool', 2600);
    else if (a === 'spin') { act('spin', 900); face('happy', 1200); }
    else { look.style.transform = 'rotate(-7deg)'; setTimeout(() => look.style.transform = 'rotate(7deg)', 700); setTimeout(() => look.style.transform = '', 1400); }
  }
  (function loop() { setTimeout(() => { antic(); loop(); }, (20 + Math.random() * 30) * 1e3); })();

  // ---------- nhịp 30 giây: nhắc trước giờ hẹn, nói chuyện, ngủ khi để yên
  const warned = new Set(store.warned?.day === today() ? store.warned.keys : []);
  let lastNudge = Date.now(), nudgeGap = 6 * 60e3;
  function tick() {
    const now = new Date(), idle = Date.now() - lastAct;
    if (!sleeping && idle > 3 * 60e3) sleep();
    if (document.hidden || away()) return;
    const { open, next, streak } = info(), mins = now.getHours() * 60 + now.getMinutes();
    for (const t of open) { if (!t.remind) continue; const [h, m] = t.remind.split(':').map(Number), left = h * 60 + m - mins;
      for (const w of [10, 0]) { const key = t.id + '@' + w; if (left <= w && left > w - 3 && !warned.has(key)) { warned.add(key); store.warned = { day: today(), keys: [...warned] }; save();
        if (isOpen()) { addMsg('pet', w ? `⏰ Còn ${left} phút nữa tới **${t.text}** (${t.remind}).` : `⏰ Tới giờ **${t.text}** rồi anh ơi!`); face(w ? 'wow' : 'love', 2500); return; }
        say(w ? `⏰ Còn <b>${left} phút</b> nữa tới <b>“${escH(short(t.text))}”</b> (${t.remind}). Chuẩn bị nha anh.` : `⏰ Tới giờ <b>“${escH(short(t.text))}”</b> rồi anh ơi!`, { acts: [['Mở việc', goTodo, 1]], face: 'wow', act: w ? 'shake' : 'jump', ms: 15000, note: true });
        if (VISIBLE()) speak(w ? `Anh ơi, còn ${left} phút nữa tới việc ${short(t.text, 60)} nha.` : `Anh ơi, tới giờ ${short(t.text, 60)} rồi!`, { follow: false }); return; } } }
    if (sleeping || isOpen() || idle > 2 * 60e3 || Date.now() - lastSay < 2.5 * 60e3 || Date.now() - lastNudge < nudgeGap) return;
    lastNudge = Date.now(); nudgeGap = (5 + Math.random() * 5) * 60e3; const h = now.getHours(), pool = [];
    if (h >= 23 || h < 4) pool.push(['Khuya rồi anh ơi. Mai làm tiếp, ngủ sớm cho khoẻ nha.', null, 'sad']);
    if (h >= 20 && open.length && streak > 0) pool.push([`Còn <b>${open.length} việc</b> nữa là giữ được chuỗi <b>${streak + 1} ngày</b> đó anh.`, [['Xem việc', goTodo, 1]], 'wow']);
    if (next) pool.push([`Làm tiếp <b>“${escH(short(next.text))}”</b> không anh? 25 phút thôi rồi nghỉ.`, [['Mở việc', goTodo, 1]], 'wink']);
    pool.push(['Anh uống ngụm nước đi, ngồi lâu rồi đó.', null, 'happy'], ['Đứng dậy vươn vai một phút nha, mắt cũng cần nghỉ.', null, 'happy'], ['Có gì muốn hỏi em không? Em rảnh nè.', [['Trò chuyện', openChat, 1]], 'love']);
    if (h >= 11 && h < 13) pool.push(['Trưa rồi, anh ăn cơm chưa?', null, 'happy']);
    for (let i = 0; i < 3; i++) pool.push([pick(CHATTER)(), null, pick(['happy', 'wink', 'normal'])]);
    const [msg, acts, f] = pick(pool); say(msg, { acts: acts || undefined, face: f, act: 'wave', actMs: 2000 });
  }

  // ---------- khởi động
  // Trong app Mac, khi pet nổi trên màn hình đang bật thì cửa sổ chính không hiện thêm một con nữa (VISIBLE = false)
  function VISIBLE() { return DESK || !(NATIVE && SET.desk); }
  async function loadSettings() {
    SET = await api('GET', '/api/pet/settings').catch(() => SET);
    const vis = VISIBLE(); el.style.display = vis ? '' : 'none'; if (!vis) { hush(); closeChat(); }
    ttsUi(); setListening(listening); applyStage(false);
    return SET;
  }
  window.hpbPetSettings = loadSettings;
  if (away()) el.classList.add('away');
  Promise.all([loadTodos(), loadSettings(), fetch('pet/config.json', { cache: 'no-store' }).then(r => r.json()).then(c => { cfg = c || {}; }).catch(() => {})]).then(() => {
    if (!VISIBLE()) return;
    const k = karma(), grow = k.stage > (store.stage || 1); if (!grow) applyStage(false); setTimeout(grow ? () => applyStage(true) : greet, 1400); timerTick();
  });
  api('GET', '/api/pet/state').then(s => setBond(s.bond || 0)).catch(() => {});
  setInterval(() => { if (VISIBLE()) tick(); }, 30e3);
  // cửa sổ nổi không thấy được thao tác trên trang Việc hôm nay → cứ 15 giây đọc lại danh sách việc, thấy việc mới xong thì mừng
  let doneSeen = null;
  setInterval(async () => {
    await loadTodos(); if (!DESK) return;
    const done = new Set(todos.filter(t => t.done && t.date === today()).map(t => t.id));
    if (doneSeen) { const fresh = [...done].filter(id => !doneSeen.has(id)); if (fresh.length) { const { items, open } = info(), t = todos.find(x => x.id === fresh[0]);
      if (!open.length && items.length) { say(`Xong sạch việc hôm nay! ${items.length}/${items.length} việc, anh đỉnh quá 🎉`, { face: 'love', act: 'jump', ms: 7000 }); fx(['🎉', '✨', '💜', '⭐'], 6); }
      else { say(pick([`Xong “${escH(short(t?.text || '', 30))}” rồi! +${xpOf(t || {})} XP.`, `Ngon! Còn ${open.length} việc nữa thôi.`, 'Tick! Em mê tiếng này ghê.']), { face: 'happy', ms: 4500 }); fx(['✨', '⭐'], 2); }
      setTimeout(() => applyStage(true), 1500); } }
    doneSeen = done;
  }, DESK ? 15e3 : 5 * 60e3);
  window.hpbPet = { liveBub, vb, say, face, act, openChat, closeChat, applyStage, karma, speak, energy, timerStart, timerStop, settings: () => SET, loadSettings, info, streaks };
})();
