# Cambios v3

- Añadido `matchesTrack()` al resolver público de circuitos.
- `rowTrackMatches()` ahora puede comparar aliases del circuito.
- El ranking y Combo Pulse filtran por `trackAssetName || rawTrackName || track`, no por el nombre público ya formateado.
- Añadido soporte para quitar prefijo `fn_` en fallback de comparación de slugs.
