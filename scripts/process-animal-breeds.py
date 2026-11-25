"""
Rasy psů a koček z archů (grafika/zvirata/zdroje → grafika/zvirata): díly se oddělí podle souvislých
neprůhledných oblastí, pojmenují podle rozvržení archu (levá polovina = pohled zboku/zepředu, pravá =
zezadu), ořežou (alfa > 2) a změří se kotvy: u článků nohou horní kloub (a) a dolní kloub / dotyk
tlapky (b), u koček poloha uší vůči hlavě (jak jsou v archu nad hlavou). Výstup: PNG dílů a
src/core/render/animalBreeds.ts (data pro vykreslování).
Spuštění: python3 scripts/process-animal-breeds.py
"""
import json, sys
from collections import deque
import numpy as np
from PIL import Image

SRC, OUT = 'grafika/zvirata/zdroje', 'grafika/zvirata'
# rozvržení: řádky dílů v levé polovině (zleva doprava) a co z pravé poloviny použít
# rozvržení: každá polovina archu (vlevo přední 3/4, vpravo zadní 3/4) se čte po řadách shora; řady se
# oddělí podle výšky (velké mezery), v řadě zleva doprava. Jména dílů v řadách (zadní pohled: + „_back“).
DOG = [['torso', 'head', 'tail'], ['fu_a', 'fl_a', 'fu_b', 'fl_b'], ['hu_a', 'hl_a', 'hu_b', 'hl_b']]
CAT_BRIT = [['ear_a', 'ear_b'], ['torso', 'head'], ['tail_1', 'tail_2', 'tail_3'], ['fu_a', 'fu_b', 'hu_a', 'hu_b'], ['fl_a', 'fl_b', 'hl_a', 'hl_b']]
CAT_MAINE = [['ear_a', 'head', 'ear_b'], ['torso'], ['tail_1', 'tail_2', 'tail_3'], ['fu_a', 'fu_b', 'hu_a', 'hu_b'], ['fl_a', 'fl_b', 'hl_a', 'hl_b']]
SHEETS = {
  'dog_bernese': ('pes-bernsky.webp', 'dog', DOG), 'dog_dalmatian': ('pes-dalmatin.webp', 'dog', DOG),
  'dog_frenchie': ('pes-buldocek.webp', 'dog', DOG), 'dog_collie': ('pes-kolie.webp', 'dog', DOG),
  'dog_husky': ('pes-husky.webp', 'dog', DOG), 'dog_dachshund': ('pes-jezevcik.webp', 'dog', DOG),
  'cat_british': ('kocka-britska.webp', 'cat', CAT_BRIT), 'cat_mainecoon': ('kocka-mainska.webp', 'cat', CAT_MAINE),
}

def components(alpha, thr=90, ds=2, min_px=150):
    m = alpha[::ds, ::ds] > thr; H, W = m.shape; lab = np.zeros((H, W), np.int32); n = 0; out = []
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1; q = deque([(y, x)]); lab[y, x] = n; pts = []
                while q:
                    cy, cx = q.popleft(); pts.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; q.append((yy, xx))
                if len(pts) >= min_px:
                    ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
                    out.append({'id': n, 'x0': min(xs) * ds, 'x1': (max(xs) + 1) * ds, 'y0': min(ys) * ds, 'y1': (max(ys) + 1) * ds, 'n': len(pts)})
    return out, lab, ds

def rows_of(comps):
    comps = sorted(comps, key=lambda c: (c['y0'] + c['y1']) / 2); rows = []
    for c in comps:
        cy = (c['y0'] + c['y1']) / 2
        for r in rows:
            ry = np.mean([(d['y0'] + d['y1']) / 2 for d in r]); rh = np.mean([d['y1'] - d['y0'] for d in r])
            if abs(cy - ry) < 0.45 * max(rh, c['y1'] - c['y0']): r.append(c); break
        else: rows.append([c])
    return [sorted(r, key=lambda c: c['x0']) for r in rows]

# uši, které v archu neleží u hlavy (mainská mývalí: daleko po stranách) – ruční poloha na hlavě
EAR_FIX = {'cat_mainecoon': {'ears': [(0.3, 0.3, 0.38), (0.7, 0.27, 0.36)], 'ears_back': [(0.3, 0.3, 0.38), (0.68, 0.28, 0.36)]},
           'cat_british': {'ears': [(0.24, 0.22, 0.3), (0.72, 0.22, 0.28)], 'ears_back': [(0.26, 0.2, 0.3), (0.66, 0.2, 0.28)]}}
meta = {}
for breed, (file, sp, layout) in SHEETS.items():
    im = Image.open(f'{SRC}/{file}').convert('RGBA'); A = np.array(im); al = A[..., 3]
    comps, lab, ds = components(al)
    parts = {}
    for half, suf in ((0, ''), (1, '_back')):
        cs = sorted([c for c in comps if ((c['x0'] + c['x1']) / 2 >= im.width / 2) == bool(half)], key=lambda c: (c['y0'] + c['y1']) / 2)
        if len(cs) != sum(len(r) for r in layout): print('CHYBA počet dílů', breed, suf, len(cs)); sys.exit(1)
        i = 0
        for row in layout:
            grp = sorted(cs[i:i + len(row)], key=lambda c: c['x0']); i += len(row)
            for nm, c in zip(row, grp): parts[nm + suf] = c
    pm = {}
    for nm, c in parts.items():
        # maska dílu (rozšířená o 6 px – měkké okraje srsti), ořez alfa > 2
        sub = (lab == c['id']).astype(np.uint8)
        big = np.kron(sub, np.ones((ds, ds), np.uint8))[: A.shape[0], : A.shape[1]]
        from PIL import ImageFilter
        big = np.array(Image.fromarray(big * 255).filter(ImageFilter.MaxFilter(13))) > 0
        piece = A.copy(); piece[~big] = 0
        ys, xs = np.where(piece[..., 3] > 2); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crop = piece[y0:y1, x0:x1]
        Image.fromarray(crop).save(f'{OUT}/{breed}_{nm}.png')
        pm[nm] = {'x0': int(x0), 'y0': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'crop': crop}
    info = {'species': sp, 'parts': sorted(pm.keys())}
    # kotvy článků nohou: a = střed horních 10 % (dutý konec), b = u horního článku 80 % výšky, u spodního
    # dotyk tlapky (98,5 %) – x jako střed neprůhledné části v daném řádku
    def cx_at(crop, v):
        a = crop[..., 3] > 128; y = min(a.shape[0] - 1, max(0, int(v * a.shape[0])))
        band = a[max(0, y - 3): y + 4].any(0); xs = np.where(band)[0]
        return float((xs.min() + xs.max() + 1) / 2 / a.shape[1]) if len(xs) else 0.5
    anchors = {}
    for k in ('fu', 'fl', 'hu', 'hl'):
        c = pm[f'{k}_a']['crop']; lower = k[1] == 'l'
        anchors[k] = {'a': [round(cx_at(c, 0.08), 3), 0.1 if not lower else 0.14], 'b': [round(cx_at(c, 0.8 if not lower else 0.95), 3), 0.8 if not lower else 0.985]}
    info['legs'] = anchors
    # zadní pohled má vlastní díly nohou – vlastní kotvy
    if 'fu_a_back' in pm:
        info['legs_back'] = {}
        for k in ('fu', 'fl', 'hu', 'hl'):
            c = pm[f'{k}_a_back']['crop']; lower = k[1] == 'l'
            info['legs_back'][k] = {'a': [round(cx_at(c, 0.08), 3), 0.1 if not lower else 0.14], 'b': [round(cx_at(c, 0.8 if not lower else 0.95), 3), 0.8 if not lower else 0.985]}
    # AnimalPart: textura, pivot a body připojení v px výřezu (pro nástroje a kontrolu)
    ap = {}
    for nm, v in pm.items():
        if nm in ('earb_a', 'earb_b'): continue
        w, h = v['w'], v['h']; base = nm.replace('_back', '')[:2]
        L = (info['legs_back'] if nm.endswith('_back') and 'legs_back' in info else info['legs']).get(base)
        if L: ap[nm] = {'texture': f'{breed}_{nm}.png', 'pivot': {'x': round(L['a'][0] * w, 1), 'y': round(L['a'][1] * h, 1)}, 'attachments': {('contact' if base[1] == 'l' else 'end'): {'x': round(L['b'][0] * w, 1), 'y': round(L['b'][1] * h, 1)}}}
        else: ap[nm] = {'texture': f'{breed}_{nm}.png', 'pivot': {'x': round(w / 2, 1), 'y': round(h / 2, 1)}, 'attachments': {}}
    json.dump(ap, open(f'{OUT}/{breed}.parts.json', 'w'), indent=1)
    # uši (kočky): spodní střed ucha vůči obdélníku hlavy (podíl jejích rozměrů) a velikost ucha (podíl šířky hlavy)
    for hk, ek in (('head', 'ear'), ('head_back', 'earb')):
        if ek == 'earb' and 'ear_a_back' in pm: pm['earb_a'], pm['earb_b'] = pm['ear_a_back'], pm['ear_b_back']
        if f'{ek}_a' in pm:
            h = pm[hk]
            info[f'ears{"" if hk == "head" else "_back"}'] = [
                {'u': round((pm[f'{ek}_{s}']['x0'] + pm[f'{ek}_{s}']['w'] / 2 - h['x0']) / h['w'], 3), 'v': round((pm[f'{ek}_{s}']['y0'] + pm[f'{ek}_{s}']['h'] - h['y0']) / h['h'], 3),
                 'w': round(pm[f'{ek}_{s}']['w'] / h['w'], 3), 'part': f'{ek}_{s}'} for s in ('a', 'b')]
    for key, vals in EAR_FIX.get(breed, {}).items():
        for e, (u, v, w) in zip(info[key], vals): e.update({'u': u, 'v': v, 'w': w})
    info['sizes'] = {k: [v['w'], v['h']] for k, v in pm.items()}
    meta[breed] = info
    print(breed, len(pm), 'dílů', info.get('ears'))
ts = '/** Vygenerováno scripts/process-animal-breeds.py – kotvy dílů ras psů a koček (needitovat ručně). */\n'
ts += 'export interface BreedInfo { species: "dog" | "cat"; parts: string[]; legs: Record<"fu" | "fl" | "hu" | "hl", { a: [number, number]; b: [number, number] }>; legs_back?: Record<"fu" | "fl" | "hu" | "hl", { a: [number, number]; b: [number, number] }>; ears?: { u: number; v: number; w: number; part: string }[]; ears_back?: { u: number; v: number; w: number; part: string }[]; sizes: Record<string, [number, number]> }\n'
ts += 'export const BREEDS: Record<string, BreedInfo> = ' + json.dumps(meta, indent=1) + ';\n'
open('src/core/render/animalBreeds.ts', 'w').write(ts)
