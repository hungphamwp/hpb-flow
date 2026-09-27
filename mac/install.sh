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

rm -rf "$DST"
ditto "$SRC" "$DST"
"$LSREG" -u "$SRC" 2>/dev/null || true
"$LSREG" -f -R "$DST"
open "$DST"
echo "Đã cài $DST"
