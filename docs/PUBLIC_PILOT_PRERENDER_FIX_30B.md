# Fix 30B - Dynamic route /pilotos/[id]

Problema:

Astro muestra:

```txt
GetStaticPathsRequired
If you meant for this route to be server-rendered, set `export const prerender = false;` in the page.
```

Causa:

`src/pages/pilotos/[id].astro` es una ruta dinámica. Astro estaba intentando tratarla como página estática, pero no tiene `getStaticPaths()` porque los pilotos vienen de stracker y se cargan por API.

Solución:

Se añade:

```astro
export const prerender = false;
```

en el frontmatter de `src/pages/pilotos/[id].astro`.

Comprobación:

- `http://localhost:4321/pilotos/1` debe cargar la ficha visual.
- `http://localhost:3000/api/pilots/1/profile` seguirá mostrando JSON, eso es correcto porque es la API.
