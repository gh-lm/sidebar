#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
for S in 16 32; do rsvg-convert -w "$S" -h "$S" brand/icon-small.svg -o "chrome/icons/icon-$S.png"; done
rsvg-convert -w 48 -h 48 brand/icon.svg -o chrome/icons/icon-48.png

rsvg-convert -w 128 -h 128 brand/icon.svg -o chrome/icons/icon-128.png

rsvg-convert -w 96 -h 96 brand/icon.svg -o site/images/lightmorphic-sidebar-mark.png
rsvg-convert -w 112 -h 112 brand/icon.svg -o site/images/lightmorphic-sidebar-mark-112.png
rsvg-convert -w 180 -h 180 brand/icon.svg -o site/images/lightmorphic-sidebar-mark-180.png

cp brand/icon-small.svg site/favicon.svg
rsvg-convert -w 48 -h 48 brand/icon.svg -o /tmp/lm-fav-48.png
rsvg-convert -w 32 -h 32 brand/icon-small.svg -o /tmp/lm-fav-32.png
rsvg-convert -w 16 -h 16 brand/icon-small.svg -o /tmp/lm-fav-16.png
magick /tmp/lm-fav-48.png /tmp/lm-fav-32.png /tmp/lm-fav-16.png site/favicon.ico
rm -f /tmp/lm-fav-48.png /tmp/lm-fav-32.png /tmp/lm-fav-16.png
command -v optipng >/dev/null && optipng -quiet -o2 chrome/icons/*.png site/images/*.png

magick chrome/icons/icon-128.png PNG32:chrome/icons/icon-128.png
mkdir -p store
cp chrome/icons/icon-128.png store/store-icon-128.png
echo "icons regenerated from brand/icon.svg"
