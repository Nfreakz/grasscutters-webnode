# GrassCutters WebNode - GC Data Core v1

Fecha: 2026-05-28  
Pack: GC Data Core v1  
Tipo: backend / endpoints / documentación  
UI: no toca  
Assets: no toca  

## 1. Objetivo

Crear una primera capa canónica para que los nuevos bloques de la web no calculen cada uno su propia versión de:

- combo activo,
- últimas vueltas,
- mejor vuelta,
- leaderboard,
- métricas globales,
- métricas del combo activo.

Este pack no elimina endpoints antiguos. Solo añade endpoints nuevos bajo /api/gc/*.

## 2. Endpoints nuevos

### GET /api/gc/snapshot

Snapshot global o de combo activo.

Parámetros:

- scope=global | activeCombo
- recentLimit=1..100
- leaderboardLimit=1..100

Uso recomendado:

- home rediseñada,
- /pitwall,
- bloques de resumen,
- paneles tipo race bulletin.

### GET /api/gc/active-combo

Devuelve el combo activo canónico con:

- activeCombo,
- latestLap,
- bestLap,
- recentLaps,
- leaderboard,
- stats.

Uso recomendado:

- bloque "Now on track",
- combo de la semana,
- tarjetas de servidor activo.

### GET /api/gc/leaderboard

Leaderboard canónico.

Parámetros:

- scope=activeCombo | global
- limit=1..200

Uso recomendado:

- timing sheet,
- ranking compacto,
- bloques de top drivers.

### GET /api/gc/recent-laps

Vueltas recientes canónicas.

Parámetros:

- scope=global | activeCombo
- limit=1..200

Uso recomendado:

- actividad reciente,
- live feed,
- últimas vueltas del combo.

## 3. Endpoints legacy que siguen vivos

No se eliminan:

- GET /api/hotlaps
- GET /api/laps
- GET /api/combos
- GET /api/combos/stats
- GET /api/combos/:comboId
- GET /api/stats/overview
- GET /api/activity/recent

## 4. Regla nueva para futuros bloques

Un bloque nuevo NO debe calcular por su cuenta:

- último circuito activo,
- combo activo,
- mejor piloto del combo,
- total de vueltas,
- última actividad,
- leaderboard.

Debe consumir primero:

- /api/gc/snapshot
- /api/gc/active-combo
- /api/gc/leaderboard
- /api/gc/recent-laps

## 5. Archivos tocados

- src/server/index.ts
- docs/GC_ENDPOINTS_MAP.md

## 6. Archivos NO tocados

- src/pages/index.astro
- src/pages/app.astro
- src/pages/hotlaps.astro
- public/images/*
- public/og/*
- archive-media/*
- estilos CSS
- componentes UI

## 7. Comandos de prueba

```powershell
npm run build
npm run dev
```

Probar:

```txt
/api/gc/snapshot
/api/gc/snapshot?scope=activeCombo
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/leaderboard?scope=global&limit=20
/api/gc/recent-laps
/api/gc/recent-laps?scope=activeCombo&limit=20
```

## 8. Siguiente paso recomendado

Si el build pasa y los endpoints devuelven datos coherentes:

1. crear /pitwall como ruta aislada,
2. hacer que /pitwall use solo /api/gc/*,
3. comparar datos con /app y /hotlaps,
4. después adaptar /app para reducir llamadas duplicadas.

## 9. Nota técnica

Este v1 inserta el bloque directamente en src/server/index.ts porque las funciones importantes actuales no están exportadas a módulos externos:

- readJoinedLaps
- getCombos
- buildComboStatsFromLaps
- makeBestHotlaps
- getSafeStrackerOrRespond

Una fase posterior debería extraer estas funciones a un servicio real:

```txt
src/server/data/gc-data-core.ts
src/server/data/stracker-service.ts
src/server/data/combo-service.ts
```

Pero para este primer pack se evita una refactorización grande.
