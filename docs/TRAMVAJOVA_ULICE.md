# Scéna „Vánoční tramvajová ulice“

Klidná zasněžená ulice: občas přijede tramvaj, lidé vystoupí a nastoupí, pekař vyjde zamést sníh, chodí chodci, rodiny, senior a pejskař.

**Spuštění:** v aplikaci **Demo: tramvaj**. Scénu znovu vytvoříte takto:
```bash
python3 scripts/process-tram-graphics.py
```
```bash
npx tsx scripts/generate-tram-demo.ts
```

## Podklady (`grafika/tramvaj`)
| Soubor | Použití |
|---|---|
| `pozadi-ulice.png` | hlavní pozadí (1672×941 → 1920×1080, bez natažení) |
| `tramvaj.png` | vůz (ořez na obsah); kotva na dotyku kol předního podvozku, zadní podvozek, dveře – změřené v obrázku |
| `zastavka.png` | zastávka (ořez, pata sloupků y 565 px pozadí); kreslí se podle hloubky – tramvaj je vidět jejími mezerami |
| `popredi.png` | lampa, lavička, zábradlí, keř – vrstva popředí |

Koleje jsou střednice dvojice kolejnic nalezená v kresbě (sledování tmavé linie sloupec po sloupci).

## Konfigurace (`TRAM_SCENE` v `scripts/generate-tram-demo.ts`)
Perspektiva, vlastní měřítko vozu (`tramScale`), místo zastavení, interval (100–180 s), počty cestujících (0–3 / 0–4), čekací místa, dveře pekárny, úsek zametání, trasy vzdáleného a předního chodníku, výchozí hustota chodců.

## Chování
- **Tramvaj** (`src/core/sim/tram.ts`):
  - přijede zprava, brzdí plynule (v² = 2·a·s) přesně na místo zastávky;
  - pak následuje prodleva, otevření dveří, výstup, nástup, kontrola volných dveří, zavření a rozjezd;
  - odjede vlevo mimo obraz;
  - ve scéně je vždy nejvýš jeden vůz;
  - přední podvozek drží kolej, zadní je na koleji díky malému svislému zkosení (vůz se neotáčí ani nehoupe);
  - dveřní křídla se odsunou do stran, za nimi je teplý vstup.
- **Cestující:**
  - vystupující a nastupující procházejí dveřmi s ořezem rámem, takže zmizí za karoserií;
  - nastupuje se až po vystoupení všech a při úplně otevřených dveřích;
  - čekající se dívají směrem příjezdu;
  - po 5 minutách bez tramvaje čekající odejdou.
- **Pekař** (`src/core/sim/bakery.ts`):
  - zhruba jednou za 3–6 min otevře hnědé dveře pod preclíkem a vyjde s koštětem (ořez rámem dveří);
  - zavře za sebou, 20–40 s zametá a pak se vrátí stejnými dveřmi;
  - koště je vektorové a kreslí se v kostře stejně jako lopata, kartáč dosedá na zem;
  - sníh se odmetá jen při dotyku koštěte, drobky rychle zapadnou;
  - zametené místo pozvolna (asi za 2 min) znovu zapadne sněhem.
- **Řazení vrstev:**
  - postavy za kolejemi (vzdálený chodník) jsou za tramvají, postavy před kolejemi před ní;
  - zastávka a ostatní objekty se řadí podle bodu dotyku se zemí;
  - popředí (lampa, lavička) je navrchu.

## Ladění
- Horní lišta → **Ladění ▾ → Ladění bruslení** zobrazí trať, kotevní body, místo zastavení, dveře, čekací místa, dveře pekárny, úsek zametání a stavy aktérů.
- Pravým tlačítkem do scény vyvoláte **Přijede tramvaj** nebo **Pekař jde zametat**.

## Ověřeno (`tests/tram.test.ts`, 15 min)
- Proběhne alespoň 4 úplných průjezdů v pořadí fází, rozestup mezi nimi přes 100 s.
- Nikdo neprochází zavřenými dveřmi.
- Počet postav nepřibývá.
- Pekař projde alespoň 2 celé cykly.
- Stav nezávisí na FPS.
- Ostatní scény jsou beze změny (`perf-check`).

## Omezení a chybějící podklady
- **Perspektiva:** kresba nemá přísnou perspektivu (rozchod kolejí neodpovídá velikosti domů a zastávky). Vůz má proto vlastní plynulé měřítko kalibrované k zastávce a postavy plošší perspektivu.
- **Odjezd vlevo:** vůz se zvětšuje jen mírně. Pro věrohodný průjezd blízko kamery by byl potřeba pohled na tramvaj více zepředu.
- **Otevřené dveře tramvaje:** jsou složené z dodaného obrázku (odsunutá křídla, malovaný vstup). Kreslený otevřený vstup by vypadal lépe.
- **Dveře pekárny:** jsou vyřezané z pozadí. Varianta pozadí s otevřenými dveřmi nebyla přiložena, interiér za dveřmi je proto malovaný přechod.
- **Pekař:** nemá zástěru (postavy ji v knihovně nemají).
