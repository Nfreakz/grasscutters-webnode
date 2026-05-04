# GC Deploy 12 - Estructura web base

Este paquete crea la estructura principal de la web GrassCutters en Astro sin tocar el servidor Node ni la sync de stracker.

## Secciones creadas

- `/` Home estructural con estado rápido de API, tracker y sync.
- `/discord` sección Discord y roadmap del bot.
- `/tracker` centro de datos stracker con acceso a hotlaps, pilotos y diagnóstico.
- `/herramientas` laboratorio de herramientas para pilotos y admins.
- `/login` maqueta de login de pilotos.
- `/perfil` maqueta de perfil privado de usuario.

## Secciones existentes que se mantienen

- `/hotlaps`
- `/pilotos`

## Archivos incluidos

- `src/layouts/BaseLayout.astro`
- `src/pages/index.astro`
- `src/pages/discord.astro`
- `src/pages/tracker.astro`
- `src/pages/herramientas.astro`
- `src/pages/login.astro`
- `src/pages/perfil.astro`
- `src/styles/global.css`

## Importante

El login y el perfil todavía no tienen autenticación real. Son estructura visual y de navegación para preparar la siguiente fase.

El botón de Discord usa un enlace genérico. Cuando tengamos la invitación definitiva, cambiar `https://discord.gg/` por el invite real.
