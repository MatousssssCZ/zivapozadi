# Grafika, výřezy a vrstvy

## Připravené zdroje

`config/assets.json` obsahuje skutečné rozměry, alpha statistiky a SHA-256 všech zdrojů. Nelze předpokládat, že mají všechny stejné rozlišení nebo 1536×1536. Pozadí je RGB, ostatní PNG mají alpha. Náhled může ukazovat RGB barvy v průhledných pixelech; v rendereru vždy respektovat alpha.

`config/atlas_regions.json` obsahuje pojmenované výřezy vybavení, dětských dílů, drobných rekvizit, sněhu, dekorací a architektury. Rect = x,y,w,h ve zdrojových pixelech. Výřez nezmění měřítko; pivot je relativní k výřezu. Pivots jsou startovní odhady, nikoli odladěné klouby. Změna ořezu vyžaduje přepočet pivotu i attachment bodů.

`config/component_candidates.json` doplňuje nepojmenované kandidáty komponent ostatních archů. Slouží k rychlému nalezení dílu, ne k automatickému finálnímu rigu. Práh pro detekci není pokynem oříznout alpha při exportu. Zachovat původní antialias a poloprůhledné okraje.

## Připravené jednotlivé výřezy

Složka `exported/` už obsahuje 82 pojmenovaných PNG vyříznutých z atlasů a 12 přesně navazujících vrstev stánků. Mapování je v `config/exported.json`. Opakovatelný export provádí `tools/export_assets.cjs` pomocí sharp. Nemění vzhled ani rozlišení zdrojových pixelů. Rigové archy zvířat a dospělého jsou ponechány jako zdroje, jejich díly lze vybrat podle component_candidates.json.

Pro lampy ve scéně používat samostatný `lamp_tall.png`; krátká lampa z archu zůstává alternativní dekorací a není použita v náhledu.

## Stánky bez nesouladu vrstev

Každý `assets/stall_*.png` je průhledný master. `exported/stall_*_front.png` obsahuje původní master bez centrálního otvoru a `exported/stall_*_rear.png` obsahuje přesně pixely tohoto otvoru, na stejném plátně. Složení bez prodavače reprodukuje master; tato vlastnost byla ověřena při exportu. Prodavače vložit mezi vrstvy a omezit na vendorClipPx z exported.json. Takto se bezpečně začíná; zadní vrstva nezobrazuje rekonstruovaný prostor, který nebyl v masteru vidět. Z jeho samostatného znovugenerování se nesmí odvozovat pixelově navazující předek a zadek.

První implementace: vykreslit celý master, potom vykreslit prodavače přes něj pouze uvnitř `vendorOpening` z `config/stall_masks.json`. Konzervativní centrální otvor zachová přesné původní pixely pultu, střechy, ozdob i sloupků. Prodavač existuje jako celá postava, ale viditelná část je omezena maskou; nesmí přesahovat boky ani stát před pultem. Výchozí masky jsou záměrně úzké, u jídla je potřeba nejvíce doladění kvůli zboží.

Pro bohatší pohyb: z TÉHOŽ masteru deterministickou alpha maskou vyrobit přední vrstvu (střecha, sloupky, pult, přední zboží) a zadní vrstvu. Uchovat původní velikost plátna, offset 0,0 a stejný transform. Součet vrstev bez prodavače se musí vizuálně shodovat s masterem. Skrytý interiér za pultem lze doplnit jen pokud ho kamera či animace vůbec odhalí. Není nutné jej vymýšlet pro běžného stojícího prodavače.

Ruce při předání mohou mít samostatnou overlay vrstvu nad pultem, ale jen po dosažení platné interakční pozice. Zboží nesmí vystřihnutím zmizet. Lampy a střechy netřídit globálně odděleně od jejich těla, pokud to vede k jejich zobrazení před nesouvisejícími postavami.

## Postavy a zvířata

- `adult_front_parts.png`: původní uživatelův arch. `adult_back_parts.png`: nově vytvořený zadní pohled; barvu a délku kabátu sjednotit při sestavení.
- `child_parts.png`: dvě poloviny přední/zadní, v každé hlava, čepice, šála, trup, paže, předloktí, rukavice, stehno, holeň, bota a náhradní rukavice. Končetiny pro druhou stranu zduplikovat, barevně/hloubkově odlišit a použít samostatné klouby.
- `crouch_parts.png`: čtyři sloupce dospělý přední/zadní, dítě přední/zadní. Klouby se musí při rotaci překrývat; předkreslené švy a duté konce skrýt pod sousedním dílem. Předklon nevzniká jen rotací celé postavy.
- `dog_parts.png`, `cat_parts.png`: hlavy, sedící polohy a doplňky. Některé hlavy mají již namalované uši; při přidání samostatných uší nesmí vzniknout dvojité uši. Cat sheet má i nadbytečné drobné geometrické kusy, které nejsou povinné k použití.
- `animal_walk_supplement.png`: pro chůzi použít vodorovné trupy odtud. Horní polovina pes, dolní kočka. Původní vzpřímené trupy patří k sedu. Pro čtyři nohy sestavit samostatné near/far končetiny, ne jeden pár hýbaný společně. Kloubní konce skrýt s dostatečným překryvem.
- `sled_child_parts.png`: hlava má čepici již připojenou. Nepřidávat druhou čepici. Sáně se skládají z rámu skluznic, sedadla a předního attachmentu; dítě posadit na sedadlo a přední skluznici vykreslit před botami. Lano je pro dynamické napojení vhodnější křivka mezi rukou a attachmentem; dodaný malovaný kus je reference textury.

Jednotlivé zdroje nejsou navzájem automaticky ve fyzickém měřítku. Normalizovat délky segmentů a proporce při sestavení, nikoli roztáhnout celý arch na obrazovku. Na kloubu mít vizuální překryv přibližně 10–20 % šířky končetiny. Přidat kontaktní body mouth, hand, collar, sledSeat, shovelGripA/B a feet. Každá rekvizita má svého vlastníka; po uvolnění se attachment zruší.

## Architektura

`architecture_patches.png` obsahuje nové dveře, křídlo, interiér, neutrální otvor a šest dvojic oken. NEJSOU to pixelově zarovnané řezy původní radnice. Usadit je do ručně vybraných otvorů čistého pozadí; aplikovat masku jen vnitřní plochy otvoru a zachovat kamenný rám z pozadí. Nepřemalovat celou fasádu. Pro okno lze místo výměny rámu použít pouze sklo a vnitřní zář. Lit/dark varianty nejdřív zarovnat na společný trim, jinak při přepnutí okno poskočí.

Pro přesně konzervovaný vzhled je přípustné použít současné sklo pozadí, jeho barevné ztmavení a mírnou maskovanou zář. Dveřní křídlo otáčet kolem skutečného pantu, ne kolem středu. Nová vrstva zakryje původní dveře pouze uvnitř portálu; práh zůstane na původním místě.

## Dekorace a efekty

`garlands_sheet.png` má nahoře tři samostatné girlandy, dvě mašle a dvě hvězdy. Dva nevyžádané malé stánky ve spodní části archu jsou NEPOUŽITÉ a nepatří do scény. Přidáním nesmí vzniknout osm stánků.

Girlandy ve stánkových masterech jsou již staticky namalované. Novou pohyblivou girlandu nepokládat přes původní jako druhou kopii. Buď ponechat statickou girlandu a hýbat jen samostatnou hvězdou, nebo původní dekoraci nejdřív korektně vyjmout z masteru. Jemný pohyb max. jednotky stupňů, různé fáze.

Pára má v atlasu šest variant. Nikdy nezesílit alpha na 255. Použít nízkou celkovou opacity, pomalý růst a zánik, lokální emitor. U stánku s jídlem je část páry již malovaná: nepřidávat na totéž místo další masivní oblak. Sníh pod sáňkami musí být souvislý. Odhrnutá dlažba je plochý ground decal, nikoli objekt řazený před chodce.

## Export a kontrola

Z atlasů lze exportovat PNG s originální alpha nebo je číst přes sourceRect. Nepoužívat automatické odstranění bílé barvy: zničilo by sníh, šály a páru. Export nemá znovu generovat obsah. Pro runtime lze vytvořit nový atlas s 2–4 px paddingem a extruzí barev hran bez změny alpha okolí; ověřit mipmap a premultiplied alpha nastavení daného rendereru. Zdrojová PNG zachovat.
