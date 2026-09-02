#!/bin/bash
# Rebuilds every image in store/ from the panel's own HTML and CSS.
#
# The panel is real: chrome/ is copied as-is and handed a stub browser
# (stub.js) that answers chrome.bookmarks and friends with fixture data, so
# what is photographed is the shipping markup, not a mockup. Headless Chrome
# comes from puppeteer, downloaded on first run into work/.
set -euo pipefail
cd "$(dirname "$0")"
HERE=$(pwd)
WORK=$HERE/work
REPO=$HERE/../..

rm -rf "$WORK/site"
mkdir -p "$WORK/site" "$WORK/node"
cp -r "$REPO/chrome" "$WORK/site/app"
cp frame.html tile.html "$WORK/site/"
cp stub.js "$WORK/site/app/sidebar/stub.js"
cp -r fav "$WORK/site/fav"

python3 - "$WORK/site/app/sidebar" <<'PY'
import pathlib, sys
d = pathlib.Path(sys.argv[1])
h = d / "sidebar.html"
s = h.read_text()
tag = '<script type="module" src="sidebar.js"></script>'
h.write_text(s.replace(tag, '<script src="stub.js"></script>\n  ' + tag))
j = d / "sidebar.js"
j.write_text(j.read_text() + '''
/* harness hooks, added by tools/store-shots/build.sh */
window.__tab = (n) => document.querySelector(`.rail-btn[data-panel="${n}"]`).click();
window.__open = (u) => openPanelSite(u);
''')
PY

export PUPPETEER_CACHE_DIR="$WORK/node/.cache"
cd "$WORK/node"
[ -d node_modules/puppeteer ] || { npm init -y >/dev/null 2>&1; npm install puppeteer --no-audit --no-fund >/dev/null; }

cd "$WORK/site"
python3 -m http.server 8731 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

mkdir -p "$WORK/out"
# Node resolves modules from the script's own directory, so the scripts run
# from beside node_modules rather than from tools/store-shots.
cp "$HERE/shoot.js" "$HERE/tile.js" "$WORK/node/"
cd "$WORK/node"
node shoot.js "$WORK/out"
node tile.js "$WORK/out/promo-tile-440x280.png"

# Shot at 2x-3x and resampled down, which is what makes the type crisp at
# the store's exact pixel sizes.
python3 - "$WORK/out" "$REPO/store" <<'PY'
import pathlib, sys
from PIL import Image
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(exist_ok=True)
for f in sorted(src.glob("*.png")):
    size = (440, 280) if "tile" in f.name else (1280, 800)
    Image.open(f).convert("RGB").resize(size, Image.LANCZOS).save(dst / f.name)
    print(f.name, size)
PY
