#!/bin/bash
# Builds build/Tuglet.app (Apple silicon + Intel), signed for local use (no Apple account needed).
set -euo pipefail
cd "$(dirname "$0")/.."
APP=build/Tuglet.app
rm -rf "$APP" build/Tuglet-*
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
for arch in arm64 x86_64; do
  swiftc -O -parse-as-library -target "$arch-apple-macos13.0" Sources/Core/*.swift Sources/App/*.swift -o "build/Tuglet-$arch"
done
lipo -create build/Tuglet-arm64 build/Tuglet-x86_64 -output "$APP/Contents/MacOS/Tuglet"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
# Ad-hoc signature: runs on this Mac; other Macs need a one-time "Open Anyway" (see docs/INSTALL.md).
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --strict "$APP"
echo "Built $APP ($(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist"))"
