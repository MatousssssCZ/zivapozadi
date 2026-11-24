# Ověření při přípravě balíčku

Datum: 24. 11. 2026. Commit: b448f2b319e3823668c9a53ea1eac3229f37002d.

## Skutečně provedeno

- Stažen veřejný repozitář a přečtena architektura, model, registry činností, shop, části coffee a simulace, rezervace, kostra, renderer, kamera, exportní plán, validační/migrační mechanismus a relevantní testy.
- Prohlédnut referenční obrázek docs/img/postavy-cg-na-namesti.png uložený v repozitáři.
- Prohlédnut manifest malovana-postava-cg.json a struktura radničního dema (24 postav, 11 objektů, 1 oblast sněhu, 2 zóny).
- Instalace závislostí: npm ci --ignore-scripts --no-audit --no-fund. Lifecycle skripty byly záměrně přeskočeny; přesto níže uvedené testy v tomto prostředí proběhly.
- npm run typecheck: dokončeno úspěšně, exit 0.
- npm test: 7 testovacích souborů, všech 58 testů prošlo, exit 0. Celková doba 76,88 s.
- Sada zahrnuje testy MP4 exportu, kontinuálního/obnoveného exportu, postav, chůze, davu, IO a determinismu. Nejde o měření výkonu nové implementace.
- Zdrojový checkout nebyl upraven; žádný commit ani push nebyl proveden.

## Omezení

Nebyl nově ručně spuštěn Electron GUI a nebyly provedeny test:e2e ani Windows/macOS packaging. Prohlédnutý obrázek je historický soubor projektu, ne screenshot z aktuálního spuštění. Nové činnosti, grafika a efekty dosud implementované nejsou; jejich časy a výsledný vizuál vyžadují implementaci a následnou kontrolu.

Existující test chůze reportoval maximální posun opory 1,768 px/snímek a 26 z 15 710 sledovaných snímků s posunem nad 0,05 px. Test přesto splnil vlastní kritéria. Proto tento audit netvrdí absolutně nulový drift chodidel. Nové kontaktní akce potřebují vlastní konkrétní testy, uvedené v 05.

## Reprodukce

V checkoutu referenčního commitu s kompatibilním Node/npm:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
```

Pro ruční spuštění aplikace či zabalení mohou být nutné dodatečné instalace binárních závislostí a běžné lifecycle skripty dle projektu. To nebylo součástí tohoto výzkumného balíčku.

## Revize 2 – doplnění zvířat

Přidán návrh psů a koček, aktualizován vstupní prompt, odkazy, parametry a ZIP. Ověřena JSON syntaxe, úplnost Z01–Z10 a ZT01–ZT10, kontrolní součty a integrita archivu. Zdrojový kód nebyl změněn a původních 58 testů nebylo znovu spouštěno; zvířecí funkce zatím nejsou implementovány.
