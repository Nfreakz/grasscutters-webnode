# GC Data Core Final Audit v1

Fecha: 2026-05-28  
Estado: baseline limpio preparado para rediseño visual

## Resultado validado

Último Endpoint Lab completo validado:

```txt
total: 22
ok: 22
warnings: 0
fails: 0
```

Legacy aliases validados:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/stats/overview
/api/combos/:comboId
/api/pilots
/api/drivers
```

Todos deben responder desde:

```txt
source = gc-data-core-legacy-server-alias
```

## Páginas principales limpias

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

### /app

```js
document.documentElement.dataset.gcAppDataCore === 'primary'
document.documentElement.dataset.gcAppDataCoreVersion === 'v1'
document.documentElement.dataset.gcAppRuntime === 'data-core-primary-clean-v1'
```

### /hotlaps

```js
document.documentElement.dataset.gcHotlapsDataCore === 'primary'
document.documentElement.dataset.gcHotlapsDataCoreVersion === 'v1.1'
document.documentElement.dataset.gcHotlapsRuntime === 'data-core-primary-clean-v1'
```

### /combos

```js
document.documentElement.dataset.gcCombosDataCore === 'primary'
document.documentElement.dataset.gcCombosDataCoreVersion === 'v1'
document.documentElement.dataset.gcCombosRuntime === 'data-core-primary-clean-v1'
window.GCTrackImages.version === 'v1.1'
```

### /combos/:comboId

```js
document.documentElement.dataset.gcComboDetailDataCore === 'primary'
document.documentElement.dataset.gcComboDetailDataCoreVersion === 'v1'
document.documentElement.dataset.gcComboDetailTrackImage === 'hardened-v1'
document.documentElement.dataset.gcComboDetailRuntime === 'data-core-primary-clean-v1'
window.GCTrackImages.version === 'v1.1'
```

## Puntos corregidos durante la fase

### Imágenes de circuito

Problema:

```txt
404 masivos en /images/tracks/*.webp/.jpg
```

Solución:

```txt
GCTrackImages fuzzy resolver v1.1
/gc-track-images-manifest.json
/api/gc/assets/tracks
placeholder SVG si no hay imagen real
```

Regla:

```txt
No volver a inventar rutas de imágenes desde cliente.
Buscar siempre contra manifest/assets reales.
```

### Combo activo y datos cruzados

Problema:

```txt
Descuadre entre /app, /hotlaps, /combos y ficha.
```

Solución:

```txt
Race Data Core como fuente primaria.
Legacy server endpoints convertidos en aliases Data Core.
```

### /pilotos

Problema:

```txt
Tras alias legacy, /pilotos mostraba 31 pilotos pero 0 vueltas, 0 activos y 0 destacados.
```

Solución:

```txt
/api/pilots y /api/drivers devuelven estadísticas completas por piloto.
```

### Endpoint Lab

Añadido:

```txt
/admin/endpoints
Combo detail Data Core
Track image assets
Track image manifest
Legacy alias validation
Botón "Probar legacy aliases"
```

## Separación de dominios

### Race Data Core

Fuente:

```txt
stracker SQLite
```

Endpoints canónicos:

```txt
/api/gc/diagnostics
/api/gc/snapshot
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
/api/gc/combos/:comboId
/api/gc/cache/status
```

### Identity Core

Fuente:

```txt
usuarios + relación playerId/user
```

Endpoints:

```txt
/api/gc/identity/status
/api/gc/identity/me
/api/gc/pilots/:playerId/profile
```

### Display Names Core

Fuente:

```txt
gc_display_names + auto cleaner
```

Pipeline:

```txt
rawName -> autoName -> displayName
```

Endpoints:

```txt
/api/gc/display-names/status
/api/gc/names/preview
```

### Championship Core

Fuente:

```txt
ACSM / calendario campeonato
```

Importante:

```txt
No mezclar con Stracker.
Stracker = Race Data Core.
ACSM = Championship Core.
```

### Archive Core

Estado:

```txt
Separado.
No tocar durante rediseño visual salvo tarea específica.
```

## Reglas de no tocar

```txt
1. No mezclar ACSM con Stracker.
2. No recalcular nombres en páginas.
3. No inventar rutas de imágenes.
4. No borrar endpoints legacy todavía.
5. No tocar /api/gc/* sin pasar Endpoint Lab.
6. No quitar fallback visual si Data Core falla.
7. No cambiar estructura visual durante fase de auditoría.
```

## Validación antes de rediseñar

```powershell
npm run build
npm run dev
```

Abrir:

```txt
/admin/endpoints
```

Ejecutar:

```txt
Ejecutar críticos
Probar legacy aliases
```

Esperado:

```txt
fails = 0
warnings = 0 en legacy aliases
```

## Próxima fase recomendada

```txt
Rediseño visual por bloques, no por reescritura total.
```

Orden recomendado:

```txt
1. /app dashboard principal
2. /hotlaps ranking
3. /combos grid + ficha
4. /pilotos directorio
5. Admin Endpoint Lab
```
