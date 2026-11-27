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
- 10 dětí v nepřetržitém cyklu (výchozí), rodič u dojezdu se dívá na jezdce.
- **Bez horních limitů:** počet dětí (`hill.kidsN`), počet drah (`hill.laneCount`) i souběžných jízd (`hill.maxRiding`, 0 = bez omezení) jsou libovolné. Dráhy se vygenerují vějířem mezi třemi zadanými drahami (výchozích 5 drah, rozestup ≥ 1,2 m; víc drah = užší rozestupy), další děti se doplní klony s jiným vzhledem. Každé dítě jede po své dráze.
- Při víc dětech jdou nahoru ve více řadách vedle sebe (1 řada na 7 dětí, `hill.ascentCols`); nahoře vyjíždí kdokoli z plošiny, je-li volná dráha; plná fronta se protáhne na schody (v řadách, rozestup 2,6 m – dítě + boby). Ověřeno: 10 dětí / 5 drah → až 4 jízdy najednou; 30 dětí / 10 drah → až 6 najednou, 95 jízd za 300 s, žádné zaseknutí ani skok polohy.
- Cyklus: fronta nahoře → položení bobů (předklon) → usednutí → odraz → **jízda podle sklonu** (gravitace, tření μ 0,07, odpor úměrný v², u každého dítěte jiný) → **brzdění nohama** na rovině dojezdu (zpomalení spočítané tak, aby vždy zastavilo před chodníkem, odlétá sníh) → vstání na stranu ke kameře → zvednutí šňůry → návrat pěšky po dojezdu → výstup po schodech → fronta.
- **Běh:** část dětí (výchozí 40 % návratů) běží – zpátky po dojezdu a první část schodů, pak zvolní do chůze. Poklus je vrstva nad chůzí (`AnimState.run`): švihová noha se zvedá výš, pánev níž s větším pérováním, předklon trupu ~9°, lokty pokrčené ~90° a paže kmitají víc; rychlost 1,85 m/s po rovině, 1,2 m/s do schodů.
- Jízda trvá 9–11 s. Boby za dítětem jedou po jeho stopě ve vzdálenosti šňůry (jen tah – nikdy nepředjedou dítě do kopce), natáčejí se podle tahu; šňůra má průvěs.
- **Rezervace po drahách:** dráha je obsazená od cesty ke startu přes jízdu, vstávání a sebrání šňůry, dokud se její jezdec s boby nevzdálí ~3 m od místa zastavení. Výjezdy jsou aspoň 1 s od sebe. Návrat vede pod konci všech drah, takže nekříží jízdy.
- Na cestě děti dodržují rozestupy (počkají za tím, kdo je před nimi, i za jeho boby); přednost má ten, kdo je na okruhu dál, a kdo čeká přes 3 s, pomalu pokračuje – žádné vzájemné zaseknutí.
- Žádné teleporty: kontrola po 400 s simulace – největší posun za krok 2,4 px.

## Traktor s radlicí (H01)
- `src/core/sim/plow.ts` (průjezd, odhrnutý pás) a `src/core/render/tractor3d.ts` (model).
- Stylizovaný low-poly 3D model promítaný kamerou scény: zašlá červená kapota, zelenošedé blatníky se sněhem, prosklená kabina s řidičem, výfuk, oranžový maják se zábleskem, šikmá radlice (vzdálený konec vpředu → sníh jde k bližší krajnici) a hrnutý sníh před ní. Kola se točí podle ujeté dráhy, karoserie lehce vibruje.
- Časy: první průjezd 60–120 s, interval 240–420 s, průjezd 25–40 s; začátek i konec mimo obraz.
- Za radlicí zůstane tmavší utužený pás s kolejemi a val hrud sněhu na bližší krajnici; při sněžení pás zapadne asi za 5 minut (bez sněžení za 20 minut). Smrk v popředí traktor zakryje.

## Nastavení v editoru
Bez výběru (vlastnosti scény v pravém panelu) jsou sekce **Bobování** a **Traktor s pluhem**. Změny se projeví hned v běžící simulaci (bez restartu) a jdou vrátit tlačítkem Zpět.
- Bobování: zapnuto / vypnuto (děti počkají nahoře), **počet dětí** a **počet drah** (bez omezení), max. souběžných jízd (0 = bez omezení; víc než drah → dráhy se přidají), podíl běhu (%), rychlost jízdy (bez horní meze; brzdění vždy zastaví před chodníkem), první jízda po startu, tlačítko **Další jízda hned**, živý přehled (kolik dětí právě jede).
- Traktor: zapnuto / vypnuto, první průjezd od–do, interval od–do, délka průjezdu od–do (určuje rychlost), šířka radlice (všechno bez horních mezí), odpočet do dalšího průjezdu, tlačítko **Projet teď**.
- Dráhy, výstup a fronta se zatím upravují v generátoru scény (`MOUNTAIN` / `p.hill` v `scripts/generate-mountain-demo.ts`).

## Další život
- Běžkaři (epizody A01): tam po horní namalované stopě, obrat na konci, zpět; zastaví se na chvíli ve stopě.
- Chodci po chodníku (portály mimo obraz), senioři za ruce, mladý pár, dva pejskaři (kolie, jezevčík), vzdálená trasa u domů. Část lidí se na 8–25 s zastaví a dívá se na děti na svahu.

## Ověření
- Galerie aktivit: **A02 Bobování ze svahu** a **H01 Traktor odhrnuje silnici** – spustí se hned (bez čekání na časovač).
- `scripts/perf-check.ts`: ostatní scény beze změny (otisk stavu shodný).
