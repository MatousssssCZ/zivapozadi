# Jak přidat novou činnost

Činnost = **definice** (deklarativní požadavky) + **runner** (stavový automat v simulaci).
Animace je jen jedna z jejích částí.

## 1. Definice (`ActivityDefinition`, `src/core/activities/types.ts`)

| Pole | Význam |
|---|---|
| `type`, `version`, `label`, `description` | identita a verze (zóna si pamatuje `activityVersion`) |
| `status` | `implemented` / `draft` – nehotové se v UI nenabízejí jako funkční |
| `participants[]` | role, počet `min/max`, `requiredCapabilities` (porovnání s `capabilities` manifestu) |
| `requiredObjects[]` | role objektů v zóně + přípustné `interactionKinds` + minimum |
| `props[]` | rekvizity, které činnost vytváří (např. kelímek) |
| `workPointKinds`, `entryPointKinds` | druhy interakčních bodů – pracovní / vstupní (čekací) |
| `surface` | požadovaný povrch v prostoru zóny (`snow` / `null`) |
| `capacity` | popis kapacity; v běhu se vynucuje rezervacemi bodů |
| `preconditions[]` | předpoklady zahájení (vynucuje `canStart`) |
| `phases[]` | fáze průběhu, animace a animační události |
| `outcome`, `repeat` | výsledek a pravidla opakování (výchozí interval) |
| `defaultParams` | nastavitelné parametry zóny (zobrazí se v panelu vlastností) |

## 2. Runner (`ActivityRunner`)

```ts
export const mojeRunner: ActivityRunner = {
  definition: mojeDefinice,
  canStart(ctx, agent, zone) { /* ověřit předpoklady, dosažitelnost, volnou kapacitu */ return { ok: true }; },
  start(ctx, agent, zone, source, sourceId) {
    // NEJDŘÍV rezervovat (ctx.res.tryReserve), pak ctx.goToPoint(...). Při neúspěchu vše uvolnit a vrátit null.
    return { type: 'moje', zoneId: zone.id, source, sourceId, phase: 'cesta', phaseStart: ctx.time(), data: {} };
  },
  step(ctx, agent, run, events) {
    // events = animační události z tohoto kroku (např. 'take'); ctx.isMoving(agent) = postava ještě jde
    return 'running'; // | 'done' | 'failed'
  },
  abort(ctx, agent, run, reason) { /* rekvizity do vysvětlitelného stavu; rezervace uvolní simulace */ },
  usesObject(run, objectId) { return false; /* true ⇒ odebrání objektu činnost přeruší */ },
};
```

Pravidla:

* Stav činnosti (`run.data`) musí být čistý JSON – je součástí checkpointu exportu.
* Veškerá náhoda přes `ctx.rand(agent)` / `ctx.randRange(...)` (RNG postavy ze seedu). Nikdy `Math.random`.
* Pohyb jen přes `ctx.goToPoint` / `ctx.goToNode` (síť tras, žádné teleporty, hlášení nedosažitelnosti).
* Animace přes `ctx.playAction(agent, klip, { duration, events })` – výchozí hodnoty slouží jako
  explicitní náhrada, když postava klip nemá.
* Rekvizita nesmí zmizet bez vysvětlení: změna `prop.place` (`counter`/`held`/`falling`/`inBin`/`ground`).

## 3. Registrace

V `src/core/activities/registry.ts` přidejte `registerActivity(mojeRunner)`. Činnost se objeví v
panelu **Činnosti**, v nastavení postav (automatické opakování), v zastávkách a v plánovaných událostech.
Testovací vzor: `tests/simulation.test.ts` (kelímek, rezervace, odebrání objektu).

---

## Návrh definice: Stavba sněhuláka (NEIMPLEMENTOVÁNO)

> Tato činnost **není** součástí první verze. Následující struktura dokládá, že ji současná definice
> činnosti pokryje. Neregistruje se, v UI je uvedena jen jako „návrh“.

```json
{
  "type": "snowman", "version": 1, "label": "Stavba sněhuláka", "status": "draft",
  "description": "Dvě až tři postavy postaví sněhuláka na volné ploše se sněhem; sněhulák zůstane ve scéně.",
  "participants": [
    { "role": "builder", "min": 1, "max": 3, "requiredCapabilities": ["walk", "crouch", "roll-snowball", "lift"] }
  ],
  "requiredObjects": [],
  "props": [
    { "id": "ball_large", "kind": "snowball", "label": "Spodní koule" },
    { "id": "ball_medium", "kind": "snowball", "label": "Prostřední koule" },
    { "id": "ball_small", "kind": "snowball", "label": "Hlava" },
    { "id": "accessories", "kind": "snowman-accessories", "label": "Mrkev, uhlíky, šála" }
  ],
  "workPointKinds": ["work"],
  "entryPointKinds": ["queue"],
  "surface": "snow",
  "capacity": { "description": "Jedna stavba na zónu; pracovní body (místo stavby + 3 dráhy válení) se rezervují pro celou skupinu." },
  "preconditions": [
    "V prostoru zóny je plocha se sněhem dostatečná pro dráhy válení (≥ 3 × 1,5 m).",
    "Je k dispozici alespoň `min` volných postav se schopnostmi.",
    "Místo stavby není obsazeno jiným sněhulákem."
  ],
  "phases": [
    { "id": "gather", "label": "Sejití účastníků u místa stavby" },
    { "id": "roll-large", "label": "Válení spodní koule", "animation": "roll", "events": ["ball_grow"] },
    { "id": "roll-medium", "label": "Válení prostřední koule", "animation": "roll" },
    { "id": "lift-medium", "label": "Zvednutí prostřední koule (2 postavy)", "animation": "lift", "events": ["ball_place"] },
    { "id": "roll-small", "label": "Hlava", "animation": "roll" },
    { "id": "decorate", "label": "Zdobení", "animation": "decorate", "events": ["place_nose", "place_eyes"] },
    { "id": "admire", "label": "Pohled na hotové dílo", "animation": "idle" }
  ],
  "outcome": "Ve scéně vznikne trvalý objekt sněhuláka (nová instance s kolizní stopou); dráhy válení zanechají stopu ve sněhu.",
  "repeat": { "defaultIntervalMin": 600, "defaultIntervalMax": 1200, "description": "Nejvýše jeden rozestavěný sněhulák na zónu." },
  "defaultParams": { "builders": 2, "rollDuration": 12, "maxSnowmen": 1 }
}
```

Potřebná rozšíření pro implementaci (mimo rozsah v0.1): koordinace více účastníků (sdílený stav
`run` pro skupinu), animační klipy `roll/lift/decorate/crouch` v manifestu, rekvizita rostoucí koule,
vytvoření trvalého objektu do stavu simulace a ověření povrchu `snow` proti oblastem.
