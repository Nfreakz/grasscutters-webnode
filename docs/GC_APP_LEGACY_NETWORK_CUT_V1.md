# GC App Legacy Network Cut v1

Fecha: 2026-05-28  
Pack: `GC_App_Legacy_Network_Cut_v1`

## Objetivo

Cortar la red legacy en `/app` sin borrar todavía el código viejo.

Después del Legacy Governor se detectaron estas llamadas:

```txt
/api/combos/stats?limit=300&sort=recent
/api/hotlaps?limit=300
/api/laps?limit=500&sort=recent&valid=all
/api/pilots?limit=800&valid=all
/api/drivers?limit=800&valid=all
/api/laps?limit=1&sort=oldest&valid=all
/api/laps?limit=1&sort=asc&valid=all
/api/laps?limit=1&order=asc&valid=all
```

## Qué hace

Intercepta esas llamadas **solo en `/app`** y las redirige internamente a Data Core.

## Mapeo

```txt
/api/combos/stats
→ /api/gc/combos?limit=1000&sort=recent

/api/hotlaps
→ /api/gc/leaderboard?scope=activeCombo

/api/laps recent
→ /api/gc/recent-laps?scope=global

/api/laps oldest/asc
→ /api/gc/diagnostics

/api/pilots
→ /api/gc/recent-laps?scope=global&limit=1000
  y genera listado único de pilotos

/api/drivers
→ /api/gc/recent-laps?scope=global&limit=1000
  y genera listado único de pilotos
```

## Por qué no se borra el legacy aún

Porque algunos scripts antiguos todavía pueden intentar pintar o calcular cosas. Este pack les da respuestas compatibles, pero ya no llama endpoints legacy.

Es fase intermedia:

```txt
menos carga
menos duplicidad
sin eliminar fallback todavía
```

## Estado expuesto

```js
window.GCAppLegacyNetworkCut.status()
document.documentElement.dataset.gcAppLegacyNetwork
```

Valores esperados:

```txt
cut-v1
```

## Qué NO toca

```txt
endpoints server
imágenes
GCTrackImages
ACSM
Archive
/hotlaps
/combos
/combos/:comboId
```

## Aplicación

```powershell
node scripts/apply-gc-app-legacy-network-cut-v1.cjs
npm run build
npm run dev
```

## Prueba

Abre:

```txt
http://localhost:4321/app
```

Consola:

```js
window.GCAppLegacyNetworkCut.status()
window.GCAppLegacyGovernor.status()
document.documentElement.dataset.gcAppDataCore
```

Resultado esperado:

```txt
gcAppDataCore = primary
GCAppLegacyNetworkCut.mutedCalls.length > 0
GCAppLegacyGovernor.legacyCalls.length idealmente 0
```

Si el Governor todavía detecta llamadas legacy, significa que alguna llamada escapa al Network Cut y hay que añadirla al mapa.

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
fails = 0
```

## Próximo paso

Si esto queda bien:

```txt
/app Phase 2
```

Eliminar funciones legacy de render dentro de `app.astro`, ya con seguridad.
