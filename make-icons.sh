#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
for S in 16 32 48 128; do rsvg-convert -w "$S" -h "$S" brand/icon.svg -o "chrome/icons/icon-$S.png"; done
rsvg-convert -w 256 -h 256 brand/icon.svg -o site/img/mark-256.png
rsvg-convert -w 112 -h 112 brand/icon.svg -o site/icon.png
command -v optipng >/dev/null && optipng -quiet -o2 chrome/icons/*.png site/icon.png site/img/mark-256.png
echo "icons regenerated from brand/icon.svg"
