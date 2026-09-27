# GaBee Mac

Bản viết lại cho macOS của GaBee (app tự động hoá trình duyệt bằng flow, điều khiển được từ coding agent qua MCP). Chạy bằng Google Chrome có sẵn trên máy, mỗi hồ sơ một cửa sổ Chrome với phiên đăng nhập riêng.

## Chạy

```bash
npm install
npm start            # http://127.0.0.1:4719
```

Hoặc mở `~/Applications/GaBee Mac.app` (tự bật server rồi mở giao diện).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/engine.js` | Trình chạy flow dạng đồ thị node (id → next / on_error, condition, loop) |
| `src/nodes.js` | 34 loại node, cùng tên và tham số với flow GaBee gốc |
| `src/template.js` | Thay biến `{{vars.x}}`, biểu thức condition |
| `src/browser.js` | Hồ sơ Chrome (proxy, chạy ẩn), kết nối CDP |
| `src/server.js` | API nội bộ cho giao diện, lượt chạy, tab làm việc |
| `src/api_v1.js` | REST `/api/v1/*` và AI API kiểu OpenAI `/v1/*` (cần khoá API) |
| `src/mcp.js` | Cổng MCP stdio cho Claude Code, Claude Desktop, Gemini CLI, Codex, Cursor, Antigravity |
| `src/agents.js` | Ghi/gỡ cấu hình MCP cho từng agent |
| `public/` | Giao diện: Tổng quan, Workflow (grid + canvas), Lần chạy, Thư viện, Hồ sơ, Proxy, Trình duyệt, API, Cài đặt |

Dữ liệu người dùng: `~/Library/Application Support/GaBeeMac/` (flows, profiles, library/media, runs, settings.json). Kết quả flow: `~/Downloads/GaBeeMac`.

## Flow

Định dạng giống GaBee gốc:

```json
{
  "id": "ten-flow", "name": "Tên", "inputs": [{"name": "url", "type": "string", "required": true}], "vars": {"url": ""},
  "nodes": [
    {"id": "n0", "label": "Mở trình duyệt", "type": "browser_session", "params": {}, "next": "n1"},
    {"id": "n1", "label": "Vào trang", "type": "goto", "params": {"url": "{{vars.url}}", "wait_until": "domcontentloaded"}, "next": "n2"},
    {"id": "n2", "label": "Trả kết quả", "type": "return", "params": {"url": "{{vars.url}}"}}
  ]
}
```

Xem hướng dẫn đầy đủ: tool MCP `get_flow_guide` hoặc `GET /api/guide`.

## Khác với bản Windows

- Chỉ có engine Chrome CDP. Flow khai `cloak` / `adspower` tự chạy bằng Chrome của hồ sơ.
- Không có worker riêng; mọi thứ chạy trong một tiến trình Node.
