# GC Data Core Display Names Guard v1

Fecha: 2026-05-28  
Pack: `GC_Data_Core_Display_Names_Guard_v1`

## Objetivo

Garantizar que los endpoints `/api/gc/*` usan los nombres corregidos desde admin para:

- pilotos
- coches
- circuitos

Esto es crítico en Assetto Corsa porque los mods suelen traer nombres muy dispares, por ejemplo:

```txt
ks_mugello
mugello
MUGELLO_GP
rt_mugello
bmw_m3_gt2
ts_bmw_m3_gt2
BMW M3 GT2
```

La web no debe resolver esto en cada página. Data Core debe entregar el nombre visible ya normalizado.

## Qué hace el pack

Añade una llamada a:

```ts
await readDisplayNameStoreAsync();
```

al inicio de cada endpoint Data Core:

```txt
/api/gc/snapshot
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
```

Esto calienta la caché de `gc_display_names` antes de leer/transformar vueltas y combos.

## Por qué es necesario

El sistema actual tiene:

```ts
applyDisplayName(kind, sourceId, sourceCode, sourceName, fallback)
```

y funciones como:

```ts
getDisplayCar(row)
getDisplayTrack(row)
getDriverName(row)
```

pero en MySQL/SQLite la lectura síncrona depende de que la caché de nombres ya esté cargada. Si un endpoint Data Core lee vueltas antes de preparar esa caché, puede devolver nombres crudos.

## Endpoint de diagnóstico añadido

```txt
GET /api/gc/display-names/status
```

Devuelve:

```json
{
  "ok": true,
  "source": "gc-data-core",
  "storage": {},
  "cache": {
    "loaded": true
  },
  "entries": {
    "total": 0,
    "enabled": 0,
    "disabled": 0,
    "byKind": {
      "driver": 0,
      "car": 0,
      "track": 0
    }
  }
}
```

## Archivos modificados

- `src/server/index.ts`

## Qué NO toca

- `/`
- `/app`
- `/hotlaps`
- `/combos`
- `/pitwall`
- assets
- imágenes
- navegación
- admin UI

## Prueba recomendada

1. En admin, cambia un nombre de coche o circuito a algo evidente:

```txt
BMW M3 GT2 TEST ADMIN
Mugello TEST ADMIN
```

2. Ejecuta:

```powershell
npm run build
npm run dev
```

3. Abre:

```txt
http://localhost:4321/api/gc/display-names/status
http://localhost:4321/api/gc/snapshot
http://localhost:4321/api/gc/leaderboard
http://localhost:4321/api/gc/recent-laps
http://localhost:4321/api/gc/combos
```

4. Comprueba que el nombre corregido aparece en:

```txt
/pitwall
/app
/hotlaps
/combos
```

## Resultado esperado

```js
document.documentElement.dataset.gcAppDataCore
document.documentElement.dataset.gcHotlapsDataCore
document.documentElement.dataset.gcCombosDataCore
```

deben seguir devolviendo `true`, y los nombres deben coincidir entre páginas.
