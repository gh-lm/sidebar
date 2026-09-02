#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
for S in 16 32 48; do rsvg-convert -w "$S" -h "$S" brand/icon.svg -o "chrome/icons/icon-$S.png"; done

# The 128 is the one the store shows. Google asks for 96x96 of artwork with
# 16px of transparent padding on each side, and warns that an icon with no
# alpha gets dropped into a frame with rounded corners instead. Drawn full
# bleed it comes out oversized next to every other listing.
rsvg-convert -w 96 -h 96 brand/icon.svg -o /tmp/lm-icon-96.png
magick /tmp/lm-icon-96.png -background none -gravity center -extent 128x128 \
  PNG32:chrome/icons/icon-128.png
rm -f /tmp/lm-icon-96.png


rsvg-convert -w 96 -h 96 brand/icon.svg -o site/images/lightmorphic-sidebar-mark.png
rsvg-convert -w 112 -h 112 brand/icon.svg -o site/images/lightmorphic-sidebar-mark-112.png
command -v optipng >/dev/null && optipng -quiet -o2 chrome/icons/*.png site/images/*.png

# optipng squeezes these down to a palette. That still carries transparency,
# but the store branches on whether an icon has alpha at all, so the 128 is
# kept as plain RGBA where there is nothing to read wrong.
magick chrome/icons/icon-128.png PNG32:chrome/icons/icon-128.png
mkdir -p store
cp chrome/icons/icon-128.png store/store-icon-128.png
echo "icons regenerated from brand/icon.svg"
