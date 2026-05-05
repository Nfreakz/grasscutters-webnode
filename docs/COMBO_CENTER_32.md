# Pack 32 - Combo Center

Este paquete añade una vista de combos basada en datos reales de stracker.

## Nuevo

- `/combos`
- `/combos/[trackId]/[carId]`
- `/api/combos/stats`
- `/api/combos/:trackId/:carId`

## Qué se considera combo

Para evitar depender solo de la tabla `Combos`, la vista agrupa vueltas reales por:

```txt
TrackId + CarId
```

Así aparecen únicamente combinaciones con actividad real.

## Datos que muestra

- Total de vueltas
- Vueltas válidas
- Limpieza
- Pilotos distintos
- Mejor vuelta
- Vmax
- Última actividad
- Leaderboard propio por combo
- Últimas vueltas del combo

## Cambios en hotlaps

Los nombres de coche y circuito enlazan ahora a la ficha del combo cuando la vuelta tiene `trackId` y `carId`.

## Pruebas

```txt
/combos
/combos/14/100
/api/combos/stats
/api/combos/14/100
```

Cambia `14/100` por cualquier TrackId + CarId que aparezca en `/combos`.
