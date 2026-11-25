# Rasy psů a koček

## Podklady
Ve složce `grafika/zvirata/zdroje` je jeden atlas na plemeno. Levá polovina obsahuje díly předního 3/4 pohledu, pravá zadního 3/4 pohledu, oba orientované doprava.

`python3 scripts/process-animal-breeds.py`:
- najde díly podle skutečného alfa kanálu (souvislé oblasti s alfou nad 90 tvoří jádro dílu, výřez pak zahrnuje měkké okraje srsti nad 2/255);
- barvy neodstraňuje;
- každý atlas čte vlastní mapou výřezů: řady se oddělí podle výšky, v řadě se díly berou zleva doprava (`SHEETS`, `DOG`, `CAT_BRIT`, `CAT_MAINE`);
- ukládá `grafika/zvirata/<rasa>_<díl>.png` a `<rasa>.parts.json` (AnimalPart: `texture`, `pivot`, `attachments` v px výřezu);
- vytváří `src/core/render/animalBreeds.ts` (kotvy článků nohou pro přední a zadní pohled, uši koček).

**Rozložení dílů**

| Druh | Řady (shora) |
|---|---|
| Pes | trup, hlava, ocas · přední nohy: bližší horní, bližší spodní, vzdálenější horní, vzdálenější spodní · zadní nohy ve stejném pořadí |
| Britská kočka | dvě uši · trup a hlava · tři díly ocasu · 4 horní díly nohou · 4 spodní díly |
| Mainská mývalí | ucho, hlava, ucho · trup · tři díly ocasu · 2 řady nohou |

## Kostra a konfigurace (`BREED_RIG` v `src/core/render/animalRenderer.ts`)
Kostra je pro všechny rasy stejná, proporce má každá rasa vlastní:
- **velikost vůči druhu:** bernský salašník 1,3, dalmatin 1,2, buldoček 0,72, kolie 1,12, husky 1,18, jezevčík 0,95, britská kočka 1,08, mainská 1,2;
- **úchyty na trupu:** rameno, kyčel, krk, kořen ocasu;
- **úchyt hlavy:** u základny krku;
- **ocas:** kořen v obrázku, zrcadlení, náklon;
- **měřítko nohou.**

Nohy jsou dvoučlánkové s výpočtem kloubů (inverzní kinematika): horní kloub je pivot horního dílu, dolní kloub je pivot spodního dílu a z kotvy spodního dílu se počítá dotyk tlapky se zemí. Ve fázi opory tlapka stojí na místě. Zadní pohled používá vlastní díly trupu, hlavy, nohou i ocasu. Doleva se zrcadlí celé sestavené zvíře. Kočičí ocas je řetěz tří článků se zpožděním ke špičce, uši jsou potomky hlavy.

**Pořadí vrstev:** vzdálené nohy → ocas → bližší nohy → trup → hlava (s ušima).

## Kontrolní náhled
`npx tsx scripts/animal-preview.ts [--kostra] [--tmave] [rasa]` vytvoří `grafika/zvirata/nahled*.png`. Náhled ukazuje stoj, čtyři fáze kroku, zadní pohled, pohled doleva a čichání.

Značky v režimu `--kostra`:
- bílá: kostra trupu;
- růžová: rameno a kyčel;
- žlutá: koleno;
- tyrkysová: dotyk tlapky;
- červená: bod umístění na zemi.

## Ve scénách
- **Liberec:** kolie a buldoček, britská kočka.
- **Kluziště:** dalmatin, husky a kolie.
- Rasu nastavíte u postavy (`petBreed`) a u kočky (`cats[].breed`).

## Omezení
- Tmavá kočka zatím chybí, atlas nedorazil.
- Rasy nemají malovaný sed. Místo něj stojí, hlavu skloní natočením.
- Pro husky a jezevčíka (dodané navíc) platí stejné postupy.
