# GC Combos Data Core Bridge v1

Fecha: 2026-05-28  
Pack: `GC_Combos_Data_Core_Bridge_v1`

## Objetivo

Alinear `/combos` con la capa central de datos.

Este pack hace dos cosas:

1. Añade el endpoint canónico:

```txt
GET /api/gc/combos
```

2. Añade un puente no destructivo en `/combos` para repintar la página desde ese endpoint.

## Por qué era necesario

`/combos` tenía una lógica propia en cliente para reagrupar circuitos y aliases. Eso podía generar diferencias respecto a `/pitwall`, `/app` y `/hotlaps`.

Con este pack, `/combos` usa la misma lógica backend que `/api/combos/stats`, pero expuesta como endpoint canónico Data Core.

## Endpoint nuevo

```txt
GET /api/gc/combos?limit=1000&sort=recent
```

Parámetros:

```txt
limit   1-1000
sort    recent | laps | drivers | fastest | clean | cars
q       búsqueda opcional
search  alias de q
```

Respuesta esperada:

```json
{
  "ok": true,
  "source": "gc-data-core",
  "generatedAt": "...",
  "mode": "real-stracker",
  "totalCombos": 0,
  "activeCombos": 0,
  "totalLaps": 0,
  "totalValidLaps": 0,
  "carsCount": 0,
  "activeCombo": null,
  "items": []
}
```

## Archivos modificados

- `src/server/index.ts`
- `src/pages/combos.astro`

## Qué NO toca

- `/`
- `src/pages/index.astro`
- `/app`
- `/hotlaps`
- `/pitwall`
- assets
- imágenes
- navegación
- endpoints legacy

## Señal de que funciona

En DevTools:

```txt
[GC /combos Data Core Bridge v1]
```

Y:

```js
document.documentElement.dataset.gcCombosDataCore
```

Debe devolver:

```txt
true
```

Si devuelve:

```txt
fallback
```

`/api/gc/combos` no respondió y la página se quedó con la lógica legacy.

## Pruebas

```powershell
node scripts/apply-gc-combos-data-core-bridge-v1.cjs
npm run build
npm run dev
```

Abrir:

```txt
http://localhost:4321/api/gc/combos
http://localhost:4321/combos
http://localhost:4321/pitwall
http://localhost:4321/app
http://localhost:4321/hotlaps
```

Comparar:

- combo activo
- total combos
- vueltas por combo
- mejor referencia
- última actividad
