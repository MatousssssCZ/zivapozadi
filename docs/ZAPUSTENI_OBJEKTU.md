# Zapuštění objektů do malovaného náměstí

Podle zadání `docs/zdroje/zadani-zasazeni-stanku.md` (ChatGPT, 24. 11. 2026). Hotová je
**priorita 1 – oprava současné scény bez nové grafiky**. Nová vrstvená grafika stánků (kap. A)
zatím není; prompty pro ni jsou připravené v zadání (A.5–A.7).

## Co aplikace dělá (`src/core/render/integration.ts`)

Vše je čistá funkce projektu a času (deterministické, export i náhled stejně), bez čtení pixelů
celé scény. Bitmapy se počítají jednou a cachují.

| Efekt | Jak | Výchozí (zadání B) |
|---|---|---|
| Zastínění půdorysu | Půdorys (šířka paty × hloubka) promítnutý kamerou, rozšířený a vrstvený (≈ rozmazaný) | 0,10, rozšíření 0,07 m, σ 1,5 px |
| Kontaktní stín | Úzký gaussovský pás podél paty, stálá ±15% modulace | 0,22, σ 0,6 px, barva `#627196` |
| Sněhový lem | Nepravidelný profil (dvě oktávy šumu, mezery), výška promítnutá jako H nad zemí, barva sněhu z pozadí | 3,5 cm (≈ 1–4 px), pokrytí 0,75 |
| Světlo na sněhu | Elipsa podle kamery (poloosy R·f/Z × R·f·h/Z²), profil Lh³/d³ s měkkým útlumem, režim screen | R 1,6 m, zisk 0,12 |
| Záře lucerny | Malý radiální gradient (screen) – jádro je už v malbě | 0,12 |
| Světlo na postavách | Teplý přechod ze strany lucerny jen v alfě postavy (izolovaná dočasná plocha) | ≤ 0,14 |
| Prodavač | Kreslí se do izolované plochy omezené otvorem stánku, pod střechou zastíněný (0,22 → 0,06), teplé světlo | – |
| Mikroblikání | 1 + 0,015·(0,8 sin(2π·0,73t) + 0,4 sin(2π·1,13t)); stejný signál pro záři, sníh i postavy | ±1,5 % |
| Sladění barev | Lineární RGB: sytost, kontrast kolem 0,18, ambientní tón, expozice; světelná jádra vynechána | 0,88 / 0,95 / 0,08 |
| Opar | `t = exp(−β·Z)`, mění jen barvu, ne alfu | β 0,0015 /m (≈ 5 % ve 33 m) |

Pořadí: pozadí → stopy → zastínění půdorysu → světlo na sněhu → kontaktní stíny → hloubkově
řazené objekty a postavy (stánek: obrázek → prodavač → sněhový lem → záře).

## Nastavení v editoru

Objekt → sekce **Zapuštění do scény**: zapnutí, kontaktní stín (síla), zastínění půdorysu,
sněhový lem (výška v cm, pokrytí), světlo luceren (síla), sladění barev (sytost, kontrast).
Tvar obrázku (společný pro všechny objekty se stejným obrázkem): kde se tělo dotýká země
(od–do 0–1, bez přesahu střechy), hloubka půdorysu, lucerny (poloha 0–1 a výška v m).

Formát: `SceneObject.integration` a `AssetEntry.shape` (volitelné – starší projekty beze změny).
Demo `demo/Namesti-radnice.zscena` má zapnuté stánky (všechny efekty), lampy (kontakt, sníh,
světlo), strom, stolky a koše (kontakt, sníh).

## Ověření

`tests/integration.test.ts`: kamera podle tabulky zadání (y 990: Z 33,4 m, 61,7 px/m, střecha
3,2 m ≈ 197 px, zadní hrana půdorysu 8,1 px), světelná elipsa ≈ 99 × 8 px, sněhový lem 1–4 px,
nepravidelný, s mezerami a deterministický, blikání ≤ ±3 % a pomalé, sladění barev nemění alfu
a nechá světelná jádra, zemní průchod nekreslí mimo okolí objektu.

![Před a po zapuštění (vlevo původní, vpravo s efekty)](img/zapusteni-stanku.png)

## Co zbývá (potřebuje novou grafiku)

* Vrstvené stánky `back / front / masky` (A.3) – prodavač by pak stál celý na podlaze stánku a
  pult ho přirozeně zakryl; teď se ořezává obdélníkem otvoru.
* Boční varianty stánků pro okraje scény (A.6), sněhová a emisní maska pro přesné sladění.
* Light wrap, odrazy na ušlapaném sněhu, sněžení v hloubkových vrstvách (B.7, B.8) – zadání je
  řadí až po schválení nové grafiky.
