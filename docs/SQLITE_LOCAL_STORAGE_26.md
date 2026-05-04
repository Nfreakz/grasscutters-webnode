# Paquete 26 - SQLite local para desarrollo

Este paquete añade un tercer storage de app:

- `APP_STORAGE_DRIVER=mysql` para Hostinger/producción.
- `APP_STORAGE_DRIVER=sqlite` para local con una base real sencilla.
- `APP_STORAGE_DRIVER=json` como fallback simple.

## Objetivo

Trabajar en local con una base de datos real, pero sin montar MySQL, Laragon, XAMPP ni tocar la base real de Hostinger.

## Variables locales recomendadas

Copia `.env.local.sqlite.example` como `.env` en la raíz del proyecto.

La clave es:

```env
APP_STORAGE_DRIVER=sqlite
APP_SQLITE_PATH=./data/app/gc-local.sqlite
```

La app creará automáticamente:

```txt
data/app/gc-local.sqlite
```

Y dentro tendrá las mismas tablas conceptuales que MySQL:

```txt
gc_users
gc_sessions
gc_display_names
gc_settings
```

## Comprobaciones

Con el servidor local arrancado, abre:

```txt
http://localhost:3000/api/sqlite/status
http://localhost:3000/api/auth/status
```

Debe aparecer:

```txt
sqlite_auth
```

## Producción

En Hostinger no cambies a SQLite. Allí debe seguir:

```env
APP_STORAGE_DRIVER=mysql
```

## Git

Asegúrate de que `.gitignore` cubre:

```gitignore
/data/app/*.sqlite
/data/app/*.sqlite3
/data/app/*.db
/data/app/*.db-wal
/data/app/*.db-shm
```

La base local no se sube a GitHub.
