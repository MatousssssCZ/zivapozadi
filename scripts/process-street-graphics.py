"""
Zasněžená ulice: zpracování samostatných prvků (grafika/zasnezena-ulice/prvky/*.png).
Ořez na neprůhledný obsah (alfa > 8), kotva = skutečná pata objektu z alfa masky (střed nejnižších
neprůhledných řádků; u lavičky, koše a plotku střed mezi krajními patkami), výška vůči celému PNG
(podle zadání) se přepočte na měřítko ořezu. Výstup: *-scena.png + podklady.json.
Spuštění: python3 scripts/process-street-graphics.py
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

G = Path('grafika/zasnezena-ulice')
out = {}
for name in ['lampa', 'lavicka', 'strom', 'plotek', 'kos']:
    im = Image.open(G / 'prvky' / f'{name}.png').convert('RGBA')
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = im.crop((x0, y0, x1, y1))
    crop.save(G / f'{name}-scena.png')
    ca = np.array(crop)[:, :, 3] > 8
    h, w = ca.shape
    # pata: nejnižší řádky s obsahem (3 % výšky)
    band = ca[int(h * 0.97):, :]
    cols = np.nonzero(band.any(axis=0))[0]
    ax = (cols.min() + cols.max()) / 2 / w if name in ('lavicka', 'kos', 'plotek') else cols.mean() / w
    out[name] = {'w': int(w), 'h': int(h), 'fullH': int(im.height), 'anchor': [round(float(ax), 4), 1.0], 'cropTop': int(y0), 'cropLeft': int(x0)}
    print(name, out[name])
(G / 'podklady.json').write_text(json.dumps(out, indent=2, ensure_ascii=False))
