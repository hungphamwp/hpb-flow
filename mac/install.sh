#!/bin/bash
# Cài bản vừa build (dist/HPB Flow.app) vào /Applications: thoát app đang chạy, thay bản mới,
# đăng ký lại với LaunchServices rồi mở lại. Dùng thay cho rm + cp tay (dễ làm Dock hiện icon cấm).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd)/dist/HPB Flow.app"
DST="/Applications/HPB Flow.app"
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -d "$SRC" ] || { echo "Chưa có $SRC — chạy mac/build.sh trước"; exit 1; }

# Không thay app khi đang có flow chạy
if curl -s -m 2 http://127.0.0.1:4719/api/runs?limit=20 | grep -q '"status":"running"'; then
  echo "Đang có flow chạy — đợi xong rồi cài lại"; exit 1
fi

osascript -e 'quit app "HPB Flow"' 2>/dev/null || true
for _ in $(seq 1 20); do pgrep -f "$DST/Contents/Resources/app/src/server.js" >/dev/null || break; sleep 0.5; done
pkill -f "$DST/Contents/Resources/app/src/server.js" 2>/dev/null || true

# Thay NỘI DUNG bên trong, giữ nguyên thư mục .app: Dock nhớ app bằng bookmark trỏ tới đúng thư mục này,
# xoá rồi chép lại (rm -rf + ditto) làm bookmark gãy → Dock hiện icon cấm dù đường dẫn không đổi.
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
"$LSREG" -u "$SRC" 2>/dev/null || true
"$LSREG" -f -R "$DST"
touch "$DST"   # Dock đọc lại icon của bản mới
# Mở lại app và chờ máy chủ lên; app không mở được thì Dock chỉ còn lối tắt tới bản cũ (hiện icon cấm)
for i in 1 2 3; do
  open "$DST"
  for _ in $(seq 1 20); do curl -s -m 1 -o /dev/null http://127.0.0.1:4719/ && break 2; sleep 0.5; done
done
curl -s -m 2 -o /dev/null http://127.0.0.1:4719/ || { echo "Cài xong nhưng app chưa mở được — mở tay HPB Flow trong /Applications"; exit 1; }
echo "Đã cài $DST"
