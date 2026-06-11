#!/usr/bin/env python
"""Render assets/og.jpg (1200x630) from content.json + the site's own fonts.

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

content = json.load(open(os.path.join(ROOT, "content.json")))


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

# headline — Fraunces 600 like the hero h1
h_roman = load_font("fraunces-roman", 88, [144, 600])
h_italic = load_font("fraunces-italic", 88, [144, 600])
d.text((M, 96), "I turn supplements", font=h_roman, fill=PAPER)
x = d.textlength("into ", font=h_roman)
d.text((M, 196), "into ", font=h_roman, fill=PAPER)
d.text((M + x, 196), "bestsellers.", font=h_italic, fill=GREEN)

# proof lines from content.json — never hand-typed
stat = lambda kw: next(s["value"] for s in content["stats"] if kw in s["label"])
line1 = (
    f"{content['hero']['gmvYtd']} GMV in 2026   ·   "
    f"{stat('PRODUCT VIEWS')} product views   ·   {stat('UNITS SOLD')} units sold"
)
line2 = "#1 Health & Wellness Affiliate — TikTok Shop US, 2025"

m_semibold = load_font("manrope", 33, [600])
m_medium = load_font("manrope", 29, [500])
d.text((M, 368), line1, font=m_semibold, fill=PAPER)
d.text((M, 424), line2, font=m_medium, fill=GREEN)

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
