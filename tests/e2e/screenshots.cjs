// Pořídí ilustrační snímky obrazovky do docs/img (xvfb-run -a node tests/e2e/screenshots.cjs)
const { _electron } = require('playwright');
const path = require('node:path'); const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const tmp = path.join(root, '.tmp/shots'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
fs.cpSync(path.join(root, 'demo/Vanocni-namesti.zscena'), path.join(tmp, 'Demo.zscena'), { recursive: true });
const img = path.join(root, 'docs/img'); fs.mkdirSync(img, { recursive: true });
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--no-sandbox'], env: { ...process.env, ZIMNI_SCENA_OPEN: path.join(tmp, 'Demo.zscena') } });
  const win = await app.firstWindow();
  await win.waitForFunction(() => window.__store?.state.project && window.__store.images.get('builtin_pozadi'), null, { timeout: 30000 });
  await win.evaluate(() => { const s = window.__store; s.sim.seek(26, s.state.project, s.state.manifests); s.set({ selection: { kind: 'zone', id: 'zone_kava' } }); });
  await win.waitForTimeout(600);
  await win.screenshot({ path: path.join(img, 'editor-zona.png') });
  await win.evaluate(() => { window.__store.set({ selection: { kind: 'object', id: 'obj_stanek' } }); });
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(img, 'editor-stanek.png') });
  await win.evaluate(() => { window.__store.set({ selection: { kind: 'character', id: 'ch_anna' } }); });
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(img, 'editor-postava.png') });
  await win.evaluate(() => { window.__store.set({ dirty: false }); });
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
