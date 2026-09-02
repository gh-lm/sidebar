"""Draws the two promotional tiles: the required 440x280 small tile and the
optional 1400x560 marquee used for featured placement.

Both are 24-bit RGB with no alpha, which the store requires and rejects
unclearly if it is wrong. The marquee carries a real capture of the panel,
scaled down from the 3x shot and bled off the bottom edge.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT, DEST, FONT, ICON = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
BG, INK, DIM, YELLOW = (14, 21, 36), (243, 245, 249), (154, 166, 189), (251, 199, 17)


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius, fill=255)
    im.putalpha(mask)
    return im


def small_tile():
    W, H = 440, 280
    tile = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(tile)
    d.rectangle([0, 0, W, 4], fill=YELLOW)

    icon = Image.open(ICON).convert("RGBA").resize((62, 62), Image.LANCZOS)
    tile.paste(icon, ((W - 62) // 2, 62), icon)

    for text, f, fill, y in [
        ("Lightmorphic Sidebar", font(30, 300), INK, 148),
        ("A side panel for Chrome", font(15, 300), YELLOW, 198),
    ]:
        w = d.textbbox((0, 0), text, font=f)[2]
        d.text(((W - w) // 2, y), text, font=f, fill=fill)

    out = f"{DEST}/promo-tile-440x280.png"
    tile.save(out)
    print(out, tile.size, tile.mode)


def marquee():
    W, H = 1400, 560
    PW, PY, RADIUS = 360, 52, 16
    PX = W - 128 - PW

    canvas = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, W, 5], fill=YELLOW)

    icon = Image.open(ICON).convert("RGBA").resize((84, 84), Image.LANCZOS)
    canvas.paste(icon, (128, 150), icon)
    d.text((128, 268), "Lightmorphic Sidebar", font=font(58, 300), fill=INK)
    d.text((130, 356), "Any website, beside the one you are reading.", font=font(24, 300), fill=DIM)
    d.text((130, 394), "Plus search, a scratchpad and snippets.", font=font(24, 300), fill=DIM)

    # The panel runs off the bottom edge rather than being shrunk to fit,
    # so it stays readable at the size the store actually draws this.
    panel = Image.open(f"{OUT}/panel-01-panel.png").convert("RGB")
    scale = PW / panel.width
    panel = panel.resize((PW, round(panel.height * scale)), Image.LANCZOS)
    panel = panel.crop((0, 0, PW, H - PY))
    panel = rounded(panel, RADIUS)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [PX, PY + 14, PX + PW, H + 40], RADIUS, fill=(0, 0, 0, 150))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(24)))
    canvas.paste(panel, (PX, PY), panel)

    out = f"{DEST}/promo-marquee-1400x560.png"
    canvas.convert("RGB").save(out)
    print(out, (W, H), "RGB")


small_tile()
marquee()
