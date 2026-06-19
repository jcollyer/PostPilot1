"""Render the PostPilot paper-plane icon to PNGs (offline, via Pillow)."""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4                      # supersample factor
BASE = 1024
S = BASE * SS               # working canvas
RADIUS = 224 * SS           # squircle corner radius
ANGLE = 18                  # plane tilt (nose up-right)

def lerp(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))

def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

# ---- diagonal gradient background -----------------------------------------
stops = [(0.0, hexrgb('#0D9488')), (0.55, hexrgb('#0EA5B7')), (1.0, hexrgb('#22D3EE'))]
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
t = (xx + yy) / (2 * (S - 1))
bg = np.zeros((S, S, 3), dtype=np.float32)
for i in range(len(stops) - 1):
    a, ca = stops[i]
    b, cb = stops[i + 1]
    m = (t >= a) & (t <= b) if i == 0 else (t > a) & (t <= b)
    lt = np.clip((t - a) / (b - a), 0, 1)
    for ch in range(3):
        bg[..., ch] = np.where(m, ca[ch] + (cb[ch] - ca[ch]) * lt, bg[..., ch])
img = Image.fromarray(bg.astype(np.uint8), 'RGB')

# ---- soft top-left glow ----------------------------------------------------
cx, cy, r = 0.28 * S, 0.22 * S, 0.95 * S
d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
glow_a = np.clip(0.22 * (1 - d / r), 0, 1)
glow = np.zeros((S, S, 4), dtype=np.uint8)
glow[..., 0:3] = 255
glow[..., 3] = (glow_a * 255).astype(np.uint8)
img = Image.alpha_composite(img.convert('RGBA'), Image.fromarray(glow, 'RGBA'))

# ---- plane geometry (base 1024 space, scaled by SS) -----------------------
def P(pts):
    return [(x * SS, y * SS) for x, y in pts]

NOSE = (772, 512)
TAIL_TOP = (252, 332)
NOTCH = (392, 512)
TAIL_BOT = (252, 692)

silhouette = P([NOSE, TAIL_TOP, NOTCH, TAIL_BOT])
upper = P([NOSE, TAIL_TOP, NOTCH])
lower = P([NOSE, NOTCH, TAIL_BOT])

# shadow layer
shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ds = ImageDraw.Draw(shadow)
ds.polygon(silhouette, fill=(13, 90, 84, 150))
shadow = shadow.filter(ImageFilter.GaussianBlur(22 * SS))
shadow = shadow.transform(
    (S, S), Image.AFFINE, (1, 0, 0, 0, 1, -20 * SS), resample=Image.BICUBIC)

# plane layer
plane = Image.new('RGBA', (S, S), (0, 0, 0, 0))
dp = ImageDraw.Draw(plane)
# dotted flight trail (behind plane, fading toward the tail)
trail_pts = []
for i in range(7):
    tt = i / 6
    bx = (1 - tt) ** 2 * 214 + 2 * (1 - tt) * tt * 300 + tt ** 2 * 384
    by = (1 - tt) ** 2 * 726 + 2 * (1 - tt) * tt * 650 + tt ** 2 * 580
    trail_pts.append((bx, by, tt))
for bx, by, tt in trail_pts:
    rr = (10 + 6 * tt) * SS
    a = int(150 * (0.35 + 0.65 * tt))
    dp.ellipse([(bx * SS - rr, by * SS - rr), (bx * SS + rr, by * SS + rr)],
               fill=(255, 255, 255, a))
dp.polygon(lower, fill=(207, 247, 251, 255))   # underside / lower wing
dp.polygon(upper, fill=(255, 255, 255, 255))   # top / upper wing
dp.line([P([NOSE])[0], P([NOTCH])[0]], fill=(255, 255, 255, 235), width=6 * SS)

# rotate plane + shadow together (nose up-right)
plane = plane.rotate(ANGLE, resample=Image.BICUBIC, center=(S / 2, S / 2))
shadow = shadow.rotate(ANGLE, resample=Image.BICUBIC, center=(S / 2, S / 2))

img = Image.alpha_composite(img, shadow)
img = Image.alpha_composite(img, plane)

# ---- squircle mask ---------------------------------------------------------
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=255)
img.putalpha(mask)

# ---- export ----------------------------------------------------------------
master = img.resize((BASE, BASE), Image.LANCZOS)
master.save('postpilot-icon-1024.png')

sizes = {
    'postpilot-icon-512.png': 512,
    'postpilot-icon-192.png': 192,
    'postpilot-icon-180.png': 180,
    'postpilot-icon-48.png': 48,
    'favicon-32.png': 32,
}
for name, sz in sizes.items():
    img.resize((sz, sz), Image.LANCZOS).save(name)

# full-bleed (no rounded mask) for adaptive/mobile use
full = Image.alpha_composite(
    Image.alpha_composite(
        Image.alpha_composite(Image.fromarray(bg.astype(np.uint8), 'RGB').convert('RGBA'),
                              Image.fromarray(glow, 'RGBA')),
        shadow),
    plane).resize((BASE, BASE), Image.LANCZOS)
full.convert('RGB').save('postpilot-icon-1024-fullbleed.png')

print('rendered:', 'postpilot-icon-1024.png + 5 sizes + fullbleed')
