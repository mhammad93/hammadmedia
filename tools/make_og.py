#!/usr/bin/env python
"""Render assets/og.jpg (1200x630) from performance.json + the site's own fonts.

Re-run after any stats update so the share image can never drift from the page:
    python tools/make_og.py
Requires: Pillow, fonttools, brotli (all in the Anaconda base env).
"""
import json
import os
import tempfile

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
BG = (11, 19, 14)        # --bg-dark
PAPER = (246, 244, 238)  # --paper
CREAM_DIM = (179, 187, 177)
GREEN = (61, 220, 132)   # --green

performance = json.load(open(os.path.join(ROOT, "performance.json")))


def load_font(name, size, axes):
    """woff2 -> temp ttf -> PIL font with variable axes set."""
    src = os.path.join(ROOT, "assets", "fonts", f"{name}.woff2")
    tmp = os.path.join(tempfile.gettempdir(), f"og-{name}.ttf")
    if not os.path.exists(tmp):
        f = TTFont(src)
        f.flavor = None
        f.save(tmp)
    font = ImageFont.truetype(tmp, size)
    font.set_variation_by_axes(axes)
    return font


def tracked(draw, pos, text, font, fill, tracking):
    """Draw text with letterspacing; returns end x."""
    x, y = pos
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

# soft green glow, top-left like the hero
glow = Image.new("L", (W, H), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse((-350, -420, 750, 280), fill=26)
from PIL import ImageFilter
glow = glow.filter(ImageFilter.GaussianBlur(120))
im = Image.composite(Image.new("RGB", (W, H), (24, 44, 31)), im, glow)
d = ImageDraw.Draw(im)

M = 84  # margin

# Share-card copy follows the selected homepage; metric values come from the public source.
h_roman = load_font("fraunces-roman", 82, [144, 600])
h_italic = load_font("fraunces-italic", 82, [144, 600])
d.text((M, 84), "The creator behind", font=h_roman, fill=PAPER)
d.text((M, 183), "your next campaign.", font=h_italic, fill=GREEN)

m_semibold = load_font("manrope", 34, [600])
m_medium = load_font("manrope", 26, [500])
metric = performance["metrics"]["janAugGmv"]
line1 = f"{metric['value']['en']} attributed GMV · {metric['period']['en']}"
line2 = "Creator-led TikTok Shop partnerships · Health & wellness"
line3 = "Both profiles · Rounded cumulative estimate · Past results vary"
for y, text, font, color in [(350, line1, m_semibold, PAPER), (411, line2, m_medium, GREEN), (456, line3, m_medium, CREAM_DIM)]:
    if d.textlength(text, font=font) > W - 2 * M:
        raise ValueError("Share-card text exceeds its safe width")
    d.text((M, y), text, font=font, fill=color)

# footer rule + letterspaced wordmark
d.line((M, 528, W - M, 528), fill=(61, 220, 132, 60), width=1)
m_caps = load_font("manrope", 22, [700])
wordmark = "HAMMADMEDIA.COM"
track = 6
wm_w = sum(d.textlength(c, font=m_caps) + track for c in wordmark) - track
tracked(d, ((W - wm_w) / 2, 556), wordmark, m_caps, CREAM_DIM, track)

out = os.path.join(ROOT, "assets", "og.jpg")
im.save(out, "JPEG", quality=90)
print(f"wrote {out} ({os.path.getsize(out)} bytes, {W}x{H})")
