// Vývojový režim: Vite dev server + Electron s načítáním z dev serveru.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
await import('./build-main.mjs');
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ZIMNI_SCENA_DEV_URL: 'http://localhost:5199' } });
child.on('exit', async (code) => { await server.close(); process.exit(code ?? 0); });
