/**
 * Kontrolní náhled ras zvířat: přední a zadní pohled, stoj, krok (4 fáze), doleva, čichání; volitelně
 * kostra a body připojení (--kostra), tmavé pozadí (--tmave). Výstup: grafika/zvirata/nahled*.png
 *   npx tsx scripts/animal-preview.ts [--kostra] [--tmave] [rasa,rasa…]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { promises as fs } from 'node:fs';
import { drawAnimal, drawAnimalShadow } from '../src/core/render/animalRenderer';
import { setCanvasFactory } from '../src/core/render/rigRenderer';
setCanvasFactory((w, h) => createCanvas(w, h) as never);
const cache = new Map<string, unknown>();
for (const dir of ['grafika/zvirata', 'grafika/ziva-pozadi/animals']) for (const f of await fs.readdir(dir)) if (f.endsWith('.png')) cache.set(f.slice(0, -4), await loadImage(`${dir}/${f}`));
const ALL: [string, 'dog' | 'cat', string | undefined][] = [['bernský salašník', 'dog', 'dog_bernese'], ['dalmatin', 'dog', 'dog_dalmatian'], ['fr. buldoček', 'dog', 'dog_frenchie'], ['border kolie', 'dog', 'dog_collie'], ['husky', 'dog', 'dog_husky'], ['jezevčík', 'dog', 'dog_dachshund'], ['bígl (původní)', 'dog', undefined], ['britská', 'cat', 'cat_british'], ['mainská mývalí', 'cat', 'cat_mainecoon'], ['mourovatá (původní)', 'cat', undefined]];
const pick = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(',').split(',').filter(Boolean);
const rows = pick.length ? ALL.filter((r) => pick.some((q) => r[2]?.includes(q) || r[0].includes(q))) : ALL;
const dark = process.argv.includes('--tmave'), bones = process.argv.includes('--kostra');
const cols: [string, number, number, number, number][] = [['stoj', 0, 0, 0, 0], ['krok 0', 1, 0, 0, 0], ['krok ¼', 1, 0.25, 0, 0], ['krok ½', 1, 0.5, 0, 0], ['krok ¾', 1, 0.75, 0, 0], ['zezadu', 0, 0, -1.4, 0], ['zezadu krok', 1, 0.25, -1.4, 0], ['doleva', 1, 0.25, Math.PI, 0], ['čichá', 0, 0, 0, 1]];
const PPM = 200, W = 230, H = 200, c = createCanvas(W * cols.length, H * rows.length), x = c.getContext('2d');
x.fillStyle = dark ? '#262b36' : '#e4e9f1'; x.fillRect(0, 0, c.width, c.height);
rows.forEach(([rn, sp, breed], j) => cols.forEach(([cn, walk, ph, face, extra], i) => {
  const a = { id: 'x', species: sp, breed, pos: { x: 0, y: 0 }, facing: face, speed: walk ? 1 : 0, dist: ph * (sp === 'dog' ? 0.55 : 0.32), mode: 'walk', until: 0, walkLeft: 0, side: 1, hidden: false, headDown: extra === 1 ? 1 : 0, sit: 0 };
  x.save(); x.translate(i * W + W / 2, j * H + H - 22); x.strokeStyle = dark ? '#556' : '#aab'; x.beginPath(); x.moveTo(-W / 2 + 6, 0); x.lineTo(W / 2 - 6, 0); x.stroke();
  drawAnimalShadow(x as never, a as never, PPM); drawAnimal(x as never, a as never, ((n: string) => cache.get(n) ?? null) as never, PPM, 3, bones); x.restore();
  x.fillStyle = dark ? '#fff' : '#000'; x.font = '13px sans-serif'; x.fillText(`${rn} – ${cn}`, i * W + 5, j * H + 15);
}));
const out = `grafika/zvirata/nahled${bones ? '-kostra' : ''}${dark ? '-tmave' : ''}.png`;
await fs.writeFile(out, c.toBuffer('image/png')); console.log(out);
