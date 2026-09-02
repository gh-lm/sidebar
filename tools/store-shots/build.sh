#!/bin/bash
# Rebuilds every image in store/ from the extension actually running.
#
# Chrome is launched with chrome/ loaded unpacked, and each screenshot is a
# capture of the extension's own panel page, with the real chrome.bookmarks,
# chrome.storage and favicon service behind it. The sample data in
# store/sample-data.json is written through the browser's own bookmarks API,
# so the panel reads it exactly as it reads a real user's.
#
# Needs node and python3. Headless Chrome and puppeteer are downloaded on
# first run into work/, which is not committed.
set -euo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)
WORK=$HERE/work
REPO=$(cd ../.. && pwd)

mkdir -p "$WORK/node" "$WORK/out"
rm -rf "$WORK/profile"

export PUPPETEER_CACHE_DIR="$WORK/node/.cache"
cd "$WORK/node"
[ -d node_modules/puppeteer ] || { npm init -y >/dev/null 2>&1; npm install puppeteer --no-audit --no-fund >/dev/null; }

# Node resolves modules from the script's own directory, so it runs from
# beside node_modules rather than from tools/store-shots.
cp "$HERE/shoot.js" "$WORK/node/"
node shoot.js "$REPO" "$WORK/out" "$WORK/profile"

# The captures are taken at 3x and resampled down, which is what makes the
# type crisp at the store's exact pixel sizes.
FONT=$WORK/Manrope.ttf
python3 - "$REPO/chrome/fonts/Manrope.woff2" "$FONT" <<'PY'
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1]); f.flavor = None; f.save(sys.argv[2])
PY

python3 "$HERE/compose.py" "$WORK/out" "$REPO/store" "$FONT"
python3 "$HERE/promo.py" "$WORK/out" "$REPO/store" "$FONT" "$REPO/chrome/icons/icon-128.png"

# The store rejects transparency on the tiles, and says so unclearly.
python3 - "$REPO/store" <<'PY'
import pathlib, sys
from struct import unpack
bad = []
for f in sorted(pathlib.Path(sys.argv[1]).glob("*.png")):
    d = f.open("rb").read(33)
    w, h = unpack(">II", d[16:24])
    ok = d[25] == 2 and (w, h) in {(1280, 800), (440, 280), (1400, 560)}
    print("%-30s %dx%d  %d-bit  colour type %d  %s" % (f.name, w, h, d[24], d[25], "ok" if ok else "WRONG"))
    if not ok: bad.append(f.name)
sys.exit(1 if bad else 0)
PY
