# Archivo Motorsport · safe API v8.2.4

## Problema

En Hostinger algunas pantallas seguían llamando a la API antigua, que responde:

```txt
Archivo Motorsport API desactivada en producción. Integra requireAdmin antes de abrir escrituras.
```

También el parche de demo era demasiado amplio y podía interceptar botones/enlaces que no tocaban.

## Solución

Este pack añade endpoints nuevos con nombre único:

```txt
GET    /api/admin/archive/safe-v824/items
GET    /api/admin/archive/safe-v824/items/:id
POST   /api/admin/archive/safe-v824/items
PATCH  /api/admin/archive/safe-v824/items/:id
PUT    /api/admin/archive/safe-v824/items/:id
DELETE /api/admin/archive/safe-v824/items/:id
POST   /api/admin/archive/safe-v824/demo
```

Y añade un JS en el admin que redirige llamadas antiguas:

```txt
/api/admin/archive/items
/api/admin/archive/items/:id
```

hacia los endpoints seguros.

## Instalación

```bash
node scripts/patch-archivo-safe-api-v824.mjs
npm run build
```

Luego commit/push/redeploy.

## Probar

En Hostinger:

```txt
/admin/archivo
/admin/archivo/editar/<id>
/admin/archivo/nuevo
```

Debe permitir:

```txt
- abrir ficha
- editar ficha
- borrar ficha
- crear demo sin popups erróneos
```
