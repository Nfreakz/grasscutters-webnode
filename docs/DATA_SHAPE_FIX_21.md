# GC Deploy 21 - Data shape fix

Este parche corrige el problema `[object Object]` en tablas y páginas que consumen `/api/hotlaps` y `/api/profile`.

## Causa

La API ya devuelve datos más ricos desde stracker, por ejemplo:

```json
{
  "driver": { "name": "..." },
  "car": { "name": "..." },
  "track": { "name": "..." }
}
```

Algunas páginas antiguas esperaban strings planos como `carName` o `trackName`. Cuando intentaban pintar `row.car`, el navegador convertía el objeto a texto y mostraba `[object Object]`.

## Solución aplicada

- `/api/hotlaps` mantiene los objetos ricos, pero ahora añade alias planos:
  - `driverName`
  - `playerName`
  - `carName`
  - `uiCarName`
  - `trackName`
  - `uiTrackName`
  - `lapTimeFormatted`
  - `sector1Ms`, `sector2Ms`, `sector3Ms`
- `/api/profile` compacta vueltas con alias planos también.
- `/hotlaps`, `/` y `/perfil` ahora leen tanto formato plano como formato anidado.

## Archivos incluidos

- `src/server/index.ts`
- `src/pages/hotlaps.astro`
- `src/pages/index.astro`
- `src/pages/perfil.astro`
