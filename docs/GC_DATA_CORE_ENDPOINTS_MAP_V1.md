# GC Data Core Endpoints Map v1

Fecha: 2026-05-28

## Endpoints canónicos Race Data Core

| Endpoint | Dominio | Uso principal | Estado |
|---|---|---|---|
| /api/gc/diagnostics | Race | salud Stracker, contadores, fechas | activo |
| /api/gc/snapshot | Race | snapshot para /app | activo |
| /api/gc/active-combo | Race | combo activo | activo |
| /api/gc/leaderboard | Race | ranking/hotlaps | activo |
| /api/gc/recent-laps | Race | actividad reciente | activo |
| /api/gc/combos | Race | listado combos | activo |
| /api/gc/combos/:comboId | Race | ficha de combo | activo |
| /api/gc/cache/status | Race | estado caché | activo |

## Endpoints canónicos Identity Core

| Endpoint | Uso |
|---|---|
| /api/gc/identity/status | estado usuarios/player links |
| /api/gc/identity/me | usuario actual |
| /api/gc/pilots/:playerId/profile | perfil público piloto |

## Endpoints Display Names

| Endpoint | Uso |
|---|---|
| /api/gc/display-names/status | estado overrides |
| /api/gc/names/preview | previsualizar limpieza automática y overrides |

## Endpoints de imágenes

| Endpoint | Uso |
|---|---|
| /api/gc/assets/tracks | listado de imágenes reales |
| /gc-track-images-manifest.json | manifest estático del fuzzy resolver |
| /js/gc-track-image.js | resolver fuzzy cliente |

## Legacy aliases de servidor

Estos endpoints siguen vivos, pero deben responder desde:

```txt
source = gc-data-core-legacy-server-alias
```

| Legacy endpoint | Alias conceptual |
|---|---|
| /api/hotlaps | /api/gc/leaderboard |
| /api/laps | /api/gc/recent-laps |
| /api/combos/stats | /api/gc/combos |
| /api/combos/:comboId | /api/gc/combos/:comboId |
| /api/pilots | Race Data Core + pilot stats projection |
| /api/drivers | Race Data Core + pilot stats projection |
| /api/stats/overview | /api/gc/diagnostics |

## ACSM / Championship

| Endpoint | Dominio |
|---|---|
| /api/gc/championship/snapshot | Championship |
| /api/gc/championship/events | Championship |

Regla:

```txt
ACSM no alimenta Race Data Core.
Stracker no alimenta Championship Core.
```
