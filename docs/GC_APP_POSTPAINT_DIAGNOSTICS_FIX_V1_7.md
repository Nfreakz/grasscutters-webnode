# GC App Postpaint Diagnostics Fix v1.7

Fecha: 2026-05-28  
Pack: `GC_App_Postpaint_Diagnostics_Fix_v1_7`

## Problema

En `/app` sigue apareciendo:

```txt
Legacy fallback
Vueltas servidor: 500
```

aunque:

```txt
/admin/endpoints
fails = 0
```

y el combo ya aparece bien en otras páginas.

## Causa

El bloque Data Core Primary de `/app` está fallando en algún punto del JS y el render viejo vuelve a ganar.

El número 500 no es el total real del servidor. Es un contador limitado/capado que viene del fallback o de endpoints acotados.

## Solución robusta

Añadir un script final de post-paint que se ejecuta después de todo lo demás y corrige la UI visible leyendo directamente:

```txt
/api/gc/diagnostics
/api/gc/combos?limit=1&sort=recent
```

## Qué corrige

```txt
gcMetricLaps
gcQuickRefs
gcMetricDrivers
gcMetricCombos
gcMetricLastActivity
gcQuickDb
gcQuickDbMeta
gcComboTrack
gcComboCars
gcComboLaps
gcComboDrivers
gcComboFamily
gcTopDriverName
gcTopDriverTime
gcTopDriverMeta
```

También cambia el badge si ve fallback:

```txt
Legacy fallback -> Data Core postpaint
```

## Qué NO cambia

```txt
endpoints
Data Core
combos logic
pilotos
hotlaps
diagnostics
database
legacy aliases
```

Solo corrige el pintado visible de `/app`.

## Aplicación

```powershell
node scripts/apply-gc-app-postpaint-diagnostics-fix-v1-7.cjs
npm run build
npm run dev
```

## Prueba visual

```txt
http://localhost:4321/app
```

Esperado:

```txt
Vueltas servidor > 500
Combo Mugello: 722 vueltas / 12 pilotos / 5 coches
Sin "Legacy fallback" visible tras unos segundos
```

## Prueba consola

```js
window.GCAppPostPaintStatus?.()
```

Esperado:

```txt
lastOkAt con fecha
diagnostics.raceData.lapsCount > 500
combo.publicComboCars.length = 5
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
del scripts\apply-gc-app-postpaint-diagnostics-fix-v1-7.cjs
```
