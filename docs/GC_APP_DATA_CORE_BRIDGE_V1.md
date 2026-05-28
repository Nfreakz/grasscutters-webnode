# GC App Data Core Bridge v1

Fecha: 2026-05-28  
Pack: `GC_App_Data_Core_Bridge_v1`

## Objetivo

Conectar `/app` con los endpoints canónicos de Pack 1 sin romper la lógica actual.

Este pack no elimina el script antiguo de `/app`. Añade una pasada final que actualiza los mismos elementos de la página usando:

```txt
GET /api/gc/snapshot?scope=activeCombo&limit=12
GET /api/gc/leaderboard?scope=activeCombo&limit=20
GET /api/gc/recent-laps?scope=activeCombo&limit=10
```

## Por qué se hace como puente

`/app` todavía tiene mucha lógica cliente heredada y muchas llamadas dispersas. Quitar todo de golpe es arriesgado. Este puente permite comprobar si los datos centralizados pintan correctamente sobre la UI actual.

## Archivos modificados

- `src/pages/app.astro`

## Qué NO toca

- `/`
- `src/pages/index.astro`
- `/pitwall`
- `/hotlaps`
- assets
- imágenes
- endpoints antiguos
- navegación

## Señal de que funciona

En DevTools debería aparecer:

```txt
[GC /app Data Core Bridge v1]
```

Y en el HTML:

```txt
document.documentElement.dataset.gcAppDataCore === "true"
```

Si `/api/gc/*` falla, no rompe `/app`. Se queda en modo legacy y marca:

```txt
document.documentElement.dataset.gcAppDataCore === "fallback"
```

## Qué actualiza

- `gcMetricDrivers`
- `gcMetricLaps`
- `gcMetricCombos`
- `gcMetricLastActivity`
- `gcComboTrack`
- `gcComboHint`
- `gcComboLaps`
- `gcComboDrivers`
- `gcComboFamily`
- `gcComboCars`
- `gcComboLink`
- `gcQuickRefs`
- `gcQuickLast`
- `gcQuickLastMeta`
- `gcQuickDb`
- `gcQuickDbMeta`
- `gcTopDriverName`
- `gcTopDriverTime`
- `gcTopDriverMeta`
- `gcTopDriverAvatar`
- `gcRefsTable`
- `gcRefsMeta`

## Pruebas

```powershell
node scripts/apply-gc-app-data-core-bridge-v1.cjs
npm run build
npm run dev
```

Abrir:

```txt
http://localhost:4321/app
http://localhost:4321/pitwall
```

Comparar:

- total laps
- drivers
- active combo
- best driver
- recent laps

## Próximo paso

Si `/app` y `/pitwall` cuadran, el siguiente pack podrá limpiar la lógica antigua de `/app` o adaptar `/hotlaps` para usar `/api/gc/leaderboard`.
