# GC Race Data Core Green Baseline v1

Fecha: 2026-05-28  
Estado: GREEN BASELINE

## Resultado Endpoint Lab

Último informe validado:

```txt
total: 25
ok: 23
warnings: 2
fails: 0
```

Warnings conocidos y aceptados:

```txt
Archive Core skeleton sin GC_ARCHIVE_CORE_SOURCE_URL
```

No son fallos de Race Data Core.

## Endpoints Race/Data Core validados

```txt
/api/gc/diagnostics
/api/gc/display-names/status
/api/gc/names/preview?limit=30
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/active-combo
/api/gc/leaderboard?scope=activeCombo&limit=30
/api/gc/recent-laps?scope=activeCombo&limit=30
/api/gc/combos?limit=100&sort=recent
/api/gc/combos/:comboId
/api/gc/cache/status
```

## Endpoints Identity/Profile validados

```txt
/api/gc/identity/status
/api/gc/identity/me
/api/gc/pilots/:playerId/profile
```

## Endpoints imágenes de circuito validados

```txt
/api/gc/assets/tracks
/gc-track-images-manifest.json
```

## Endpoints Championship validados

```txt
/api/gc/championship/snapshot
/api/gc/championship/events?scope=upcoming
```

## Endpoints legacy aún presentes

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/stats/overview
/api/combos/:comboId
```

Estado actual:

```txt
siguen funcionando
se mantienen como fallback temporal
no son la fuente primaria de /app, /hotlaps, /combos ni /combos/:comboId
```

## Páginas en Data Core primary

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

## Reglas de protección

### Regla 1

No eliminar legacy server antes de validar online.

### Regla 2

No tocar imagen de circuito al limpiar datos.

Sistema actual correcto:

```txt
/js/gc-track-image.js
/gc-track-images-manifest.json
GCTrackImages.bestAsset()
GCTrackImages.candidates()
GCTrackImages.placeholderUrl()
```

No volver a usar:

```txt
/js/gc-track-images.js
rutas inventadas /images/tracks/*.webp
rutas inventadas /images/tracks/*.jpg
```

### Regla 3

No mezclar ACSM con Stracker.

```txt
Race Data Core = Stracker
Championship Core = ACSM/calendario campeonato
```

### Regla 4

No recalcular nombres en páginas.

```txt
rawName -> autoName -> displayName
```

lo resuelve Data Core.

### Regla 5

Toda limpieza debe pasar por:

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

## Próximo paso

Legacy Removal Phase 1:

```txt
Eliminar o neutralizar scripts legacy en páginas ya cubiertas, no endpoints server.
```

Orden:

```txt
1. /app
2. /hotlaps
3. /combos
4. /combos/:comboId
```
