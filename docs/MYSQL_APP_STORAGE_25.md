# Paquete 25 - MySQL App Storage

Este paquete mueve los datos propios de la app a MySQL/MariaDB:

- Usuarios
- Sesiones
- Roles
- Piloto vinculado
- Alias/filtros de nombres de pilotos, coches y circuitos

`stracker.db3` sigue siendo un archivo separado sincronizado desde GTX. No se mezcla con usuarios.

## Variables necesarias

En local y Hostinger:

```env
APP_STORAGE_DRIVER=mysql
MYSQL_HOST=...
MYSQL_PORT=3306
MYSQL_DATABASE=...
MYSQL_USER=...
MYSQL_PASSWORD=...
MYSQL_CONNECTION_LIMIT=5
```

No subas `.env` a GitHub.

## Tablas creadas

El servidor crea automáticamente estas tablas al arrancar si `APP_STORAGE_DRIVER=mysql`:

- `gc_users`
- `gc_sessions`
- `gc_display_names`
- `gc_settings`

También tienes el SQL manual en:

```txt
scripts/mysql-schema.sql
```

## Migrar datos JSON actuales

Si tienes usuarios o alias actuales en:

```txt
data/app/users.json
data/app/display-names.json
```

puedes migrarlos a MySQL con:

```txt
npm run mysql:migrate-json
```

Hazlo una vez, después de tener las variables MySQL en `.env`.

## Comprobaciones

```txt
/api/auth/status
/api/admin/status
/api/admin/storage/status
```

En `/api/auth/status` debe salir:

```txt
status: mysql_auth
```

## Modo fallback

Si dejas:

```env
APP_STORAGE_DRIVER=json
```

seguirá usando `data/app/users.json` y `data/app/display-names.json`.

Para producción, usa MySQL.
