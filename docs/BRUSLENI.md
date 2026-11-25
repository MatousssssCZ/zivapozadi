# Bruslení na kluzišti

Podle zadání „Živá pozadí – bruslení na vánočním kluzišti“. Logika a pohyb jsou hotové a odzkoušené na zkušební scéně. **Konečný vzhled kluziště** (malované pozadí s ledem a mantinelem) dodá grafik. Led a mantinel jsou zatím vektoroví zástupci.

## Zkušební scéna
`npx tsx scripts/generate-rink-demo.ts [složka]` vytvoří `demo/Kluziste-test.zscena`. Generátor vychází z Liberce a místo náměstí dá kluziště 13 × 11 m. Složka se negeneruje do gitu (30 MB, kopie podkladů Liberce).

Na ledě je 16 bruslařů:
- rekreační 8 (jeden z nich je rodič, který drží za ruku dítě poprvé),
- nejistí dospělí 2,
- děti poprvé 2,
- zdatné děti 2,
- velmi dobří 2.

Sáňky, odklízení, pády chodců a zvířata jsou ve scéně vypnuté.

## Změněné a nové moduly
| Modul | Co dělá |
|---|---|
| `src/core/sim/rink.ts` (nový) | Profily, stav bruslaře, navigace, lokomoce (odrazy a skluz), brzda, odpočinek u mantinelu, dítě poprvé, dvojice rodič–dítě, pády, prvky, stopy nožů, póza (`skatePose`), ruční spuštění událostí |
| `src/core/sim/simulation.ts` | `stepRink` (krok kluziště, převod na agenty, pohled se mění jen mimo odraz), `triggerRinkEvent`, stav pro panel. Bruslaři (`onIce`) jsou mimo dav chodců. |
| `src/core/anim/skeleton.ts` | `applyKey`/`applyFall` vyčleněné z pádů; bruslařská póza se skládá z cílů (pánev, brusle, ruce, předklon, náklon). Pád na ledě na ni plynule navazuje. |
| `src/core/render/characterPose.ts`, `rigRenderer.ts` | Nůž brusle pod botou: dva držáky, ocelová lišta, odlesk; výška `BLADE_H` |
| `src/core/render/sceneRenderer.ts` | Zástupný led, stopy nožů (mizí za 60 s), mantinel řazený podle hloubky s brankou |
| `src/renderer/*` | Volba „Ladění bruslení“ v horní liště, tlačítka „Pád na ledě“ a „Prvek“, překryv |
| `scripts/generate-rink-demo.ts`, `tests/rink.test.ts` | Zkušební scéna a testy |

## Kde se ladí parametry
- **`SKATE_PROFILES`** (`rink.ts`) pro každý profil:
  - rychlost,
  - odstup a počet odrazů v sérii, dojezd,
  - šířka postoje, pokrčení kolen, ruce do stran, předklon,
  - nejmenší poloměr oblouku, max. náklon,
  - brzdné zpomalení, zrychlení odrazem,
  - dovednosti,
  - váha pádu.
- **`RinkConfig`** (`project.rink`):
  - obrys ledu `ice`, branka `gate`, směr jízdy `dir`;
  - zástupný mantinel: výška `boardH`, vypnutí `boards: false` (až bude malované pozadí);
  - `events` (všechno volitelné, jinak výchozí podle zadání):
    - pády `fallEvery`, `fallPersonal`,
    - prvky `trickEvery`, `trickPersonal`,
    - váhy prvků `tricks`.
- **`TRICK_WEIGHTS`**: skluz na jedné noze 40, jízda vzad 30, pirueta 0, skok 0.
- **`BLADE_H`** (výška nože, podíl délky nohy) a **`TRAIL_LIFE`/`TRAIL_POOL`** (doba života a počet stop).
- Odpor skluzu a model odstupu jsou ve `stepLocomotion` a `stepSkater`.

## Jak to funguje (stručně)
- **Lokomoce:** série 2–5 odrazů se střídáním nohou. Každý krok má přípravu, odraz do strany a dozadu, návrat nízko nad ledem a položení. Zrychlení vzniká **jen během zatíženého odrazu** a ve skluzu rychlost pozvolna klesá. Zatížená brusle není ukotvená ve světě, klouže.
- **Zatáčky:** omezené zakřivení, náklon tan φ = v·ω/g v mezích profilu, před ostřejším obloukem zpomalení.
- **Odstup:** cílová rychlost = rychlost předchozího + (mezera − min.)/1 s. Tento model nekolabuje ani v uzavřeném okruhu. Kdo je dlouho zdržený, přejede do sousední dráhy, blízké postavy se objíždějí.
- **Brzda:** pluh, postupné zpomalení, konečná dráha. Odpočinek u mantinelu každých 45–120 s na 5–20 s.
- **Dítě poprvé:** drobné kroky podél mantinelu s pauzami. Druhé dítě drží rodič za ruku a rodič jede vedle něj jeho rychlostí.
- **Události:** jeden globální plánovač a nejvýše jedna událost najednou.
  - Pád: pokus jednou za 100–220 s podle vah profilů. Průběh: zaváhání → (60 %) pád → vstávání → 5–12 s opatrně.
  - Prvky: jednou za 90–150 s, s kontrolou volného prostoru a odložením o 30–60 s, když místo není. Pád a prvek nikdy současně ani těsně po sobě.

## Ověřeno
**`tests/rink.test.ts` (7 testů):**
- kvóty profilů;
- rychlost roste jen při odrazu (0 případů bez odrazu za 60 s × 16 bruslařů);
- nikdy obě brusle ve vzduchu;
- skluz si drží rychlost;
- brzda má konečnou dráhu bez skoku;
- sled zaváhání → pád → vstávání → jízda;
- žádný prvek během pádu;
- 20 minut provozu:
  - 6–13 prvků, 1–8 pádů,
  - žádný překryv událostí, každá se uvolní do 15 s,
  - nejmenší vzdálenost těl > 0,4 m,
  - nikdo trvale nestojí,
  - stopy omezené;
- více expertů nezvýší četnost prvků;
- stav nezávisí na FPS (60 vs. 30 s výpadky).

**Ruční běh 20 minut:** 7 prvků (4× jedna noha, 3× vzad), 4 pády, 6 zaváhání, 1 odložení. Průměrné rychlosti:

| Profil | Průměrná rychlost |
|---|---|
| Rekreační | 0,55 m/s |
| Nejistý dospělý | 0,30 m/s |
| Velmi dobrý bruslař | 0,77 m/s |
| Zdatné dítě | 0,79 m/s |
| Dítě poprvé | 0,13 m/s |

Hodnoty jsou včetně odpočinků. Simulace 20 minut trvá zhruba 9 s.

**Ostatní scény:** celá sada testů prochází. `perf-check` u Liberce a Radnice dává shodné snímky i otisk stavu, kluziště se zapíná jen s `project.rink`.

**Vizuálně:** prohlédnuté archy póz (5 profilů × 5 fází × 4 směry), pásy snímků odrazu, pádu a jízdy vzad a ladicí překryv. Póza je přijatelná, ale **přirozenost pohybu v plné rychlosti je potřeba posoudit na videu**.

## Omezení a chybějící podklady
- **Malované pozadí kluziště** zatím není. Po dodání se nastaví `ice` a `gate` podle kresby a `boards: false`. Přední mantinel pak bude muset být samostatná vrstva (překryv), aby zakrýval nohy postav za ním.
- **Brusle** jsou kreslené vektorově (nůž pod existující botou), ne malované.
- **Pirueta** je hotová (dvě otáčky přes dostupné 3/4 pohledy, zapnutá v pastelové scéně; ve výchozích vahách 0). **Skok** je vypnutý.
- **Ruka v ruce** je přibližná: cíle rukou se nastavují gestem, ne přesným spojením dlaní.
- **Pád** používá klíčové pózy pádu chodců „dozadu do sedu“ nebo „bokem“ (vstávání přes klek), bez oprášení.
- **Vstup a odchod brankou** s přezutím na lavičce jsou hotové (`rink.entry`, viz `docs/PASTELOVE_KLUZISTE.md`); bez `entry` (zkušební scéna) bruslaři začínají na ledě a zůstávají na něm.
- **Zástupný mantinel je nízký** (0,55 m), aby byly ve zkušební scéně vidět brusle.
