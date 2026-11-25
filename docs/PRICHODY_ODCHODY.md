# Příchody a odchody (nikdo se neobjeví ani nezmizí v záběru)

- **Příchod:** návštěvník se objeví vždy celý mimo obraz, a to za vstupem ve směru ven ze scény (posun, dokud není celý obrys postavy za okrajem). Ke vstupu dojde a teprve pak se rozhodne, kam dál. Jediná výjimka jsou dveře budovy: tam se postava objeví ve dveřích, které se otevřou.
- **Odchod:** od výstupu dojde postava za okraj obrazu a zmizí až tam.
- **Doprovod:** dítě, partner i přítel, se kterým jde, dojdou za vůdcem a zmizí až mimo obraz. Dřív mizeli naráz s ním, i když byli ještě vidět.
- **Kočka** přichází i odchází celá za okrajem. Psi jdou s majitelem.
- **Rodič se sáňkami a pracovník údržby** na začátku nestojí u vstupu, ale přijdou později zpoza okraje.
- **Test:** `tests/offscreen.test.ts` zkontroluje 6 minut Liberce a každé objevení či zmizení postavy i zvířete musí být mimo obraz (nebo ve dveřích).
