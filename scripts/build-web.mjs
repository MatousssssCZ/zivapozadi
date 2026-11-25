// Webová verze (GitHub Pages): stejné UI jako v aplikaci, aplikační vrstva v prohlížeči
// (src/renderer/webApi.ts). Přibalí hotové scény (demo/*.zscena → projekty/) a vestavěné podklady.
import { build } from 'vite';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist-web');
await build({ configFile: path.resolve('vite.config.ts'), build: { outDir: out, emptyOutDir: true, target: 'es2022' } });
await mkdir(path.join(out, 'projekty'), { recursive: true });
for (const d of ['Liberec-zivy-trh', 'Pastelove-kluziste', 'Tramvajova-ulice', 'Namesti-radnice', 'Vanocni-namesti']) await cp(path.join('demo', `${d}.zscena`), path.join(out, 'projekty', `${d}.zscena`), { recursive: true });
await cp(path.join('resources', 'builtin'), path.join(out, 'builtin'), { recursive: true });
await writeFile(path.join(out, '.nojekyll'), '');
console.log('Webová verze:', out);
