# GC Deploy 31 - Pilot admin link manager + leaderboard polish

## Cambios

- Añade endpoint admin para vincular manualmente un usuario web con un piloto stracker: `POST /api/admin/users/:userId/link-pilot`.
- Mantiene desvinculación desde admin y añade cambio de piloto desde la tabla de usuarios.
- Mejora `/perfil` con botón de desvincular piloto y GUID más discreto.
- Mejora `/hotlaps`: elimina sectores falsos, añade Delta, Vmax, Cortes, Fecha y enlace al perfil público del piloto.
- Mejora `/pilotos/[id]` mostrando Steam GUID abreviado visualmente.

## Pruebas recomendadas

1. Entra en `/admin` y busca un usuario sin piloto vinculado.
2. Pulsa `Vincular piloto`, introduce un Player ID real y guarda.
3. Abre `/perfil` con ese usuario y comprueba el vínculo.
4. Desvincula desde `/perfil` y vuelve a vincular desde `/admin`.
5. Abre `/hotlaps` y comprueba que las filas enlazan a `/pilotos/[id]`.

## Nota

Los alias siguen guardándose en `gc_display_names` con MySQL en producción y SQLite en local.
