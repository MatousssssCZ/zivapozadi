# Vektorové postavy a zvířata

Lidé, psi a kočky kreslení čistě vektorově (uzavřené plochy, měkké obrysy, základní barva, jemný stín
a tlumený akcent). Žádné tělo, oděv ani srst nezávisí na rastrových obrázcích. Kostra, kontakty se
zemí, pohyb i všechny existující činnosti (bruslení, odhrnování, sněhulák, koulování, sezení, pády,
anděl, sáně, venčení…) zůstávají společné. Mění se jen viditelný povrch.

Zapnutí: nastavení scény `scene.vectorFigures` – horní lišta **Vektorové postavy** (uloží se se scénou, simulace se sestaví znovu). Pastelové kluziště je má zapnuté. V Node skriptech
a testech `VEKTOR=1`. Vývojový náhled: úvodní menu **Laboratoř postav**.

## Datové oddělení

| Vrstva | Kde | Obsah |
|---|---|---|
| Anatomický profil | `src/core/vector/body.ts` | výška, ramena, objem trupu, poměr nohou, hlava; dítě má vlastní proporce (velká hlava, kratší a silnější končetiny, oblý trup bez pasu) |
| Kostra a pohyb | `src/core/anim/skeleton.ts` (beze změny) | pánev, hrudník, krk, hlava, ramena, paže, předloktí, ruce, stehna, lýtka, chodidla (pata + špička) |
| Vzhled a outfit | `src/core/vector/outfit.ts` | střih, materiálový profil, paleta, detaily, kompatibilita; 24 ručních outfitů + řízené obměny |
| Vykreslení | `src/core/vector/figure.ts` | souvislá silueta těla a oděvu z pózy, korekce v ohybech, vrstvy podle pohledu |
| Zvířata | `src/core/vector/animal.ts` | tělesné typy, kostra (pánev–páteř–hrudník, lopatka, krk, hlava, nohy, ocas, uši), chůze, pózy |
| Geometrie | `src/core/vector/geom.ts` | trubice bez kruhových kloubů, hladké obrysy, válcové stínování |

Pořadí v každém snímku: chování a trasa (simulace) → kontakty (kotvy pat ze simulace) → póza (kostra)
→ oděv a srst (deformace podle pózy) → sekundární pohyby (šála, bambule – stávající fyzika) → vrstvy
a vykreslení.

## Pohledy

Profil, ¾ zepředu, ¾ zezadu, zepředu a zezadu. Tvář, uši a vlasy jsou body na kouli hlavy podle
natočení (ne zúžený profil). Trup se staví z rozestupů kloubů v obraze a z hloubky profilu.
Zvířata mají profil a ¾ k divákovi či od něj: zkrácený trup, posunuté vzdálené nohy, hlava před tělem
nebo za ním, obě oči nebo jen týl.

## Oděvy

Každý oděv je vlastní střih, nejen přebarvení:
- **dlouhý kabát** je jeden kus látky. Sukni tvoří obal kyčlí, kolen a lemu visícího ve směru tíže.
  V kroku se přední díly mírně rozevřou, vzadu je delší zadní díl a v dřepu kabát přejde přes kolena
  k zemi.
- **péřové bundy** mají komory podle délky, vroubkovaný obrys, nafouklé rukávy a vysoký límec.
- **parka** má kapuci (zezadu leží na zádech), pásek v pase a kapsy s klopou.
- **sportovní bunda** má panely v podpůrné barvě, zip a menší objem.
- **dětská kombinéza a oteplovačky** mají měkčí objemy, vyšší pas a zesílená kolena.

Kalhoty jsou úzké, rovné, volné nebo zateplené (nohavice nad botou, nebo zastrčené do vysoké boty).
Sukně jsou s punčochami. Boty kotníkové, sněhule s lemem a vysoké, s rozlišenou patou a špičkou.

Záhyby vznikají jen v ohybech (loket, koleno). Jejich síla roste s úhlem a narovnáním mizí. Mají pevné
pozice a nepřeskakují. Vnitřní strana ohybu se stlačí, objem zůstává. Kapsy, knoflíky, zip i prošívání
jsou kotvené v rámci trupu nebo končetiny a deformují se s oděvem.

Pravidla kompatibility (`compatible`):
- šála respektuje límec (vysoký límec péřovky → bez šály, klopy → omotaná šála);
- rovná manžeta → rukavice místo palčáků;
- batoh jen na kratších bundách (sedí na objemu bundy).

## Zvířata

| Psi | Kočky |
|---|---|
| drobný krátkosrstý, jezevčík, retrívr, ovčácký, border kolie, špic/husky, dlouhonohý štíhlý, velký trikolorní, buldoček, bígl | štíhlá krátkosrstá (mourek), robustní krátkosrstá, dlouhosrstá, kotě |

Typy se liší proporcemi (délka trupu a nohou, hloubka hrudi, kohoutek), hlavou (čenich, uši), ocasem,
délkou srsti (límec, praporce, lícní chomáče) i chůzí (délka kroku, práh klusu, opora).

Chůze:
- **pes – krok:** laterální sled LH → LF → RH → RF.
- **pes – klus:** diagonální páry LF + RH, RF + LH. Má kratší oporu a jiný pohyb těla. Přechod podle
  rychlosti a typu.
- **kočka – chůze:** laterální sled (zadní a pak přední na stejné straně) s proměnlivými rozestupy.
- **kočka – plížení:** nízký trup, pokrčené nohy, delší opora a hlava vpřed.

Tlapka v opoře stojí, protože fáze se počítá z uražené dráhy.

Pózy:
- pes sedí se zalomenými zadními nohami a nártem na zemi a umí čichat;
- kočka sedí vzpřímeně s ocasem u těla, protahuje se, připravuje ke skoku, letí a dopadá s odpružením.

Kresba (skvrny, sedlo, žíhání, náprsenka) je v souřadnicích trupu a deformuje se s ním. Uši mají vlastní
setrvačnost: dlouhé psí kmitají se zpožděním, kočičí občas cuknou. Vrtění mění intenzitu, nekývá se
stále stejně.

## Výkon (Node, CPU renderer)

| Měření | Výsledek |
|---|---|
| jedna postava | ≈ 1,1 ms |
| jedno zvíře | ≈ 2,7 ms (ve zvětšení) |
| Liberec, 30 postav: vektorové / malované | 258 / 288 ms na snímek |
| Radnice, 24 postav: vektorové / malované | 193 / 172 ms na snímek |

Detail (záhyby, prošívání, obočí, nos) se vypíná podle velikosti na obrazovce. Kontakty chodidel
a tlapek zůstávají.

## Nástroje

- `npx tsx scripts/vector-preview.ts [id…] [--kostra]`: postavy v krocích, pohledech a krajních
  pózách. Volba `--katalog` vykreslí mřížku všech 24 outfitů.
- `npx tsx scripts/animal-vector-preview.ts [typ…] [--kostra]`: zvířata.
- `npx tsx scripts/vector-scene.ts <scéna> <čas> <výstup> [--malovane]` (`FRAMES=20` měří výkon).
- **Laboratoř postav** v aplikaci nabízí:
  - rychlost, směr (8), pauzu, krok a zpomalení;
  - kostru a kontakty paty a špičky;
  - oděv, tělesný typ a pohybový profil (klidná, pomalá, svižná, opatrná na sněhu, dítě, senior);
  - pózy (dřep, předklon, klek, sed, zvedání, zvednutá ruka, držení oběma rukama, leh);
  - skutečnou velikost vedle zvětšení;
  - běžící pás posouvaný uraženou drahou, na kterém je vidět případné klouzání.

## Známé limity

- Délky kostí zůstávají z ověřené šablony, aby se nezměnily kontakty, pády ani brusle. Výšku a stavbu
  mění proporce vzhledu a vektorový profil (objemy, hlava). Variabilita poměru nohou je připravená
  v `templateFor`, ale vypnutá.
- Kapuce je jen shrnutá; nasazená kapuce (skrývá vlasy) zatím chybí.
- Cval psa a skok kočky na překážku řeší simulace (Z09). Samostatný cval zatím chybí.
