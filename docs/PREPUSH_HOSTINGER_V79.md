# GrassCutters · pre-push y Hostinger

## Objetivo

Este pack no añade funcionalidades nuevas. Sirve para revisar que el proyecto está listo antes del push y que el Archivo Motorsport podrá funcionar en Hostinger sin perder datos.

## Archivos incluidos

```txt
scripts/gc-prepush-check.mjs
scripts/check-hostinger-archive-env.mjs
scripts/patch-gitignore-local-data.mjs
.env.archivo.local.example
.env.archivo.hostinger.example
docs/PREPUSH_HOSTINGER_V79.md
LEEME_PRIMERO.md
```

## Uso recomendado en local

Desde la raíz del proyecto:

```bash
node scripts/patch-gitignore-local-data.mjs
node scripts/gc-prepush-check.mjs
```

Para incluir build en el chequeo:

```powershell
$env:GC_PREPUSH_BUILD="1"
node scripts/gc-prepush-check.mjs
Remove-Item Env:\GC_PREPUSH_BUILD
```

## Qué revisa

- Que no quedan rutas peligrosas tipo `/archive-media/*`.
- Que `/archive-media` se sirve con `express.static`.
- Que el hard-delete del Archivo Motorsport está registrado.
- Que las rutas de vincular/desvincular usuarios están registradas.
- Que existen archivos clave.
- Que no subas datos locales por accidente.
- Que no queden backups temporales evidentes.

## Local persistente

En local puedes usar:

```env
APP_STORAGE_DRIVER=json
ARCHIVE_STORAGE_DRIVER=json
ARCHIVE_DATA_PATH=F:/Web Node/gc-local-persistent/motorsport-archive.json
ARCHIVE_MEDIA_DIR=F:/Web Node/gc-local-persistent/archive-media
ARCHIVE_MEDIA_PUBLIC_URL=/archive-media
```

Eso permite hacer pruebas sin tocar Hostinger y sin subir datos locales a Git.

## Hostinger

En Hostinger se recomienda:

```env
APP_STORAGE_DRIVER=mysql
ARCHIVE_STORAGE_DRIVER=mysql

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=TU_BASE_DE_DATOS
MYSQL_USER=TU_USUARIO
MYSQL_PASSWORD=TU_PASSWORD

ARCHIVE_DATA_PATH=/home/TU_USUARIO/gc-persistent/motorsport-archive.snapshot.json
ARCHIVE_MEDIA_DIR=/home/TU_USUARIO/gc-persistent/archive-media
ARCHIVE_MEDIA_PUBLIC_URL=/archive-media
```

Después de configurar variables en Hostinger, ejecuta si tienes consola:

```bash
node scripts/check-hostinger-archive-env.mjs
```

## Cosas que NO conviene subir

Si son pruebas locales, evita subir:

```txt
data/app/motorsport-archive.json
data/app/users.json
data/app/display-names.json
public/archive-media/
gc-local-persistent/
*.backup-*
prepush-report.json
```

## Checklist antes del push

```bash
node scripts/gc-prepush-check.mjs
npm run build
git status
```

Revisa bien que `git status` no incluya datos locales ni backups.

## Checklist después del deploy

En Hostinger:

```txt
/admin/archivo
/admin/usuarios
/admin/nombres
/archivo
/api/admin/archive/status
```

Probar:

```txt
- crear ficha Archivo Motorsport
- subir/descargar imagen
- borrar ficha de prueba
- vincular/desvincular usuario con piloto
- comprobar que /archive-media/... carga imágenes
```
