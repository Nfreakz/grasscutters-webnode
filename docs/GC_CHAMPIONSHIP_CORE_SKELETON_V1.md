# GC Championship Core Skeleton v1

Fecha: 2026-05-28  
Pack: `GC_Championship_Core_Skeleton_v1`

## Objetivo

Crear una capa separada para datos de campeonato.

## Separación crítica

```txt
Race Data Core = Stracker
Championship Core = ACSM / calendario campeonato
```

Este pack NO toca:

```txt
/api/gc/active-combo
/api/gc/leaderboard
/api/gc/recent-laps
/api/gc/combos
Stracker
Race Data Core
```

## Endpoints añadidos

```txt
GET /api/gc/championship/snapshot
GET /api/gc/championship/events
```

## Fuente inicial

De momento lee eventos del calendario/admin:

```txt
gcCalendarReadEventsDbV8()
```

y detecta eventos importados desde ACSM si:

```txt
id contiene acsm
description contiene Assetto Corsa Server Manager
title contiene acsm
```

## `/api/gc/championship/snapshot`

Devuelve:

```json
{
  "ok": true,
  "source": "gc-championship-core",
  "domain": "championship",
  "upstream": "calendar/acsm-import",
  "separatedFromRaceDataCore": true,
  "summary": {
    "currentEvent": {},
    "nextEvent": {},
    "featured": [],
    "acsmImported": {},
    "counts": {}
  },
  "events": []
}
```

## `/api/gc/championship/events`

Parámetros:

```txt
limit=50
type=all|combo|race_gc|race_lfm
source=all|acsm|manual|calendar
scope=all|upcoming|current|featured
q=texto
search=texto
```

## Qué NO hace todavía

No calcula standings.
No calcula resultados.
No importa datos de carrera directamente.
No toca la página del campeonato.
No mezcla ACSM con Race Data Core.

## Próximo paso

Cuando validemos estos endpoints:

1. Crear `/championship` o página de campeonato.
2. Añadir import real de standings/resultados si ACSM lo proporciona.
3. Separar claramente visualmente:
   - Campeonato
   - Hotlaps
   - Server/Pitwall
