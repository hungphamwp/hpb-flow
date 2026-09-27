import { NODE_DOCS } from './nodes.js';

export const FLOW_GUIDE = `# Viết flow cho HPB Flow

Flow là đồ thị node, cùng định dạng với bản gốc:

{
  "id": "ten-flow", "name": "Tên hiển thị", "description": "Mô tả", "tags": ["facebook"],
  "inputs": [ {"name": "prompt", "type": "string", "required": true, "description": "..."} ],
  "vars": { "prompt": "" },
  "nodes": [
    {"id": "n0", "label": "Mở trình duyệt", "type": "browser_session", "params": {}, "next": "n1"},
    {"id": "n1", "label": "Vào trang", "type": "goto", "params": {"url": "https://example.com", "wait_until": "domcontentloaded"}, "next": "n2"},
    {"id": "n2", "label": "Trả kết quả", "type": "return", "params": {"url": "{{vars.url}}"}}
  ]
}

- Node nối nhau bằng next; không có next = kết thúc nhánh. on_error trỏ tới node chạy khi node lỗi.
- inputs là MẢNG. type: string | number | select (kèm options) | image | array. Giá trị vào node qua {{vars.ten}}.
- Mọi param nhận template {{vars.x}}; chuỗi chỉ gồm một template thì giữ nguyên kiểu (mảng, số…). Trong {{ }} có thể viết biểu thức JS.
- Mọi node nên có label ngắn, nói việc làm gì.

Quy trình tạo flow mới:
1. get_flow_guide → list_nodes → list_flows + get_flow (chép flow gần giống nhất rồi sửa).
2. list_profiles → hỏi người dùng chọn profile → open_page mở trang đích trên profile đó.
3. snapshot_page lấy cấu trúc trang và selector thật. Không đoán selector.
4. page_action thử từng thao tác (click / type / eval) tới khi đúng.
5. run_draft chạy thử cả flow chưa lưu, sửa tới khi chạy được. Chỉ save_flow thứ đã chạy được và người dùng sẽ dùng lại.
6. run_flow rồi get_run_status; đọc output thật, output_paths phải có file nếu flow lưu gì đó. Chưa đọc nội dung thì chưa được nói là xong.

Nguyên tắc:
- Không chờ cứng bằng wait {ms} (trừ chờ animation ≤ 300ms). Dùng wait_for_function với expression (KHÔNG có return) + polling.
- Thao tác bằng node native (click, type, key_press, hover, scroll) — sự kiện thật, isTrusted. eval_js chỉ để ĐỌC trang. Khi không có selector ổn định: eval_js gắn id cho phần tử (el.id = '__gb_x'), rồi node click bấm '#__gb_x'.
- eval_js bọc trong function: phải return, không await, đọc biến qua object vars.
- type mặc định fill(); trang mở khoá nút gửi khi thấy gõ phím (ChatGPT, Perplexity) thì dùng mode "keystrokes", delay 20–50.
- selector nhận mảng dự phòng, cái ổn định nhất đứng trước; kèm cả nhãn tiếng Việt lẫn tiếng Anh.
- Ảnh blob: trên Gemini/ChatGPT: lọc bằng src.startsWith('blob:') || naturalWidth > 50.
- Trả file, đừng trả URL: dùng download_file / save_images_to_library rồi return đường dẫn với key tên path/file/dir/saved.
- Flow 10–20 node; lặp thì dùng loop (times + until_expression), đừng chép node nhiều lần.
- Đọc câu trả lời chat AI: trước khi gửi, eval_js chốt mốc window.__gabeeBaseCount / window.__gabeeBaseText; chờ nút stop XUẤT HIỆN; rồi poll_stream_text với done_expression + done_settle. Chép từ flow chatgpt-ask / gemini-ask.
- Không dùng human_pause khi tự chạy flow qua MCP (bạn không bấm được nút). Cần đăng nhập thì open_page rồi bảo người dùng đăng nhập vào cửa sổ đó.
- Flow chạy trên tài khoản thật: hỏi người dùng trước khi đăng bài, gửi, xoá, thanh toán. run_flow trả status running thì dùng get_run_status, TUYỆT ĐỐI không gọi run_flow lại.
- Không viết flow né hệ thống chống bot, tạo/nuôi tài khoản hàng loạt, spam hay mua tương tác.

Lỗi hay gặp: rơi vào trang đăng nhập = sai profile; ELEMENT_NOT_FOUND = selector đoán hoặc thiếu wait_for_function; status ok nhưng output rỗng = thiếu node return hoặc output_var sai tên.

Các node (xem list_nodes để có mô tả tham số):
` + Object.entries(NODE_DOCS).map(([k, v]) => `- ${k}: ${v.desc}`).join('\n');
