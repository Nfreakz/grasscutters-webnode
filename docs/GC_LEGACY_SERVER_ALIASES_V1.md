# GC Legacy Server Aliases v1

Fecha: 2026-05-28  
Pack: `GC_Legacy_Server_Aliases_v1`

## Objetivo

Convertir endpoints legacy del servidor en aliases de Race Data Core.

Hasta ahora habíamos cortado llamadas legacy a nivel de página:

```txt
/app
/hotlaps
/combos
/combos/:comboId
```

Pero los endpoints viejos seguían existiendo con su lógica antigua.

Este pack mantiene las URLs antiguas, pero las resuelve desde Data Core.

## Endpoints legacy convertidos

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/combos/:comboId
/api/pilots
/api/drivers
/api/stats/overview
```

## Principio

```txt
No eliminar URL antigua.
Sí centralizar datos.
```

Así cualquier bloque viejo o futuro que llame `/api/hotlaps` recibirá datos centralizados, no una cocina paralela.

## Mapeo conceptual

```txt
/api/hotlaps
→ Race Data Core leaderboard

/api/laps
→ Race Data Core recent laps

/api/combos/stats
→ Race Data Core combos

/api/combos/:comboId
→ Race Data Core combo detail

/api/pilots
→ pilotos derivados de Race Data Core

/api/drivers
→ alias de pilots

/api/stats/overview
→ diagnóstico derivado de Race Data Core
```

## Qué mantiene

Cada endpoint devuelve campos legacy compatibles:

```txt
items
hotlaps
laps
combos
pilots
drivers
leaderboard
summary
item
```

según corresponda.

También añade:

```txt
source: gc-data-core-legacy-server-alias
legacyEndpoint
canonicalEndpoint
```

## Qué NO toca

```txt
páginas
scripts cliente
imágenes
ACSM
Archive
Identity Core
Admin UI
```

## Aplicación

```powershell
node scripts/apply-gc-legacy-server-aliases-v1.cjs
npm run build
npm run dev
```

## Pruebas directas

```txt
http://localhost:4321/api/hotlaps?limit=50
http://localhost:4321/api/laps?limit=50&sort=recent&valid=all
http://localhost:4321/api/combos/stats?limit=50&sort=recent
http://localhost:4321/api/combos/47
http://localhost:4321/api/pilots?limit=50
http://localhost:4321/api/drivers?limit=50
http://localhost:4321/api/stats/overview
```

En todas debe aparecer:

```txt
source = gc-data-core-legacy-server-alias
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

También revisar legacy endpoints dentro del Lab:

```txt
legacy-hotlaps
legacy-laps
legacy-combos-stats
legacy-overview
```

Deben seguir OK, ahora con source alias.

## Siguiente paso

Si esto queda verde:

```txt
Legacy script removal real
```

empezando por `/app`, porque ya no dependerá de endpoints viejos.
