# GC Deploy 14 - Login real fase 1

## Qué añade

- Registro real de usuarios.
- Login con email y contraseña.
- Hash de contraseña con PBKDF2 SHA-256, salt único e iteraciones configuradas en código.
- Sesiones con token aleatorio y cookie `httpOnly`.
- Storage local en `data/app/users.json`.
- Vinculación de usuario web con piloto real de stracker por `PlayerId`.
- Perfil con datos de cuenta + métricas reales del piloto vinculado.

## Archivos importantes

```txt
src/server/index.ts       -> endpoints auth + storage usuarios
src/pages/login.astro     -> entrar / crear cuenta
src/pages/perfil.astro    -> perfil real y vínculo piloto
src/styles/03-components.css
.env.example
.gitignore
```

## Rutas nuevas

```txt
GET  /api/auth/status
GET  /api/auth/me
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/link-pilot
POST /api/auth/unlink-pilot
```

## Variables nuevas

```env
APP_USERS_PATH=./data/app/users.json
AUTH_REGISTRATION_ENABLED=true
AUTH_SESSION_DAYS=14
AUTH_COOKIE_SECURE=auto
FIRST_USER_ADMIN=false
```

## Importante para Git

`data/app/users.json` contiene usuarios y hashes de contraseña. No debe subirse a GitHub.

El `.gitignore` de este paquete añade:

```gitignore
/data/app/*.json
/data/app/*.tmp
```

## Flujo recomendado

1. Probar en local con `npm run dev`.
2. Ir a `/login`.
3. Crear cuenta.
4. Vincular un piloto real de stracker.
5. Revisar `/perfil`.
6. Confirmar que `git status` no muestra `data/app/users.json`.
7. Subir código a GitHub y redeploy.

## Estado actual

Este sistema es suficiente para empezar a construir el área privada. Más adelante podemos migrar el storage a SQLite/PostgreSQL y añadir Discord OAuth.
