# Výkon (optimalizace bez ztráty vizuálu)

Změřeno v Liberci (snímek 1920 × 1080, Node + @napi-rs/canvas):

| | Před | Po |
|---|---|---|
| Vykreslení snímku (ustálené) | 265 ms | ~130 ms |
| Simulace 1 s scény | 202 ms | ~98 ms |
| Simulace 1 s scény (Radnice) | 105 ms | ~57 ms |

## Co se změnilo
- **Vzdálené nohy psa a kočky** se ztmavují předem: kopie dílu na 86 % jasu v mezipaměti místo `ctx.filter = 'brightness(0.86)'` při každém kreslení. Filtr nutil plátno kreslit přes celou vrstvu snímku a stál ~155 ms na snímek. Obraz je okem stejný; rozdíl je jen ve vzorkování srsti, nejvýš 0,005 % pixelů o víc než 8 úrovní.
- **Plánovač davu** (`crowd.ts`) vybírá sousedy do 9 m jednou na postavu, ne pro každý z 90 kandidátů rychlosti, a nezávislé hodnoty počítá předem. Řešič počítá projekci v polích čísel místo nových objektů. Vzorce i pořadí výpočtu zůstaly stejné, takže stav simulace je po 300 s shodný do bitu.

## Kontrola
- `npx tsx scripts/perf-check.ts --uloz` uloží referenční snímky (Liberec, Radnice) a otisky stavu.
- `npx tsx scripts/perf-check.ts` je porovná a změří časy. Limit: pixelů s rozdílem > 8 úrovní nejvýš 0,02 % snímku a průměrný rozdíl < 0,02; otisky stavu musí být shodné.

## Zkoušeno a zamítnuto
- Předem zmenšené velké obrázky stánků: bez přínosu, čas se rozkládá na stovky malých dílů postav.
- Kódování / čtení pixelů pro export (31 ms na snímek) zatím beze změny. Souběžné zpracování (výpočet dalšího snímku, zatímco se kóduje předchozí) je možný další krok.
