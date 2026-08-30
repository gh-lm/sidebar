#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
for S in 16 32 48 128; do rsvg-convert -w "$S" -h "$S" brand/icon.svg -o "chrome/icons/icon-$S.png"; done
rsvg-convert -w 96 -h 96 brand/icon.svg -o site/images/sidemorphic-mark.png
rsvg-convert -w 112 -h 112 brand/icon.svg -o site/images/sidemorphic-mark-112.png
command -v optipng >/dev/null && optipng -quiet -o2 chrome/icons/*.png site/images/*.png
echo "icons regenerated from brand/icon.svg"
