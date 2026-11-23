# Architektura

```
electron/main.ts        hlavní proces: okno, dialogy, IPC, správa projektu, FFmpeg (NodeEncoderHost)
electron/preload.ts     úzký IPC most `window.zs` (contextIsolation, sandbox)
src/core/               čisté TypeScript jádro – bez DOM a bez Node (sdílí editor, export i CLI)
  model/                datový model projektu (types.ts), výchozí hodnoty, validace + migrace, otisky
  math/                 vektory, geometrie, deterministický RNG (sfc32, serializovatelný stav)
  nav/                  síť tras: graf, A*, zablokování spojení přes překážky
  scene/                převody objekt→scéna, kolizní stopy, měřítko podle hloubky
  anim/                 manifest postavy, animátor (klipy, události), procedurální testovací postava
  sim/                  simulace (pevný krok), pohyb, rezervace, plánovač, hodiny náhledu
  activities/           definice a běh činností (registry, coffee)
  render/               vykreslení scény (Canvas 2D API), póza a úchopové body postavy
  export/               plán exportu (části, otisk), orchestrace exportu přes rozhraní
src/node/               Node: bezpečné ukládání, import assetů, FFmpeg, enkodér s checkpointy, Skia render
src/renderer/           editor (React): store + historie, plátno, overlay značek, panely, export přes IPC
scripts/                generování testovací grafiky a dema, CLI export, build
tests/                  Vitest (jádro, IO, export) + e2e test aplikace (Playwright/Electron)
```

## Tok dat

1. **Dokument projektu** (`ProjectFile`) je jediný zdroj pravdy. Editor ho mění jen příkazy
   `store.edit(label, fn)` (snímek dokumentu do historie zpět/vpřed; tažení = jedna položka historie).
2. **Simulace** se z dokumentu staví (`Simulation.create(project, manifests)`). Po každé editaci se
   náhled přestaví a dopočítá do stejného času. Statická data (graf tras, interakční body) se odvozují,
   proměnný stav (`SimState`) je čistý JSON: polohy, rychlosti, animace, činnosti, rekvizity,
   rezervace, fronty, stav plánovače, RNG postav i světa.
3. **Renderer** (`drawScene`) je čistá funkce `(projekt, stav simulace, čas) → obraz`. Sněžení je
   bezstavová hash-funkce seedu a času. Editorové značky kreslí výhradně `src/renderer/overlay.ts`.
4. **Export** (`runExport`) pro snímek *n* dopočítá simulaci přesně na krok `n × 2` (60 Hz / 30 fps),
   vykreslí snímek v cílovém rozlišení a předá ho enkodéru; `writeFrame` čeká na převzetí ⇒ fronta má
   nejvýše jeden snímek (omezená paměť). Pomalý počítač exportuje déle, průběh se nemění.

## Simulace postavy – oddělené vrstvy

| Vrstva | Kde | Co dělá |
|---|---|---|
| Rozhodování | `Simulation.stepAgent / stepWander` | procházka po síti, zastávky, automatické a plánované činnosti |
| Pohyb po trase | `sim/movement.ts` | plynulé zrychlení/brzdění, zpomalení v zatáčkách, rezervace úzkých průchodů, žádné teleporty |
| Přehrávání animací | `anim/animator.ts` | chůze (fáze podle uražené dráhy ⇒ kroky sladěné s posunem), prolnutí chůze/klid, akční klipy, události |
| Držené předměty | `SimState.props` + `agent.holding` | kelímek: pult → ruka (úchopový bod) → pád do koše / odložení |
| Účast v činnosti | `activities/*` | stavový automat činnosti, rezervace míst, fronty, přerušení |

Směr pohledu se otáčí omezenou úhlovou rychlostí a 8směrový pohled má hysterezi (bez přeskakování).
Úchopový bod ruky se počítá z pózy (`render/characterPose.ts`) – stejně v simulaci i vykreslení.

## Rezervace a konflikty

`Reservations` drží klíče s kapacitou 1 (`objId#pointId`, `edge:<id>`) a fronty FIFO. Činnost musí
místo rezervovat dřív, než k němu postava vyrazí. Při dokončení i přerušení činnosti simulace vždy
zavolá `releaseAll(agentId)` (bezpečnostní síť). Překrytí zón není chyba; pevné překážky (oblasti a
kolizní stopy objektů) zablokují spojení trasy a editor to zobrazí červeně.

## Export po částech

`NodeEncoderHost` (hlavní proces / CLI) spouští pro každou část samostatný FFmpeg
(`rawvideo rgba → libx264, yuv420p, BT.709, GOP 2 s`). Pracovní složka `<výstup>.mp4.casti/`
obsahuje `manifest.json` (otisk projektu+nastavení, hotové části) a `checkpoint_NNNN.json`
(stav simulace v prvním snímku části). Checkpoint další části se uloží dřív, než se část označí
za hotovou. Navázání ověří otisk – při změně projektu/nastavení se staré části zahodí. Hotové části se
spojí bez překódování (concat demuxer) a připojí se zvuk (AAC; opakování `-stream_loop`, ticho `apad`,
zkrácení se zeslabením; rychlost hudby se nikdy nemění).

V Electronu běží simulace a vykreslení v okně editoru (OffscreenCanvas → `getImageData`) a snímky
jdou přes IPC do hlavního procesu. CLI používá totéž jádro s rendererem Skia (`@napi-rs/canvas`).

## Rozšiřitelnost

* **Činnosti:** `registerActivity(runner)` – viz `PRIDANI_CINNOSTI.md`.
* **Postavy:** manifest s `backend` (`procedural-test-figure` hotový; `frames` a `skeleton` připravené
  v datovém formátu – stačí doplnit vykreslovací backend, simulace se nemění).
* **Renderer:** veškeré kreslení jde přes Canvas 2D API v `render/`; výměna za WebGL (např. PixiJS)
  je izolovaná změna.
* **Formát projektu:** `formatVersion` + `migrateProject` pro budoucí migrace.
