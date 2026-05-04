# Paquete 20 - Admin Console

Añade una consola de administración inicial para GrassCutters Node/Astro.

## Nueva página

- `/admin`

## Nuevas rutas API

- `GET /api/admin/status`
- `POST /api/admin/bootstrap`
- `GET /api/admin/users`
- `POST /api/admin/users/:userId/role`
- `POST /api/admin/users/:userId/unlink-pilot`
- `POST /api/admin/users/:userId/revoke-sessions`
- `POST /api/admin/stracker/sync`

## Primer admin

Si ya tienes usuarios creados pero ninguno es admin, usa `/admin` y el panel de bootstrap.

Secret admitido:

- `ADMIN_SETUP_SECRET`
- o, si no existe, `STRACKER_SYNC_SECRET`

Recomendado en Hostinger y local:

```env
ADMIN_SETUP_SECRET=una_clave_larga_distinta
```

Si ya tienes una sesión iniciada, puedes dejar vacío el email y promocionar la cuenta actual.
Si no, indica el email de una cuenta ya registrada.

## Seguridad

- No se exponen hashes de contraseña.
- No se muestra el secret.
- El último admin no puede degradarse a piloto.
- El admin puede forzar sync stracker sin poner el secret en la URL.
- Se pueden revocar sesiones de usuario.

## Estado actual

Es una consola fase 1. No borra usuarios todavía. Primero dejamos control de roles, sesiones, vinculación y sync.
