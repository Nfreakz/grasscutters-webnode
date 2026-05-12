# Archivo Motorsport · safe API export fix v8.2.5

## Problema

El build fallaba con:

```txt
No matching export in "src/server/motorsport-archive-safe-api-v824-routes.ts"
for import "registerMotorsportArchiveSafeApiV824"
```

## Solución

Este pack reemplaza:

```txt
src/server/motorsport-archive-safe-api-v824-routes.ts
```

por una versión que exporta exactamente:

```ts
export function registerMotorsportArchiveSafeApiV824(app: Express)
```

## Uso

```bash
node scripts/patch-archivo-safe-api-export-v825.mjs
npm run build
```

Si pasa:

```bash
git add .
git commit -m "Fix Motorsport Archive safe API export"
git push
```
