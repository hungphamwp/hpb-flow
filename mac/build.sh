#!/bin/bash
# Đóng gói HPB Flow thành app macOS (Apple Silicon) kèm Node, ra dist/HPB Flow.app và dist/HPB-Flow.dmg
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
NODE_VER=v22.23.3
NODE_SHA=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53
VERSION=$(node -p "require('./package.json').version")
APP="$ROOT/dist/HPB Flow.app"
C="$APP/Contents"

rm -rf "$ROOT/dist" && mkdir -p "$C/MacOS" "$C/Resources/app" "$C/Resources/node/bin"

# 1. Node chính thức (không phụ thuộc Homebrew), tải một lần rồi giữ trong mac/.cache
CACHE="$ROOT/mac/.cache"; mkdir -p "$CACHE"
TGZ="$CACHE/node-$NODE_VER-darwin-arm64.tar.gz"
[ -f "$TGZ" ] || curl -fL -o "$TGZ" "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-darwin-arm64.tar.gz"
echo "$NODE_SHA  $TGZ" | shasum -a 256 -c - >/dev/null
tar xzf "$TGZ" -C "$CACHE" "node-$NODE_VER-darwin-arm64/bin/node"
cp "$CACHE/node-$NODE_VER-darwin-arm64/bin/node" "$C/Resources/node/bin/node"

# 2. Code + thư viện
cp -R src public flows package.json package-lock.json "$C/Resources/app/"
(cd "$C/Resources/app" && npm ci --omit=dev --no-audit --no-fund --silent)

# 3. Vỏ app Swift + icon + Info.plist
xcrun swiftc -O -target arm64-apple-macos13 mac/main.swift -o "$C/MacOS/HPBFlow"
cp mac/icon.icns "$C/Resources/icon.icns"
cat > "$C/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>HPB Flow</string>
<key>CFBundleDisplayName</key><string>HPB Flow</string>
<key>CFBundleIdentifier</key><string>vn.hpbmedia.hpb-flow</string>
<key>CFBundleExecutable</key><string>HPBFlow</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VERSION</string>
<key>CFBundleVersion</key><string>$VERSION</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSHumanReadableCopyright</key><string>© HPB Media</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST

# 4. Ký ad-hoc (đủ để chạy trên máy mình; gửi máy khác thì cần Developer ID)
codesign --force --deep --sign - "$APP"

# 5. File .dmg kéo-thả vào Applications
STAGE="$ROOT/dist/dmg"; mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/" && ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "HPB Flow" -srcfolder "$STAGE" -ov -format UDZO "$ROOT/dist/HPB-Flow.dmg"
rm -rf "$STAGE"
du -sh "$APP" "$ROOT/dist/HPB-Flow.dmg"
