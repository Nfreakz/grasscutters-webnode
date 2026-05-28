# GC App Use Canonical Combo v1.5

Fecha: 2026-05-28  
Pack: `GC_App_Use_Canonical_Combo_v1_5`

## Problema

Aunque Race Data Core está centralizado, `/app` seguía mostrando una lectura distinta en la tarjeta de combo:

```txt
Estado: 2 combos
Coches: 6
```

mientras `/combos` y la home/ficha mostraban correctamente:

```txt
5 coches
combo canónico filtrado
```

## Causa

`/app` estaba usando:

```txt
/api/gc/snapshot
```

para pintar la tarjeta visible del combo.

Ese snapshot todavía contiene información más cruda del active combo:

```txt
mergedCombosCount
memberComboIds
cars sin filtro público
```

La página `/combos`, en cambio, ya usa:

```txt
/api/gc/combos
```

donde está aplicada la lógica canónica:

```txt
mainVariant
publicComboCars
minPublicCarLaps = 5
minPublicDrivers = 2
Zolder merge
```

## Solución

`/app` mantiene `/api/gc/snapshot` para totales globales y lectura de servidor, pero la tarjeta visible del combo pasa a usar:

```txt
/api/gc/combos?limit=1&sort=recent
```

Así `/app`, home y `/combos` muestran el mismo combo público.

## Cambios

### En `/app`

Data Core Primary ahora carga:

```txt
/api/gc/snapshot?scope=activeCombo&limit=12
/api/gc/leaderboard?scope=activeCombo&limit=20
/api/gc/recent-laps?scope=activeCombo&limit=12
/api/gc/combos?limit=1&sort=recent
```

La tarjeta del combo usa:

```txt
canonicalCombo || snapshot.activeCombo
```

### Coches

`comboCars()` ahora prioriza:

```txt
publicComboCars
carNames
carList
cars
```

Así no muestra coches descartados por menos de 5 vueltas.

### Estado

Ya no muestra:

```txt
2 combos
```

por `mergedCombosCount`.

Ahora muestra:

```txt
Canónico
Filtrado
Activo
```

según el caso.

## Qué NO cambia

```txt
stats globales de servidor
vueltas totales
pilotos
hotlaps
diagnostics
legacy aliases
combos endpoint
```

## Aplicación

```powershell
node scripts/apply-gc-app-use-canonical-combo-v1-5.cjs
npm run build
npm run dev
```

## Prueba visual

```txt
http://localhost:4321/app
```

Esperado:

```txt
Mugello
5 coches
722 vueltas
12 pilotos
Estado: Canónico / Filtrado / Activo
```

Debe coincidir con:

```txt
http://localhost:4321/combos
http://localhost:4321/combos/36
```

## Prueba consola

En `/app`:

```js
({
  appDataCore: document.documentElement.dataset.gcAppDataCore,
  appCanonicalCombo: document.documentElement.dataset.gcAppCanonicalCombo,
  primary: window.GCAppDataCorePrimary
})
```

Esperado:

```txt
appDataCore = primary
appCanonicalCombo = v1.5
primary.combos.items[0].publicComboCars.length = 5
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```
