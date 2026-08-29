#!/bin/bash
# Builds the store zip. Refuses if anything that must not ship is present.
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(python3 -c "import json;print(json.load(open('chrome/manifest.json'))['version'])")

if [ -d dev ]; then
  echo "REFUSING: dev/ exists — remove the preview stub before packaging." >&2
  exit 1
fi
if grep -rn "src=[\"']http\|url([\"']\?http\|@import.*http" chrome/ ; then
  echo "REFUSING: a remote asset is referenced above." >&2
  exit 1
fi

mkdir -p dist
rm -f "dist/sidemorphic-$VERSION.zip"
( cd chrome && zip -qr "../dist/sidemorphic-$VERSION.zip" . -x '.*' )
echo "dist/sidemorphic-$VERSION.zip"
unzip -l "dist/sidemorphic-$VERSION.zip" | tail -1
