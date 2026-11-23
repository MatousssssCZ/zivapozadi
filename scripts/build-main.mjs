import { build } from 'esbuild';
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true, external: ['electron', 'ffmpeg-static'] };
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' });
console.log('main + preload sestaveny');
