# Dodaná grafika – zpracování a požadavky

## Co bylo dodáno (grafika/zdroje)

| Soubor | Obsah | Rozlišení |
|---|---|---|
| `pozadi-radnice.webp` | malované pozadí – náměstí s radnicí | 1672 × 941 (bez průhlednosti) |
| `stanky-arch.webp` | 4 interiéry + 4 rámy stánků | 1774 × 887, průhledné pozadí |
| `strom-lampy-arch.webp` | vánoční strom + 2× lampa | 1671 × 941, průhledné pozadí |

## Zpracování (`npx tsx scripts/process-graphics.ts` → grafika/zpracovane)

* Archy se automaticky rozdělí podle průhledných mezer.
* Alfa kanál se vyčistí (ztrátová WebP má u plných pixelů alfu ~250 → 255, šum pod 10 → 0).
* **Stánky:** interiér se vloží za rám – automaticky se najde otvor rámu (největší uzavřená průhledná
  oblast), interiér se ořízne na otvor a posune tak, aby byly vidět horní police. Výsledek:
  `stanek-hracky.png`, `stanek-pernik.png`, `stanek-napoje.png` (stánek s kávou), `stanek-pletene.png`.
  Rámy a interiéry jsou uložené i zvlášť.
* Demo projekt: `npx tsx scripts/generate-radnice-demo.ts` → `demo/Namesti-radnice.zscena`.

## Doporučení pro finální grafiku

* **Pozadí v 3840 × 2160.** Současné 1672 × 941 se pro 4K export 2,3× zvětšuje (je mírně měkké).
* **Objekty** stačí v současném rozlišení, pokud nebudou ve scéně větší než ~ jejich pixelová velikost
  při 4K (stánek ~ 430 px vysoký se ve 4K zobrazuje ~ 380 px – v pořádku).
* Prvky, které mají zakrývat postavy (popředí), dodávejte zvlášť jako průhledné PNG.
* Bezztrátové PNG je lepší než WebP (žádné okraje kolem průhlednosti).

## Postavy a zvířata – co je potřeba (zatím nedodáno, ve scéně jsou provizorní testovací postavy)

* Jedna postava pro první test: **chůze** (cyklus 8–12 snímků) + **stání** (1 snímek stačí).
* Směry: bok (druhý se zrcadlí); šikmo ke kameře a od kamery, pokud jsou.
* Všechny snímky na **stejně velkém plátně**, chodidla vždy ve **stejném bodě**.
* Formát: PNG po snímcích, nebo sprite sheet (mřížka stejných políček) – napište počet snímků a fps.
* Volitelné klipy pro kávu: objednávka, převzetí, pití, vyhození (jinak se použije náhrada).
* Zvířata stejným způsobem (chůze/běh + stání); chování zvířat je další etapa.
