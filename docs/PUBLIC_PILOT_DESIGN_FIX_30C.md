# Fix 30C - Diseño de /pilotos/[id]

La ruta `/pilotos/[id]` ya cargaba datos, pero se veía casi sin formato.

## Causa probable

La página dependía demasiado de clases globales y de estilos Astro escopados. Parte del contenido se inserta con JavaScript después de cargar la página, y los estilos escopados de Astro no siempre alcanzan esos elementos dinámicos.

## Solución

Se reemplaza `src/pages/pilotos/[id].astro` por una versión con:

- `export const prerender = false`
- diseño completo inline global con namespace `.pilot-public-page`
- hero tipo plataforma
- métricas en strip
- tabla de mejores combos
- garaje y circuitos en listas compactas
- últimas vueltas con estados visuales
- responsive mejorado

## Comprobación

- `http://localhost:4321/pilotos/2` debe verse como ficha visual de plataforma.
- `http://localhost:3000/api/pilots/2/profile` seguirá mostrando JSON, eso es correcto.
