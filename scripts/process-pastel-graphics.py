"""
Zpracování podkladů scény „Pastelové vánoční kluziště“ (grafika/pastel/zdroje → grafika/pastel):
 - pozadí zvětšené na 1920×1080 (16:9, společný souřadnicový systém scény),
 - sady rozdělené na jednotlivé sprity (podle mezer v neprůhlednosti), ořez průhledných okrajů
   (práh 2/255 – jemné větve a průsvitné halo lamp zůstávají), žádné plošné odstraňování barev,
 - kotva každého spritu na patě (dolní okraj plné kresby, střed opěrné části),
 - obrys ledu z kresby pozadí (sněhový lem kolem ledu je jasně bílý: horní okraj svislým hledáním,
   spodní a boky paprsky ze středu; vyhlazeno mediánem),
 - poloha světýlek vánočního stromu (jasné teplé body) pro jemné třpytění.
Spuštění: python3 scripts/process-pastel-graphics.py
"""
import json, math
import numpy as np
from PIL import Image, ImageFilter

SRC, OUT = 'grafika/pastel/zdroje', 'grafika/pastel'
meta = {}

def crop_save(im, box, name, foot_x=None, foot_frac=None):
    """im RGBA, box (x0,y0,x1,y1) buňky; ořez na alfa > 2; kotva = pata (dolní řádek s alfa > 128)."""
    cell = im.crop(box)
    a = np.array(cell)[..., 3]
    ys, xs = np.where(a > 2)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    sp = cell.crop((x0, y0, x1, y1))
    A = np.array(sp)[..., 3]
    solid = np.where((A > 128).any(1))[0]
    foot = solid.max() + 1  # pata = poslední řádek plné kresby
    if foot_frac is not None: foot = int(round(foot_frac * A.shape[0]))
    if foot_x is None:  # střed plné kresby ve spodní pětině (kmen / sloup / podstavec)
        band = A[int(foot - 0.2 * (foot - solid.min())):foot] > 128
        cols = np.where(band.any(0))[0]; fx = (cols.min() + cols.max() + 1) / 2
    else: fx = foot_x - box[0] - x0
    sp.save(f'{OUT}/sprites/{name}.png')
    meta[name] = {'w': sp.width, 'h': sp.height, 'anchor': [round(fx / sp.width, 4), round(foot / sp.height, 4)]}
    return sp

def split(im, thr=24):
    a = np.array(im)[..., 3] > thr
    def runs(v):
        out, s = [], None
        for i, x in enumerate(v):
            if x and s is None: s = i
            if not x and s is not None: out.append((s, i)); s = None
        if s is not None: out.append((s, len(v)))
        return out
    return a, runs

# ---------------------------------------------------------------- pozadí
bg = Image.open(f'{SRC}/pozadi-kluziste.webp').convert('RGB').resize((1920, 1080), Image.LANCZOS)
bg.save(f'{OUT}/pozadi-kluziste.png')

# ---------------------------------------------------------------- stromy (dva vedle sebe)
im = Image.open(f'{SRC}/stromy-listnate.webp').convert('RGBA'); W, H = im.size
a, runs = split(im)
cols = runs(a.any(0)); mid = (cols[0][1] + cols[1][0]) // 2
crop_save(im, (0, 0, mid, H), 'strom-listnaty-siroky')
crop_save(im, (mid, 0, W, H), 'strom-listnaty-uzky')

# ---------------------------------------------------------------- lampy, lavička, koš (mřížka 2 × 2)
im = Image.open(f'{SRC}/lampy-lavicka-kos.webp').convert('RGBA'); W, H = im.size
a, runs = split(im)
cols = runs(a.any(0)); xm = (cols[0][1] + cols[1][0]) // 2
rows = runs(a.any(1)); ym = (rows[0][1] + rows[1][0]) // 2
crop_save(im, (0, 0, xm, ym), 'lampa-rovna')
crop_save(im, (xm, 0, W, ym), 'lampa-oblouk')
crop_save(im, (0, ym, xm, H), 'lavicka')
crop_save(im, (xm, ym, W, H), 'kos')
# lampa s ramenem: kotva pod sloupem (ne pod středem i s lucernou)
L = Image.open(f'{OUT}/sprites/lampa-oblouk.png'); A = np.array(L)[..., 3]
foot = int(meta['lampa-oblouk']['anchor'][1] * L.height); band = A[int(foot * 0.85):foot] > 128
c = np.where(band.any(0))[0]; meta['lampa-oblouk']['anchor'][0] = round(((c.min() + c.max() + 1) / 2) / L.width, 4)

# ---------------------------------------------------------------- stánek a vánoční strom
im = Image.open(f'{SRC}/stanek-napoje.webp').convert('RGBA')
crop_save(im, (0, 0) + im.size, 'stanek-napoje')
# kotva stánku: střed těla (bez vývěsního štítu vlevo), pata = spodek podstavce nad sněhovým lemem
S = Image.open(f'{OUT}/sprites/stanek-napoje.png'); A = np.array(S)[..., 3] > 128
yb = int(S.height * 0.93); cols = np.where(A[yb])[0]
meta['stanek-napoje']['anchor'][0] = round(((cols.min() + cols.max()) / 2) / S.width, 4)
im = Image.open(f'{SRC}/vanocni-strom.webp').convert('RGBA')
crop_save(im, (0, 0) + im.size, 'vanocni-strom')

# světýlka stromu: malé jasné teplé body (R,G vysoké, B nižší), lokální maxima
T = np.array(Image.open(f'{OUT}/sprites/vanocni-strom.png')).astype(int)
r, g, b, al = T[..., 0], T[..., 1], T[..., 2], T[..., 3]
hot = (r > 245) & (g > 215) & (b < 200) & (al > 200)
pts = []
ys, xs = np.where(hot)
order = np.argsort(-(r + g)[ys, xs])
for i in order:
    x, y = xs[i], ys[i]
    if all((x - px) ** 2 + (y - py) ** 2 > 22 ** 2 for px, py in pts): pts.append((int(x), int(y)))
meta['vanocni-strom']['lights'] = [[round(x / T.shape[1], 4), round(y / T.shape[0], 4)] for x, y in pts[:90]]

# ---------------------------------------------------------------- obrys ledu
blur = np.array(bg.filter(ImageFilter.BoxBlur(4))).astype(int)
R_, G_, B_ = blur[..., 0], blur[..., 1], blur[..., 2]; lum = (R_ + G_ + B_) / 3
rim = (lum > 226) & (B_ - R_ >= -2)
Hh, Ww = lum.shape
def first_run(col, ys, n=8):
    c = 0
    for y in ys:
        c = c + 1 if not rim[y, col] else 0
        if c >= n: return y - (n - 1) * (1 if ys[1] > ys[0] else -1)
    return None
top = []
for x in range(0, 1920, 16):
    t = first_run(x, list(range(752, 1075)))
    if t is not None: top.append((x, t))
tv = [float(np.median([p[1] for p in top[max(0, i - 3):i + 4]])) for i in range(len(top))]
cx, cy = 960, 900; ray = []
for k in range(720):
    ang = 2 * math.pi * k / 720; dx, dy = math.cos(ang), math.sin(ang) * 0.25
    n = 0; t = 0
    while True:
        t += 1; x = cx + dx * t; y = cy + dy * t
        if x < 0 or x >= Ww or y < 0 or y >= Hh: last = (min(max(x, 0), Ww - 1), min(max(y, 0), Hh - 1)); break
        if rim[int(y), int(x)]:
            n += 1
            if n >= 4: last = (x - dx * 4, y - dy * 4); break
        else: n = 0
    ray.append(last)
Rr = np.array([math.hypot(p[0] - cx, (p[1] - cy) * 4) for p in ray])
Rm = [float(np.median(np.take(Rr, range(i - 20, i + 21), mode='wrap'))) for i in range(720)]
rp = [(cx + math.cos(2 * math.pi * k / 720) * Rm[k], cy + math.sin(2 * math.pi * k / 720) * Rm[k] * 0.25) for k in range(720)]
bot = sorted([p for p in rp if p[1] > 900], key=lambda p: p[0])
bx, byv = np.array([p[0] for p in bot]), np.array([p[1] for p in bot])
ice = [(x, round(y, 1)) for (x, _), y in zip(top, tv)] + [(x, round(float(np.interp(x, bx, byv)), 1)) for x, _ in top[::-1]]
json.dump({'ice': ice, 'sprites': meta}, open(f'{OUT}/podklady.json', 'w'), indent=1)
print('sprity:', {k: (v['w'], v['h'], v['anchor']) for k, v in meta.items()}, 'světýlek', len(meta['vanocni-strom']['lights']), 'bodů ledu', len(ice))
