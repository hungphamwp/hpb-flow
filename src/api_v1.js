// REST API (/api/v1/*) và AI API kiểu OpenAI (/v1/*): dùng ChatGPT/Gemini đang đăng nhập trong profile như một API.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { getSettings } from './settings.js';
import { listFlows, getFlow, summarize } from './flows.js';
import { listProfiles } from './browser.js';

export function aiModels() {
  const out = [];
  for (const f of listFlows()) {
    if (f.api?.type !== 'ai-api') continue;
    for (const [id, label] of Object.entries(f.api.models || {})) out.push({ id, label, surface: f.api.surface || 'chat', flow: f.id, primary: !!f.api.primary });
  }
  return out;
}

export function mountApi(app, { startRun, waitRun }) {
  const v1 = express.Router();
  v1.use((req, res, next) => {
    const s = getSettings();
    if (!s.api_enabled) return res.status(403).json({ error: 'API đang tắt. Bật trong trang API của GaBee Mac.' });
    const key = req.get('x-api-key') || (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (key !== s.api_key) return res.status(401).json({ error: 'Sai API key' });
    next();
  });
  const wrap = fn => async (req, res) => { try { res.json(await fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); } };

  // ---- REST
  v1.get('/profiles', wrap(() => listProfiles()));
  v1.get('/flows', wrap(() => listFlows().map(summarize)));
  v1.get('/flows/:id', wrap(req => getFlow(req.params.id)));
  v1.post('/flows/:id/run', wrap(async req => {
    const run = startRun(getFlow(req.params.id), req.body?.vars || {}, { profile: req.body?.profile_id, keepTab: req.body?.keep_tab, source: 'api' });
    return waitRun(run.id, 600);
  }));
  v1.post('/flows/:id/queue', wrap(req => {
    const run = startRun(getFlow(req.params.id), req.body?.vars || {}, { profile: req.body?.profile_id, source: 'api' });
    return { run_id: run.id, status: run.status };
  }));
  v1.get('/flow-jobs/:id', wrap(req => waitRun(req.params.id, 0)));
  app.use('/api/v1', v1);

  // ---- AI API (OpenAI-compatible)
  const ai = express.Router();
  ai.use((req, res, next) => {
    const s = getSettings();
    if (!s.api_enabled || !s.ai_api_enabled) return res.status(403).json({ error: { message: 'AI API đang tắt' } });
    const key = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.get('x-api-key');
    if (key !== s.api_key) return res.status(401).json({ error: { message: 'Sai API key' } });
    next();
  });
  ai.get('/models', (req, res) => res.json({ object: 'list', data: aiModels().map(m => ({ id: m.id, object: 'model', owned_by: 'gabee', surface: m.surface, flow: m.flow })) }));

  function pickModel(id, surface) {
    const models = aiModels().filter(m => m.surface === surface);
    return models.find(m => m.id === id) || models.find(m => m.primary) || models[0];
  }
  ai.post('/chat/completions', async (req, res) => {
    try {
      const { model, messages = [], stream, profile_id, conversation_url } = req.body || {};
      const m = pickModel(model, 'chat');
      if (!m) throw new Error('Chưa có flow chat nào khai báo api');
      const sys = messages.filter(x => x.role === 'system').map(x => x.content).join('\n');
      const user = [...messages].reverse().find(x => x.role === 'user');
      const text = c => (typeof c === 'string' ? c : (c || []).map(p => p.text || '').join('\n'));
      const prompt = (sys ? sys + '\n\n' : '') + text(user?.content || '');
      const vars = { prompt, model: m.label || '', response_format: 'markdown' };
      if (conversation_url) vars.target_url = conversation_url;
      const run = startRun(getFlow(m.flow), vars, { profile: profile_id || getSettings().ai_profile, source: 'api' });
      const r = await waitRun(run.id, 600);
      if (r.status !== 'ok') throw new Error(r.error || 'Flow lỗi');
      const content = String(r.output?.response ?? r.output?.answer ?? JSON.stringify(r.output));
      const id = 'chatcmpl-' + run.id, created = Math.floor(Date.now() / 1000);
      if (stream) {
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: m.id, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: m.id, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
        return res.end();
      }
      res.json({ id, object: 'chat.completion', created, model: m.id, conversation_url: r.output?.conversation_url,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    } catch (e) { res.status(400).json({ error: { message: e.message, type: 'flow_error' } }); }
  });
  ai.post('/images/generations', async (req, res) => {
    try {
      const { model, prompt, profile_id, image } = req.body || {};
      const m = pickModel(model, 'image');
      if (!m) throw new Error('Chưa có flow tạo ảnh nào khai báo api');
      const run = startRun(getFlow(m.flow), { prompt, input_images: image || '' }, { profile: profile_id || getSettings().ai_profile, source: 'api' });
      const r = await waitRun(run.id, 900);
      if (r.status !== 'ok') throw new Error(r.error || 'Flow lỗi');
      const paths = r.output?.media_result?.paths || [];
      if (!paths.length) throw new Error('Không tạo được ảnh');
      res.json({ created: Math.floor(Date.now() / 1000), data: paths.map(p => ({ b64_json: fs.readFileSync(p).toString('base64'), path: p, revised_prompt: prompt })) });
    } catch (e) { res.status(400).json({ error: { message: e.message } }); }
  });
  app.use('/v1', ai);

  app.get('/api/openapi.json', (req, res) => res.json({
    openapi: '3.0.0', info: { title: 'GaBee Mac API', version: '0.2.0', description: 'Mọi route /api/v1 và /v1 cần header X-API-Key hoặc Authorization: Bearer <key>.' },
    paths: {
      '/api/v1/profiles': { get: { summary: 'Danh sách profile' } },
      '/api/v1/flows': { get: { summary: 'Danh sách flow' } },
      '/api/v1/flows/{id}/run': { post: { summary: 'Chạy flow đồng bộ', requestBody: { content: { 'application/json': { schema: { properties: { vars: { type: 'object' }, profile_id: { type: 'string' }, keep_tab: { type: 'boolean' } } } } } } } },
      '/api/v1/flows/{id}/queue': { post: { summary: 'Xếp hàng chạy, trả run_id' } },
      '/api/v1/flow-jobs/{id}': { get: { summary: 'Trạng thái lượt chạy' } },
      '/v1/models': { get: { summary: 'Model AI khả dụng (OpenAI-compatible)' } },
      '/v1/chat/completions': { post: { summary: 'Chat qua ChatGPT/Gemini/Grok/Perplexity đang đăng nhập' } },
      '/v1/images/generations': { post: { summary: 'Tạo ảnh qua ChatGPT/Gemini đang đăng nhập' } },
    },
  }));
}
