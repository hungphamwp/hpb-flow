// Tin tức & video AI: gom tin (Google News RSS) + video (YouTube Data API) khi bấm "Làm mới", lưu cache để mở lên là xem ngay.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const ENV_FILE = path.join(HOME, 'websites/hpb-video-auto/.env');

const NEWS_FEEDS = [
  { id: 'vn', label: 'Tiếng Việt', q: 'trí tuệ nhân tạo OR "AI" OR ChatGPT OR Claude OR Gemini when:2d', hl: 'vi', gl: 'VN', ceid: 'VN:vi' },
  { id: 'en', label: 'Quốc tế', q: '(OpenAI OR Anthropic OR Google Gemini OR "AI agent" OR "generative AI") when:2d', hl: 'en-US', gl: 'US', ceid: 'US:en' },
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

async function fetchNews(feed) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(feed.q)}&hl=${feed.hl}&gl=${feed.gl}&ceid=${feed.ceid}`;
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Google News ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const it = m[1], src = tag(it, 'source'); let title = tag(it, 'title');
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    return { title, source: src, url: tag(it, 'link'), at: new Date(tag(it, 'pubDate')).getTime() || null, lang: feed.id };
  }).filter(n => n.title && n.url);
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

  function digest(news, videos) {
    const head = news.slice(0, 25).map(n => `- ${n.title} (${n.source})`).join('\n');
    const vids = videos.slice(0, 8).map(v => `- ${v.title} — ${v.channel}, ${v.views} lượt xem`).join('\n');
    const prompt = `Bạn là người bạn am hiểu AI, viết cho Hưng (chủ HPB Media, làm web/dữ liệu/tự động hoá cho doanh nghiệp nhỏ, không có thời gian đọc tin). Dựa CHỈ vào các đầu báo và video dưới đây, viết bản tin nhanh bằng tiếng Việt tự nhiên như người nói chuyện, không sáo rỗng, không emoji.
Trả về JSON thuần (không bọc markdown) dạng: {"tom_tat":"2-3 câu nói hôm nay giới AI có gì đáng chú ý nhất","diem_tin":[{"tieu_de":"ngắn gọn","y_chinh":"1-2 câu, nói rõ chuyện gì và vì sao đáng để ý","cho_hung":"1 câu: điều này có ích gì cho việc làm dịch vụ cho doanh nghiệp nhỏ / làm content của Hưng"}],"nen_xem":["tên 2-3 video đáng xem nhất trong danh sách video, kèm lý do ngắn"]}
Chọn 5-6 điểm tin quan trọng nhất, gộp các tin trùng nhau. Không bịa thông tin ngoài danh sách.

TIN:
${head}

VIDEO:
${vids}`;
    return new Promise(res => {
      const env = { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', path.join(HOME, '.local/bin'), process.env.PATH].join(':') };
      const p = spawn('claude', ['-p', prompt, '--output-format', 'text'], { env });
      let out = '', to = setTimeout(() => p.kill(), 150000);
      p.stdout.on('data', d => { out += d; });
      p.on('error', () => { clearTimeout(to); res(null); });
      p.on('close', () => { clearTimeout(to); const m = out.match(/\{[\s\S]*\}/); try { res(m ? JSON.parse(m[0]) : null); } catch { res(null); } });
    });
  }

  async function refresh() {
    const st = rd(STATUS, {});
    if (st.running && Date.now() - new Date(st.at) < 5 * 60e3) throw new Error('Đang làm mới, chờ chút');
    setStatus({ running: true, step: 'Đang lấy tin và video mới…', ok: null });
    (async () => {
      try {
        const errors = [], seen = new Set(); let news = [];
        for (const f of NEWS_FEEDS) {
          try { for (const n of await fetchNews(f)) { const k = n.title.toLowerCase().slice(0, 60); if (!seen.has(k)) { seen.add(k); news.push(n); } } }
          catch (e) { errors.push(`${f.label}: ${e.message}`); }
        }
        news = news.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 80);
        let videos = []; const key = ytKey();
        if (!key) errors.push('Thiếu YOUTUBE_API_KEY nên chưa lấy được video');
        else { try { videos = await fetchVideos(key); } catch (e) { errors.push(e.message); } }
        const prev = rd(FILE, null);
        wr(FILE, { updated: new Date().toISOString(), news, videos, errors, digest: prev?.digest || null, digest_at: prev?.digest_at || null });
        if (!news.length && !videos.length) return setStatus({ running: false, ok: false, step: errors.join(' · ') || 'Không lấy được gì' });
        setStatus({ running: true, step: 'Đang viết tóm tắt nhanh…' });
        const dg = await digest(news, videos), cur = rd(FILE, {});
        if (dg) wr(FILE, { ...cur, digest: dg, digest_at: new Date().toISOString() });
        setStatus({ running: false, ok: true, step: dg ? 'Xong' : 'Đã lấy tin, chưa viết được tóm tắt' });
      } catch (e) { setStatus({ running: false, ok: false, step: 'Lỗi: ' + e.message }); }
    })();
    return { ok: true };
  }
  return { get: () => ({ data: rd(FILE, null), status: rd(STATUS, null) }), refresh };
}
