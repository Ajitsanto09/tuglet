#!/bin/bash
# Zips build/Tuglet.app for a GitHub Release, writes SHA256SUMS, then checks the ZIP itself.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' Resources/Info.plist)
ZIP="Tuglet-$VERSION-mac.zip"
grep -q "## \[$VERSION\]" CHANGELOG.md || { echo "CHANGELOG.md has no [$VERSION] section"; exit 1; }
rm -rf release && mkdir release
ditto -c -k --keepParent build/Tuglet.app "release/$ZIP"
(cd release && shasum -a 256 "$ZIP" > SHA256SUMS)

# Verify the archive as a teammate would receive it.
TMP=$(mktemp -d)
ditto -x -k "release/$ZIP" "$TMP"
APP="$TMP/Tuglet.app"
codesign --verify --strict "$APP"
[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")" = "$VERSION" ]
lipo -archs "$APP/Contents/MacOS/Tuglet" | grep -q arm64
lipo -archs "$APP/Contents/MacOS/Tuglet" | grep -q x86_64
[ -f "$APP/Contents/Resources/AppIcon.icns" ]
(cd release && shasum -a 256 -c SHA256SUMS)
echo "release/$ZIP verified (signature, version $VERSION, arm64 + x86_64, icon, checksum)"
