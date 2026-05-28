# GC Admin Endpoint Lab v1

Fecha: 2026-05-28  
Pack: `GC_Admin_Endpoint_Lab_v1`

## Objetivo

Añadir una página interna de administración para probar todos los endpoints importantes desde la web, también online.

Ruta:

```txt
/admin/endpoints
```

## Por qué se añade

Durante la creación de Data Core se detectó un fallo real:

```txt
/api/gc/pilots/:playerId/profile
```

devolvía tiempos correctos pero nombres como:

```txt
Piloto desconocido
Coche desconocido
Circuito desconocido
```

Ese tipo de bug no se ve con un simple HTTP 200. Hace falta una página que haga checks inteligentes.

## Qué prueba

### Admin

```txt
/api/admin/status
```

### Race Data Core

```txt
/api/gc/diagnostics
/api/gc/cache/status
/api/gc/display-names/status
/api/gc/names/preview?limit=30
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/active-combo
/api/gc/leaderboard?scope=activeCombo&limit=30
/api/gc/recent-laps?scope=activeCombo&limit=30
/api/gc/combos?limit=100&sort=recent
```

### Identity/Profile Core

```txt
/api/gc/identity/status
/api/gc/identity/me
/api/gc/pilots/:playerId/profile
```

### Championship Core

```txt
/api/gc/championship/snapshot
/api/gc/championship/events?scope=upcoming
```

### Archive Core

```txt
/api/gc/archive/snapshot
/api/gc/archive/latest?limit=6
```

### Calendar

```txt
/api/calendar-events
```

### Legacy compare

```txt
/api/hotlaps?limit=50
/api/laps?limit=50&sort=recent&valid=all
/api/combos/stats?limit=50&sort=recent
/api/stats/overview
```

## Checks automáticos

La página no solo comprueba HTTP 200.

También detecta:

```txt
ok=false
warnings
health distinto de ok
Stracker no válido
display names no cargados
sin vueltas
sin combos
sin items
nombres desconocidos
descuadre diagnostics vs combos
```

## Detector de nombres

Busca recursivamente:

```txt
Piloto desconocido
Coche desconocido
Circuito desconocido
unknown driver
unknown car
unknown track
```

Si aparece en `pilot-profile` o `names-preview`, se marca como error.

## Controles

```txt
PlayerId para probar perfil
Filtro de endpoints
Filtro por grupo/core
Ejecutar visibles
Ejecutar críticos
Copiar informe JSON
```

## Archivos añadidos/modificados

Añade:

```txt
src/pages/admin/endpoints.astro
docs/GC_ADMIN_ENDPOINT_LAB_V1.md
README_GC_ADMIN_ENDPOINT_LAB_V1.md
```

Modifica:

```txt
src/components/AdminSubnav.astro
```

añadiendo:

```txt
/admin/endpoints
```

## Qué NO toca

```txt
Race Data Core
Championship Core
Archive Core
Identity Core
endpoints server
UI pública
assets
home
/pitwall
/app
/hotlaps
/combos
```

## Aplicación

```powershell
node scripts/apply-gc-admin-endpoint-lab-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/admin/endpoints
```

Primero ejecuta:

```txt
Ejecutar críticos
```

Luego cambia `PlayerId` a uno real y prueba de nuevo `Pilot profile`.
