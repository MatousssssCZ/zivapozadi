# Chůze seniorů (profil A a B)

## Co je hotové
- **Profil A – pomalá chůze:** krok 0,50 m, kadence 100 kroků/min, rychlost ≈ 0,83 m/s. Předklon trupu +4°, švih paží 55 %, pohupování 70 %.
- **Profil B – chůze s jednou holí:** krok 0,38 m, kadence 84 kroků/min, rychlost ≈ 0,53 m/s. Předklon +8°, švih volné paže 35 %.
  - Hůl je v pravé ruce a podpírá levou nohu. Zrcadlová varianta: hůl v levé ruce, podpírá pravou nohu.
  - Hůl se přesouvá jednou za celý cyklus, současně s podpíranou nohou. Hrot dopadá spolu s její patou, kousek před ní.
  - Dokud je podpíraná noha na zemi, hrot stojí ve světě. Jeho poloha ve scéně se uloží při došlapu, takže drží i v zatáčce a při přepnutí pohledu.
  - Délka hole je pevná (≈ výška zápěstí, u demo postavy 0,89 m). Ruka drží rukojeť a náklon hole se dopočítá z polohy hrotu a ruky. Paže ani hůl se nenatahují.
- **Rozejití, zastavení a otočky:** používají stávající kontaktní chůzi. Opřený hrot zůstává stát i během rozejití a dokročení. Při změně ruky v obraze (otočka) se hrot usadí při dalším došlapu.
- **Sníh:** ve sněhu jde senior o 15 % pomaleji a kroky se úměrně zkrátí (délka kroku × (v/v₀)^0,6).
- **Variace jednotlivce** (deterministicky z id): délka kroku ±5 %, kadence ±4 %, předklon ±1,5°.

## Nastavení
- V panelu postavy jsou dvě volby:
  - **Chůze:** Běžná / Senior A / Senior B.
  - **Hůl v ruce:** pravé / levé.
- V projektu jde o `characters[].gaitProfile` (`elderA` | `elderB`) a `caneSide` (`R` | `L`).
- Demo Liberec obsahuje dva seniory: `ch_senior_a` (paní Věra) a `ch_senior_b` (pan Josef s holí).

## Ladění
- V horní liště je volba **„Ladění chůze seniorů“**. Zobrazí:
  - opěrné body chodidel,
  - hrot hole (zelená = opřený, oranžová = ve vzduchu),
  - rukojeť,
  - profil, délku kroku, kadenci a rychlost.
- Kontrolní scéna: `npx tsx scripts/elderly-check.ts [projekt] [složka]` → vypíše měření a uloží `seniori-chuze.png` a `seniori-ladeni.png`.

## Ověřeno (`tests/elderly.test.ts`, 300 s simulace Liberce)
- Délka kroku a kadence v ustálené chůzi: odchylka do 4 % / 5 % od cíle. Naměřeno:
  - A: 0,490 m a 99 kroků/min (cíl 0,491 m a 102 kroků/min),
  - B: 0,367 m a 83 kroků/min (cíl 0,366 m a 85 kroků/min).
  - Kadence je asi o 2 % nižší, protože dav místy zpomalí.
- Hůl došlape 1,00× za cyklus. Prokluz hrotu během opory je 0 px a délka hole je stálá. Obě strany (pravá i levá ruka) jsou ověřené.
- Ruka drží rukojeť: odchylka je 0, jen v krajní poloze při otočce nejvýš 1,5 j. (≈ 2 cm).
- Stav seniorů nezávisí na snímkové frekvenci (60 FPS vs. 30 FPS s výpadky).

## Chybí / podklady
- Hůl je zatím **kreslená vektorově**: dřevěná násada, zahnutá rukojeť a gumová patka. Malovaný podklad hole (bok, 3/4 zepředu a zezadu) zatím chybí.
- Senioři nemají vlastní díly (šedé vlasy, starší tváře). Používají běžnou knihovnu dospělých.
