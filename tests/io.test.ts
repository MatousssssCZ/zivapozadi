import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { demoProject, tmpDir } from './helpers';
import { loadProject, saveProject, importAssetFile, ProjectIOError, PROJECT_FILE } from '../src/node/projectIO';
import { canonicalJson } from '../src/core/model/hash';
import { Simulation } from '../src/core/sim/simulation';

describe('ukládání a otevírání projektu', () => {
  it('uložení a opětovné otevření bez ztráty údajů', async () => {
    const lp = await demoProject();
    const p = lp.project;
    p.objects[0].zBias = 17; p.objects[0].locked = true; p.objects[1].visible = false; p.nav.edges[0].oneWay = true;
    p.schedule[0].onUnavailable = 'report'; p.export.resolution = '3840x2160'; p.seed = 4242;
    await saveProject(lp.dir, p);
    const again = await loadProject(lp.dir);
    const strip = (x: typeof p) => ({ ...x, meta: { ...x.meta, modifiedAt: '' } });
    expect(canonicalJson(strip(again.project))).toBe(canonicalJson(strip(p)));
    expect(again.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('přenos projektu: zkopírovaná složka funguje jinde a dává stejnou simulaci', async () => {
    const lp = await demoProject();
    const moved = path.join(await tmpDir('zs-move-'), 'Jinde.zscena');
    await fs.cp(lp.dir, moved, { recursive: true });
    await fs.rm(lp.dir, { recursive: true, force: true }); // původní umístění zmizí
    const lp2 = await loadProject(moved);
    expect(lp2.missingAssets).toEqual([]);
    for (const a of lp2.project.assets) expect(path.isAbsolute(a.file)).toBe(false);
    const s1 = Simulation.create(lp.project, lp.manifests); s1.advanceTo(30);
    const s2 = Simulation.create(lp2.project, lp2.manifests); s2.advanceTo(30);
    expect(s2.stateHash()).toBe(s1.stateHash());
  });

  it('import kopíruje soubor do projektu a odmítá nepodporované soubory', async () => {
    const lp = await demoProject();
    const src = path.join(await tmpDir(), 'Můj stánek.png');
    await fs.copyFile(path.join(lp.dir, 'assets/images/stanek.png'), src);
    const e = await importAssetFile(lp.dir, src);
    expect(e.file.startsWith('assets/images/')).toBe(true);
    expect(e.width).toBe(560);
    await fs.rm(src);
    await expect(fs.access(path.join(lp.dir, e.file))).resolves.toBeUndefined();
    const bad = path.join(await tmpDir(), 'x.bmp'); await fs.writeFile(bad, 'xx');
    await expect(importAssetFile(lp.dir, bad)).rejects.toThrow(/Nepodporovaný typ/);
    const fake = path.join(await tmpDir(), 'fake.png'); await fs.writeFile(fake, 'not a png');
    await expect(importAssetFile(lp.dir, fake)).rejects.toThrow(/není platný obrázek/);
  });

  it('chybějící asset ⇒ srozumitelné upozornění, ne pád', async () => {
    const lp = await demoProject();
    await fs.rm(path.join(lp.dir, 'assets/images/kos.png'));
    const lp2 = await loadProject(lp.dir);
    expect(lp2.missingAssets).toContain('builtin_kos');
    expect(lp2.issues.some((i) => i.message.includes('Chybí soubor assetu'))).toBe(true);
  });

  it('poškozený / novější / cizí soubor ⇒ srozumitelná chyba', async () => {
    const lp = await demoProject();
    const f = path.join(lp.dir, PROJECT_FILE);
    const orig = await fs.readFile(f, 'utf8');
    await fs.writeFile(f, orig.slice(0, 200));
    await expect(loadProject(lp.dir)).rejects.toThrow(/poškozený/);
    await fs.writeFile(f, JSON.stringify({ ...JSON.parse(orig), formatVersion: 99 }));
    await expect(loadProject(lp.dir)).rejects.toThrow(/novější formát/);
    await fs.writeFile(f, JSON.stringify({ hello: 1 }));
    await expect(loadProject(lp.dir)).rejects.toBeInstanceOf(ProjectIOError);
    const j = JSON.parse(orig); j.objects[0].assetId = 'neni'; await fs.writeFile(f, JSON.stringify(j));
    await expect(loadProject(lp.dir)).rejects.toThrow(/neexistující asset/);
    const k = JSON.parse(orig); k.assets[0].file = '../../etc/passwd'; await fs.writeFile(f, JSON.stringify(k));
    await expect(loadProject(lp.dir)).rejects.toThrow(/mimo projektovou složku/);
  });

  it('bezpečný zápis ponechá zálohu předchozí verze', async () => {
    const lp = await demoProject();
    lp.project.meta.name = 'Změněno';
    await saveProject(lp.dir, lp.project);
    const bak = JSON.parse(await fs.readFile(path.join(lp.dir, PROJECT_FILE + '.bak'), 'utf8'));
    expect(bak.meta.name).toBe('Vánoční náměstí (demo)');
    const files = await fs.readdir(lp.dir);
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});
