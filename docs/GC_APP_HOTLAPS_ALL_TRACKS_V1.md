# GC App Hotlaps All Tracks v1

## Problema

En `/app`, el bloque de actividad/hotlaps estaba acabando limitado al combo activo, ahora Mugello.

La revisión del repo muestra dos causas probables:

1. El endpoint legacy `/api/hotlaps` usa `activeCombo` por defecto.
2. El script legacy de `/hotlaps` detecta el circuito activo y aplica `applyActiveTrack()`.

Eso contradice el comportamiento esperado: Hotlaps debe mostrar todo el histórico y los filtros deben ser manuales.

## Solución

Se añade:

```txt
scripts/patch-hotlaps-all-laps.mjs
```

Este patch se ejecuta automáticamente antes de `dev:server` y `prebuild`.

## Qué corrige

### Servidor

Cambia el default de `/api/hotlaps`:

```txt
activeCombo → all
```

### /hotlaps

- Pide `/api/gc/leaderboard?scope=all&limit=3000`.
- Evita aplicar automáticamente el circuito activo.
- El botón principal queda como acceso a `/combos`.
- Añade guard defensivo para mantener `trackFilter=all`.

### /app

Añade un runtime que rellena `Actividad reciente` con vueltas de todos los circuitos usando endpoints en cascada:

```txt
/api/gc/recent-laps?scope=all
/api/laps?scope=all
/api/gc/leaderboard?scope=all
/api/hotlaps?scope=all
```

Actualiza:

```txt
gcRefsTable
gcRefsMeta
gcMetricDrivers
gcMetricLaps
gcMetricCombos
gcMetricLastActivity
gcQuickRefs
gcQuickLast
gcQuickDb
gcApiState
```

## No toca

```txt
avatares
home2
noticias
archivo
mugello_mapa.png
```

## Importante

Este pack NO incluye ni reescribe:

```txt
public/images/tracks/mugello_mapa.png
```
