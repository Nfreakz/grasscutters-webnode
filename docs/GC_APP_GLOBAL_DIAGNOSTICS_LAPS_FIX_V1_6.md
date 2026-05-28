# GC App Global Diagnostics Laps Fix v1.6

Fecha: 2026-05-28  
Pack: `GC_App_Global_Diagnostics_Laps_Fix_v1_6`

## Problema

En `/app` aparece:

```txt
Vueltas: 500
Vueltas servidor: 500
```

pero el combo visible muestra:

```txt
Mugello
722 vueltas
12 pilotos
5 coches
```

Y antes el servidor global mostraba más de 11.000 vueltas.

## Causa

`/app` estaba usando datos de endpoints acotados para métricas globales:

```txt
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/recent-laps?scope=activeCombo&limit=12
```

Esos endpoints pueden devolver una ventana/capado de 500 vueltas visibles/matched, no el total global real del servidor.

## Solución

Mantener:

```txt
/api/gc/combos?limit=1&sort=recent
```

para la tarjeta pública del combo.

Añadir:

```txt
/api/gc/diagnostics
```

para métricas globales:

```txt
Pilotos
Vueltas servidor
Combos activos
Última actividad global
```

## Qué NO cambia

```txt
combo canónico
coches públicos >= 5 vueltas
filtro min 2 pilotos
/hotlaps
/pilotos
/combos
/combos/:id
legacy aliases
```

## Aplicación

```powershell
node scripts/apply-gc-app-global-diagnostics-laps-fix-v1-6.cjs
npm run build
npm run dev
```

## Prueba visual

```txt
http://localhost:4321/app
```

Esperado:

```txt
Combo Mugello: 722 vueltas / 12 pilotos / 5 coches
Vueltas servidor: total global real, no 500
```

## Prueba consola

```js
({
  dataCore: document.documentElement.dataset.gcAppDataCore,
  canonicalCombo: document.documentElement.dataset.gcAppCanonicalCombo,
  globalDiagnostics: document.documentElement.dataset.gcAppGlobalDiagnostics,
  primary: window.GCAppDataCorePrimary
})
```

Esperado:

```txt
dataCore = primary
canonicalCombo = v1.5
globalDiagnostics = v1.6
primary.diagnostics.raceData.lapsCount > 500
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```
