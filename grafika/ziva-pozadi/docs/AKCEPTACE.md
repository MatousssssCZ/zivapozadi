# Přejímka a známé limity

## Ověřeno při přípravě balíku

- Všech 24 zdrojových PNG lze načíst, skutečné velikosti jsou v manifestu.
- Všechny objekty a archy kromě pozadí mají alpha kanál a transparentní pixely.
- Každý pojmenovaný atlasový rect je uvnitř zdrojového obrázku.
- Reference je první schválený návrh. Výškový návrh není použit.
- Existuje samostatný vodorovný trup psa/kočky pro chůzi.
- Exportováno 82 PNG výřezů a 12 vrstev stánků; původní RGBA pixely vrstev se skládají beze změny.
- Statické sestavení se vykreslilo v Canvas2D. Browserový interaktivní náhled nebyl v tomto prostředí spuštěn; HTML je bez externích závislostí.
- Šest stánků je samostatně; nadbytečné malé stánky v dekorativním archu se ignorují.

## Co musí Claude ověřit v existující aplikaci

1. Statický screenshot v 1920×1080 a 1280×720: celá věž, šest stánků, průchod k radnici, strom vpravo; správné poměry a žádné bílé/černé obdélníky kolem grafiky.
2. Postava u všech šesti pultů: hlava pod střechou, tělo uvnitř, pult zakrývá spodní část, končetiny neprocházejí sloupky ani zbožím.
3. Jedna postava obejde strom, obě přední lampy, lavičky a stolky. Nejde skrz překážky a nezmění z-index v nesprávném místě.
4. Fronta se zaplní třemi návštěvníky a uvolní postupně. Žádné dva stejné sloty, žádná blokace hlavní cesty.
5. Dítě, dospělý a pes přejdou z popředí dozadu bez velikostních skoků; chodidla/tlapky nekloužou a zůstávají na zemi.
6. Rodič se sáňkami: souvislé lano, dítě sedí na sedadle, nohy jsou správně překryté; trasa je po sněhu a mimo herní zónu.
7. Koulovačka zůstane uvnitř zóny. Sněhulák má trvalý stav a během stavby nevzniká/nezmizí bez přechodu.
8. Pes má čtyři nohy a správné vodítko; kočka nezobrazuje dvojité uši a při skoku doletí na skutečný povrch.
9. Dveře/okna při změně nezmění kámen fasády, nerozjedou se rozměry ani pozice.
10. Desetiminutový běh s defaultní hustotou: žádné hromadění lidí, uniklé rezervace, nezničitelné rekvizity nebo rostoucí počet částic. Změřit fps, frame time a paměť, uvést zařízení.
11. Pozastavení na neaktivním tabu, návrat bez teleportů; resizing zachová společnou transformaci celé scény.

## Zbývající implementační práce

Nejsou otestované rigy ani animace v uživatelově aplikaci, jejíž zdrojový kód zde není přiložen. Atlasové řezy a masky jsou výchozí konfigurace, ne hotový skin. Pozadí bylo generativně vyčištěno a není zaručena pixelová shoda s konceptem. Dveře a okna vyžadují maskované usazení. Mezi předním a zadním dospělým může být třeba sjednotit délku kabátu. Předklon, sed a chůze potřebují vizuální ladění překryvu segmentů. Bez těchto kontrol neoznačovat výsledek jako produkčně hotový.
