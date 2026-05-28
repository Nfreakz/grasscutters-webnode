# GC Pitwall Preview v1

Fecha: 2026-05-28  
Pack: `GC_Pitwall_Preview_v1`  
Objetivo: validar el rediseño público de GrassCutters sin tocar `/`.

## Archivos añadidos

- `src/pages/pitwall.astro`
- `src/styles/pages/pitwall.css`

## Reglas respetadas

- No toca `/`.
- No toca `src/pages/index.astro`.
- No toca assets ni imágenes.
- No toca navegación.
- No modifica endpoints existentes.
- No introduce datos demo como si fueran reales.
- Si `/api/gc/*` no responde, muestra error claro.

## Endpoints usados

La página `/pitwall` consume únicamente:

```txt
GET /api/gc/snapshot?scope=activeCombo&limit=12
GET /api/gc/leaderboard?scope=activeCombo&limit=20
GET /api/gc/recent-laps?scope=activeCombo&limit=10
```

También permite cambiar el leaderboard a:

```txt
GET /api/gc/leaderboard?scope=global&limit=20
GET /api/gc/recent-laps?scope=global&limit=10
```

## Bloques de UI

- Hero `GrassCutters Pit Wall`
- Diagnóstico Race Control
- Métricas globales
- Now on Track
- Race Bulletin
- Timing Sheet
- Race Feed

## Criterio técnico

La página no debe calcular la verdad del sistema. Solo pinta la respuesta de `/api/gc/*`.

Esto permite validar si el Pack 1 realmente centraliza:

- total laps
- valid laps
- drivers count
- active combo
- best lap
- latest lap
- leaderboard
- recent laps

## Pruebas recomendadas

```powershell
npm run build
npm run dev
```

Abrir:

```txt
http://localhost:4321/pitwall
http://localhost:4321/api/gc/snapshot
http://localhost:4321/api/gc/active-combo
http://localhost:4321/api/gc/leaderboard
http://localhost:4321/api/gc/recent-laps
```

## Qué NO hacer todavía

- No sustituir la home por `/pitwall`.
- No añadir `/pitwall` al menú.
- No adaptar `/app` todavía.
- No adaptar `/hotlaps` todavía.
- No añadir bloques nuevos que usen endpoints legacy.

## Próximo paso recomendado

Si `/pitwall` carga datos coherentes:

1. Pack 3: ajustar `/api/gc/*` si algún campo viene flojo.
2. Pack 4: adaptar `/app` para consumir `/api/gc/snapshot`.
3. Pack 5: adaptar `/hotlaps` para usar `/api/gc/leaderboard` y `activeCombo`.
