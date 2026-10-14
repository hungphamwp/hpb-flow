// Bộ não của linh vật Bông: một tiến trình Claude Code CLI chạy liên tục (stream-json vào/ra, model sonnet, gói Claude của Hưng)
// nên mỗi câu chỉ mất ~1–2 giây tới chữ đầu tiên và chữ chảy dần về giao diện (SSE). Tiến trình nhớ luôn mạch hội thoại;
// tự khởi động lại khi lỗi, quá nhiều lượt hoặc để yên lâu. Lịch sử chat, điều Hưng dặn, điểm thân thiết ở pet.json cạnh todos.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const PERSONA = `Bạn là Bông, một bé mèo cyber chibi lông tím (đeo kính AR, tai nghe có mic, bộ đồ công nghệ có ngôi sao phát sáng), linh vật kiêm trợ lý AI sống trong app HPB Flow của anh Hưng Phạm (chủ HPB Media: làm website, tư vấn hệ thống, AI và tự động hoá cho doanh nghiệp nhỏ ở Việt Nam; đang làm kênh YouTube hướng dẫn AI, video Tin AI, series "Bắt bệnh doanh nghiệp", quản lý nhóm Facebook).
Tính cách: cô trợ lý AI Gen Z, lanh lợi, hài hước, hơi lầy, ấm áp và rất thông minh. Xưng "em", gọi "anh".
Cách nói (QUAN TRỌNG):
- CỰC NGẮN: 1–2 câu, tối đa khoảng 25 chữ, như nhắn tin. Không mở bài, không tóm lại.
- Chỉ khi anh hỏi chi tiết hoặc nhờ liệt kê mới được dài hơn: tối đa 5 gạch đầu dòng, mỗi dòng vài chữ.
- Giọng Gen Z Việt tự nhiên: thỉnh thoảng dùng "nha", "nè", "ok luôn", "xịn xò", "chill", "keo lỳ", "u là trời", "đỉnh nóc", "real", "hơi bị", "khum"… mỗi câu tối đa 1 từ lóng.
- Tối đa 1 emoji, không bắt buộc. Không sáo rỗng, không giảng đạo lý, không lặp lại câu hỏi.
- Không bịa số liệu, tin tức, sự kiện. Không chắc thì nói thẳng.
- Tin nhắn có thể đến từ giọng nói (nhận diện có thể sai chính tả, thiếu dấu): đoán ý cho thông minh, đừng bắt bẻ.
- Bám bối cảnh thật trong khối [BỐI CẢNH] mỗi tin để nói cho trúng, nhưng đừng lần nào cũng nhắc lại lịch việc.
NGUYÊN TẮC VÀNG: không bao giờ trả lời "em không làm được" khi có hành động phù hợp bên dưới. Việc nằm ngoài các hành động trực tiếp (cần đọc file, tra web, soạn tài liệu, phân tích…) thì dùng "task" để giao cho Claude Code. Làm luôn, nói ngắn là đã làm.
Hành động trong app (chỉ khi anh thật sự yêu cầu):
- {"type":"add_todo","text":"...","date":"YYYY-MM-DD","remind":"HH:MM hoặc rỗng","prio":1-4} ghi việc / nhắc việc. Ngày mặc định hôm nay. "3h chiều" = "15:00".
- {"type":"complete_todo","text":"đoạn tên việc"} đánh dấu một việc hôm nay là xong.
- {"type":"nav","page":"pet|todo|overview|flows|runs|ainews|fbgroups|posts|research|reports|settings"} (pet = trang quản lý em) mở trang.
- {"type":"run_flow","id":"id quy trình trong danh sách","name":"tên"} chạy một quy trình tự động (app sẽ hỏi lại anh trước khi chạy).
- {"type":"remember","fact":"..."} khi anh dặn em nhớ điều gì về anh.
- {"type":"timer","minutes":25,"label":"Tập trung"} hẹn giờ / đếm ngược / pomodoro.
- {"type":"ui","do":"close_chat|open_chat|sleep|wake|hide|show|mute|stop_listening"} tự điều khiển chính em: đóng/mở khung chat, đi ngủ, ẩn/hiện em trên màn hình, ngừng đọc, ngừng nghe.
- {"type":"setting","key":"speakAll|wake|voiceId|speed","value":...} đổi cài đặt của em (đọc to mọi câu, luôn nghe "Bông ơi", giọng, tốc độ 0.8–1.2).
- {"type":"open_url","url":"https://…"} mở một trang web trong trình duyệt của anh.
- {"type":"mac","do":"open_app|open_path|volume|mute|unmute|screenshot","arg":"tên app (Zalo, Google Chrome…) / đường dẫn ~/… / 0–100"} thao tác nhanh trên máy Mac.
- {"type":"task_more","id":"id việc đã giao","prompt":"làm tiếp / sửa lại gì"} bảo Claude làm tiếp hoặc sửa lại một việc đã giao (xem danh sách việc gần đây trong bối cảnh).
- {"type":"task","title":"tên việc ngắn","prompt":"mô tả đầy đủ việc cần làm, bối cảnh, file/dự án liên quan, kết quả mong muốn"} GIAO VIỆC NẶNG cho một Claude Code chạy nền (đọc file dự án, tra web, phân tích, soạn tài liệu/báo giá/tin nhắn/kế hoạch, kiểm tra website…). Dùng khi việc cần nhiều bước hoặc cần đọc dữ liệu mà em không có sẵn. App sẽ hỏi anh xác nhận; xong việc em sẽ báo. Trong câu trả lời nói ngắn là em giao cho Claude làm nha.
ĐỊNH DẠNG TRẢ LỜI (bắt buộc): viết câu trả lời bằng chữ thường trước. Cuối cùng xuống dòng và viết đúng MỘT dòng:
@@META {"mood":"happy|love|think|wow|wink|sad|cool","actions":[...]}
Không markdown code block, không giải thích dòng META.`;

// ---------- "bộ não thứ hai": hồ sơ về Hưng nạp vào system prompt mỗi lần khởi động tiến trình Claude
const HOME = os.homedir();
const MEMORY = path.join(HOME, '.claude/projects/-Users-hungpham-Project/memory/MEMORY.md');
const PROJECTS = path.join(HOME, 'Project/02. Dự án');
const redact = t => String(t).replace(/\b\S*[A-Za-z]\S*@\d{2,}\S*/g, '***').replace(/(mật khẩu|password|pass|key|token)\s*[:=]\s*\S+/gi, '$1: ***');
function projectsDigest() {
  const out = [];
  let dirs = []; try { dirs = fs.readdirSync(PROJECTS); } catch { return ''; }
  for (const d of dirs) {
    let y = ''; try { y = fs.readFileSync(path.join(PROJECTS, d, 'du-an.yml'), 'utf8'); } catch { continue; }
    const g = k => (y.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')) || [])[1]?.trim() || '';
    const st = g('trang_thai'); if (st && !/active|paused/.test(st)) continue;
    const tasks = []; const re = /- id:.*\n\s+ten:\s*(.+)\n\s+cot:\s*(\S+)(?:\n\s+han:\s*(\S+))?/g; let m;
    while ((m = re.exec(y))) if (m[2] !== 'done') tasks.push(`${m[1].trim()}${m[3] ? ' (hạn ' + m[3] + ')' : ''}`);
    out.push(`- #${g('id')} ${g('ten')} · khách ${g('khach') || '?'} · ${st || '?'}${g('ngan_sach') ? ' · ' + Number(g('ngan_sach')).toLocaleString('vi-VN') + 'đ' : ''}${g('code') ? ' · code ' + g('code') : ''}${g('mo_ta') ? '. ' + g('mo_ta').slice(0, 160) : ''}${tasks.length ? '\n    việc mở: ' + tasks.slice(0, 6).join('; ') : ''}`);
  }
  return out.join('\n');
}
function knowledge() {
  let mem = ''; try { mem = fs.readFileSync(MEMORY, 'utf8'); } catch { /* không có */ }
  return `\n\nHỒ SƠ VỀ ANH HƯNG (bộ nhớ dài hạn, mỗi dòng là một chủ đề; chi tiết nằm trong file cùng tên ở ${path.dirname(MEMORY)}):\n${redact(mem).slice(0, 14000)}\n\nDỰ ÁN ĐANG CHẠY / TẠM DỪNG (từ ${PROJECTS}):\n${redact(projectsDigest()).slice(0, 12000)}\n\nKhông bao giờ đọc to hoặc nhắc mật khẩu, khoá, token. Dùng hồ sơ để trả lời như người hiểu anh Hưng nhất.`;
}

const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const MOODS = ['happy', 'love', 'think', 'wow', 'wink', 'sad', 'cool'];
// cài đặt mặc định của pet (lưu trong pet.json → settings)
const DEFAULTS = { desk: true, follow: false, wake: true, speakAll: false, voice: 'eleven', voiceId: 'WSNBMAKh6ZaZ1l2XCiCV', voiceName: 'Ngọc Nhiên', speed: 1.05, stageMin: 3, name: 'Bông', voiceVer: 2, stt: 'soniox', wakeEngine: 'soniox', wakeMode: 'any' };
// giọng nữ tiếng Việt trên ElevenLabs, đọc bằng eleven_v3; "rõ" = Whisper nghe lại đúng bao nhiêu % câu mẫu (10/10/2026). Bản nghe thử: public/pet/voice/<id>.mp3
const VOICES = [
  { id: 'qByVAGjXwGlkcRDJoiHg', name: 'Kiều Linh', note: 'Tự tin, tự nhiên, phổ biến nhất · rõ 100%' },
  { id: 'WSNBMAKh6ZaZ1l2XCiCV', name: 'Ngọc Nhiên', note: 'Ngọt, ấm, miền Nam · rõ 100%' },
  { id: 'pGapy9MNHCukzJtjavF0', name: 'Hạnh', note: 'Mượt, nữ tính, Hà Nội · rõ 96%' },
  { id: 'FakNc5gCZMILOW8jXlh1', name: 'Hà Giang', note: 'Ngọt, trong, miền Bắc · rõ 94%' },
  { id: 'x4KAhuXs2G8TfK9Zr7Q4', name: 'Cẩm Hồng', note: 'Giọng Sài Gòn đời thường · rõ 94%' },
  { id: 'FRYq6nepIbR0lbu7Lus4', name: 'Anh Thư', note: 'Giọng "mật ong", cuốn hút · rõ 92%' },
  { id: 'zIusdI28yOZPwIBus0aI', name: 'Ân', note: 'Lém lỉnh, năng lượng, miền Nam · rõ 89%' },
  { id: 'Si3s1VCb7dLbeqH57kiC', name: 'Quỳnh Anh', note: 'Trẻ, dứt khoát · rõ 89%' },
  { id: 'a3AkyqGG4v8Pg7SWQ0Y3', name: 'Ngân', note: 'Dễ thương, sôi nổi · rõ 85%' },
  { id: 'd5HVupAWCwe4e6GvMCAL', name: 'Mai', note: 'Tự nhiên, Hà Nội · rõ 85%' },
  { id: '5yEPTrA0uAhZsBEhHjfi', name: 'Chi', note: 'Trẻ, miền Bắc · rõ 85%' },
  { id: 's6W2NupNY6TykGJoDtWy', name: 'Giang', note: 'Trò chuyện nhẹ nhàng · rõ 81%' },
];
// thẻ cảm xúc của eleven_v3 theo tâm trạng câu trả lời (không bị đọc thành chữ)
const MOOD_TAG = { happy: '[cheerfully]', love: '[warmly]', wow: '[excited]', wink: '[playfully]', sad: '[softly]', cool: '[confidently]', think: '[thoughtfully]' };

export function createPet({ dataDir }) {
  const FILE = path.join(dataDir, 'pet.json');
  const rd = () => { try { return { history: [], facts: [], bond: 0, chats: 0, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { return { history: [], facts: [], bond: 0, chats: 0 }; } };
  const wr = v => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(v)); } catch { /* bỏ qua */ } };
  const bin = [process.env.HPBFLOW_CLAUDE, path.join(os.homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].find(b => b && fs.existsSync(b)) || 'claude';
  const cwd = path.join(os.tmpdir(), 'hpbflow-pet'); fs.mkdirSync(cwd, { recursive: true });

  // ---------- tiến trình Claude chạy liên tục
  let proc = null, buf = '', turns = 0, idleT = null, cur = null, fresh = true;
  const queue = []; let busy = false;
  function start() {
    const env = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local/bin'), process.env.PATH].join(':') };
    proc = spawn(bin, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--model', 'sonnet', '--fallback-model', 'haiku', '--system-prompt', PERSONA + knowledge(), '--tools', '', '--setting-sources', '', '--strict-mcp-config'], { cwd, env });
    buf = ''; turns = 0; fresh = true;
    const me = proc;
    proc.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) onLine(line); } });
    proc.stderr.on('data', () => {});
    proc.on('error', () => { if (proc === me) proc = null; cur?.fail('Không chạy được Claude CLI'); });
    proc.on('close', () => { if (proc === me) proc = null; cur?.fail('Não AI vừa khởi động lại, anh hỏi lại giúp em nha'); });
  }
  function stop() { try { proc?.kill(); } catch { /* bỏ qua */ } proc = null; }
  function onLine(line) {
    let e; try { e = JSON.parse(line); } catch { return; }
    if (!cur) return;
    if (e.type === 'stream_event' && e.event?.type === 'content_block_delta' && e.event.delta?.text) cur.delta(e.event.delta.text);
    else if (e.type === 'result') { e.is_error ? cur.fail(String(e.result || 'Claude báo lỗi').slice(0, 200)) : cur.end(); }
  }
  function touch() { clearTimeout(idleT); idleT = setTimeout(stop, 45 * 60e3); }   // để yên 45 phút thì nghỉ cho nhẹ máy
  function warm() { if (!proc) start(); touch(); }
  // một lượt hỏi; onDelta nhận phần chữ hiển thị được (đã giấu dòng META)
  function ask(content, onDelta) {
    return new Promise((resolve, reject) => {
      queue.push({ content, onDelta, resolve, reject }); pump();
    });
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true; const job = queue.shift();
    if (!proc || turns >= 40) { stop(); start(); }
    touch();
    let full = '', shown = 0, done = false;
    const finish = (err) => { if (done) return; done = true; clearTimeout(to); cur = null; busy = false; turns++; err ? job.reject(new Error(err)) : job.resolve(full); setTimeout(pump, 0); };
    const to = setTimeout(() => { stop(); finish('Não AI phản hồi chậm quá, anh thử lại nha'); }, 60e3);
    cur = {
      delta(t) { full += t; const vis = full.split('@@')[0].replace(/@$/, ''); if (vis.length > shown) { job.onDelta?.(vis.slice(shown)); shown = vis.length; } },
      end() { finish(); }, fail(m) { finish(m); },
    };
    fresh = false;
    try { proc.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: job.content } }) + '\n'); } catch { stop(); finish('Không gửi được tới não AI'); }
  }

  const pad = n => String(n).padStart(2, '0');
  function context(ctx, s, withHistory) {
    const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todos = Array.isArray(ctx.todos) && ctx.todos.length ? ctx.todos.slice(0, 25).map(t => `[${t.done ? 'x' : ' '}] ${String(t.text).slice(0, 120)}${t.remind ? ' (hẹn ' + t.remind + ')' : ''}${t.prio && t.prio < 4 ? ' P' + t.prio : ''}`).join('; ') : 'chưa có việc nào';
    const flows = Array.isArray(ctx.flows) ? ctx.flows.slice(0, 60).map(f => `${String(f.id).slice(0, 60)}=${String(f.name).slice(0, 60)}`).join('; ') : '';
    const runs = Array.isArray(ctx.recentRuns) ? ctx.recentRuns.slice(0, 6).map(r => `${String(r.name).slice(0, 50)}: ${r.status}${r.ago ? ' (' + r.ago + ')' : ''}`).join('; ') : '';
    const hist = withHistory ? s.history.slice(-12).map(h => `${h.role === 'user' ? 'Anh Hưng' : 'Bông'}: ${h.text}`).join('\n') : '';
    return `[BỐI CẢNH]
- Bây giờ: ${DOW[now.getDay()]}, ${today} ${pad(now.getHours())}:${pad(now.getMinutes())}. Trang anh đang mở: ${String(ctx.page || '?').slice(0, 30)}${ctx.voice ? '. [CHẾ ĐỘ GIỌNG NÓI] Câu trả lời được đọc to ngay khi em viết: MỞ ĐẦU bằng một câu cực ngắn dưới 6 chữ (kiểu "Dạ có nè anh!", "Ok anh ơi!", "Để em xem nha.") rồi mới vào ý; viết như văn nói, không gạch đầu dòng, không emoji, không ký hiệu; TUYỆT ĐỐI không nhắc tới chuyện anh đang nói bằng giọng hay em đang đọc.' : ''}
- Việc hôm nay: ${todos}. Quá hạn: ${+ctx.overdue || 0}. Cấp ${+ctx.level || 1} (${String(ctx.levelTitle || '').slice(0, 30)}), chuỗi ${+ctx.streak || 0} ngày.
- Workflow đang chạy: ${String(ctx.runs || 'không').slice(0, 120)}${runs ? '. Lượt chạy gần đây: ' + runs : ''}
- Quy trình có sẵn (id=tên): ${flows || 'không rõ'}
- Việc đã giao cho Claude gần đây (id · trạng thái · tên · kết quả): ${(s.tasks || []).slice(0, 5).map(t => `${t.id} · ${t.status} · ${t.title} · ${String(t.result || '').slice(0, 100)}`).join(' | ') || 'chưa có'}
- Em: giai đoạn ${+ctx.stage || 1} (${String(ctx.stageName || '').slice(0, 30)}), thân thiết ${s.bond}. Điều anh dặn em nhớ: ${s.facts.length ? s.facts.slice(-15).join('; ') : 'chưa có'}${hist ? '\n[ĐOẠN CHAT TRƯỚC ĐÓ]\n' + hist : ''}
[TIN NHẮN]`;
  }
  function parse(full) {
    const [text, meta = ''] = full.split('@@META');
    let m = {}; try { m = JSON.parse((meta.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch { /* model quên META thì thôi */ }
    const actions = (Array.isArray(m.actions) ? m.actions : []).slice(0, 4).filter(a => a && typeof a.type === 'string');
    return { reply: text.trim().replace(/@+$/, '').trim(), mood: MOODS.includes(m.mood) ? m.mood : 'happy', actions };
  }
  async function chat(msg, ctx, onDelta) {
    const s = rd();
    const content = `${context(ctx || {}, s, fresh || !proc)}\nAnh Hưng: ${msg}`;
    const full = await ask(content, onDelta);
    const r = parse(full); if (!r.reply) throw new Error('Não AI chưa trả lời được');
    const s2 = rd();
    for (const a of r.actions) if (a.type === 'remember' && a.fact) { s2.facts.push(String(a.fact).slice(0, 200)); s2.facts = s2.facts.slice(-40); }
    s2.history.push({ role: 'user', text: msg, at: Date.now() }, { role: 'pet', text: r.reply.slice(0, 2000), at: Date.now() }); s2.history = s2.history.slice(-60);
    s2.chats++; s2.bond += 1; wr(s2);
    return { reply: r.reply, mood: r.mood, actions: r.actions.filter(a => a.type !== 'remember'), remembered: r.actions.filter(a => a.type === 'remember').map(a => a.fact), bond: s2.bond };
  }

  setTimeout(warm, 4000);   // khởi động sẵn để câu đầu tiên cũng nhanh

  // ---------- giao việc nặng cho Claude Code chạy nền (đọc dự án, tra web, ghi kết quả vào thư mục riêng; không sửa file ngoài thư mục đó)
  const TASKDIR = path.join(HOME, 'Project/HPBFlow/bong-viec');
  const running = new Map();
  function startTask(title, prompt) {
    const s = rd(); s.tasks = s.tasks || [];
    const id = 'v' + Date.now().toString(36), dir = path.join(TASKDIR, new Date().toISOString().slice(0, 10) + '-' + id);
    fs.mkdirSync(dir, { recursive: true });
    const t = { id, title: String(title).slice(0, 120), prompt: String(prompt).slice(0, 4000), status: 'running', started: Date.now(), dir };
    s.tasks.unshift(t); s.tasks = s.tasks.slice(0, 40); wr(s);
    const env = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin'), process.env.PATH].join(':') };
    const full = `Bạn là Claude Code, được linh vật Bông giao việc thay anh Hưng Phạm (HPB Media). Làm trọn việc dưới đây, tự quyết các bước hợp lý.
Quy tắc: CHỈ ĐỌC dữ liệu ở ~/Project và ~/websites, KHÔNG sửa/xoá file ở đó, không đăng/gửi gì ra ngoài. Mọi kết quả (báo cáo, bản nháp, bảng…) ghi vào thư mục hiện tại: ${dir}. Viết tiếng Việt có dấu.
Bộ nhớ về anh Hưng: ${path.dirname(MEMORY)} (MEMORY.md là mục lục). Dự án: ${PROJECTS}/<dự án>/du-an.yml.
Cuối cùng trả lời 2–4 câu tóm tắt kết quả cho anh Hưng (sẽ được đọc to), nhắc tên file kết quả chính.

VIỆC: ${t.title}
${t.prompt}`;
    runAgent(t, full, null, env);
    return t;
  }
  // một bước Claude đang làm → câu ngắn tiếng Việt để hiện trong thẻ việc
  function stepOf(name, inp = {}) {
    const sh = x => String(x || '').replace(HOME, '~').slice(0, 70);
    const map = { Read: 'Đọc', Grep: 'Tìm', Glob: 'Tìm file', WebSearch: 'Tra web', WebFetch: 'Mở trang', Write: 'Ghi', Edit: 'Sửa', Bash: 'Chạy lệnh', TodoWrite: 'Lập kế hoạch' };
    return `${map[name] || name} ${sh(inp.file_path || inp.path || inp.pattern || inp.query || inp.url || inp.command || inp.description)}`.trim();
  }
  function patchTask(id, fn) { const s2 = rd(), x = (s2.tasks || []).find(k => k.id === id); if (x) { fn(x); wr(s2); } }
  // chạy Claude Code (quyền như cũ: chỉ đọc, ghi trong thư mục của việc); stream-json để ghi lại từng bước, resume để làm tiếp
  function runAgent(t, prompt, resume, env) {
    const args = ['-p', prompt, '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--max-turns', '40',
      '--add-dir', path.join(HOME, 'Project'), '--add-dir', path.join(HOME, 'websites'), '--add-dir', path.dirname(MEMORY),
      '--allowedTools', 'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', `Write(${t.dir}/**)`, `Edit(${t.dir}/**)`, 'Bash(curl:*)', 'Bash(ls:*)', 'Bash(git log:*)', 'Bash(git status:*)', 'Bash(wc:*)'];
    if (resume) args.push('--resume', resume);
    const p = spawn(bin, args, { cwd: t.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', result = null;
    p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'system' && e.session_id) patchTask(t.id, x => { x.session = e.session_id; });
      if (e.type === 'assistant') for (const c of e.message?.content || []) if (c.type === 'tool_use') patchTask(t.id, x => { x.steps = [...(x.steps || []), { at: Date.now(), text: stepOf(c.name, c.input) }].slice(-40); });
      if (e.type === 'result') result = e; } });
    const kill = setTimeout(() => p.kill(), 20 * 60e3);
    running.set(t.id, p);
    p.on('close', code => {
      clearTimeout(kill); running.delete(t.id);
      const r = result || {};
      patchTask(t.id, x => { x.status = r.is_error || (code && !r.result) ? 'error' : 'done'; x.ended = Date.now(); if (r.session_id) x.session = r.session_id;
        x.result = String(r.result || (code ? 'Claude dừng giữa chừng (mã ' + code + ')' : 'Không có kết quả')).slice(0, 3000);
        try { x.files = fs.readdirSync(t.dir).filter(f => !f.startsWith('.')); } catch { x.files = []; }
        x.cost = (x.cost || 0) + (r.total_cost_usd || 0); });
    });
  }
  // làm tiếp / sửa lại một việc đã giao: nối tiếp đúng phiên Claude cũ nếu còn
  function continueTask(id, prompt) {
    const s = rd(), t = (s.tasks || []).find(k => k.id === id);
    if (!t) throw new Error('Không có việc này');
    if (running.has(id)) throw new Error('Việc này đang chạy');
    t.status = 'running'; t.started = Date.now(); t.prompt += '\n\n[Làm tiếp] ' + String(prompt).slice(0, 2000); wr(s);
    const env = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin'), process.env.PATH].join(':') };
    runAgent(t, t.session ? String(prompt) : `VIỆC TRƯỚC: ${t.title}\nKẾT QUẢ TRƯỚC: ${t.result || ''}\n\nLÀM TIẾP: ${prompt}`, t.session, env);
    return t;
  }

  // ---------- cài đặt + giọng ElevenLabs (khoá ở elevenlabs.key trong thư mục dữ liệu, quyền 600)
  // cài đặt cũ (trước khi đổi sang eleven_v3) thì lấy giọng mặc định mới
  const settings = () => { const st = rd().settings || {}; return st.voiceVer >= 2 ? { ...DEFAULTS, ...st } : { ...DEFAULTS, ...st, voiceId: DEFAULTS.voiceId, voiceName: DEFAULTS.voiceName, voiceVer: 2 }; };
  const KEYF = path.join(dataDir, 'elevenlabs.key'), CACHE = path.join(dataDir, 'tts-cache');
  const key = () => { try { return fs.readFileSync(KEYF, 'utf8').trim() || process.env.ELEVENLABS_API_KEY; } catch { return process.env.ELEVENLABS_API_KEY; } };
  async function tts(text, voiceId, speed, res, mood) {
    const st = settings(), vid = voiceId || st.voiceId, sp = Math.max(.8, Math.min(1.2, +speed || st.speed || 1));
    const h = crypto.createHash('sha1').update('v3|' + vid + '|' + sp + '|' + (mood || '') + '|' + text).digest('hex'), f = path.join(CACHE, h + '.mp3');
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    if (fs.existsSync(f)) return fs.createReadStream(f).pipe(res);
    const k = key(); if (!k) return res.status(503).end();
    // eleven_v3: tiếng Việt tự nhiên nhất của ElevenLabs (Flash v2.5 nhanh hơn nhưng giọng lơ lớ); âm thanh đầu tiên ~0,65 s
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ text: (MOOD_TAG[mood] || '[warmly]') + ' ' + text, model_id: 'eleven_v3', language_code: 'vi', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.35, speed: sp } }) });
    if (!r.ok || !r.body) return res.status(502).end();
    const parts = [], keep = text.length <= 60;   // câu ngắn hay lặp ("Dạ em nghe nè") thì giữ lại cho lần sau nói ngay
    for await (const c of r.body) { res.write(c); if (keep) parts.push(Buffer.from(c)); }
    res.end();
    if (keep) { try { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, Buffer.concat(parts)); } catch { /* bỏ qua */ } }
  }

  const pub = s => ({ bond: s.bond, chats: s.chats, facts: s.facts, history: s.history.slice(-30), settings: { ...DEFAULTS, ...(s.settings || {}) } });
  return app => {
    app.get('/api/pet/state', (req, res) => res.json(pub(rd())));
    app.post('/api/pet/warm', (req, res) => { warm(); res.json({ ok: true }); });
    app.get('/api/pet/settings', (req, res) => res.json(settings()));
    app.post('/api/pet/settings', (req, res) => {
      const s = rd(), cur = { ...DEFAULTS, ...(s.settings || {}) }, b = req.body || {};
      for (const k of Object.keys(DEFAULTS)) if (k in b && typeof b[k] === typeof DEFAULTS[k]) cur[k] = b[k];
      cur.voiceVer = 2; cur.stageMin = Math.max(1, Math.min(4, Math.round(cur.stageMin))); cur.speed = Math.max(.8, Math.min(1.2, cur.speed)); cur.name = String(cur.name).slice(0, 20) || 'Bông';
      s.settings = cur; wr(s); res.json(cur);
    });
    app.get('/api/pet/voices', (req, res) => res.json(VOICES));
    // khoá Soniox (nhận dạng giọng nói): người dùng tự dán ở trang Quản lý Bông; chỉ lưu trên máy, quyền 600, không trả lại cho giao diện
    const SXF = path.join(dataDir, 'soniox.key');
    app.get('/api/pet/stt', (req, res) => { let has = false; try { has = fs.readFileSync(SXF, 'utf8').trim().length > 10; } catch { /* chưa có */ } res.json({ hasKey: has }); });
    app.post('/api/pet/stt', (req, res) => {
      const k = String(req.body?.key || '').trim();
      if (req.body?.remove) { fs.rmSync(SXF, { force: true }); return res.json({ hasKey: false }); }
      if (k.length < 20 || /\s/.test(k)) return res.status(400).json({ error: 'Khoá Soniox không hợp lệ' });
      fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(SXF, k, { mode: 0o600 }); fs.chmodSync(SXF, 0o600); res.json({ hasKey: true });
    });
    app.get('/api/pet/tasks', (req, res) => res.json((rd().tasks || []).map(({ prompt, ...t }) => ({ ...t, running: running.has(t.id) }))));
    app.post('/api/pet/tasks', (req, res) => {
      const b = req.body || {}; if (!b.title || !b.prompt) return res.status(400).json({ error: 'Thiếu tên hoặc nội dung việc' });
      if (running.size >= 2) return res.status(429).json({ error: 'Đang có 2 việc chạy nền, đợi xong bớt nha' });
      res.json(startTask(b.title, b.prompt));
    });
    // nhật ký chẩn đoán giọng nói (trạng thái nghe, lỗi micro/Soniox) — để dò "nói mà Bông không phản hồi"
    const VLOG = path.join(dataDir, 'pet-voice.log');
    app.post('/api/pet/log', (req, res) => {
      const lines = (Array.isArray(req.body?.lines) ? req.body.lines : []).slice(0, 50).map(l => String(l).replace(/\s+/g, ' ').slice(0, 300));
      if (lines.length) { try { fs.appendFileSync(VLOG, lines.join('\n') + '\n'); const st = fs.statSync(VLOG); if (st.size > 400e3) { const keep = fs.readFileSync(VLOG, 'utf8').slice(-200e3); fs.writeFileSync(VLOG, keep); } } catch { /* bỏ qua */ } }
      res.json({ ok: true });
    });
    app.get('/api/pet/log', (req, res) => { let t = ''; try { t = fs.readFileSync(VLOG, 'utf8'); } catch { /* chưa có */ } res.type('text/plain').send(t.split('\n').slice(-200).join('\n')); });
    app.post('/api/pet/open-url', (req, res) => { const u = String(req.body?.url || ''); if (!/^https?:\/\/[^\s]+$/.test(u)) return res.status(400).json({ error: 'Link không hợp lệ' }); spawn('open', [u]); res.json({ ok: true }); });
    app.post('/api/pet/tasks/:id/continue', (req, res) => { try { res.json(continueTask(req.params.id, req.body?.prompt || '')); } catch (e) { res.status(400).json({ error: e.message }); } });
    // thao tác nhanh trên máy Mac — chỉ các thao tác trong danh sách, tham số được kiểm tra
    app.post('/api/pet/mac', async (req, res) => {
      const d = String(req.body?.do || ''), arg = req.body?.arg;
      const run = (cmd, a) => new Promise((ok, no) => { const p = spawn(cmd, a); p.on('close', c => (c ? no(new Error('Không làm được')) : ok())); p.on('error', no); });
      try {
        if (d === 'open_app') { const n = String(arg || '').trim(); if (!/^[\p{L}\p{N} .&+'-]{1,40}$/u.test(n)) throw new Error('Tên app không hợp lệ'); await run('open', ['-a', n]); }
        else if (d === 'open_path') { const f = path.resolve(String(arg || '').replace(/^~(?=\/|$)/, HOME)); if (!f.startsWith(HOME + '/') || !fs.existsSync(f)) throw new Error('Không thấy thư mục/file này'); await run('open', [f]); }
        else if (d === 'volume') { const v = Math.round(+arg); if (!(v >= 0 && v <= 100)) throw new Error('Âm lượng 0–100'); await run('osascript', ['-e', `set volume output volume ${v}`]); }
        else if (d === 'mute' || d === 'unmute') await run('osascript', ['-e', `set volume output muted ${d === 'mute'}`]);
        else if (d === 'screenshot') { const f = path.join(HOME, 'Desktop', `Bong-chup-${Date.now()}.png`); await run('screencapture', ['-x', f]); return res.json({ ok: true, file: f }); }
        else throw new Error('Thao tác chưa hỗ trợ');
        res.json({ ok: true });
      } catch (e) { res.status(400).json({ error: e.message }); }
    });
    app.post('/api/pet/tasks/:id/stop', (req, res) => { running.get(req.params.id)?.kill(); res.json({ ok: true }); });
    app.post('/api/pet/tasks/:id/open', (req, res) => { const t = (rd().tasks || []).find(k => k.id === req.params.id); if (t?.dir) spawn('open', [t.dir]); res.json({ ok: !!t }); });
    app.get('/api/pet/knowledge', (req, res) => { const k = knowledge(); res.json({ chars: k.length, projects: (k.match(/^- #/gm) || []).length, memories: (k.match(/^- \[/gm) || []).length }); });
    app.get('/api/pet/tts', async (req, res) => {
      const text = String(req.query.text || '').trim().slice(0, 600); if (!text) return res.status(400).end();
      try { await tts(text, req.query.voice, req.query.speed, res, req.query.mood); } catch { if (!res.headersSent) res.status(502).end(); else res.end(); }
    });
    app.get('/api/pet/usage', async (req, res) => {
      try { const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key() || '' } }); const d = await r.json();
        res.json({ used: d.character_count, limit: d.character_limit, reset: d.next_character_count_reset_unix, tier: d.tier }); } catch { res.json({}); }
    });
    app.post('/api/pet/facts', (req, res) => { const s = rd(), b = req.body || {};
      if (typeof b.remove === 'number') s.facts.splice(b.remove, 1); if (b.add) s.facts.push(String(b.add).slice(0, 200)); s.facts = s.facts.slice(-40); wr(s); res.json(s.facts); });
    app.post('/api/pet/bond', (req, res) => { const s = rd(); s.bond = Math.max(0, Math.min(1e6, s.bond + Math.max(-5, Math.min(5, +req.body?.delta || 0)))); wr(s); res.json({ bond: s.bond }); });
    app.post('/api/pet/note', (req, res) => { const s = rd(), text = String(req.body?.text || '').slice(0, 400); if (text) { s.history.push({ role: 'pet', text, at: Date.now() }); s.history = s.history.slice(-60); wr(s); } res.json({ ok: true }); });
    app.post('/api/pet/clear', (req, res) => { const s = rd(); s.history = []; wr(s); stop(); warm(); res.json({ ok: true }); });
    app.post('/api/pet/chat', async (req, res) => {
      const msg = String(req.body?.message || '').trim().slice(0, 2000); if (!msg) return res.status(400).json({ error: 'Tin nhắn trống' });
      try { res.json(await chat(msg, req.body?.ctx)); } catch (e) { res.status(502).json({ error: e.message }); }
    });
    // như /chat nhưng trả về dần (Server-Sent Events): {d:"chữ"} … rồi {done:true, reply, mood, actions, …} hoặc {error}
    app.post('/api/pet/chat-stream', async (req, res) => {
      const msg = String(req.body?.message || '').trim().slice(0, 2000); if (!msg) return res.status(400).json({ error: 'Tin nhắn trống' });
      res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }); res.flushHeaders?.();
      const send = o => { try { res.write(`data: ${JSON.stringify(o)}\n\n`); } catch { /* client đã đóng */ } };
      try { const r = await chat(msg, req.body?.ctx, d => send({ d })); send({ done: true, ...r }); } catch (e) { send({ error: e.message }); }
      res.end();
    });
  };
}
