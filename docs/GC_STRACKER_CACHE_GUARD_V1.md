# GC Stracker Cache Guard v1

Fecha: 2026-05-28  
Pack: `GC_Stracker_Cache_Guard_v1`

## Objetivo

Cerrar el circuito de caché de Race Data Core.

Race Data Core depende de:

```txt
Stracker
```

No depende de:

```txt
ACSM
```

Este pack NO toca ACSM ni campeonato.

## Qué añade

### Endpoint público seguro

```txt
GET /api/gc/cache/status
```

Devuelve estado de caché y Stracker sin rutas internas sensibles:

```json
{
  "ok": true,
  "source": "gc-race-data-core",
  "domain": "stracker",
  "cache": {
    "api": "performance-core-v15.29.3",
    "queryCacheEntries": 0,
    "joinedLapsCached": true,
    "dbBytesCached": true,
    "queryTtlMs": 15000,
    "joinedLapsTtlMs": 15000
  },
  "stracker": {
    "exists": true,
    "validSQLite": true,
    "sizeMb": 40.2,
    "modifiedAt": "..."
  }
}
```

### Endpoint admin

```txt
POST /api/admin/stracker/cache/clear
```

Limpia:

```txt
gcStrackerBytesCache
gcJoinedLapsCache
gcStrackerQueryCache
```

Usa:

```ts
requireAdmin(...)
```

### Refuerzo de sync

Busca llamadas a:

```ts
await syncStrackerFromGTX()
```

y añade, si no existe ya:

```ts
if (result?.ok) invalidateStrackerRuntimeCache('stracker-sync');
```

Esto evita que después de sincronizar Stracker se sigan mostrando datos viejos en:

```txt
/api/gc/snapshot
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
```

## Qué NO toca

```txt
ACSM
Championship Core
calendario
archivo motorsport
UI pública
/app
/hotlaps
/combos
/pitwall
assets
```

## Archivos modificados

```txt
src/server/index.ts
```

## Aplicación

```powershell
node scripts/apply-gc-stracker-cache-guard-v1.cjs
npm run build
npm run dev
```

## Pruebas

### Ver caché

```txt
http://localhost:4321/api/gc/cache/status
```

### Limpiar caché como admin

Desde navegador logueado como admin o herramienta HTTP:

```txt
POST http://localhost:4321/api/admin/stracker/cache/clear
```

### Ver diagnóstico completo

```txt
http://localhost:4321/api/gc/diagnostics
```

Debe incluir:

```json
"cache": {
  "api": "performance-core-v15.29.3"
}
```

## Interpretación

### joinedLapsCached: true

Race Data Core ya tiene vueltas cacheadas.

### dbBytesCached: true

El fichero SQLite está en memoria.

### queryCacheEntries > 0

Hay consultas SQL cacheadas.

### Después de limpiar

Debe tender a:

```txt
queryCacheEntries: 0
joinedLapsCached: false
dbBytesCached: false
```

hasta que se consulten endpoints otra vez.

## Próximo paso recomendado

Cuando esto funcione:

1. Crear `Championship Core Skeleton` separado para ACSM.
2. Después empezar limpieza legacy de `/app`, `/hotlaps` y `/combos`.
