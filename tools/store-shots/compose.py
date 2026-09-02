"""Sets each capture of the running panel onto the listing canvas.

The panel image is untouched apart from being scaled down from the 3x
capture; the ground, the headline and the shadow are drawn around it.
Output is 24-bit RGB with no alpha, which is what the store accepts.
"""
import json, sys
from PIL import Image, ImageDraw, ImageFont

OUT, DEST, FONT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1280, 800
PANEL_W, PANEL_H = 430, 720
PANEL_X, PANEL_Y = W - 72 - PANEL_W, 40
RADIUS = 16

DARK = {"bg": (14, 21, 36), "h1": (243, 245, 249), "p": (154, 166, 189), "shadow": 150}
LIGHT = {"bg": (244, 242, 236), "h1": (17, 24, 39), "p": (75, 85, 99), "shadow": 60}
YELLOW = (251, 199, 17)

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([weight])
    return f

def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius, fill=255)
    im.putalpha(mask)
    return im

shots = json.load(open(f"{OUT}/shots.json"))
for shot in shots:
    t = LIGHT if shot.get("light") else DARK
    canvas = Image.new("RGB", (W, H), t["bg"])
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, W, 5], fill=YELLOW)

    h1 = font(46, 300)
    body = font(19, 300)
    y = 258
    for line in shot["h"].split("|"):
        draw.text((88, y), line, font=h1, fill=t["h1"])
        y += 56
    y += 34
    for line in shot["s"].split("|"):
        draw.text((88, y), line, font=body, fill=t["p"])
        y += 29

    panel = Image.open(f"{OUT}/panel-{shot['file']}").convert("RGB")
    panel = panel.resize((PANEL_W, PANEL_H), Image.LANCZOS)
    panel = rounded(panel, RADIUS)

    # Soft drop shadow, drawn from the panel's own rounded silhouette.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [PANEL_X, PANEL_Y + 18, PANEL_X + PANEL_W, PANEL_Y + PANEL_H + 18],
        RADIUS, fill=(0, 0, 0, t["shadow"]))
    from PIL import ImageFilter
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)

    canvas.paste(panel, (PANEL_X, PANEL_Y), panel)
    canvas = canvas.convert("RGB")
    canvas.save(f"{DEST}/{shot['file']}")
    print(shot["file"], canvas.size, canvas.mode)
