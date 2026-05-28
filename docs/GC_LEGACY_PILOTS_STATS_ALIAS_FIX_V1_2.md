# GC Legacy Pilots Stats Alias Fix v1.2

Fecha: 2026-05-28  
Pack: `GC_Legacy_Pilots_Stats_Alias_Fix_v1_2`

## Problema

Después de convertir `/api/pilots` y `/api/drivers` en legacy aliases, la página:

```txt
/pilotos
```

carga el directorio, pero parte de los datos salen a cero:

```txt
Pilotos: 31
Activos: 0
Vueltas: 0
Más activo: 0
Pilotos destacados: 0
```

## Causa

La página `/pilotos` espera campos como:

```txt
totalLaps
laps
lapCount
validLaps
lastSeenAt
lastActivityAt
latestLapAt
firstSeenAt
firstActivityAt
lastCarName
carName
bestLapTime
```

pero el alias inicial de `/api/pilots` devolvía casi solo:

```txt
id
name
displayName
carName
trackName
```

Por eso los pilotos existían, pero sin estadísticas útiles.

## Qué corrige

Reemplaza los handlers de:

```txt
/api/pilots
/api/drivers
```

por versiones completas basadas en Race Data Core.

Ahora cada piloto incluye:

```txt
totalLaps
laps
lapCount
validLaps
invalidLaps
firstSeenAt
firstActivityAt
lastSeenAt
lastActivityAt
latestLapAt
bestLapMs
bestLapTime
bestLapTimeFormatted
maxSpeedKmh
lastCarName
lastCarDisplayName
carName
lastTrackName
trackName
cleanRate
active7d
avatarUrl
profileUrl
stats
```

## Qué NO toca

```txt
/pilotos.astro
/app
/hotlaps
/combos
/combos/:comboId
imágenes
ACSM
Archive
Admin Lab
```

Solo modifica:

```txt
src/server/index.ts
```

## Aplicación

```powershell
node scripts/apply-gc-legacy-pilots-stats-alias-fix-v1-2.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/pilots?limit=5&valid=all
http://localhost:4321/api/drivers?limit=5&valid=all
```

Comprobar que cada item trae:

```txt
totalLaps > 0
lastSeenAt
firstSeenAt
lastCarName
```

## Prueba visual

```txt
http://localhost:4321/pilotos
```

Resultado esperado:

```txt
Vueltas > 0
Más activo > 0
Pilotos destacados > 0
```

## Validación Lab

```txt
/admin/endpoints
Probar legacy aliases
```

Debe seguir:

```txt
fails = 0
```
