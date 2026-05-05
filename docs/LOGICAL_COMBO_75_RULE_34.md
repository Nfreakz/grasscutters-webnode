# GC Deploy 34 - Logical Combo 75% Rule

## Objetivo

Los combos ya no se tratan como un `ComboId` aislado si representan el mismo circuito y prácticamente el mismo paquete de coches.

## Regla

Para combos del mismo circuito:

- Si un nuevo `ComboId` comparte la mayoría del paquete de coches y solo añade algunos, se agrupa dentro del mismo combo lógico.
- Si el 75% o más de sus coches son nuevos respecto al combo lógico existente, se considera un combo distinto.

Ejemplo:

```txt
Combo 8: Porsche + Nissan + BMW
Combo 9: Porsche + Nissan + BMW + Mazda
→ mismo combo lógico

Combo 10: Audi + Ferrari + Mercedes + Toyota
→ nuevo combo lógico si el 75% son coches nuevos
```

## Qué cambia

- `/combos` muestra combos lógicos, no cada `ComboId` crudo.
- `/combos/:comboId` resuelve la familia lógica aunque abras un ComboId secundario.
- La API devuelve `memberComboIds`, `canonicalComboId`, `mergedCombosCount` y `mergePolicy`.
- Hotlaps puede seguir enlazando a cualquier ComboId: la ficha final agrupa la familia correcta.
