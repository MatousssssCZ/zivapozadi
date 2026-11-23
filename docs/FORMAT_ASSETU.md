# Formát projektu a assetů (verze formátu 1)

## Projektová složka

```
Moje-scena.zscena/
  project.json            dokument projektu (UTF-8 JSON, viz níže)
  project.json.bak        předchozí uložená verze (automatická záloha)
  assets/images/          obrázky (PNG s průhledností, JPEG, WebP)
  assets/audio/           hudba (mp3, wav, ogg, m4a, aac, flac, opus)
  assets/characters/      manifesty postav (*.json)
```

Všechny cesty v `project.json` jsou **relativní** k projektové složce (cesty mimo složku se při
otevření odmítnou). Importované soubory se kopírují do `assets/` s názvem `<slug>-<sha1[0:8]>.<přípona>`.
Projekt je tedy přenositelný jako celá složka. Ukládání: dočasný soubor → fsync → atomické přejmenování.

## project.json – hlavní položky

| Klíč | Obsah |
|---|---|
| `format`, `formatVersion` | `"zimni-scena-projekt"`, `1` |
| `meta` | název, časy vytvoření/úpravy, verze aplikace |
| `seed` | celé číslo – zdroj veškeré náhody simulace |
| `scene` | logická velikost (1920×1080), pozadí, měřítko hloubky (`depth`), sněžení |
| `assets[]` | `{id, kind: image|character|audio, name, file, width?, height?, durationSec?, anchor?, pixelScale?, defaultInteraction?, defaultFootprint?, provisional?}` |
| `objects[]` | `{id, name, assetId, x, y, scale, anchor?, layer: background|world|foreground, zBias, flipX, visible, locked, footprint?, interaction?}` |
| `nav` | `nodes[] {id, x, y, name?, stop?}`, `edges[] {id, a, b, oneWay, narrow}` |
| `areas[]` | `{id, name, kind: obstacle|snow, polygon[]}` |
| `zones[]` | `{id, name, activityType, activityVersion, enabled, bounds[], objectRoles{role: objectId[]}, params}` |
| `characters[]` | `{id, name, assetId, startNodeId, baseScale, walkSpeed, palette, wander, activities{type: {enabled, firstDelayMin/Max, intervalMin/Max}}}` |
| `schedule[]` | `{id, name, time, activityType, characterId|null, zoneId|null, onUnavailable: wait|skip|report, waitLimit}` |
| `export` | rozlišení, fps (30), režim délky (`manual`/`audio`), délka, `audioAssetId`, `audioWhenShorter` (`loop`/`silence`), CRF, preset, délka části, výstupní cesta, diagnostický PNG režim |

### Souřadnice

* Logické souřadnice scény jsou nezávislé na rozlišení náhledu i exportu (export 4K = měřítko 2).
* `x, y` objektu = **kotevní bod = bod kontaktu se zemí**; `anchor` je normalizovaný (0–1) vůči obrázku.
* Velikost obrázku ve scéně = `width × pixelScale × scale`. Malované podklady pro 4K mají `pixelScale: 0.5`.
* Úhly (`facing`, směr pohledu): radiány, 0 = vpravo, π/2 = ke kameře (dolů), −π/2 = od kamery.

### Interakce objektu

`interaction = { kind: stand|table|viewpoint|bin|generic, points[] }`, bod:
`{ id, kind: service|queue|seat|view|drop|counter|work, offset{x,y}, facing?, navNodeId?, label? }`.
`offset` je vůči kotvě při měřítku 1 (škáluje a zrcadlí se s objektem). `navNodeId` určuje přístupový
bod trasy; bez něj se použije nejbližší uzel s volnou přímou spojnicí. `counter` = místo pro rekvizitu
(pult stánku, otvor koše), nechodí se k němu.

`footprint` = kolizní polygon (vůči kotvě) ⇒ pevná překážka pro spojení tras.

## Obrázkový asset

PNG (doporučeno, s alfa kanálem), JPEG nebo WebP. Rozměry se čtou z hlavičky souboru. Pro výchozí
hodnoty při vložení do scény lze v knihovně (`resources/builtin/builtin.json`) uvést `anchor`,
`pixelScale`, `defaultFootprint` a `defaultInteraction`.

## Manifest postavy (`zimni-scena-postava`, verze 1)

```json
{
  "format": "zimni-scena-postava", "formatVersion": 1,
  "id": "test-figure", "name": "Testovací postava (provizorní)", "provisional": true,
  "backend": "procedural-test-figure",
  "height": 130, "anchor": { "x": 0.5, "y": 1 },
  "directions": ["E", "SE", "NE"],
  "directionFallbacks": { "W": { "use": "E", "mirror": true }, "SW": { "use": "SE", "mirror": true },
                          "NW": { "use": "NE", "mirror": true }, "S": { "use": "SE", "mirror": false }, "N": { "use": "NE", "mirror": false } },
  "clips": {
    "idle":    { "duration": 3.2, "loop": "loop" },
    "walk":    { "duration": 1.0, "loop": "loop", "strideLength": 92 },
    "talk":    { "duration": 1.4, "loop": "loop" },
    "receive": { "duration": 1.1, "loop": "once", "events": [{ "time": 0.6, "name": "take" }] },
    "drink":   { "duration": 2.6, "loop": "once", "events": [{ "time": 1.1, "name": "sip" }] },
    "drop":    { "duration": 1.0, "loop": "once", "events": [{ "time": 0.55, "name": "release" }] }
  },
  "clipFallbacks": { "look": "idle" },
  "attachPoints": { "handR": { "E": { "x": 14, "y": -64 } } },
  "capabilities": ["walk", "look", "hold-cup", "drink", "talk"],
  "supportedActivities": ["coffee"]
}
```

* **Směry:** `E/W` boční, `SE/SW` šikmo ke kameře, `NE/NW` šikmo od kamery, `S/N` čelně. Chybějící
  směr se řeší `directionFallbacks` (jiný směr, případně zrcadlení); bez náhrady vznikne upozornění.
* **Klipy:** `duration` (s), `loop` (`loop`/`once`/`pingpong`), `events` (animační události, např.
  okamžik převzetí kelímku `take`), `strideLength` u chůze (délka cyklu dvou kroků ⇒ synchronizace
  kroků s posunem), `frames` pro budoucí snímkový backend (`[{file, duration}]`).
* **Chybějící klip:** použije se `clipFallbacks`; bez náhrady se přehraje „virtuální“ klip s výchozí
  délkou a událostmi z definice činnosti (logika nezamrzne) a zobrazí se upozornění.
* **Úchopové body:** u procedurálního backendu se počítají z pózy; u budoucích backendů je
  `attachPoints[name][direction]` (případně po snímcích) povinný zdroj.
* **backend:** `procedural-test-figure` je implementován. `frames` a `skeleton` jsou vyhrazené hodnoty
  připraveného rozhraní – v této verzi se vykreslí zástupný obdélník s upozorněním.
