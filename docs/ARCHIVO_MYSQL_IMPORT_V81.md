# Archivo Motorsport · importador MySQL desde CSV v8.1

Importa CSV directamente a MySQL/Hostinger.

## Variables

```env
APP_STORAGE_DRIVER=mysql
ARCHIVE_STORAGE_DRIVER=mysql
ARCHIVE_IMPORT_DIR=/home/u303801827/gc-import/archive-import
```

Opcionales:

```env
ARCHIVE_IMPORT_PUBLISH=1
ARCHIVE_IMPORT_DRY_RUN=1
ARCHIVE_IMPORT_FORCE=1
```

## Preparar Hostinger

```bash
mkdir -p /home/u303801827/gc-import/archive-import
```

Sube ahí los CSV:

```txt
01_circuitos.csv
02_pilotos.csv
03_vehiculos.csv
04_campeonatos.csv
05_records.csv
06_glosario.csv
```

## Probar sin escribir

```bash
ARCHIVE_IMPORT_DRY_RUN=1 node scripts/import-archivo-mysql-from-csv.mjs
```

## Importar en borrador

```bash
node scripts/import-archivo-mysql-from-csv.mjs
```

## Importar publicado directamente

```bash
ARCHIVE_IMPORT_PUBLISH=1 node scripts/import-archivo-mysql-from-csv.mjs
```

Luego revisa `/admin/archivo`.
