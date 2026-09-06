#!/bin/bash
# Regenerates every raster icon from the one SVG. Needs rsvg-convert.
set -euo pipefail
cd "$(dirname "$0")"
# The small sizes come from the simplified mark. At 16px the full one's
# three dots are half a pixel across and its panel block is invisible, so it
# renders as a dark square with a yellow smudge -- which is what a toolbar
# button and a browser tab both show.
for S in 16 32; do rsvg-convert -w "$S" -h "$S" brand/icon-small.svg -o "chrome/icons/icon-$S.png"; done
rsvg-convert -w 48 -h 48 brand/icon.svg -o chrome/icons/icon-48.png

# The 128 is the one the store shows. Google's advice is 96x96 of artwork
# inside 16px of transparent padding, but that assumes a mark that needs
# breathing room. Ours is already an app-icon shape -- a rounded square with
# its own margin drawn in -- so padding it again just makes it look small
# next to everything else. Full bleed, with the corners transparent.
rsvg-convert -w 128 -h 128 brand/icon.svg -o chrome/icons/icon-128.png


rsvg-convert -w 96 -h 96 brand/icon.svg -o site/images/lightmorphic-sidebar-mark.png
rsvg-convert -w 112 -h 112 brand/icon.svg -o site/images/lightmorphic-sidebar-mark-112.png
rsvg-convert -w 180 -h 180 brand/icon.svg -o site/images/lightmorphic-sidebar-mark-180.png

# A declared <link rel="icon"> covers the browser tab, but plenty of things
# ask the server for /favicon.ico regardless and never look at the HTML:
# bookmark bars, history, feed readers, link previews. Without one they show
# a blank page icon. The .ico carries three sizes so each picks its own.
# A browser tab draws the icon at 16px, so the site's icon is the simplified
# mark. The .ico carries the full mark only at 48, where it reads.
cp brand/icon-small.svg site/favicon.svg
rsvg-convert -w 48 -h 48 brand/icon.svg -o /tmp/lm-fav-48.png
rsvg-convert -w 32 -h 32 brand/icon-small.svg -o /tmp/lm-fav-32.png
rsvg-convert -w 16 -h 16 brand/icon-small.svg -o /tmp/lm-fav-16.png
magick /tmp/lm-fav-48.png /tmp/lm-fav-32.png /tmp/lm-fav-16.png site/favicon.ico
rm -f /tmp/lm-fav-48.png /tmp/lm-fav-32.png /tmp/lm-fav-16.png
command -v optipng >/dev/null && optipng -quiet -o2 chrome/icons/*.png site/images/*.png

# optipng squeezes these down to a palette. That still carries transparency,
# but the store branches on whether an icon has alpha at all, so the 128 is
# kept as plain RGBA where there is nothing to read wrong.
magick chrome/icons/icon-128.png PNG32:chrome/icons/icon-128.png
mkdir -p store
cp chrome/icons/icon-128.png store/store-icon-128.png
echo "icons regenerated from brand/icon.svg"
