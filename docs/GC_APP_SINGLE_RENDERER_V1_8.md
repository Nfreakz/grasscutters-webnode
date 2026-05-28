# GC App Single Renderer v1.8

Fecha: 2026-05-28  
Pack: `GC_App_Single_Renderer_v1_8`

## Problema

En `/app` se veía:

```txt
11.789 → 500 → 11.789
```

o:

```txt
Data Core postpaint
```

Esto confirma una carrera de renderizado: varios scripts estaban escribiendo en los mismos elementos del DOM.

## Por qué pasaba

La página tenía:

```txt
script viejo /app
GC_APP_DATA_CORE_PRIMARY_V1
GC_APP_POSTPAINT_DIAGNOSTICS_FIX_V1_7
```

Cada uno podía pintar:

```txt
gcMetricLaps
gcQuickRefs
gcComboLaps
gcComboDrivers
gcComboCars
```

con datos de endpoints diferentes.

## Solución correcta

Eliminar los renderers que competían y dejar uno solo:

```txt
GC_APP_SINGLE_RENDERER_V1_8
```

Este renderer lee:

```txt
/api/gc/diagnostics
/api/gc/combos?limit=1&sort=recent
/api/gc/recent-laps?limit=12&sort=recent&valid=all
/api/gc/leaderboard?scope=activeCombo&limit=20
```

Y pinta toda la UI visible de `/app` desde ahí.

## Qué elimina

```txt
GC_APP_DATA_CORE_PRIMARY_V1
GC_APP_POSTPAINT_DIAGNOSTICS_FIX_V1_7
```

## Qué mantiene

```txt
endpoints
legacy aliases
combos canonical filter
pilotos
hotlaps
admin lab
```

## Resultado esperado

```txt
Vueltas servidor: 11.789
Combo Mugello: 722 vueltas / 12 pilotos / 5 coches
Badge: Data Core single
Sin parpadeo 500 → correcto → 500
```

## Aplicación

```powershell
node scripts/apply-gc-app-single-renderer-v1-8.cjs
npm run build
npm run dev
```

## Prueba visual

```txt
http://localhost:4321/app
```

Esperar 3 segundos.

Debe mantenerse estable.

## Prueba consola

```js
({
  dataCore: document.documentElement.dataset.gcAppDataCore,
  version: document.documentElement.dataset.gcAppDataCoreVersion,
  single: document.documentElement.dataset.gcAppSingleRenderer,
  status: window.GCAppSingleRendererStatus?.(),
  primary: window.GCAppDataCorePrimary
})
```

Esperado:

```txt
dataCore = primary
version = v1.8-single
single = v1.8
status.lastOkAt con fecha
primary.diagnostics.raceData.lapsCount > 500
primary.combos.items[0].publicComboCars.length = 5
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```

## Antes de commit

Eliminar el script temporal:

```powershell
del scripts\apply-gc-app-single-renderer-v1-8.cjs
```
