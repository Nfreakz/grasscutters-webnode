# GC Deploy 36 - Public structure polish

Este pack ordena la parte pública de GrassCutters sin meter páginas sociales dentro del control panel.

## Añadido

- Header público actualizado y consistente.
- Footer público con enlaces de estructura.
- Página pública `/comunidad`.
- Página pública `/datos`.
- Página pública `/estado`.
- Página `404` con diseño de marca.
- CSS público más completo en `src/styles/marketing.css`.

## Mantiene separado

La plataforma interna sigue centrada en:

- `/app`
- `/hotlaps`
- `/combos`
- `/pilotos`
- `/perfil`
- `/admin`

Discord y App Android quedan en la web pública.

## Notas

La página `/estado` intenta leer rutas existentes:

- `/api/status`
- `/api/stracker/status`
- `/api/auth/status`
- `/api/discord/status`

Si alguna no existe o está desactivada, lo muestra como no disponible sin romper la página.
