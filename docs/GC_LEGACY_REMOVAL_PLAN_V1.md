# GC Legacy Removal Plan v1

Fecha: 2026-05-28  
Estado: preparado, no ejecutado

## Objetivo

Retirar lógica legacy sin romper datos, imágenes ni fallback.

## Situación actual

Las páginas principales ya usan Data Core primary:

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

El Endpoint Lab queda en verde:

```txt
fails = 0
```

Los únicos warnings son esperados:

```txt
Archive Core sin fuente pública
```

## Qué significa "legacy"

Legacy en este proyecto incluye:

```txt
endpoints antiguos usados antes de /api/gc/*
scripts cliente que recalculan rankings
scripts cliente que reagrupar combos
scripts cliente que inventan rutas de imágenes
scripts cliente que pintan encima de Data Core primary
```

## Qué NO se debe borrar todavía

No borrar aún:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/stats/overview
/api/combos/:comboId
```

Motivo:

```txt
sirven como fallback temporal
pueden alimentar páginas no revisadas
sirven para comparar en Endpoint Lab
```

## Fase 1 - Página por página

### 1. /app

Objetivo:

```txt
Data Core primary ya pinta métricas, combo, top driver y actividad.
```

Acción:

```txt
neutralizar scripts legacy que repinten después de Data Core
mantener fallback mínimo si Data Core falla
no tocar HTML visual
```

Prueba:

```js
document.documentElement.dataset.gcAppDataCore
```

Debe devolver:

```txt
primary
```

### 2. /hotlaps

Objetivo:

```txt
Data Core primary ya pinta tabla y filtros.
```

Acción:

```txt
neutralizar cálculo legacy de leaderboard en cliente
mantener filtros actuales
mantener métrica correcta de pilotos del combo activo
```

Prueba:

```js
document.documentElement.dataset.gcHotlapsDataCore
document.documentElement.dataset.gcHotlapsDataCoreVersion
```

Debe devolver:

```txt
primary
v1.1
```

### 3. /combos

Objetivo:

```txt
Data Core primary ya pinta cards, destacados y métricas.
```

Acción:

```txt
neutralizar render legacy de cards
mantener GCTrackImages fuzzy resolver
no tocar manifest ni assets
```

Prueba:

```js
document.documentElement.dataset.gcCombosDataCore
GCTrackImages.version
```

Debe devolver:

```txt
primary
v1.1
```

### 4. /combos/:comboId

Objetivo:

```txt
Data Core primary ya usa /api/gc/combos/:comboId.
```

Acción:

```txt
mantener fallback legacy hasta validar online
no tocar renderTrackImage endurecido
no cargar /js/gc-track-images.js
```

Prueba:

```js
document.documentElement.dataset.gcComboDetailDataCore
document.documentElement.dataset.gcComboDetailTrackImage
```

Debe devolver:

```txt
primary
hardened-v1
```

## Fase 2 - Server legacy

Solo después de validar online:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/stats/overview
/api/combos/:comboId
```

Opciones:

```txt
A. mantener como aliases a /api/gc/*
B. marcar deprecated pero funcional
C. eliminar si no hay llamadas
```

Recomendación:

```txt
mantener aliases durante 1 release
no eliminar directamente
```

## Fase 3 - Scripts temporales

Al final limpiar:

```txt
scripts/apply-gc-*.cjs
README_GC_*.md temporales de packs
```

Pero conservar:

```txt
docs/GC_RACE_DATA_CORE_GREEN_BASELINE_V1.md
docs/GC_LEGACY_REMOVAL_PLAN_V1.md
docs/GC_ADMIN_DATA_CORE_MAP_V1.md
```

## Criterios de éxito

Antes de cada fase:

```txt
npm run build
/admin/endpoints -> Ejecutar críticos
fails = 0
```

Además:

```txt
sin nombres desconocidos
sin 404 masivos de imágenes
sin SyntaxError gc-track-image.js
/app y /hotlaps muestran mismos pilotos del combo activo
/combos y /combos/:comboId muestran imagen o placeholder
```

## No tocar sin nueva revisión

```txt
ACSM / Championship Core
Archive Core
admin/nombres
fuzzy resolver de imágenes
auth/users
avatar endpoints
```
