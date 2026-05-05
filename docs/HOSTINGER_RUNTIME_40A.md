# GC Deploy 40a - Hostinger static index + config local

Corrige dos puntos:

1. En local, `astro.config.mjs` ya no revienta si todavía no has ejecutado `npm install` tras añadir `@astrojs/node`.
2. En Hostinger, Express sirve correctamente páginas Astro generadas como carpetas con `index.html`, por ejemplo `/admin/`, `/hotlaps/`, `/perfil/`.

Para producción sigue siendo necesario que Hostinger instale `@astrojs/node` desde `package.json`.

Si Hostinger sigue dando problemas, usa:

- Comando de compilación: `npm run build`
- Archivo de entrada: `src/server/index.ts`
- Directorio de salida: `./` si Hostinger lo permite. Si no, `dist` puede funcionar con este runtime.
