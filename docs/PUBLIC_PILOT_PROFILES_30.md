# Deploy 30 - Perfiles públicos de piloto + identidad admin

## Objetivo

Convertir `/pilotos` en una puerta real hacia fichas públicas de rendimiento y reforzar el panel admin cuando hay pilotos con el mismo nombre.

## Cambios principales

### API nueva

- `GET /api/pilots/:playerId/profile`

Devuelve un perfil público generado desde `stracker.db3` usando el `PlayerId` real del piloto.
No necesita login y no expone datos de cuenta web.

### Página nueva

- `/pilotos/[id]`

Ficha pública con:

- mejor vuelta
- ranking global
- vueltas válidas
- consistencia
- resumen competitivo
- mejores combos
- últimas vueltas
- garaje por coche
- circuitos usados

### `/pilotos` mejorado

El listado ahora incluye:

- Player ID visible
- botón para abrir ficha pública
- búsqueda por nombre, ID o Steam GUID

### `/perfil` mejorado

Si el usuario tiene piloto vinculado, aparece:

- botón de perfil público
- enlace directo `/pilotos/{PlayerId}`

### Admin mejorado

En el editor de nombres, los pilotos con nombres repetidos se marcan como:

- `Nombre duplicado`

Esto ayuda a evitar errores con casos tipo dos pilotos llamados `Neo`.
Los overrides de piloto deben hacerse por `PlayerId`/`SteamGuid`, no por nombre visible.

## Persistencia

Los alias siguen guardándose en:

- MySQL producción: `gc_display_names`
- SQLite local: `gc_display_names`

No se vuelve a depender de `display-names.json` salvo migración legacy.
