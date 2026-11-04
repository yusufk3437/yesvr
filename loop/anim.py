import numpy as np, cv2, sys, subprocess
from scipy.ndimage import gaussian_filter
from multiprocessing import Pool

T = 600           # 20 s @ 30 fps, every motion is periodic in T -> seamless loop
FPS = 30
OUT_W, OUT_H = 1920, 1080

src = cv2.imread('src.png').astype(np.float32) / 255.0   # BGR
H, W = src.shape[:2]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
TAU = 2 * np.pi

def gauss(cx, cy, sx, sy):
    return np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2) / 2).astype(np.float32)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def bump(t, c, w):
    """smooth periodic bump centred at time c (frames) with width w."""
    d = (t - c + T / 2) % T - T / 2
    return np.exp(-(d / w) ** 2)

def tnoise(h, w, sy, sx, seed, octaves=3):
    r = np.random.default_rng(seed)
    n = np.zeros((h, w), np.float32)
    amp = 1.0
    for o in range(octaves):
        g = gaussian_filter(r.standard_normal((h, w)).astype(np.float32), (sy / 2 ** o, sx / 2 ** o), mode='wrap')
        n += amp * g / (g.std() + 1e-6)
        amp *= 0.5
    n = (n - n.min()) / (n.max() - n.min())
    return n

lum0 = (0.114 * src[..., 0] + 0.587 * src[..., 1] + 0.299 * src[..., 2])

# ---------------------------------------------------------------- body warps
w_chest = gauss(830, 470, 150, 95)
w_head = gauss(790, 265, 95, 95)
w_lid1 = gauss(785, 291, 22, 6.5)
w_lid2 = gauss(858, 270, 14, 5)
w_cat = gauss(960, 690, 85, 45)
w_cathead = gauss(775, 660, 55, 45)
w_ivy = gauss(520, 120, 70, 110)

hand_poly = np.array([(878, 605), (890, 590), (915, 578), (950, 572), (985, 580), (1020, 588),
                      (1075, 592), (1082, 640), (1040, 642), (990, 628), (950, 620), (915, 626), (890, 626)], np.int32)
hm = np.zeros((H, W), np.uint8)
cv2.fillPoly(hm, [hand_poly], 255)
hm = cv2.GaussianBlur(hm.astype(np.float32) / 255, (0, 0), 5)
w_hand = hm * np.clip((1095 - xx) / 215, 0.2, 1.0)
w_fur = gauss(897, 628, 24, 13) * 0.5
w_hand = np.maximum(w_hand, w_fur)

# ---------------------------------------------------------------- fire setup
FY0, FY1, FX0, FX1 = 100, 910, 0, 300
fyy, fxx = yy[FY0:FY1, FX0:FX1], xx[FY0:FY1, FX0:FX1]
fpoly = np.array([(0, 115), (60, 150), (130, 228), (176, 300), (186, 480), (176, 505), (172, 880), (0, 905)], np.int32)
fm = np.zeros((H, W), np.uint8)
cv2.fillPoly(fm, [fpoly], 255)
fm = cv2.GaussianBlur(fm.astype(np.float32) / 255, (0, 0), 6)[FY0:FY1, FX0:FX1]
flum = cv2.GaussianBlur(lum0, (0, 0), 3)[FY0:FY1, FX0:FX1]
M_fire = smoothstep(0.38, 0.8, flum) * fm             # bright flame pixels only
M_fire_soft = cv2.GaussianBlur(M_fire, (0, 0), 6)
tip = np.clip((800 - fyy) / 450, 0.3, 1.0)           # tips of flames move more

NT = 1200   # tile height, scroll speeds are even px/frame -> integer number of tiles per loop
nA = tnoise(NT, 300, 14, 9, 1)
nB = tnoise(NT, 300, 16, 10, 2)
nTong = tnoise(NT, 300, 26, 6, 3)
nSm1 = tnoise(NT, 300, 30, 22, 4)
nSm2 = tnoise(NT, 300, 18, 30, 5)

def scroll(n, speed, t):
    r = np.roll(n, -((speed * t) % NT), axis=0)
    return r[0:FY1 - FY0, FX0:FX1] if r.shape[1] >= FX1 else r[0:FY1 - FY0]

smoke_mask = np.zeros((H, W), np.uint8)
cv2.fillPoly(smoke_mask, [np.array([(0, 110), (60, 148), (128, 226), (165, 290), (150, 470), (0, 520)], np.int32)], 255)
smoke_mask = cv2.GaussianBlur(smoke_mask.astype(np.float32) / 255, (0, 0), 18)[FY0:FY1, FX0:FX1]
smoke_mask *= np.clip((560 - fyy) / 330, 0, 1) ** 0.8

# fire light on the room
rng = np.random.default_rng(11)
fl_k = [7, 11, 23, 37, 61, 89, 131, 173]
fl_a = [0.5, 0.4, 0.45, 0.35, 0.3, 0.25, 0.2, 0.15]
fl_p = rng.uniform(0, TAU, len(fl_k))
def flicker(t, shift=0.0):
    ph = TAU * t / T
    v = sum(a * np.sin(k * ph + p + shift * k) for k, a, p in zip(fl_k, fl_a, fl_p))
    return v / sum(fl_a)
Lmap = (np.clip(1 - xx / 1500, 0, 1) ** 1.6 * (0.6 + 0.4 * np.clip(1 - np.abs(yy - 500) / 700, 0, 1))).astype(np.float32)
Lmap[FY0:FY1, FX0:FX1] *= (1 - 0.7 * fm)
tint = np.array([0.45, 0.8, 1.0], np.float32)   # BGR: warm

# ---------------------------------------------------------------- embers
class P: pass
embers = []
for i in range(55):
    e = P()
    e.P = int(rng.choice([100, 120, 150, 200]))
    e.off = int(rng.integers(0, e.P))
    nc = T // e.P
    e.x0 = rng.uniform(15, 160, nc); e.y0 = rng.uniform(560, 760, nc)
    e.rise = rng.uniform(300, 560, nc); e.drift = rng.uniform(-30, 45, nc)
    e.wob = rng.uniform(3, 12, nc); e.wf = rng.integers(1, 4, nc); e.wp = rng.uniform(0, TAU, nc)
    e.life = rng.uniform(0.55, 1.0, nc); e.size = rng.uniform(0.6, 1.6, nc)
    e.br = rng.uniform(0.5, 1.0, nc)
    embers.append(e)

motes = []
for i in range(22):
    m = P()
    m.cx = rng.uniform(230, 650); m.cy = rng.uniform(120, 620)
    m.ax = rng.uniform(15, 50); m.ay = rng.uniform(20, 60)
    m.kx = int(rng.integers(1, 3)); m.ky = int(rng.integers(1, 3))
    m.px, m.py = rng.uniform(0, TAU, 2)
    m.ka = int(rng.integers(2, 6)); m.pa = rng.uniform(0, TAU)
    m.br = rng.uniform(0.15, 0.4)
    motes.append(m)

# ---------------------------------------------------------------- window / rain
WX0, WX1, WY0, WY1 = 1255, 1650, 0, 560
im8 = (src * 255).astype(np.int32)
g = ((im8[..., 0] > im8[..., 2] + 5)).astype(np.uint8) * 255
g[:, :1240] = 0; g[560:] = 0
k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, k5); g = cv2.morphologyEx(g, cv2.MORPH_OPEN, k5)
g = cv2.erode(g, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
G = cv2.GaussianBlur(g.astype(np.float32) / 255, (0, 0), 1.0)
Gw = G[WY0:WY1, WX0:WX1]
HB = WY1 - WY0
SLANT = 0.13

def make_rain(n, lmin, lmax, amin, amax, kmin, kmax, thick):
    r = []
    for i in range(n):
        d = P()
        d.x = rng.uniform(-40, WX1 - WX0); d.y = rng.uniform(0, HB)
        d.k = int(rng.integers(kmin, kmax)); d.L = rng.uniform(lmin, lmax)
        d.a = rng.uniform(amin, amax); d.th = thick
        r.append(d)
    return r
rain_far = make_rain(520, 6, 13, 0.10, 0.22, 16, 24, 1)
rain_near = make_rain(110, 15, 28, 0.18, 0.32, 26, 36, 1)

def inside_glass(x, y):
    xi, yi = int(round(x)), int(round(y))
    return 0 <= yi < H and 0 <= xi < W and G[yi, xi] > 0.95

def rand_glass_point(ymax_pad=0):
    while True:
        x = rng.uniform(1275, 1635); y = rng.uniform(15, 545 - ymax_pad)
        if inside_glass(x, y):
            return x, y

sliders = []
for i in range(30):
    s = P()
    s.P = int(rng.choice([200, 300, 300, 600]))
    s.off = int(rng.integers(0, s.P))
    nc = T // s.P
    s.cyc = []
    for c in range(nc):
        for _ in range(200):
            D = rng.uniform(25, 110)
            x, y = rand_glass_point()
            lat = rng.uniform(-4, 4)
            ok = all(inside_glass(x + lat * u, y + D * u + 4) for u in np.linspace(0, 1, 12))
            if ok:
                break
        cc = P()
        cc.x, cc.y, cc.D, cc.lat = x, y, D, lat
        cc.r = rng.uniform(2.1, 3.5)
        cc.s = rng.uniform(0.15, 0.55); cc.e = cc.s + rng.uniform(0.12, 0.3)
        cc.trail = np.sort(rng.uniform(0.05, 0.95, int(D / 9)))
        cc.tr = rng.uniform(0.5, 1.0, len(cc.trail))
        s.cyc.append(cc)
    sliders.append(s)

beads = []
for i in range(260):
    b = P()
    b.x, b.y = rand_glass_point()
    b.r = rng.uniform(0.7, 1.9)
    b.k = int(rng.integers(1, 4)); b.p = rng.uniform(0, TAU)
    beads.append(b)

def render_drop(img, ref, cx, cy, r, alpha):
    if alpha <= 0.01 or r < 0.3:
        return
    pad = int(np.ceil(r * 1.4)) + 2
    x0, x1 = int(cx) - pad, int(cx) + pad + 1
    y0, y1 = int(cy) - pad, int(cy) + pad + 1
    if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
        return
    X, Y = np.meshgrid(np.arange(x0, x1, dtype=np.float32), np.arange(y0, y1, dtype=np.float32))
    dx = (X - cx) / r
    dyr = np.where(Y > cy, r * 1.2, r * 0.95)
    dy = (Y - cy) / dyr
    d = np.sqrt(dx * dx + dy * dy)
    a = np.clip((1 - d) / 0.3, 0, 1) * alpha * G[y0:y1, x0:x1]
    sx = (cx - (X - cx) * 0.75).astype(np.float32)
    sy = (cy - (Y - cy) * 0.75 - r * 0.6).astype(np.float32)
    col = cv2.remap(ref, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    col = col * 1.12 + 0.03
    rim = smoothstep(0.55, 1.0, d)
    col = col * (1 - 0.5 * rim)[..., None]
    hl = np.exp(-((dx + 0.33) ** 2 + (dy + 0.38) ** 2) / (2 * 0.2 ** 2)) * 0.75
    hl2 = np.exp(-((dx - 0.2) ** 2 + (dy - 0.55) ** 2) / (2 * 0.2 ** 2)) * 0.18
    col = col + (hl + hl2)[..., None] * np.array([0.95, 0.93, 0.9], np.float32)
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - a[..., None]) + col * a[..., None]

def glow_layer(points, shape, sig):
    lay = np.zeros(shape, np.float32)
    for (x, y, rad, inten) in points:
        cv2.circle(lay, (int(round(x * 4)), int(round(y * 4))), max(1, int(round(rad * 4))), float(inten), -1, cv2.LINE_AA, 2)
    return lay

# ---------------------------------------------------------------- frame
def frame(t):
    ph = TAU * t / T
    # breathing (5 s), cat breathing (3.33 s)
    b = 0.5 - 0.5 * np.cos(4 * ph)
    bc = 0.5 - 0.5 * np.cos(6 * ph + 1.0)
    # drowsy nod: slow sink, gentle recovery (once per 10 s)
    nod = (0.5 - 0.5 * np.cos(2 * ph - 0.6)) ** 2.2
    # eyelids: slow squeeze + soft flutter, mostly resting closed
    lid = 0.9 * bump(t, 165, 22) - 0.7 * bump(t, 330, 30) \
        + 0.5 * np.sin(TAU * (t - 470) / 7.5) * bump(t, 470, 14) + 0.5 * bump(t, 520, 25)
    # hand: very slow scratch strokes (4 s) along finger direction
    u = np.sin(5 * ph) * 0.8 + 0.2 * np.sin(10 * ph + 0.7)
    press = 0.5 - 0.5 * np.cos(10 * ph)
    hdx, hdy = -3.6 * u, 1.0 * u + 0.7 * press

    DX = w_hand * hdx + w_head * (0.7 * nod) + w_ivy * (0.9 * np.sin(2 * ph + 0.3) + 0.4 * np.sin(5 * ph))
    DY = (-1.7 * b) * w_chest + w_head * (2.4 * nod - 0.6 * b) + w_hand * hdy \
        + (-1.1 * bc) * w_cat + (-0.45 * bc) * w_cathead + w_lid1 * lid + w_lid2 * lid * 0.8

    # fire distortion (scrolling tileable noise, upward)
    a1, b1 = scroll(nA, 6, t), scroll(nB, 8, t)
    fdx = (a1 - 0.5) * 2 * 4.5 * M_fire_soft * tip
    fdy = ((b1 - 0.5) * 2 * 5.5 - 2.0) * M_fire_soft * tip
    DX[FY0:FY1, FX0:FX1] += fdx
    DY[FY0:FY1, FX0:FX1] += fdy

    mx = (xx - DX).astype(np.float32); my = (yy - DY).astype(np.float32)
    img = cv2.remap(src, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

    # fire brightness / tongues
    fr = img[FY0:FY1, FX0:FX1]
    tong = scroll(nTong, 10, t)
    f = 0.65 * tong + 0.35 * a1
    fl = flicker(t)
    mod = 0.86 + 0.28 * f + 0.06 * fl
    fr *= (1 + (mod - 1) * M_fire_soft)[..., None]
    flame = smoothstep(0.55, 0.85, f) * M_fire_soft * (0.75 + 0.25 * fl)
    hot = smoothstep(0.7, 0.95, f)
    fcol = np.stack([0.08 + 0.35 * hot, 0.42 + 0.4 * hot, np.ones_like(hot)], -1)
    fr[:] = 1 - (1 - fr) * (1 - 0.42 * flame[..., None] * fcol)
    # smoke
    sm = scroll(nSm1, 2, t)
    sm2 = scroll(nSm2, 4, t)
    smoke = smoothstep(0.45, 0.85, 0.6 * sm + 0.4 * sm2) * smoke_mask
    sa = (0.22 * smoke)[..., None]
    scol = np.array([0.36, 0.40, 0.45], np.float32) * (0.85 + 0.15 * fl)
    fr[:] = fr * (1 - sa) + scol * sa
    img[FY0:FY1, FX0:FX1] = fr

    # flickering fire light over the room
    lf = float(0.045 * fl)
    img = (img * (1 + lf * Lmap[..., None] * tint)).astype(np.float32)

    # rain outside (behind the glass)
    lay = np.zeros((HB, WX1 - WX0), np.uint8)
    for grp in (rain_far, rain_near):
        for d in grp:
            yb = (d.y + d.k * (HB + 40) * t / T) % (HB + 40) - 20
            xb = d.x + SLANT * yb
            x2, y2 = xb - SLANT * d.L, yb - d.L
            cv2.line(lay, (int(xb * 16), int(yb * 16)), (int(x2 * 16), int(y2 * 16)), int(255 * d.a), 1, cv2.LINE_AA, 4)
    layf = cv2.GaussianBlur(lay.astype(np.float32) / 255, (0, 0), 0.6)
    img[WY0:WY1, WX0:WX1] += (layf * Gw)[..., None] * np.array([0.95, 0.88, 0.80], np.float32) * 0.9

    # drops on the glass
    img = img.astype(np.float32)
    ref = img.copy()
    for bd in beads:
        render_drop(img, ref, bd.x, bd.y, bd.r, 0.55 + 0.3 * np.sin(bd.k * ph + bd.p))
    for s in sliders:
        age = (t + s.off) % s.P
        c = ((t + s.off) // s.P) % (T // s.P)
        cc = s.cyc[c]
        a = age / s.P
        fade = smoothstep(0.0, 0.06, a) * (1 - smoothstep(0.85, 0.99, a))
        if a < cc.s:
            pos = 0.0
            r = cc.r * (0.75 + 0.25 * a / cc.s)
        else:
            uu = min(1.0, (a - cc.s) / (cc.e - cc.s))
            pos = uu ** 1.5 + 0.03 * np.sin(TAU * 3 * uu) * uu * (1 - uu)
            r = cc.r * (1 - 0.15 * uu)
        cx = cc.x + cc.lat * pos
        cy = cc.y + cc.D * pos
        for tp, trr in zip(cc.trail, cc.tr):
            if pos >= tp:
                passed = (cc.s + (cc.e - cc.s) * tp ** (1 / 1.5))
                ta = (1 - smoothstep(passed, 1.0, a)) * fade * 0.8
                render_drop(img, ref, cc.x + cc.lat * tp, cc.y + cc.D * tp, cc.r * 0.42 * trr, ta)
        render_drop(img, ref, cx, cy, r, 0.95 * fade)

    # embers rising
    pts = []
    for e in embers:
        age = (t + e.off) % e.P
        c = ((t + e.off) // e.P) % (T // e.P)
        a = age / e.P / e.life[c]
        if a >= 1:
            continue
        y = e.y0[c] - e.rise[c] * a
        x = e.x0[c] + e.drift[c] * a + e.wob[c] * np.sin(TAU * e.wf[c] * a + e.wp[c])
        inten = e.br[c] * np.sin(np.pi * a) ** 0.6 * (0.7 + 0.3 * np.sin(TAU * 7 * a + e.wp[c]))
        if y < 230:
            inten *= max(0.0, (y - 150) / 80)
        pts.append((x, y, e.size[c], inten))
    for m in motes:
        x = m.cx + m.ax * np.sin(m.kx * ph + m.px)
        y = m.cy + m.ay * np.sin(m.ky * ph + m.py)
        inten = m.br * (0.5 + 0.5 * np.sin(m.ka * ph + m.pa)) ** 2
        pts.append((x, y, 0.9, inten))
    # draw at 1/1 scale with sub-pixel shift
    lay = np.zeros((H, W), np.float32)
    for (x, y, rad, inten) in pts:
        if 0 <= x < W and 0 <= y < H:
            cv2.circle(lay, (int(round(x * 4)), int(round(y * 4))), max(1, int(round(rad * 4))), float(inten), -1, cv2.LINE_AA, 2)
    core = cv2.GaussianBlur(lay, (0, 0), 0.7)
    glow = cv2.GaussianBlur(lay, (0, 0), 3.0) * 3.0
    img += core[..., None] * np.array([0.55, 0.85, 1.0], np.float32) * 1.6 \
        + glow[..., None] * np.array([0.05, 0.35, 1.0], np.float32) * 0.6

    img = np.clip(img, 0, 1)
    out = cv2.resize(img, (OUT_W, OUT_H), interpolation=cv2.INTER_LANCZOS4)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)

if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'stills':
        for t in map(int, sys.argv[2:]):
            cv2.imwrite(f'f{t:03d}.png', frame(t))
    else:
        out = sys.argv[2]
        n = int(sys.argv[3]) if len(sys.argv) > 3 else T
        ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                               '-s', f'{OUT_W}x{OUT_H}', '-r', str(FPS), '-i', '-',
                               '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
                               '-tune', 'film', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
        with Pool(4) as pool:
            for i, fr in enumerate(pool.imap(frame, range(n), chunksize=4)):
                ff.stdin.write(fr.tobytes())
                if i % 50 == 0:
                    print(i, flush=True)
        ff.stdin.close(); ff.wait()
