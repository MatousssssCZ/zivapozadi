# Návrh před implementací (v0.1)

Tento dokument byl sepsán před začátkem implementace a popisuje rozhodnutí, ze kterých
implementace vychází. Podrobný popis hotového stavu je v `ARCHITEKTURA.md`.

## Zvolený stack a důvody

| Oblast | Volba | Důvod |
|---|---|---|
| Jazyk | TypeScript 5.9 (strict) | Požadavek; jeden jazyk pro jádro, UI i export. |
| Desktopový obal | Electron 45 | Stejný Chromium na Windows i macOS ⇒ shodné vykreslování; přímý přístup k souborům a k procesu FFmpeg; bez backendu. |
| UI | React 19 + Vite 7 | Panely a formuláře; plátno scény je mimo React (imperativní kreslení). |
| Vykreslování | Canvas 2D API za rozhraním `SceneRenderer` | V Chromiu je Canvas 2D akcelerován GPU (Skia). Tentýž kód vykresluje i v Node (`@napi-rs/canvas`, Skia) pro CLI export a testy. Přechod na WebGL (PixiJS) je možný výměnou implementace rozhraní. |
| Export | FFmpeg (libx264, yuv420p, MP4) jako podřízený proces | Lokální, bez placených API; snímky se posílají jako surové RGBA přes stdin. |
| Testy | Vitest + skripty pro skutečný export + Playwright (Electron) | Ověření determinismu, rezervací, ukládání a reálného MP4. |

## Oddělení vrstev

```
src/core/      čisté TS, bez DOM i Node  ── model, validace, navigace, simulace,
               činnosti, animace (pózy), vykreslení scény (Canvas2D rozhraní),
               plán exportu a orchestrace (přes rozhraní)
src/node/      jen Node (hlavní proces Electronu + CLI) ── bezpečné ukládání,
               správa assetů, hledání a řízení FFmpeg, checkpointy na disku
electron/      hlavní proces + preload (IPC most, dialogy)
src/renderer/  editor (React), editorové plátno, editorové značky (overlay)
```

* **Editor** mění jen dokument projektu (`ProjectFile`) přes příkazy s historií zpět/vpřed.
* **Simulace** se z dokumentu sestaví (`Simulation.create(project)`), běží s pevným krokem 1/60 s,
  její stav je čistý JSON (serializovatelný checkpoint včetně stavu RNG).
* **Vykreslování** je čistá funkce (projekt + stav simulace + čas → obraz). Neobsahuje náhodu ani
  editorové značky. Značky kreslí výhradně `src/renderer/overlay.ts`.
* **Export** krokuje tutéž simulaci a volá tentýž renderer v cílovém rozlišení; snímky jdou s
  omezenou frontou do FFmpeg.

## Balení a FFmpeg

* `electron-builder` (NSIS pro Windows, DMG pro macOS). Sestavení se provádí na cílovém OS
  (případně v CI matici), protože FFmpeg je nativní binárka.
* FFmpeg se přibaluje balíčkem `ffmpeg-static` (binárka pro platformu sestavení, rozbalená mimo asar).
  Pořadí hledání: proměnná `ZIMNI_SCENA_FFMPEG` → přibalený `ffmpeg-static` → `ffmpeg` v PATH.
  Pozn.: buildy `ffmpeg-static` jsou pod GPL (kvůli libx264) – nutno zohlednit při distribuci.
* Délka hudby se zjišťuje přes `ffmpeg -i` (není potřeba ffprobe).

## Technická omezení první verze

* Scéna je 2D s pevnou kamerou; pozadí je plochý obrázek – překážky, sníh a zóny se kreslí ručně.
* Navigace jen po explicitní síti tras (graf), žádný volný navmesh ani simulace davu.
* Postavy: jedna procedurální testovací postava (provizorní vzhled). Rozhraní pro snímkové a
  kosterní animace je připraveno, implementována je jen procedurální varianta.
* Jediná plně implementovaná činnost: káva u stánku. Sněhulák je jen zdokumentovaná definice.
* Posun v čase vpřed = dopočítání simulace; posun zpět = restart a opětovné dopočítání.
* Export: Canvas 2D → `getImageData` → IPC → FFmpeg; 4K export bude pomalejší než reálný čas.
