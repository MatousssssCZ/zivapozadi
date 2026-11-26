// Webová verze (GitHub Pages): stejné UI jako v aplikaci, aplikační vrstva v prohlížeči
// (src/renderer/webApi.ts). Přibalí hotové scény (demo/*.zscena → projekty/) a vestavěné podklady.
import { build } from 'vite';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist-web');
await build({ configFile: path.resolve('vite.config.ts'), build: { outDir: out, emptyOutDir: true, target: 'es2022' } });
await mkdir(path.join(out, 'projekty'), { recursive: true });
for (const d of ['Liberec-zivy-trh', 'Pastelove-kluziste', 'Pastelove-kluziste-2', 'Pastelove-kluziste-3', 'Tramvajova-ulice', 'Namesti-radnice', 'Vanocni-namesti']) await cp(path.join('demo', `${d}.zscena`), path.join(out, 'projekty', `${d}.zscena`), { recursive: true });
await cp(path.join('resources', 'builtin'), path.join(out, 'builtin'), { recursive: true });
// náhledy scén pro úvodní menu (projekty/<scéna>.zscena/nahled.jpg, šířka 560 px)
{
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { readFile, writeFile } = await import('node:fs/promises');
  for (const d of ['Liberec-zivy-trh', 'Pastelove-kluziste', 'Pastelove-kluziste-2', 'Pastelove-kluziste-3', 'Tramvajova-ulice', 'Namesti-radnice', 'Vanocni-namesti']) {
    try {
      const dir = path.join('demo', `${d}.zscena`), pj = JSON.parse(await readFile(path.join(dir, 'project.json'), 'utf8'));
      const a = pj.assets.find((x) => x.id === pj.scene.backgroundAssetId); if (!a) continue;
      const im = await loadImage(await readFile(path.join(dir, a.file))), w = 560, h = Math.round((w * im.height) / im.width);
      const c = createCanvas(w, h); c.getContext('2d').drawImage(im, 0, 0, w, h);
      await writeFile(path.join(out, 'projekty', `${d}.zscena`, 'nahled.jpg'), c.toBuffer('image/jpeg', 82));
    } catch (e) { console.warn('Náhled scény', d, e.message); }
  }
}
await writeFile(path.join(out, '.nojekyll'), '');
console.log('Webová verze:', out);
