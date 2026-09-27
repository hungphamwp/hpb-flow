export const STEP_DOCS = {
  goto: '{ url, wait_until?: "domcontentloaded"|"load"|"networkidle" }',
  click: '{ selector: string|string[], force? } — mảng = các phương án dự phòng, lấy cái đầu tiên hiện ra',
  type: '{ selector?, text } — click vào ô rồi gõ; xuống dòng dùng Shift+Enter (đổi bằng newline_key)',
  fill: '{ selector, text } — dùng cho input/textarea thường',
  press: '{ key, selector? } — ví dụ "Enter", "Meta+A"',
  sleep: '{ ms } — tối đa 10000; chỉ dùng khi không có điều kiện nào để chờ',
  wait_for: '{ selector (state: "hidden" để chờ biến mất) | text | url_includes | count_gt: { selector, value }, timeout? }',
  count: '{ selector } → số phần tử, dùng với save_as rồi count_gt để chờ phần tử mới',
  upload: '{ selector (input[type=file]), files: đường dẫn, cách nhau bởi dấu phẩy/xuống dòng }',
  extract: '{ selector, attr?, all?, fields?: { cot: { selector?, attr? } } } → chuỗi / mảng / mảng object',
  eval: '{ script: thân hàm JS chạy trong trang, nhận biến args; args? }',
  scroll: '{ times, delay?, distance?, target_selector? }',
  collect_responses: '{ url? (mở trang sau khi đã nghe mạng), url_includes, pick: thân hàm JS nhận json trả về mảng dòng, times?, delay?, max?, scroll_selector?, trigger_selector?, idle_stop? } — cuộn và gom dữ liệu từ API của trang',
  download: '{ url | selector (img/video/a), filename } → đường dẫn file đã lưu',
  screenshot: '{ filename?, full_page? }',
  save_excel: '{ data: "{{vars.x}}", filename }',
  save_json: '{ data, filename }',
  human_pause: '{ message } — dừng chờ người dùng bấm Tiếp tục trên giao diện',
  log: '{ message }',
  set: '{ value } → gán biến bằng save_as',
  return: '{ value } — kết quả cuối của flow',
  for_each: '{ items: mảng hoặc chuỗi nhiều dòng, steps: [...], collect?: giá trị gom mỗi vòng } — trong vòng dùng {{item}}, {{index}}',
};

export const FLOW_GUIDE = `# Cách viết flow cho GaBee Mac

Flow là file JSON:
{
  "name": "ten-flow-khong-dau", "title": "Tên hiển thị", "group": "Facebook",
  "description": "Mô tả ngắn",
  "inputs": [ { "name": "content", "label": "Nội dung", "type": "textarea|text|file|number|checkbox", "required": true, "default": "" } ],
  "steps": [ { "type": "goto", "url": "https://..." }, ... ]
}

Mọi step đều nhận thêm: label (ghi chú), optional (lỗi thì bỏ qua), timeout (ms), save_as (lưu kết quả vào {{vars.ten}}), when (chỉ chạy nếu giá trị sau khi thay biến là truthy).
Biến: {{inputs.x}}, {{vars.x}}, {{item}}, {{index}}, {{now}}.

Quy trình khuyên dùng khi tạo flow mới:
1. list_flows / get_flow để chép flow gần giống.
2. list_profiles, rồi open_page với profile đã đăng nhập sẵn.
3. snapshot_page để đọc cấu trúc trang (cây accessibility), chọn selector.
4. page_action thử từng step trên tab thật.
5. save_flow, run_flow, rồi get_run để đọc log và kết quả.

Nguyên tắc:
- Selector ưu tiên role/aria (ví dụ role=button[name=/Đăng|Post/i]) hoặc data-e2e/data-testid; đưa nhiều phương án dạng mảng vì giao diện hay đổi, và đủ cả tiếng Việt lẫn tiếng Anh.
- Chờ bằng wait_for, không dùng sleep dài.
- Muốn lấy dữ liệu danh sách, ưu tiên collect_responses (đọc API của trang) thay vì bóc DOM.
- Mỗi profile là một phiên đăng nhập riêng. Hỏi người dùng trước khi chạy flow đăng bài/gửi tin trên tài khoản thật; flow đăng bài nên có human_pause trước bước bấm Đăng.
- Không viết flow né hệ thống chống bot, tạo/nuôi tài khoản hàng loạt, spam hay mua tương tác.

Các step:
` + Object.entries(STEP_DOCS).map(([k, v]) => `- ${k}: ${v}`).join('\n');
