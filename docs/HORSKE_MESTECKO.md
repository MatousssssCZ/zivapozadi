# Scéna „Horské městečko“

Pohlednicové horské městečko při růžovém západu slunce: děti bobují na svahu vlevo, běžkaři jezdí po namalované stopě vpravo, lidé se procházejí po chodníku (někteří se psem a někteří se zastaví a dívají na děti) a občas silnicí projede traktor s radlicí.

**Spuštění:** v aplikaci **Demo: horské městečko** (nebo v nabídce scén). Scénu znovu vytvoříte takto:
```bash
npx tsx scripts/generate-mountain-demo.ts
```

## Podklady (`grafika/horske-mestecko`)
| Soubor | Použití |
|---|---|
| `pozadi.png` | pozadí 1672×941 → 1920×1080 (jednotné měřítko, bez natažení) |
| `lampa.png` → `lampa-scena.png` | lampa (ořez, kotva na patě); řadí se podle hloubky, kolize jen pata |
| `smrk.png` → `smrk-scena.png` | smrk v pravém dolním rohu – vrstva popředí, před ním nevede žádná trasa |
| `scena.json`, `ZADANI_PRO_CLAUDE.md` | návrh tras a zadání (trasy byly znovu zkalibrované podle obrazu) |

## Měřítko a terén
- Hloubka: y 425 → 0,27, y 1080 → 0,773. Dospělý na chodníku ≈ 7 % výšky obrazu, u domů ≈ 3 %.
- **Svah** (`src/core/sim/hillSled.ts`): nad úpatím (`footY` = 700 px) se obrazová výška rozdělí na hloubku (25 %) a skutečnou výšku nad zemí (75 %), s plynulým přechodem 70 px. Postavy na svahu mají měřítko podle hloubky terénu (`AgentState.lift`), ne podle obrazového y – děti nahoře nejsou maličké. Boby se kreslí jako 3D model ve výšce terénu a se sklonem svahu.

## Bobování (A02)
- 5 dětí v nepřetržitém cyklu, rodič u dojezdu se dívá na jezdce.
- Cyklus: fronta nahoře → položení bobů (předklon) → usednutí → odraz → **jízda podle sklonu** (gravitace, tření μ 0,07, odpor úměrný v², u každého dítěte jiný) → **brzdění nohama** na rovině dojezdu (zpomalení spočítané tak, aby vždy zastavilo před chodníkem, odlétá sníh) → vstání na stranu ke kameře → zvednutí šňůry → návrat pěšky po dojezdu → výstup po schodech → fronta.
- Jízda trvá 9–11 s. Boby za dítětem jedou po jeho stopě ve vzdálenosti šňůry (jen tah – nikdy nepředjedou dítě do kopce), natáčejí se podle tahu; šňůra má průvěs.
- **Rezervace dojezdu:** nikdo nevyjede, dokud na dojezdu někdo dojíždí, vstává, bere šňůru nebo se vrací v konfliktní části (x > 640). Druhá dráha smí vyjet souběžně jen hned po první. Děti na cestě dodržují rozestupy (počkají za tím, kdo je před nimi, i za jeho boby).
- Žádné teleporty: kontrola po 240 s simulace – největší posun za krok 2,3 px.

## Traktor s radlicí (H01)
- `src/core/sim/plow.ts` (průjezd, odhrnutý pás) a `src/core/render/tractor3d.ts` (model).
- Stylizovaný low-poly 3D model promítaný kamerou scény: zašlá červená kapota, zelenošedé blatníky se sněhem, prosklená kabina s řidičem, výfuk, oranžový maják se zábleskem, šikmá radlice (vzdálený konec vpředu → sníh jde k bližší krajnici) a hrnutý sníh před ní. Kola se točí podle ujeté dráhy, karoserie lehce vibruje.
- Časy: první průjezd 60–120 s, interval 240–420 s, průjezd 25–40 s; začátek i konec mimo obraz.
- Za radlicí zůstane tmavší utužený pás s kolejemi a val hrud sněhu na bližší krajnici; při sněžení pás zapadne asi za 5 minut (bez sněžení za 20 minut). Smrk v popředí traktor zakryje.

## Další život
- Běžkaři (epizody A01): tam po horní namalované stopě, obrat na konci, zpět; zastaví se na chvíli ve stopě.
- Chodci po chodníku (portály mimo obraz), senioři za ruce, mladý pár, dva pejskaři (kolie, jezevčík), vzdálená trasa u domů. Část lidí se na 8–25 s zastaví a dívá se na děti na svahu.

## Ověření
- Galerie aktivit: **A02 Bobování ze svahu** a **H01 Traktor odhrnuje silnici** – spustí se hned (bez čekání na časovač).
- `scripts/perf-check.ts`: ostatní scény beze změny (otisk stavu shodný).
