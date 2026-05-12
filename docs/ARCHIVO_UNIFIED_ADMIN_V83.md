# Archivo Motorsport · Admin unificado v8.3

## Diagnóstico desde Git

El módulo tenía varias generaciones mezcladas:

- `/admin/archivo` llamaba a `/api/admin/archive/items` y demo a `/api/admin/archive/reset-demo`.
- `/admin/archivo/editar/[id]` cargaba la ficha antes de que cargaran los parches JS.
- `/admin/archivo/calidad` leía `data/app/motorsport-archive.json`, por eso no valía para MySQL/Hostinger.
- `/admin/archivo/relaciones` llamaba a la API vieja antes del parche.
- `/admin/archivo/imagen-url` llenaba el select leyendo JSON local desde Astro.

## Qué hace este pack

Sustituye las 5 pantallas admin por versiones que llaman directamente a una API única:

```txt
/api/admin/archive/unified/*
```

Sin scripts v822/v823/v824, sin monkey patch, sin llamadas a rutas viejas.

## Endpoints nuevos

```txt
GET    /api/admin/archive/unified/items
GET    /api/admin/archive/unified/items/:id
POST   /api/admin/archive/unified/items
PUT    /api/admin/archive/unified/items/:id
PATCH  /api/admin/archive/unified/items/:id
DELETE /api/admin/archive/unified/items/:id
POST   /api/admin/archive/unified/demo
POST   /api/admin/archive/unified/import-csv
POST   /api/admin/archive/unified/media/inspect-url
POST   /api/admin/archive/unified/items/:id/media/from-url
```

## Instalación

```bash
node scripts/patch-archivo-unified-admin-v83.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Unify Motorsport Archive admin API"
git push
```

Redeploy/restart en Hostinger.

## Pruebas

En Hostinger:

```txt
/admin/archivo
/admin/archivo/nuevo
/admin/archivo/editar/<id>
/admin/archivo/calidad
/admin/archivo/relaciones
/admin/archivo/imagen-url
/admin/archivo/importar
```
