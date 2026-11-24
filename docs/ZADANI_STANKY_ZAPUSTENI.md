# Zadání pro ChatGPT: přirozené zasazení stánků do malovaného náměstí

Problém (viz `docs/img/stanek-ve-scene-problem.png`): stánky působí jako nalepená textura.

| Co je špatně | Projev |
|---|---|
| Perspektiva | Stánek je kreslený přesně zepředu (nárys bez boční stěny a hloubky střechy), náměstí je viděné šikmo shora. |
| Spodní hrana | Rovná a ostrá – chybí kontaktní stín, okluze a nahrnutý sníh u paty. |
| Světlo | Lucerny svítí, ale neosvětlují sníh kolem stánku; světlo stánku neodpovídá večernímu světlu scény. |
| Barvy a ostrost | Stánek je sytější, kontrastnější a ostřejší než malba pozadí; chybí opar vzdálenosti. |
| Obsluha | Prodavač je jen oříznutý do okna – chybí vnitřní prostor stánku. |

## Co přiložit ke zprávě pro ChatGPT

1. Snímek scény se stánkem: `docs/img/stanek-ve-scene-problem.png` nebo celý snímek z aplikace.
2. Pozadí náměstí s radnicí (původní obrázek).
3. Původní arch stánků (4 stánky).

## Prompt

```text
Přikládám: (1) snímek z mé aplikace, kde je stánek vložený do malovaného náměstí, (2) samotné pozadí náměstí, (3) arch původních stánků. Stánky ve scéně působí jako nalepená textura. Potřebuji od tebe dvě věci: A) zadání a prompty pro novou grafiku stánků, B) technický postup, jak je aplikace zapustí do obrazu, aby působily přirozeně. Nejdřív stručně analyzuj, proč stánek nepůsobí přirozeně (perspektiva, kontakt se zemí, světlo, barvy, ostrost, opar, měřítko), pak navrhni řešení.

KONTEXT APLIKACE
- Aplikace vytváří živé zimní obrazy: malované pozadí 1920×1080 (večerní vánoční náměstí s radnicí, teplé světlo z oken a luceren, modravý sníh), na něm 2D objekty (stánky, strom, lampy, koše, stolky) a chodící 2D postavy. Objekty jsou samostatné PNG s průhledným pozadím; aplikace je kreslí v Canvas2D podle hloubky (čím níž v obraze, tím blíž a větší) a umí kreslit i pomocné vrstvy (stíny, záře, masky, přebarvení) – žádné 3D.
- Perspektiva scény: kamera ~2,6 m nad zemí, horizont v y ≈ 831 px, náměstí je hluboké ~55 m (y 900 → 1080). Měřítko postavy (1,75 m) je 0,36 v y = 900 a 1,3 v y = 1080. Stánky stojí v pásu y ≈ 975–1000 (vzdálenost ~30–35 m), na obrázku jsou široké ~190 px.
- Ve stánku stojí prodavač (skládaná 2D postava), kterého teď kreslím jen oříznutého do okna nad pultem; zákazníci stojí před pultem, fronta podél stánku.
- Stánky mají zůstat ve stejném stylu (malované, dřevěné, sníh na střeše, girlandy, mašle, lucerny, zboží na policích – hračky, perník, nápoje se samovarem, pletené zboží).

A) NOVÁ GRAFIKA STÁNKŮ (pro generování obrázků)
1. Navrhni správný úhel pohledu, aby seděl s pozadím (stánek viděný mírně shora a mírně z boku podle polohy v obraze – vysvětli, jestli stačí jeden pohled „mírně shora, čelně“, nebo je potřeba levá/pravá varianta podle toho, kde stánek ve scéně stojí).
2. Navrhni rozdělení stánku do vrstev (každá zvlášť jako PNG s průhledným pozadím, stejný rozměr a zarovnání), aby šel prodavač dát DOVNITŘ stánku: např. zadní stěna s policemi a zbožím; prodavač se vkládá sem; přední část (pult, sloupky, střecha, girlandy, lucerny); samostatně záře luceren (pro aditivní kreslení); samostatně stínová/okluzní maska spodku; volitelně závěj u paty stánku.
3. Pro každý ze 4 stánků napiš hotové prompty pro generování obrázku (anglicky nebo česky – co dá lepší výsledek) s přesným popisem kompozice, světla (večer, teplé lucerny zevnitř, modravé okolí), stylu shodného s pozadím (malba, měkké okraje, stejná sytost), velikosti a zarovnání vrstev a toho, co NESMÍ obsahovat (žádné pozadí, žádný stín na zemi vypečený do obrázku, žádný text).
4. Uveď, jak zkontrolovat, že vrstvy na sebe přesně sedí.

B) TECHNICKÉ ZAPUŠTĚNÍ V APLIKACI (Canvas2D, bez 3D)
Popiš přesný postup a parametry (hodnoty, rozsahy, pořadí kreslení), např.:
- kontaktní stín a ambientní okluze pod stánkem a mezi stánkem a zemí (tvar podle půdorysu promítnutého kamerou, měkkost, sytost, barva podle sněhu),
- nahrnutý sníh / závěj u paty a na pultu (jak ho vykreslit, aby navazoval na sníh v pozadí),
- světlo luceren a interiéru na sníh před stánkem a na postavy u pultu (radiální záře, aditivní/screen režim, barva, dosah, mírné blikání),
- barevné sladění s pozadím (úrovně, sytost, posun odstínu k barvě okolního světla, „color grading“ podle místa v obraze), opar/atmosféra podle vzdálenosti, sjednocení ostrosti (jemné rozostření/změkčení okrajů, „light wrap“ – prosvícení okraje světlem pozadí),
- odraz světla na mokrém/ušlapaném sněhu (volitelně), padající sníh před i za stánkem,
- jak řešit pořadí kreslení se zákazníky u pultu a prodavačem uvnitř (vrstvy A),
- jak to udělat obecně pro jakýkoli vložený objekt (strom, lampy, koše), aby editor mohl tyto efekty zapnout u každého objektu (parametry v projektu).
Uveď pro každý efekt: vzorec nebo algoritmus, výchozí hodnoty, rozsah, náklady na výkon (export videa 1080p i 4K, 30 fps), a jak ověřit výsledek (měřitelná kritéria, např. rozdíl průměrného jasu/sytosti okolí a objektu, šířka přechodu na hraně).

FORMA VÝSTUPU
- Jeden dokument v Markdownu (česky), název „Zadani_zasazeni_stanku_Claude.md“, kapitoly: Analýza – A) Grafika (vrstvy + hotové prompty pro 4 stánky) – B) Zapuštění v aplikaci (efekty, parametry, pořadí kreslení, ověření) – Priority a postup.
```
