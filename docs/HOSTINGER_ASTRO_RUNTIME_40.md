# Pack 40 - Hostinger Astro Runtime Fix

Este pack corrige el caso en el que Hostinger arranca `src/server/index.ts`, pero Astro genera el build como `dist/client` + `dist/server/entry.mjs` o despliega el contenido de `dist` como raíz.

## Qué hace

- Mantiene `@astrojs/node`.
- Mantiene `output: 'static'`, compatible con Astro actual.
- Añade `prebuild` para parchear automáticamente `src/server/index.ts` antes de compilar.
- El servidor Express ahora busca assets en:
  - `dist/client`
  - `client`
  - `dist`
  - raíz del proyecto
- El servidor Express monta SSR desde:
  - `dist/server/entry.mjs`
  - `server/entry.mjs`

## Hostinger

Si sigue apareciendo que falta `dist`, revisa en Hostinger el campo **Directorio de salida**. Para esta estructura suele funcionar mejor:

- Directorio raíz: `./`
- Comando de compilación: `npm run build`
- Archivo de entrada: `src/server/index.ts`
- Directorio de salida: `./` o vacío si Hostinger lo permite

Si Hostinger obliga a usar `dist`, este pack también intenta resolver el caso en el que `client/` y `server/` quedan en la raíz.
