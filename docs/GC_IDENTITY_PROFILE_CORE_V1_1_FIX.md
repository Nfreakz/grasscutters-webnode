# GC Identity/Profile Core v1.1 Fix

Fecha: 2026-05-28  
Pack: `GC_Identity_Profile_Core_v1_1_Fix`

## Problema detectado

El endpoint:

```txt
/api/gc/pilots/:playerId/profile
```

devolvía:

```txt
Piloto desconocido
Coche desconocido
Circuito desconocido
```

aunque las vueltas existían.

## Causa

`readJoinedLaps()` ya devuelve vueltas mapeadas con campos camelCase:

```txt
playerId
driverName
carName
trackName
lapTimeMs
timestampIso
driver.name
car.name
track.name
```

El pack Identity v1 estaba leyendo principalmente campos crudos de SQL:

```txt
PlayerId
DriverName
Car
Track
LapTime
Timestamp
```

En un objeto ya mapeado, esos campos ya no existen.

## Solución

Identity/Profile Core v1.1 ahora lee primero:

```txt
row.playerId
row.driverName
row.carName
row.trackName
row.lapTimeMs
row.timestampIso
row.driver.name
row.car.name
row.track.name
```

y solo después usa fallbacks crudos.

## Archivos modificados

```txt
src/server/index.ts
```

## Endpoints afectados

```txt
/api/gc/identity/me
/api/gc/identity/status
/api/gc/pilots/:playerId/profile
```

## Qué NO toca

```txt
Race Data Core
leaderboard
active combo
hotlaps
combos
Championship Core
Archive Core
UI
assets
```

## Aplicación

```powershell
node scripts/apply-gc-identity-profile-core-v1-1-fix.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/api/gc/pilots/1/profile
```

Resultado esperado:

```txt
driverName != Piloto desconocido
carName != Coche desconocido
trackName != Circuito desconocido
```

Si `PlayerId=1` realmente tiene datos válidos, deberían aparecer nombres correctos.
