# Pády chodců

## Co je hotové
Jsou tři varianty pádu a zachycené uklouznutí. Každá je složená z klíčových póz celého těla (`src/core/anim/fallPoses.ts`) a kostra mezi nimi interpoluje. Nohy a paže se dopočítávají přes IK, kolena ve 3D jako při chůzi.

| Varianta | Průběh | Délka |
|---|---|---|
| **Uklouznutí dozadu do sedu** | přední noha ujede vpřed (klouže), ruce nahoru a do stran, pád na zadek, dlaně za tělem; pauza, přetočení přes dřep, oprášení zadku | 7,5 s |
| **Zakopnutí dopředu na ruce a kolena** | zadní špička zachytí, vyrovnávací krok, dopad na dlaně a kolena; pauza, klek na jedno koleno, výpad, vstoje, oprášení kolen a dlaní | 6,6 s |
| **Boční uklouznutí při otáčení** | chodidlo ujede do strany, paže do stran, pád na bok/kyčel s oporou ruky; přes klek nahoru, oprášení boku | 6,4 s |
| **Zachycené uklouznutí** | noha ujede, paže nahoru, vyrovná se a jde dál | 1,9 s |

- **Fáze:** chůze → ztráta opory → pokus o vyrovnání → pád → dopad a usazení → pauza → vstávání → oprášení → pokračování. Fáze se zobrazuje i ve stavu postavy.
- **Kontakty:** chodidla, dlaně, kolena a sed jsou v každém klíči označené jako stojící nebo klouzající. Ladění je ukazuje zeleně / červeně.
- **Strany:** pro variantu dozadu a dopředu se volí, která noha ujede (výměna stran). U boční varianty se volí směr pádu (ke kameře / od ní).
- **Otisky ve sněhu:** vzniknou jednou při dopadu z kontaktních bodů pózy (sed, dlaně, kolena, bok), jen na sněhu. Slábnou jako stopy.
- **Konec bez skoku:** posun těla (např. o kus vpřed po zakopnutí) se převede do polohy postavy před doznívajícím prolnutím. Postava pak pokračuje ve své trase.
- **Okolí:** lidé do 8 m se při dopadu na ~3,5 s otočí k upadlému.
- **Pomocník:** u skutečného pádu (ne u zachyceného uklouznutí) s pravděpodobností 50 %. Přijde nejbližší dospělý, který jde sám a odchází; dojde k upadlému a při vstávání nabídne ruku (gesto otevřené dlaně). Pak pokračuje v odchodu.

## Pravidla výběru (`src/core/sim/falls.ts`)
- **Kdo může upadnout:** jen návštěvník, který odchází po trase sám, bez dítěte, partnera či psa, bez věcí v rukou a bez činnosti. Musí jít plnou chůzí a mít kolem volné místo: nikdo do 1,6 m a žádná překážka do 1 m.
- **Senioři se nevybírají.** Pád seniora by vyžadoval jinou (pomalejší, opatrnější) sadu póz.
- **Četnost:** střední interval 210 s, minimální rozestup 120 s, nejvýš jedna událost najednou a cooldown postavy 15 min. Váhy variant: zachycené 45 %, dozadu 22 %, dopředu 17 %, bokem 16 %.
- **Nastavení projektu:** `project.falls` (`enabled`, `meanIntervalSec`, `minGapSec`, `agentCooldownSec`, `weights`, `helperChance`). Bez něj se náhodné pády nespouštějí. V demu Liberec jsou zapnuté.

## Ladění v editoru
- V horní liště je volba **„Ladění pádů“**. Nabízí výběr varianty a strany, zpomalení 4×, zapnutí pomocníka a tlačítko **„Spustit pád“**.
- Pád se spustí u vybrané postavy, jinak u vhodné postavy u středu obrazu.
- Překryv zobrazuje kontakty, fázi a čas, čáru k pomocníkovi a otisky.
- Kontrolní scéna: `npx tsx scripts/falls-check.ts [projekt] [složka]` → vypíše výsledky a uloží `pady-faze.png` a `pady-ladeni.png`.

## Ověřeno (`tests/falls.test.ts`)
- Všechny varianty vlevo i vpravo projdou fázemi ve správném pořadí a pak pokračují v chůzi.
- Otisk vznikne jen u pádu, ne u zachyceného uklouznutí: 2–4 otisky na pád, vždy jen při jednom dopadu.
- Pánev se pohybuje bez skoků: nejvýš ≈ 3,4 px za krok, což odpovídá rychlému pádu při 60 Hz.
- Pomocník přijde a nabídne ruku.
- Náhodné pády za 10 min:
  - nejvýš jeden najednou,
  - dodržený rozestup,
  - žádná postava dvakrát (cooldown),
  - jen sólo chodci bez věcí.
- Stav simulace (pády i postavy) je stejný při 60 FPS i při 30 FPS s výpadky.

## Opravy navíc
- **Pády:** během pádu animátor stojí a základní póza zůstane zmrazená, takže se pád z ní plynule prolne. Dřív postavu postrkoval dav a „chodila na místě“ a náhlé „dokročení“ srazilo pánev o 15 j.
- **Všechny postavy:**
  - zastavení hned po rozejití se teď plynule vrátí do klidového postoje. Dřív póza poskočila do dokročení z plné chůze;
  - délka nohy se v prvních snímcích švihu počítá v rovině poslední kotvy chodidla. Dřív při odrazu v zatáčce pánev na pár snímků poklesla (o 5–13 j.);
  - postava, kterou dav lehce postrkuje, se dokáže otočit na místě. Dřív zůstala natrvalo stát;
  - mezilehlý bod trasy, ke kterému se postava přes stojící lidi nedostane, se po 3 s přeskočí.

## Omezení / chybí
- **Malovaný kabát** visí podél trupu. V sedu a na zemi se proto kresba těla ořízne na úrovni země. Vlastní malované díly pro sed nebo leh (pokrčený kabát) chybí.
- **Boční pád** se v pohledu z boku promítá do hloubky, takže je méně čitelný než zepředu nebo zezadu.
- **Pomocník** nabízí ruku jen gestem. Upadlý se ruky skutečně nechytá (spojené IK obou postav není hotové).
