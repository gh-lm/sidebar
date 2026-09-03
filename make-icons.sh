#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
for S in 16 32 48; do rsvg-convert -w "$S" -h "$S" brand/icon.svg -o "chrome/icons/icon-$S.png"; done

# The 128 is the one the store shows. Google's advice is 96x96 of artwork
# inside 16px of transparent padding, but that assumes a mark that needs
# breathing room. Ours is already an app-icon shape -- a rounded square with
# its own margin drawn in -- so padding it again just makes it look small
# next to everything else. Full bleed, with the corners transparent.
rsvg-convert -w 128 -h 128 brand/icon.svg -o chrome/icons/icon-128.png


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
