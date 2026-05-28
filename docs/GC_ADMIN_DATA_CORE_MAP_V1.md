# GC Admin Data Core Map v1

Fecha: 2026-05-28  
Pack: `GC_Admin_Data_Core_Map_v1`

## Objetivo

Detener el crecimiento a ciegas y mapear qué partes del admin deben alimentar Data Core, cuáles deben vivir en otro core separado y cuáles no deben tocar la lógica pública.

## Aclaración crítica

ACSM y Stracker son dominios distintos.

```txt
Stracker = datos del servidor GrassCutters: vueltas, hotlaps, pilotos, coches, circuitos, combos, actividad.
ACSM     = datos importados del campeonato para mostrar en la página del campeonato.
```

Por tanto:

```txt
ACSM NO debe decidir el combo activo general de /api/gc/active-combo.
ACSM NO debe contaminar /api/gc/leaderboard, /api/gc/hotlaps o /api/gc/recent-laps.
ACSM SÍ debe alimentar una capa separada de Championship Core.
```

## Separación de cores

### 1. Race Data Core

Fuente principal:

```txt
Stracker
```

Debe cubrir:

```txt
/api/gc/snapshot
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
/api/gc/names/preview
/api/gc/display-names/status
```

Incluye:

```txt
laps
hotlaps
drivers/pilots
cars
tracks
combos
display names
auto name cleanup
storage safe status
stracker sync/cache status
```

No incluye:

```txt
ACSM championship data
archivo motorsport
media manager
admin-only secrets
```

### 2. Championship Core

Fuente principal:

```txt
ACSM import / championship data
```

Debe cubrir en el futuro:

```txt
/api/gc/championship/snapshot
/api/gc/championship/events
/api/gc/championship/standings
/api/gc/championship/results
/api/gc/championship/calendar
```

Debe alimentar:

```txt
/pagina-del-campeonato
/championship
/calendario si se decide mostrar carreras importadas
```

No debe alimentar:

```txt
/hotlaps
/app
/combos
/pitwall race data
```

### 3. Archive Core

Fuente principal:

```txt
Motorsport archive / media manager / fichas / relaciones / imágenes
```

Debe cubrir en el futuro:

```txt
/api/gc/archive/latest
/api/gc/archive/items
/api/gc/archive/featured
/api/gc/media/latest
```

No debe mezclarse con Race Data Core.

## Inventario admin revisado

### Admin resumen

Ruta UI:

```txt
/admin
```

Funciones visibles:

```txt
usuarios
admins
usuarios vinculados a piloto
sesiones activas
storage
stracker
ACSM
```

Endpoints usados:

```txt
/api/admin/status
/api/profile
/api/admin/acsm/sync-current-combo
```

Impacto Data Core:

```txt
Usuarios/sesiones        → Identity/Profile Core
Storage                 → Diagnostics safe summary
Stracker                → Race Data Core
ACSM                    → Championship Core
```

### Admin usuarios

Ruta UI:

```txt
/admin/usuarios
```

Debe considerarse fuente de identidad web, no de tiempos.

Impacto Data Core:

```txt
pilot_player_id
pilot_steam_guid
pilot_stracker_name
role
sessions
```

Debe alimentar:

```txt
/api/gc/me/racing-profile
/api/gc/pilots/:id/profile
avatar / pilot link
```

No debe alterar:

```txt
leaderboard
best lap
active combo
```

### Admin nombres

Ruta UI:

```txt
/admin/nombres
```

Endpoints usados:

```txt
/api/admin/name-filters
/api/admin/name-filters/bulk
```

Función:

```txt
alias visibles para pilotos, coches y circuitos
manual quick alias
catálogo editable
vista missing/overrides
```

Impacto Data Core:

```txt
CRÍTICO
```

Regla obligatoria:

```txt
rawName → autoName → displayName
```

Los endpoints Race Data Core deben devolver `displayName` como nombre visible principal y, cuando sea útil, incluir `rawName` y `autoName` para diagnóstico.

### Admin calendario

Ruta UI:

```txt
/admin/calendario
```

Tipos visibles en UI:

```txt
combo
race_lfm
race_gc
```

Campos:

```txt
title
startDate
endDate
startTime
endTime
repeatFrequency
repeatUntil
trackName
carNames
linkUrl
description
visible
featured
```

También tiene panel ACSM.

Impacto Data Core:

```txt
Eventos manuales combo/race_gc/race_lfm → Calendar Core o Snapshot calendar block
ACSM import championship                 → Championship Core
```

No debe alterar:

```txt
/api/gc/active-combo
```

salvo que explícitamente se decida que el calendario manual gobierna un bloque público de "próximo evento" o "combo anunciado", distinto del combo activo por datos Stracker.

### Admin sistema

Ruta UI:

```txt
/admin/sistema
```

Endpoints usados:

```txt
/api/admin/status
/api/admin/stracker/sync
/api/admin/acsm/status
/api/admin/acsm/sync-current-combo
```

Impacto Data Core:

```txt
/api/admin/stracker/sync → debe invalidar cache Race Data Core
/api/admin/status        → puede alimentar diagnóstico seguro
/api/admin/acsm/*        → Championship Core, no Race Data Core
```

Regla:

```txt
Forzar sync de Stracker debe refrescar /api/gc/snapshot, /api/gc/leaderboard, /api/gc/combos.
```

### Admin archivo

Ruta UI:

```txt
/admin/archivo
/admin/archivo/calidad
/admin/archivo/relaciones
/admin/archivo/imagen-url
```

Endpoint visible en archivo:

```txt
/api/admin/archive/unified
```

Funciones:

```txt
crear/editar/importar fichas
publicadas/borradores
calidad
relaciones
imágenes
media manager
```

Impacto Data Core:

```txt
NO debe entrar en Race Data Core.
Debe vivir en Archive Core.
```

Puede alimentar bloques públicos como:

```txt
últimas fichas
dossiers destacados
noticias de archivo
media reciente
```

pero con endpoints separados.

### Admin historial

Ruta UI:

```txt
/admin/historial
```

Impacto Data Core:

```txt
No debe alimentar UI pública.
Sirve para auditoría interna.
```

Puede alimentar diagnóstico admin, nunca público.

## Endpoints canónicos actuales y destino

| Endpoint | Core | Estado |
|---|---|---|
| `/api/gc/snapshot` | Race Data Core | Mantener |
| `/api/gc/active-combo` | Race Data Core | Mantener, basado en Stracker |
| `/api/gc/leaderboard` | Race Data Core | Mantener |
| `/api/gc/recent-laps` | Race Data Core | Mantener |
| `/api/gc/combos` | Race Data Core | Mantener |
| `/api/gc/display-names/status` | Race Data Core Diagnostics | Mantener |
| `/api/gc/names/preview` | Race Data Core Diagnostics | Mantener |
| `/api/admin/name-filters` | Admin Names | Fuente de overrides |
| `/api/admin/stracker/sync` | Admin System | Debe invalidar Race Data Core |
| `/api/admin/acsm/status` | Championship Admin | No mezclar con Race Data Core |
| `/api/admin/acsm/sync-current-combo` | Championship Admin | Renombrar conceptualmente a import championship data |
| `/api/admin/archive/unified` | Archive Admin | Separar como Archive Core |
| `/api/calendar-events` | Calendar/Public | Puede alimentar calendar block |
| `/api/admin/calendar-events` | Calendar Admin | Fuente editable |

## Cambios de criterio respecto a packs anteriores

En una respuesta anterior se sugirió ACSM como posible prioridad para `activeCombo`. Queda corregido:

```txt
activeCombo de Race Data Core = Stracker / servidor GrassCutters.
ACSM = Championship Core / página del campeonato.
```

Si se quiere mostrar "combo del campeonato" o "próxima carrera ACSM", debe ser otro campo:

```json
{
  "championship": {
    "currentRound": {},
    "nextRace": {},
    "standings": []
  }
}
```

No debe reemplazar:

```json
{
  "activeCombo": {}
}
```

## Reglas para futuros packs

### Regla 1

Ninguna página pública nueva debe llamar directamente a endpoints admin.

Mal:

```txt
/pitwall -> /api/admin/status
```

Bien:

```txt
/pitwall -> /api/gc/snapshot
```

### Regla 2

Ninguna página pública debe recalcular nombres.

Mal:

```txt
frontend limpia bmw_m3_gt2
```

Bien:

```txt
Data Core devuelve car.displayName
```

### Regla 3

Ninguna página pública debe mezclar ACSM con Stracker.

Mal:

```txt
activeCombo = ACSM current combo
```

Bien:

```txt
activeCombo = Stracker
championship.currentRound = ACSM
```

### Regla 4

Archive/media no deben entrar en Race Data Core.

Mal:

```txt
/api/gc/snapshot incluye fichas de archivo completas
```

Bien:

```txt
/api/gc/archive/latest
```

### Regla 5

Admin es fuente de configuración, no fuente pública directa.

Admin escribe y valida. Data Core lee lo ya normalizado y expone solo lo seguro.

## Próximos packs recomendados

### Pack A - Race Data Core Diagnostics

Crear:

```txt
/api/gc/diagnostics
```

Debe devolver resumen seguro:

```txt
stracker exists
stracker modifiedAt
cache status
display names loaded
laps count
combos count
last generatedAt
```

Sin paths internos sensibles.

### Pack B - Stracker Sync Cache Guard

Verificar que:

```txt
/api/admin/stracker/sync
```

invalida caches usadas por:

```txt
/api/gc/snapshot
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
```

### Pack C - Championship Core Skeleton

Crear endpoints separados:

```txt
/api/gc/championship/snapshot
/api/gc/championship/events
```

Sin tocar Race Data Core.

### Pack D - Calendar Public Snapshot

Añadir al snapshot público solo si se quiere:

```json
{
  "calendar": {
    "nextEvent": {},
    "featured": []
  }
}
```

Pero sin ACSM mezclado con `activeCombo`.

### Pack E - Archive Core Skeleton

Crear:

```txt
/api/gc/archive/latest
```

para futuros bloques de home o pitwall, sin tocar rankings.
