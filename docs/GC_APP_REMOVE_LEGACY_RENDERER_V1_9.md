# GC App Remove Legacy Renderer v1.9

Fecha: 2026-05-28  
Pack: `GC_App_Remove_Legacy_Renderer_v1_9`

## Problema

Después de aplicar el single renderer, `/app` muestra:

```txt
500
```

durante un momento y luego cambia a:

```txt
11.789
```

## Diagnóstico

El single renderer funciona.

El problema es que todavía queda un renderer viejo en `/app` que pinta primero usando endpoints legacy/acotados.

Después el single renderer v1.8 corrige el valor usando:

```txt
/api/gc/diagnostics
```

Eso produce el salto visual:

```txt
500 -> 11.789
```

## Solución correcta

Eliminar el renderer viejo de `/app`.

Este pack elimina el script inline legacy identificado por:

```txt
[GC /app v6.3 panel fix]
```

y deja activo solo:

```txt
GC_APP_SINGLE_RENDERER_V1_8
```

## También añade

Un estado inicial neutro para evitar que valores estáticos viejos se vean antes de que cargue el single renderer:

```txt
gcMetricLaps = —
gcQuickRefs = —
gcMetricCombos = —
gcMetricLastActivity = —
```

El single renderer los reemplaza en cuanto cargan los datos reales.

## Qué NO toca

```txt
backend
endpoints
Data Core
combos logic
pilotos
hotlaps
admin lab
track images loader
```

## Aplicación

```powershell
node scripts/apply-gc-app-remove-legacy-renderer-v1-9.cjs
npm run build
npm run dev
```

## Prueba

Abrir:

```txt
http://localhost:4321/app
```

Esperado:

```txt
No aparece 500
Puede aparecer — durante menos de un segundo
Luego aparece 11.789
Badge: Data Core single
```

## Consola

```js
({
  legacy: document.documentElement.dataset.gcAppLegacyRenderer,
  single: document.documentElement.dataset.gcAppSingleRenderer,
  status: window.GCAppSingleRendererStatus?.()
})
```

Esperado:

```txt
legacy = removed-v1.9
single = v1.8
status.lastOkAt con fecha
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
del scripts\apply-gc-app-remove-legacy-renderer-v1-9.cjs
```
