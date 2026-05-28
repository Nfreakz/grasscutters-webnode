# GC Hotlaps Data Core Bridge v1

Fecha: 2026-05-28  
Pack: `GC_Hotlaps_Data_Core_Bridge_v1`

## Objetivo

Alinear `/hotlaps` con la nueva fuente central `/api/gc/*`.

Este pack mantiene el loader legacy de `/hotlaps`, pero añade una capa final que repinta la tabla, métricas y filtros usando Data Core.

## Endpoints usados

```txt
GET /api/gc/snapshot?scope=activeCombo&limit=12
GET /api/gc/leaderboard?scope=activeCombo&limit=1000
```

## Qué corrige

Antes `/hotlaps` detectaba el último circuito activo desde `/api/hotlaps`, que era un ranking de mejores vueltas y no actividad real.  
Ahora usa `activeCombo` desde `/api/gc/snapshot`.

## Archivos modificados

- `src/pages/hotlaps.astro`

## Qué NO toca

- `/`
- `src/pages/index.astro`
- `/app`
- `/pitwall`
- endpoints antiguos
- assets
- imágenes
- navegación

## Señal de que funciona

En DevTools debe aparecer:

```txt
[GC /hotlaps Data Core Bridge v1]
```

Y:

```js
document.documentElement.dataset.gcHotlapsDataCore
```

Resultado esperado:

```txt
true
```

Si sale:

```txt
fallback
```

Data Core no respondió y `/hotlaps` sigue usando la lógica antigua.

## Elementos actualizados

- `hotlapSource`
- `hotlapLoaded`
- `hotlapVisible`
- `hotlapUpdated`
- `leaderboardHint`
- `leaderboardOrder`
- `activeTrackChip`
- `hotlapMetricTrack`
- `hotlapMetricTrackMeta`
- `hotlapMetricBest`
- `hotlapMetricBestMeta`
- `hotlapMetricDrivers`
- `hotlapMetricSpeed`
- `hotlapMetricSpeedMeta`
- `hotlapRows`
- filtros de piloto/coche/circuito

## Pruebas

```powershell
node scripts/apply-gc-hotlaps-data-core-bridge-v1.cjs
npm run build
npm run dev
```

Abrir:

```txt
http://localhost:4321/hotlaps
http://localhost:4321/pitwall
http://localhost:4321/app
```

Comparar:

- circuito activo
- mejor vuelta del combo
- pilotos visibles
- leaderboard
- actividad contra `/pitwall`

## Próximo paso

Si `/hotlaps`, `/app` y `/pitwall` cuadran, el siguiente pack puede ser:

1. Adaptar `/combos` a Data Core.
2. Limpiar scripts temporales.
3. Empezar rediseño público real sobre `/pitwall`.
