"""Draws the 440x280 promo tile. 24-bit RGB, no alpha, which the store requires."""
import sys
from PIL import Image, ImageDraw, ImageFont

DEST, FONT, ICON = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 440, 280
BG, INK, YELLOW = (14, 21, 36), (243, 245, 249), (251, 199, 17)

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f

tile = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(tile)
d.rectangle([0, 0, W, 4], fill=YELLOW)

icon = Image.open(ICON).convert("RGBA").resize((62, 62), Image.LANCZOS)
tile.paste(icon, ((W - 62) // 2, 62), icon)

name, tag = font(30, 300), font(15, 300)
for text, f, fill, y in [("Lightmorphic Sidebar", name, INK, 148), ("A side panel for Chrome", tag, YELLOW, 198)]:
    w = d.textbbox((0, 0), text, font=f)[2]
    d.text(((W - w) // 2, y), text, font=f, fill=fill)

tile.save(DEST)
print(DEST, tile.size, tile.mode)
