# Fix 30A - Perfil público de piloto en blanco

Problema detectado:

- `/api/pilots/1/profile` devuelve JSON correctamente.
- `/pilotos/1` queda en blanco.

Eso indica que la API funciona y el fallo está en la página Astro del perfil público, probablemente por una propiedad no esperada o por intentar renderizar datos undefined antes de cargar.

## Qué cambia

Se reemplaza `src/pages/pilotos/[id].astro` por una versión robusta:

- Renderiza una estructura base siempre visible.
- Carga datos por fetch desde `/api/pilots/:id/profile`.
- Soporta nombres de campos alternativos.
- No rompe si faltan mejores combos, garaje, circuitos o vueltas recientes.
- Muestra error visible en vez de quedarse en blanco.

## Nota

Ver JSON en `http://localhost:3000/api/pilots/1/profile` es normal: esa es una ruta API. La página visual correcta es `http://localhost:4321/pilotos/1`.
