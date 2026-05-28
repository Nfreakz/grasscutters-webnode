# GC Combo Canonical Compat Shape Fix v1.1

Fecha: 2026-05-28  
Pack: `GC_Combo_Canonical_Compat_Shape_Fix_v1_1`

## Problema

Después de aplicar `GC_Combo_Canonical_Public_Filter_v1`, la ficha:

```txt
/combos/36
```

muestra datos correctos, pero el listado:

```txt
/combos
```

muestra:

```txt
Vueltas 0
Pilotos 0
Sin piloto
Sin fecha
```

## Causa

La lógica nueva devuelve muchos datos dentro de:

```txt
summary
mainVariant
publicComboCars
```

pero la página `/combos.astro` todavía lee campos legacy de primer nivel:

```txt
totalLaps
validLaps
driversCount
bestLapTimeFormatted
bestDriverName
bestCarName
lastSeenAt
carNames
```

Por eso los datos existen, pero la UI no los encuentra.

## Solución

Añade un adaptador de compatibilidad:

```txt
gcComboCanonicalCompatShapeV1()
```

Este adaptador no cambia la lógica canónica. Solo duplica campos clave a primer nivel para que la UI actual los lea correctamente.

## Campos añadidos

```txt
totalLaps
laps
lapCount
validLaps
validLapCount
cleanLaps
invalidLaps
driversCount
driverCount
pilots
usedCarsCount
carsCount
publicCarsCount
carNames
carList
carModels
bestLap
bestLapMs
bestLapTimeMs
bestLapTime
bestLapTimeFormatted
bestDriverName
fastestDriverName
bestCarName
fastestCarName
maxSpeedKmh
firstSeenAt
lastSeenAt
lastActivityAt
latestLapAt
cleanRate
```

## Qué NO cambia

```txt
Agrupación canónica
Selección de variante principal
Filtro de coches >= 5 vueltas
/pilotos
/hotlaps
/app
diagnostics
leaderboard
recent laps
```

## Aplicación

```powershell
node scripts/apply-gc-combo-canonical-compat-shape-fix-v1-1.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/gc/combos?limit=5&sort=recent
```

Comprobar en cada item:

```txt
totalLaps > 0
driversCount > 0
bestLapTimeFormatted
bestDriverName
carNames
lastSeenAt
```

## Prueba visual

```txt
http://localhost:4321/combos
```

Debería volver a mostrar:

```txt
Vueltas > 0
Pilotos > 0
Mejor referencia real
Última actividad real
```

## Validación

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```
