# Paquete 23 - Storage persistente + Landing pública

Este paquete arregla dos puntos importantes:

1. Los datos de usuarios y alias no deben vivir dentro del directorio que Hostinger redeploya.
2. La raíz `/` pasa a ser una landing pública tradicional y la plataforma tipo app pasa a `/app`.

## Muy importante antes de subir este paquete a Hostinger

Si ahora tienes usuarios reales creados en producción, haz copia antes del próximo deploy:

- `data/app/users.json`
- `data/app/display-names.json`

Si quieres conservar también la copia actual de stracker:

- `data/stracker/stracker.db3`

Hostinger puede limpiar o sobrescribir el directorio de la app al hacer deploy. Por eso no conviene usar `./data/app/users.json` en producción.

## Nueva variable recomendada

En Hostinger añade:

```env
APP_DATA_DIR=/home/u303801827/gc-persistent
```

Usa tu usuario real de Hostinger. La idea es que esa carpeta quede fuera de:

```txt
/home/.../domains/TU_DOMINIO/nodejs
```

Con solo `APP_DATA_DIR`, el servidor usará automáticamente:

```txt
/home/u303801827/gc-persistent/app/users.json
/home/u303801827/gc-persistent/app/display-names.json
/home/u303801827/gc-persistent/stracker/stracker.db3
```

También puedes usar rutas específicas si quieres:

```env
APP_USERS_PATH=/home/u303801827/gc-persistent/app/users.json
APP_DISPLAY_NAMES_PATH=/home/u303801827/gc-persistent/app/display-names.json
STRACKER_DB_PATH=/home/u303801827/gc-persistent/stracker/stracker.db3
```

Pero no hace falta si `APP_DATA_DIR` está bien configurado.

## Migración local opcional

En local puedes probar con:

```env
APP_DATA_DIR=./.gc-persistent
```

Luego ejecuta:

```powershell
node scripts/migrate-persistent-data.mjs
```

Esto copia, si existen:

```txt
data/app/users.json -> .gc-persistent/app/users.json
data/app/display-names.json -> .gc-persistent/app/display-names.json
data/stracker/stracker.db3 -> .gc-persistent/stracker/stracker.db3
```

Añade al `.gitignore`:

```gitignore
.gc-persistent/
```

## Ruta nueva para comprobar storage

Con una cuenta admin:

```txt
/api/admin/storage/status
```

Si `persistent` sale `false`, el storage sigue dentro del proyecto y no es seguro para deploys.

## Cambio de navegación

La web queda así:

```txt
/       Landing pública tradicional
/app    Panel/plataforma tipo aplicación
/hotlaps
/pilotos
/tracker
/herramientas
/discord
/perfil
/admin
```

La app mantiene el menú lateral. La landing no.
