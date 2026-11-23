/**
 * End-to-end test skutečné aplikace (Electron) přes Playwright.
 * Linux bez displeje: xvfb-run -a node tests/e2e/electron.e2e.cjs
 * Proměnné: E2E_EXPORT_RES (výchozí 3840x2160), E2E_EXPORT_SEC (výchozí 3), E2E_OUT (složka výstupů)
 */
const { _electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.E2E_OUT || path.join(root, '.tmp/e2e-out'));
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const proj = path.join(out, 'Demo.zscena');
fs.cpSync(path.join(root, 'demo/Vanocni-namesti.zscena'), proj, { recursive: true });
const RES = process.env.E2E_EXPORT_RES || '3840x2160';
const SEC = Number(process.env.E2E_EXPORT_SEC || 3);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' – ' + detail : ''}`); };

async function launch() {
  const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--no-sandbox'], env: { ...process.env, ZIMNI_SCENA_OPEN: proj } });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await win.waitForFunction(() => window.__store?.state.project && window.__store.images.get('builtin_pozadi'), null, { timeout: 30000 });
  await win.waitForTimeout(500);
  return { app, win };
}

/** Převod souřadnic scény na souřadnice okna (stejná logika jako editor při zoomu 100 %). */
async function sceneToClient(win, x, y) {
  return win.evaluate(([x, y]) => {
    const c = document.querySelector('[data-testid=scene-canvas]');
    const r = c.getBoundingClientRect();
    const fit = Math.min(c.width / 1920, c.height / 1080) * 0.94;
    const ox = c.width / 2 - 960 * fit, oy = c.height / 2 - 540 * fit;
    const k = r.width / c.width;
    return { x: r.left + (x * fit + ox) * k, y: r.top + (y * fit + oy) * k };
  }, [x, y]);
}
const S = (win, fn, arg) => win.evaluate(fn, arg);

(async () => {
  let { app, win } = await launch();
  await win.screenshot({ path: path.join(out, '01-otevreno.png') });

  // --- výběr objektu kliknutím a přesun tažením
  const p0 = await sceneToClient(win, 560, 560); // stánek
  await win.mouse.click(p0.x, p0.y);
  const sel = await S(win, () => window.__store.state.selection);
  check('výběr objektu kliknutím', sel && sel.id === 'obj_stanek', JSON.stringify(sel));
  const before = await S(win, () => { const o = window.__store.state.project.objects.find((o) => o.id === 'obj_stanek'); return { x: o.x, y: o.y }; });
  await win.mouse.move(p0.x, p0.y); await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(p0.x + i * 6, p0.y + i * 2);
  await win.mouse.up();
  const after = await S(win, () => { const o = window.__store.state.project.objects.find((o) => o.id === 'obj_stanek'); return { x: o.x, y: o.y }; });
  check('přesun tažením', after.x > before.x + 40 && after.y > before.y + 10, `${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  await win.keyboard.press('Control+z');
  const undone = await S(win, () => { const o = window.__store.state.project.objects.find((o) => o.id === 'obj_stanek'); return { x: o.x, y: o.y }; });
  check('zpět vrátí přesun', undone.x === before.x && undone.y === before.y, JSON.stringify(undone));
  await win.keyboard.press('Control+y');
  const redone = await S(win, () => window.__store.state.project.objects.find((o) => o.id === 'obj_stanek').x);
  check('vpřed znovu provede přesun', redone === after.x);
  await win.keyboard.press('Control+z');

  // --- měřítko přes panel vlastností (rovnoměrné ⇒ poměr stran)
  await win.fill('[data-testid=prop-scale]', '1.25'); await win.press('[data-testid=prop-scale]', 'Enter');
  const sc = await S(win, () => window.__store.state.project.objects.find((o) => o.id === 'obj_stanek').scale);
  check('změna měřítka z panelu', sc === 1.25, String(sc));
  // --- duplikace, zamknutí, skrytí, smazání
  await win.keyboard.press('Control+d');
  const dup = await S(win, () => { const s = window.__store.state; return { n: s.project.objects.length, sel: s.selection.id, name: s.project.objects.find((o) => o.id === s.selection.id).name }; });
  check('duplikace (Ctrl+D)', dup.n === 9 && dup.name.includes('kopie'), JSON.stringify(dup));
  await win.getByTestId('props-panel').getByText('Zamčený', { exact: true }).click();
  await win.keyboard.press('Delete');
  const lockedStill = await S(win, () => window.__store.state.project.objects.length);
  check('zamčený objekt nelze smazat', lockedStill === 9);
  await win.getByTestId('props-panel').getByText('Zamčený', { exact: true }).click();
  await win.getByTestId('props-panel').getByText('Viditelný', { exact: true }).click();
  const hidden = await S(win, () => { const s = window.__store.state; return s.project.objects.find((o) => o.id === s.selection.id).visible; });
  check('skrytí objektu', hidden === false);
  await win.keyboard.press('Delete');
  const afterDel = await S(win, () => window.__store.state.project.objects.length);
  check('smazání (Delete)', afterDel === 8);

  // --- trasa: nástroj Trasa přidá body a spojení
  await win.keyboard.press('t');
  const a = await sceneToClient(win, 300, 1000), b = await sceneToClient(win, 500, 1010);
  await win.mouse.click(a.x, a.y); await win.mouse.click(b.x, b.y);
  await win.keyboard.press('Escape'); await win.keyboard.press('v');
  const nav = await S(win, () => ({ n: window.__store.state.project.nav.nodes.length, e: window.__store.state.project.nav.edges.length }));
  check('kreslení trasy (2 body + spojení)', nav.n === 13 && nav.e === 16, JSON.stringify(nav));

  // --- uložení a znovuotevření
  await win.keyboard.press('Control+s');
  await win.waitForTimeout(600);
  const saved = await S(win, () => JSON.stringify(window.__store.state.project, (k, v) => (k === 'modifiedAt' ? undefined : v)));
  await app.close();
  ({ app, win } = await launch());
  const reopened = await S(win, () => JSON.stringify(window.__store.state.project, (k, v) => (k === 'modifiedAt' ? undefined : v)));
  check('uložení a opětovné otevření bez ztráty údajů', saved === reopened, `${saved.length} B`);

  // --- náhled: přehrání se zrychlením, pauza, shodný stav jako dopočítaná simulace
  await win.selectOption('[data-testid=speed]', '8');
  await win.click('[data-testid=play]');
  await win.waitForFunction(() => window.__store.sim.time() >= 20, null, { timeout: 60000 });
  await win.click('[data-testid=play]');
  const pv = await S(win, () => { const s = window.__store.sim.sim; return { step: s.state.step, hash: s.stateHash() }; });
  await win.waitForTimeout(400);
  const still = await S(win, () => window.__store.sim.sim.state.step);
  check('pauza zastaví čas', still === pv.step);
  await win.screenshot({ path: path.join(out, '02-nahled-8x.png') });
  const recomputed = await S(win, (step) => { const st = window.__store; st.sim.restart(st.state.project, st.state.manifests); st.sim.sim.runSteps(step); return st.sim.sim.stateHash(); }, pv.step);
  check('náhled 8× = restart + dopočítání (determinismus)', recomputed === pv.hash, `krok ${pv.step}`);
  await win.click('[data-testid=restart]');
  const t0 = await S(win, () => window.__store.sim.sim.state.step);
  check('restart do počátečního stavu', t0 === 0);

  // --- skutečný export z aplikace
  const mp4 = path.join(out, `export-${RES}.mp4`);
  await S(win, ([mp4, RES, SEC]) => window.__store.edit('test', (d) => { d.export.outputPath = mp4; d.export.resolution = RES; d.export.durationSec = SEC; d.export.durationMode = 'manual'; d.export.chunkSec = 2; d.export.preset = 'veryfast'; }), [mp4, RES, SEC]);
  // zapnout značky a vybrat zónu, aby bylo vidět, že se do exportu nedostanou
  await S(win, () => window.__store.set({ selection: { kind: 'zone', id: 'zone_kava' }, showMarkers: true }));
  await win.click('text=Export videa…');
  await win.waitForSelector('[data-testid=export-dialog]');
  await win.waitForFunction(() => !document.querySelector('[data-testid=export-start]').disabled, null, { timeout: 10000 });
  await win.screenshot({ path: path.join(out, '03-export-dialog.png') });
  const tStart = Date.now();
  let peakMain = 0, peakTotal = 0; const memSamples = [];
  await win.click('[data-testid=export-start]');
  const memPoll = setInterval(async () => {
    try {
      const m = await win.evaluate(() => window.zs.memory()); peakMain = Math.max(peakMain, m.main);
      const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map((x) => ({ type: x.type, kb: x.memory.workingSetSize })));
      const total = metrics.reduce((a, x) => a + x.kb * 1024, 0); peakTotal = Math.max(peakTotal, total);
      memSamples.push(Math.round(total / 1e6));
    } catch {}
  }, 1000);
  await win.waitForTimeout(1500);
  await win.screenshot({ path: path.join(out, '04-export-prubeh.png') });
  await win.waitForSelector('[data-testid=export-result]', { timeout: 600000 });
  clearInterval(memPoll);
  const resText = await win.textContent('[data-testid=export-result]');
  check('export z aplikace dokončen', resText.startsWith('Hotovo'), resText);
  await win.screenshot({ path: path.join(out, '05-export-hotovo.png') });
  const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,pix_fmt,codec_name:format=duration', '-of', 'json', mp4], { encoding: 'utf8' }).stdout);
  const v = pr.streams[0];
  const [W, H] = RES.split('x').map(Number);
  check('rozlišení / fps / snímky / délka exportu', v.width === W && v.height === H && v.r_frame_rate === '30/1' && Number(v.nb_frames) === SEC * 30 && Math.abs(Number(pr.format.duration) - SEC) < 0.05 && v.pix_fmt === 'yuv420p', JSON.stringify({ ...v, duration: pr.format.duration }));
  const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', 'select=eq(n\\,45)', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 27 }).stdout;
  let mag = 0; for (let i = 0; i < raw.length; i += 4) if (raw[i] > 220 && raw[i + 1] < 60 && raw[i + 2] > 200) mag++;
  check('editorové značky nejsou v exportu', raw.length === W * H * 4 && mag === 0, `purpurových pixelů: ${mag}`);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', 'select=eq(n\\,45)', '-frames:v', '1', path.join(out, 'export-snimek-45.png')]);
  console.log(`Doba exportu ${((Date.now() - tStart) / 1000).toFixed(1)} s, max RSS hlavního procesu ${(peakMain / 1e6).toFixed(0)} MB, max součet všech procesů ${(peakTotal / 1e6).toFixed(0)} MB`);
  console.log('Průběh paměti všech procesů (MB, po 1 s):', memSamples.join(' '));
  check('omezená paměť při exportu (všechny procesy < 2,5 GB)', peakTotal > 0 && peakTotal < 2.5e9, `${(peakTotal / 1e6).toFixed(0)} MB`);

  // --- zrušení a navázání exportu z GUI
  const mp4b = path.join(out, 'export-navazani.mp4');
  await win.click('text=Zavřít');
  await S(win, (mp4b) => window.__store.edit('test', (d) => { d.export.outputPath = mp4b; d.export.resolution = '1920x1080'; d.export.durationSec = 8; d.export.chunkSec = 2; }), mp4b);
  await win.click('text=Export videa…');
  await win.waitForFunction(() => !document.querySelector('[data-testid=export-start]').disabled, null, { timeout: 10000 });
  await win.click('[data-testid=export-start]');
  await win.waitForFunction(() => /část [3-4]\//.test(document.querySelector('[data-testid=export-progress]')?.textContent ?? ''), null, { timeout: 120000 });
  await win.click('text=Zrušit export');
  await win.waitForSelector('[data-testid=export-result]', { timeout: 60000 });
  const cancelText = await win.textContent('[data-testid=export-result]');
  check('zrušení exportu z GUI', cancelText.includes('zrušen'), cancelText);
  await win.waitForFunction(() => document.querySelector('[data-testid=export-start]')?.textContent === 'Pokračovat v exportu', null, { timeout: 10000 });
  await win.screenshot({ path: path.join(out, '06-export-navazani.png') });
  await win.click('[data-testid=export-start]');
  await win.waitForFunction(() => document.querySelector('[data-testid=export-result]')?.textContent.startsWith('Hotovo'), null, { timeout: 300000 });
  const resumeText = await win.textContent('[data-testid=export-result]');
  check('navázání přerušeného exportu z GUI', /navázáno od části [2-9]/.test(resumeText), resumeText);
  const pr2 = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=nb_frames:format=duration', '-of', 'json', mp4b], { encoding: 'utf8' }).stdout);
  check('navázaný export má všech 240 snímků', Number(pr2.streams[0].nb_frames) === 240 && Math.abs(Number(pr2.format.duration) - 8) < 0.05, JSON.stringify(pr2));
  await S(win, () => window.__store.set({ dirty: false }));
  await app.close();
  fs.writeFileSync(path.join(out, 'vysledky.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} KONTROL SELHALO` : `\nVšech ${results.length} kontrol prošlo.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
