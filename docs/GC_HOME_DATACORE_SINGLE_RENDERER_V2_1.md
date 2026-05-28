# GC Home Data Core Single Renderer v2.1

Fecha: 2026-05-28

## Problema

La home sigue mostrando `Hotlaps 0`, `Pilotos 1`, `Vueltas totales 0` y la imagen del combo queda en `Track image pending`.

## Causa

El cleanup global migró endpoints, pero no sustituyó la lógica vieja de la home. La función antigua seguía parseando con shape legacy.

## Solución

Este pack elimina el script viejo de home que contiene `gcLoadComboWeek()` / `gcLoadLandingMetrics()` y añade un renderer único:

```txt
GC_HOME_DATACORE_SINGLE_RENDERER_V2_1
```

Lee solo:

```txt
/api/gc/diagnostics
/api/gc/combos?limit=1&sort=recent
```

## Aplicar

```powershell
node scripts/apply-gc-home-datacore-single-renderer-v2-1.cjs
node scripts/patch-gc-home-audit-v2-1.cjs
npm run build
npm run dev
```

## Probar

Abrir `/`.

En consola:

```js
window.GCHomeDataCoreStatus?.()
```

Esperado:

```txt
homeDataCore = v2.1-single
diagnostics.raceData.lapsCount > 0
combo.publicComboCars.length > 0
```

Antes de commit:

```powershell
del scripts\apply-gc-home-datacore-single-renderer-v2-1.cjs
del scripts\patch-gc-home-audit-v2-1.cjs
```
