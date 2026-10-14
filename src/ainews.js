// Tin tức & video AI: tin từ 17 nguồn RSS (hãng chính thức + báo công nghệ + báo Việt) → gom sự kiện → đọc bài gốc → Claude tóm tắt chỉ từ nội dung nguồn;
// video từ YouTube Data API. Tự làm mới mỗi ngày lúc 23:00, bấm "Làm mới" để lấy ngay.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, 'websites/hpb-video-auto/.env');

// Nguồn tin (làm lại 10/10/2026 — Hưng cần tin ĐÚNG, ĐỦ, MỚI, nhiều nguồn): blog chính thức của hãng + báo công nghệ uy tín + báo công nghệ Việt.
// kind: official = hãng tự công bố (độ tin cậy cao nhất), press = báo quốc tế, vn = báo Việt. ai: true = nguồn chuyên AI, false = nguồn chung phải lọc chữ AI.
const NEWS_FEEDS = [
  { src: 'OpenAI', url: 'https://openai.com/news/rss.xml', kind: 'official', ai: true },
  { src: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', kind: 'official', ai: true },
  { src: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', kind: 'official', ai: true },
  { src: 'Anthropic', url: 'https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml', kind: 'official', ai: true },
  { src: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', kind: 'official', ai: true },
  { src: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', kind: 'press', ai: true },
  { src: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', kind: 'press', ai: true },
  { src: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/', kind: 'press', ai: true },
  { src: 'Wired', url: 'https://www.wired.com/feed/tag/ai/latest/rss', kind: 'press', ai: true },
  { src: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', kind: 'press', ai: true },
  { src: 'The Decoder', url: 'https://the-decoder.com/feed/', kind: 'press', ai: true },
  { src: '9to5Mac', url: 'https://9to5mac.com/feed/', kind: 'press', ai: false },
  { src: 'Reuters', url: 'https://news.google.com/rss/search?q=site:reuters.com+(AI+OR+OpenAI+OR+Anthropic+OR+Gemini+OR+Nvidia)+when:3d&hl=en-US&gl=US&ceid=US:en', kind: 'press', ai: false, gnews: true },
  { src: 'VnExpress', url: 'https://vnexpress.net/rss/so-hoa.rss', kind: 'vn', ai: false },
  { src: 'Thanh Niên', timeout: 30000, url: 'https://thanhnien.vn/rss/cong-nghe.rss', kind: 'vn', ai: false },
  { src: 'Tuổi Trẻ', url: 'https://tuoitre.vn/rss/nhip-song-so.rss', kind: 'vn', ai: false },
  { src: 'Genk', url: 'https://genk.vn/rss/ai.rss', kind: 'vn', ai: true },
];
const VIDEO_QUERIES = ['tin tức AI hôm nay', 'AI mới ra mắt', 'ChatGPT Claude Gemini mới nhất', 'AI agent tự động hoá', 'cách dùng AI kiếm tiền', 'công cụ AI mới'];
// "ai" trong tiếng Việt là đại từ ("ai ngờ"), nên chữ AI phải viết hoa mới tính; các tên riêng khác tìm không phân biệt hoa thường
const AI_UP = /\bA\.?I\b/, AI_LOW = /ChatGPT|\bGPT|Claude|Gemini|OpenAI|Anthropic|Copilot|Midjourney|\bSora\b|Grok|DeepSeek|\bLLM|AI agent|agent|trí tuệ nhân tạo|Cursor|n8n|NotebookLM|\bVeo\b|Nano Banana|prompt|Perplexity|Manus/i;
const NOT_AI = /LÀ AI\b|AI NGỜ|AI BIẾT|AI CŨNG/;
const isAI = sn => !NOT_AI.test(sn.title) && AI_UP.test(sn.title) || AI_LOW.test(sn.title) || AI_LOW.test((sn.description || '').slice(0, 120));

const ytKey = () => {
  try { const l = fs.readFileSync(ENV_FILE, 'utf8').split('\n').find(x => x.startsWith('YOUTUBE_API_KEY=')); return l ? l.slice(16).trim() : null; } catch { return null; }
};
const dec = s => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, '').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? dec(m[1]) : ''; };

const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' };
const tagAny = (x, ts) => { for (const t of ts) { const v = tag(x, t); if (v) return v; } return ''; };
async function fetchNews(feed) {
  const r = await fetch(feed.url, { headers: UA, signal: AbortSignal.timeout(feed.timeout || 20000) });
  if (!r.ok) throw new Error(`${feed.src} ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<(item|entry)[\s>]([\s\S]*?)<\/\1>/g)].map(m => {
    const it = m[2]; let title = tag(it, 'title');
    let src = feed.src; if (feed.gnews) { const s2 = tag(it, 'source'); if (s2 && title.endsWith(' - ' + s2)) title = title.slice(0, -(s2.length + 3)); }
    const link = tag(it, 'link') || (it.match(/<link[^>]+href="([^"]+)"/) || [])[1] || '';
    const at = new Date(tagAny(it, ['pubDate', 'published', 'updated', 'dc:date'])).getTime() || null;
    const desc = tagAny(it, ['description', 'summary', 'content:encoded', 'content']).replace(/\s+/g, ' ').slice(0, 600);
    return { title, source: src, url: link.trim(), at, desc, kind: feed.kind, lang: feed.kind === 'vn' ? 'vn' : 'en', gnews: !!feed.gnews };
  }).filter(n => n.title && n.url && (feed.ai || isAIText(n.title + ' ' + n.desc.slice(0, 200))));
}
// lọc tin AI cho nguồn chung (báo Việt, 9to5Mac, Reuters)
const isAIText = t => AI_UP.test(t) && !NOT_AI.test(t) || AI_LOW.test(t);

// lấy chữ bài gốc (các thẻ <p>) để Claude tóm tắt theo NỘI DUNG chứ không theo tiêu đề
async function articleText(url) {
  if (/news\.google\.com/.test(url)) return '';
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return '';
    const h = (await r.text()).replace(/<(script|style|noscript|svg|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
    const ps = [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => dec(m[1]).replace(/\s+/g, ' ').trim()).filter(t => t.length > 60);
    return ps.join('\n').slice(0, 3500);
  } catch { return ''; }
}

const isoDur = d => { const m = String(d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); if (!m) return 0; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };

async function fetchVideos(key) {
  const after = new Date(Date.now() - 7 * 864e5).toISOString();
  const ids = new Map();
  for (const q of VIDEO_QUERIES) {
    const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&order=viewCount&publishedAfter=${after}&regionCode=VN&relevanceLanguage=vi&q=${encodeURIComponent(q)}&key=${key}`;
    const d = await fetch(u, { signal: AbortSignal.timeout(20000) }).then(r => r.json());
    if (d.error) throw new Error('YouTube API: ' + d.error.message);
    for (const it of d.items || []) if (!ids.has(it.id.videoId) && it.snippet.liveBroadcastContent === 'none' && isAI(it.snippet)) ids.set(it.id.videoId, it.snippet);
  }
  const list = [...ids.keys()], out = [];
  for (let i = 0; i < list.length; i += 50) {
    const d = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${list.slice(i, i + 50).join(',')}&key=${key}`, { signal: AbortSignal.timeout(20000) }).then(r => r.json());
    if (d.error) throw new Error('YouTube API: ' + d.error.message);
    for (const v of d.items || []) {
      const sn = ids.get(v.id), sec = isoDur(v.contentDetails?.duration);
      out.push({ id: v.id, title: dec(sn.title), channel: dec(sn.channelTitle), at: new Date(sn.publishedAt).getTime(), views: +v.statistics?.viewCount || 0, likes: +v.statistics?.likeCount || 0, comments: +v.statistics?.commentCount || 0, sec,
        short: sec > 0 && sec <= 62, thumb: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` });
    }
  }
  return out.sort((a, b) => b.views - a.views);
}

export function createAiNews(dataDir) {
  const FILE = path.join(dataDir, 'ainews.json'), STATUS = path.join(dataDir, 'ainews-status.json');
  const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const wr = (f, v) => { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };
  const setStatus = s => wr(STATUS, { ...rd(STATUS, {}), ...s, at: new Date().toISOString() });

  // gọi Claude CLI (gói Claude của Hưng), đưa prompt qua stdin vì danh sách tin dài
  const claude = (prompt, ms = 240000) => new Promise(res => {
    const env = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin'), process.env.PATH].join(':') };
    const p = spawn('claude', ['-p', '--output-format', 'text', '--model', 'sonnet'], { env });
    let out = '', to = setTimeout(() => p.kill(), ms);
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => { clearTimeout(to); res(null); });
    p.on('close', () => { clearTimeout(to); const m = out.match(/\{[\s\S]*\}/); try { res(m ? JSON.parse(m[0]) : null); } catch { try { fs.writeFileSync(path.join(dataDir, 'claude-loi.txt'), out); } catch { /* bỏ qua */ } res(null); } });
    p.stdin.end(prompt);
  });

  // Bước 1: gom các bài cùng một sự kiện, chấm độ quan trọng (chỉ dựa vào tiêu đề + mô tả RSS)
  async function cluster(news) {
    const lines = news.map((n, i) => `${i}|${n.source}|${n.kind}|${new Date(n.at).toISOString().slice(0, 16)}|${n.title}|${n.desc.slice(0, 220)}`).join('\n');
    const r = await claude(`Bạn là biên tập viên tin công nghệ. Dưới đây là các bài báo (id|nguồn|loại nguồn|giờ UTC|tiêu đề|mô tả).
Việc của bạn: GOM các bài nói về CÙNG MỘT sự kiện thành một nhóm, bỏ bài không liên quan tới AI (ví dụ bài chỉ nói về iPhone, game, chính trị không dính AI), chấm điểm quan trọng 1-10 cho người làm dịch vụ web/AI/tự động hoá cho doanh nghiệp nhỏ ở Việt Nam (ra mắt model/sản phẩm AI lớn, thay đổi giá, công cụ dùng được ngay, chính sách AI ở Việt Nam = điểm cao; bài phân tích chung chung, quảng cáo = điểm thấp).
Trả JSON thuần: {"su_kien":[{"ids":[số id],"tieu_de":"tiêu đề tiếng Việt, đúng tên riêng như trong bài, không thêm thông tin","diem":1-10,"nhom":"mo_hinh|san_pham|doanh_nghiep|chinh_sach|nghien_cuu|bao_mat|viet_nam|khac"}]}
Mỗi id chỉ thuộc một nhóm. Không bịa.

${lines}`);
    return Array.isArray(r?.su_kien) ? r.su_kien.filter(e => Array.isArray(e.ids) && e.ids.length) : null;
  }

  // Bước 2: đọc bài gốc của các sự kiện quan trọng rồi viết tóm tắt CHỈ từ nội dung nguồn
  async function writeBatch(stories, base) {
    const blocks = stories.map((s, i0) => `### SỰ KIỆN ${base + i0}: ${s.tieu_de}\n` + s.nguon.map(n => `- Nguồn: ${n.source} (${n.kind === 'official' ? 'CHÍNH THỨC từ hãng' : n.kind === 'vn' ? 'báo Việt' : 'báo quốc tế'}), đăng ${new Date(n.at).toISOString().slice(0, 16)} UTC\n  Tiêu đề: ${n.title}\n  Mô tả: ${n.desc.slice(0, 300)}${n.text ? `\n  Nội dung bài: ${n.text.slice(0, 2200)}` : ''}`).join('\n')).join('\n\n');
    return claude(`Bạn viết bản tin AI cho Hưng (chủ HPB Media, làm web, AI, tự động hoá cho doanh nghiệp nhỏ ở Việt Nam). YÊU CẦU QUAN TRỌNG NHẤT: CHÍNH XÁC.
- CHỈ dùng dữ kiện có trong phần nguồn bên dưới. Không dùng kiến thức bên ngoài, không đoán, không làm tròn hay đổi con số, giữ nguyên tên model/sản phẩm/công ty như trong bài.
- Nếu các nguồn nói khác nhau, ghi rõ ở "luu_y". Nếu chỉ có tiêu đề/mô tả ngắn, viết ngắn, đừng thêm chi tiết.
- Tiếng Việt tự nhiên, không sáo rỗng, không emoji.
Trả JSON thuần: {"su_kien":[{"so":số thứ tự SỰ KIỆN,"tieu_de":"ngắn, đúng sự thật","tom_tat":"2-3 câu: ai làm gì, khi nào, con số chính","chi_tiet":["2-4 gạch đầu dòng dữ kiện cụ thể lấy từ nguồn"],"cho_hung":"1 câu: dùng được gì cho dịch vụ/content của Hưng, rỗng nếu không liên quan","luu_y":"mâu thuẫn giữa các nguồn hoặc điều chưa xác nhận, rỗng nếu không có"}]}
Viết cho TẤT CẢ sự kiện, giữ đúng thứ tự.

${blocks}`, 240000);
  }
  // chia nhóm 4 sự kiện, chạy 3 nhóm song song (một lần quá dài thì Claude trả JSON vỡ — lỗi 10/10)
  async function write(stories) {
    const groups = []; for (let i = 0; i < stories.length; i += 4) groups.push([stories.slice(i, i + 4), i]);
    const res = await Promise.all(groups.map(([g, b]) => writeBatch(g, b).then(r => r || writeBatch(g, b))));
    const su_kien = res.flatMap(r => r?.su_kien || []);
    if (!su_kien.length) return null;
    const tt = await claude(`Dựa CHỈ vào các tóm tắt sự kiện AI dưới đây, viết 2-3 câu tiếng Việt nói hôm nay giới AI có gì quan trọng nhất (không thêm dữ kiện ngoài). Trả JSON thuần {"tom_tat_chung":"..."}\n\n${su_kien.map(x => '- ' + x.tieu_de + ': ' + x.tom_tat).join('\n')}`, 120000);
    return { tom_tat_chung: tt?.tom_tat_chung || '', su_kien };
  }

  async function refresh() {
    const st = rd(STATUS, {});
    if (st.running && Date.now() - new Date(st.at) < 12 * 60e3) throw new Error('Đang làm mới, chờ chút');
    setStatus({ running: true, step: `Đang lấy tin từ ${NEWS_FEEDS.length} nguồn…`, ok: null });
    (async () => {
      try {
        const errors = [], seen = new Set(); let news = [];
        const got = await Promise.allSettled(NEWS_FEEDS.map(fetchNews));
        got.forEach((g, i) => { if (g.status === 'rejected') errors.push(`${NEWS_FEEDS[i].src}: ${g.reason?.message || 'lỗi'}`); else for (const n of g.value) { const k = n.url.split('?')[0]; if (!seen.has(k)) { seen.add(k); news.push(n); } } });
        // chỉ lấy tin mới: 48 giờ, ít quá thì nới 72 giờ
        const fresh = h => news.filter(n => n.at && Date.now() - n.at < h * 3600e3);
        news = (fresh(48).length >= 25 ? fresh(48) : fresh(72)).sort((a, b) => b.at - a.at).slice(0, 160);
        let videos = []; const key = ytKey();
        if (!key) errors.push('Thiếu YOUTUBE_API_KEY nên chưa lấy được video');
        else { setStatus({ running: true, step: 'Đang lấy video…' }); try { videos = await fetchVideos(key); } catch (e) { errors.push(e.message); } }
        const prev = rd(FILE, null);
        const srcOk = NEWS_FEEDS.length - errors.filter(e => NEWS_FEEDS.some(f => e.startsWith(f.src))).length;
        wr(FILE, { ...(prev || {}), v: 2, updated: new Date().toISOString(), news, videos, errors, sources: srcOk, sources_total: NEWS_FEEDS.length });
        if (!news.length) return setStatus({ running: false, ok: false, step: errors.join(' · ') || 'Không lấy được tin' });
        setStatus({ running: true, step: `Đang gom ${news.length} bài thành các sự kiện…` });
        const cl = await cluster(news);
        if (!cl) return setStatus({ running: false, ok: false, step: 'Đã lấy tin nhưng chưa gom được sự kiện (Claude không trả lời)' });
        // độ tin cậy tính bằng code: số nguồn KHÁC NHAU + có nguồn chính thức không
        let stories = cl.map(e => {
          const items = [...new Set(e.ids)].map(i => news[i]).filter(Boolean);
          const srcs = [...new Set(items.map(n => n.source))];
          return { tieu_de: e.tieu_de, diem: +e.diem || 0, nhom: e.nhom || 'khac', nguon: items, so_nguon: srcs.length, chinh_thuc: items.some(n => n.kind === 'official'), viet_nam: items.some(n => n.kind === 'vn'), at: Math.max(...items.map(n => n.at || 0)) };
        }).filter(s => s.nguon.length);
        const rank = s => s.diem * 10 + Math.min(s.so_nguon, 5) * 6 + (s.chinh_thuc ? 12 : 0) + Math.max(0, 24 - (Date.now() - s.at) / 3600e3) / 3;
        stories.sort((a, b) => rank(b) - rank(a));
        const top = stories.slice(0, 12);
        setStatus({ running: true, step: `Đang đọc bài gốc của ${top.length} sự kiện quan trọng…` });
        for (const s of top) {
          // đọc tối đa 2 bài: ưu tiên nguồn chính thức, rồi báo quốc tế
          const pick = [...s.nguon].sort((a, b) => ({ official: 0, press: 1, vn: 2 }[a.kind] - { official: 0, press: 1, vn: 2 }[b.kind])).filter(n => !n.gnews).slice(0, 2);
          for (const n of pick) n.text = await articleText(n.url);
        }
        setStatus({ running: true, step: 'Đang viết tóm tắt từ nội dung bài…' });
        const w = await write(top);
        const out = stories.map((s, i) => {
          const x = i < top.length ? (w?.su_kien || []).find(z => +z.so === i) : null;
          return { ...s, viet: x || null, nguon: s.nguon.map(({ text, ...n }) => ({ ...n, da_doc: !!text })) };
        });
        const cur = rd(FILE, {});
        wr(FILE, { ...cur, stories: out, digest: w ? { tom_tat: w.tom_tat_chung } : null, digest_at: new Date().toISOString() });
        setStatus({ running: false, ok: true, step: w ? 'Xong' : 'Đã gom sự kiện, chưa viết được tóm tắt' });
      } catch (e) { setStatus({ running: false, ok: false, step: 'Lỗi: ' + e.message }); }
    })();
    return { ok: true };
  }
  // tự làm mới MỖI NGÀY 1 LẦN lúc 23:00 (Hưng chốt 10/10/2026). Máy tắt/ngủ đúng 23:00 thì làm bù khi mở máy trước 6:00 sáng hôm sau.
  const lastMoc = () => { const m = new Date(); m.setHours(23, 0, 0, 0); if (Date.now() < +m) m.setDate(m.getDate() - 1); return +m; };
  const tick = () => {
    const h = new Date().getHours(), d = rd(FILE, null);
    if ((h >= 23 || h < 6) && (!d || d.v !== 2 || new Date(d.updated).getTime() < lastMoc())) refresh().catch(() => {});
  };
  setTimeout(tick, 90e3); setInterval(tick, 10 * 60e3);
  return { get: () => ({ data: rd(FILE, null), status: rd(STATUS, null) }), refresh };
}
