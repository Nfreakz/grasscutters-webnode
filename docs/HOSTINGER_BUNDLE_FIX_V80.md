# Hostinger bundle fix v8.0

## Problema

Hostinger daba 503 con este error:

```txt
ERR_MODULE_NOT_FOUND:
Cannot find module .../dist/server-node/motorsport-archive-delete-routes
imported from .../dist/server-node/index.mjs
```

## Causa

`scripts/build-server.mjs` compilaba solo `src/server/index.ts` con:

```js
bundle: false
```

Eso dejaba imports locales sueltos. En local Vite/tsx los resolvía, pero en Hostinger Node buscaba archivos que no estaban en `dist/server-node`.

## Solución

Este pack cambia `scripts/build-server.mjs` para compilar el servidor como bundle:

```js
bundle: true,
packages: 'external'
```

Así los módulos locales de `src/server/` quedan dentro de `dist/server-node/index.mjs`, pero los paquetes de npm siguen cargándose desde `node_modules`.

## Uso

1. Descomprime en la raíz del proyecto.
2. Reemplaza `scripts/build-server.mjs`.
3. Ejecuta:

```bash
npm run build
```

4. Commit + push:

```bash
git add scripts/build-server.mjs
git commit -m "Fix Hostinger server bundle"
git push
```

5. Redespliega/reinicia la app en Hostinger.

## Qué debería cambiar en logs

Antes:

```txt
Servidor compilado:
```

Después:

```txt
Servidor compilado en bundle:
```
