/** E2E: generátor postav v aplikaci (xvfb-run -a node tests/e2e/characters.e2e.cjs) */
const { _electron } = require('playwright');
const path = require('node:path'); const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, '.tmp/e2e-postavy'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const proj = path.join(out, 'R.zscena'); fs.cpSync(path.join(root, 'demo/Namesti-radnice.zscena'), proj, { recursive: true });
const results = []; const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? ' – ' + d : ''}`); };
async function launch() {
  const app = await _electron.launch({ executablePath: require('electron'), args: [root, '--no-sandbox'], env: { ...process.env, ZIMNI_SCENA_OPEN: proj } });
  const win = await app.firstWindow();
  win.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await win.waitForFunction(() => window.__store?.state.project && window.__store.images.get(window.__store.state.project.scene.backgroundAssetId), null, { timeout: 30000 });
  return { app, win };
}
const snap = (win) => win.evaluate(() => JSON.stringify(window.__store.state.project.characters.map((c) => c.appearance)));
(async () => {
  let { app, win } = await launch();
  await win.click('[data-testid=tab-generator]');
  await win.fill('[data-testid=gen-count]', '6'); await win.press('[data-testid=gen-count]', 'Enter');
  await win.click('[data-testid=gen-generate]');
  await win.waitForTimeout(500);
  const n0 = await win.evaluate(() => window.__store.state.project.characters.length);
  await win.click('[data-testid=gen-save]');
  const n1 = await win.evaluate(() => window.__store.state.project.characters.length);
  check('uložení vygenerované skupiny do projektu', n1 === n0 + 6, `${n0} → ${n1}`);
  // úprava jednotlivce v panelu vlastností
  const id = await win.evaluate(() => { const s = window.__store; const c = s.state.project.characters[s.state.project.characters.length - 1]; s.set({ selection: { kind: 'character', id: c.id } }); return c.id; });
  await win.waitForTimeout(300);
  const sel = win.getByTestId('props-panel').getByTestId('variant-hat');
  const opts = await sel.locator('option:not([disabled])').evaluateAll((os) => os.map((o) => o.value));
  const before = await win.evaluate((id) => window.__store.state.project.characters.find((c) => c.id === id).appearance, id);
  if (opts.length > 1) {
    const target = opts.find((o) => o !== before.variants.hat);
    await sel.selectOption(target);
    const after = await win.evaluate((id) => window.__store.state.project.characters.find((c) => c.id === id).appearance.variants.hat, id);
    check('změna čepice u jednotlivce', after === target, `${before.variants.hat} → ${after}`);
  } else {
    await win.getByTestId('props-panel').locator('.role-box').nth(1).locator('.swatch:not(.sel)').first().click();
    const after = await win.evaluate((id) => window.__store.state.project.characters.find((c) => c.id === id).appearance.colors.hat, id);
    check('změna barvy čepice u jednotlivce (knihovna má jednu čepici)', after !== before.colors.hat, `${before.colors.hat} → ${after}`);
  }
  await win.getByTestId('props-panel').getByText('zamknout bunda').click();
  const jk = await win.evaluate((id) => window.__store.state.project.characters.find((c) => c.id === id).appearance.variants.jacket, id);
  for (let i = 0; i < 4; i++) await win.getByTestId('props-panel').getByTestId('regenerate').click();
  const jk2 = await win.evaluate((id) => window.__store.state.project.characters.find((c) => c.id === id).appearance.variants.jacket, id);
  check('přegenerování respektuje zámek bundy (GUI)', jk === jk2, jk);
  await win.getByTestId('props-panel').getByTestId('preview-walk').click();
  await win.evaluate(() => { const s = window.__store; s.sim.seek(25, s.state.project, s.state.manifests); s.set({ rigDiagnostics: true }); });
  await win.waitForTimeout(800);
  await win.screenshot({ path: path.join(out, 'editor-postava.png') });
  await win.keyboard.press('Control+s'); await win.waitForTimeout(500);
  const saved = await snap(win);
  await app.close();
  ({ app, win } = await launch());
  check('postavy se po znovuotevření nezměnily', (await snap(win)) === saved, `${JSON.parse(saved).length} postav`);
  const hashes = await win.evaluate(() => { const s = window.__store; s.sim.restart(s.state.project, s.state.manifests); s.sim.sim.runSteps(600); const h1 = s.sim.sim.stateHash(); s.sim.restart(s.state.project, s.state.manifests); s.sim.sim.runSteps(600); return [h1, s.sim.sim.stateHash()]; });
  check('simulace s generovanými postavami je deterministická', hashes[0] === hashes[1]);
  await win.evaluate(() => window.__store.set({ dirty: false }));
  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} SELHALO` : `Všech ${results.length} kontrol prošlo.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
