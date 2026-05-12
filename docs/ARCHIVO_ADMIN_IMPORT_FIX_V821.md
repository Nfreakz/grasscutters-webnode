# Archivo Motorsport · admin import fix v8.2.1

## Corrige

Dos problemas detectados en Hostinger:

```txt
No se han recibido CSV
```

Causa: las rutas se habían registrado antes de `express.json()`, así que `req.body` llegaba vacío.

```txt
Archivo Motorsport API desactivada en producción. Integra requireAdmin antes de abrir escrituras.
```

Causa: la ruta vieja de demo seguía interceptando. Este pack añade rutas demo seguras para MySQL/Hostinger.

## Instalación

```bash
node scripts/patch-archivo-admin-mysql-import-v821.mjs
npm run build
```

Luego commit, push y redeploy.

## Qué cambia

- Mueve `registerMotorsportArchiveAdminMysqlRoutes(app, { rootDir })` después de `express.json()`.
- Sube el límite JSON/urlencoded a `25mb`.
- Añade endpoints demo seguros:
  - `POST /api/admin/archive/demo`
  - `POST /api/admin/archive/create-demo`
  - `POST /api/admin/archive/seed-demo`
  - `POST /api/admin/archive/items/demo`
- Mantiene importador web:
  - `POST /api/admin/archive/import-csv-web`

## Probar

1. `/admin/archivo/nuevo`
2. Crear demo
3. `/admin/archivo/importar`
4. Subir CSV con “Solo probar” activado
