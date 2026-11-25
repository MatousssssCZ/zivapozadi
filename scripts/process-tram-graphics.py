"""
Podklady scény „Vánoční tramvajová ulice“ (grafika/tramvaj/zdroje → grafika/tramvaj):
 - pozadí zvětšené na 1920×1080 (stejný poměr stran, bez natažení),
 - tramvaj, zastávka a popředí oříznuté na skutečný neprůhledný obsah (alfa > 2); poloha výřezu
   v původním plátně se uloží, aby vrstvy seděly na pozadí,
 - koleje: střednice dvojice kolejnic sledovaná po tmavé linii (sloupec po sloupci),
 - tramvaj: body dotyku předního a zadního podvozku, obdélník dveří (v px výřezu).
Spuštění: python3 scripts/process-tram-graphics.py
"""
import json
import numpy as np
from PIL import Image, ImageFilter

SRC, OUT = 'grafika/tramvaj/zdroje', 'grafika/tramvaj'
bg = Image.open(f'{SRC}/pozadi-ulice.webp').convert('RGB'); W0, H0 = bg.size
bg.resize((1920, 1080), Image.LANCZOS).save(f'{OUT}/pozadi-ulice.png')
meta = {'src': [W0, H0]}
def crop(name, file):
    im = Image.open(f'{SRC}/{file}').convert('RGBA')
    if im.size != (W0, H0): im = im.resize((W0, H0), Image.LANCZOS)
    a = np.array(im)[..., 3]; ys, xs = np.where(a > 2)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    im.crop((x0, y0, x1, y1)).save(f'{OUT}/{name}.png'); meta[name] = {'x0': x0, 'y0': y0, 'w': x1 - x0, 'h': y1 - y0}
crop('zastavka', 'zastavka.png'); crop('popredi', 'popredi-lampa-lavicka.webp')
t = Image.open(f'{SRC}/tramvaj.webp').convert('RGBA'); a = np.array(t)[..., 3]; ys, xs = np.where(a > 2)
tx0, ty0 = int(xs.min()), int(ys.min()); t.crop((tx0, ty0, int(xs.max()) + 1, int(ys.max()) + 1)).save(f'{OUT}/tramvaj.png')
# (změřeno z obrázku: dotyk kol předního a zadního podvozku, dveře – px původního plátna)
meta['tramvaj'] = {'w': int(xs.max()) + 1 - tx0, 'h': int(ys.max()) + 1 - ty0,
  'bogieF': [890 - tx0, 912 - ty0], 'bogieR': [1245 - tx0, 838 - ty0], 'door': [717 - tx0, 418 - ty0, 825 - tx0, 868 - ty0], 'roof': [0, 230 - ty0]}
# koleje (sledování tmavé linie od levého okraje)
L = np.array(bg.convert('L').filter(ImageFilter.BoxBlur(1))).astype(float)
dark = lambda x, y: (L[y - 4, x] + L[y + 4, x]) / 2 - L[y, x]
rails = []
for y0 in (674, 704):
    y = max(range(y0 - 12, y0 + 12), key=lambda yy: dark(6, yy)); pts = []
    for x in range(6, 1640, 2):
        yb = max(range(y - 3, y + 2), key=lambda yy: dark(x, yy))
        if dark(x, yb) > 6: y = yb
        pts.append((x, y))
    rails.append(pts)
mid = [((p[0]), (p[1] + q[1]) / 2) for p, q in zip(rails[0], rails[1])]
k = 1920 / W0
meta['track'] = [[round(x * k, 1), round(y * k, 1)] for x, y in mid[::20]]
meta['rails'] = [[[round(x * k, 1), round(y * k, 1)] for x, y in r[::20]] for r in rails]
json.dump(meta, open(f'{OUT}/podklady.json', 'w'), indent=1)
print({k2: v for k2, v in meta.items() if k2 not in ('track', 'rails')}, len(meta['track']))
