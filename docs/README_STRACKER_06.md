# GC Deploy 06 - Detector seguro de stracker.db3

Este paquete mantiene el servidor en un solo archivo para evitar los 503 de Hostinger, pero añade un detector seguro de `stracker.db3`.

## Qué añade

- `data/stracker/.gitkeep` para que exista la carpeta en Git.
- Dependencia `sql.js`, que permite leer SQLite sin módulos nativos.
- `/api/stracker/status` para comprobar si existe el archivo.
- `/api/stracker/tables` para listar tablas, columnas y número de filas.
- `/api/stracker/preview/:table` para ver unas filas de una tabla concreta.

## Importante

El servidor NO lee `stracker.db3` al arrancar. Solo lo lee cuando visitas `/api/stracker/tables` o `/api/stracker/preview/:table`.

Así evitamos que un archivo ausente o corrupto tire la web completa.

## Ruta por defecto

```txt
./data/stracker/stracker.db3
```

También puedes definir otra ruta con:

```txt
STRACKER_DB_PATH=./data/stracker/stracker.db3
```

## Pruebas

Primero, sin subir DB:

```txt
/api/status
/api/stracker/status
/api/stracker/tables
```

Después de subir `stracker.db3`:

```txt
/api/stracker/tables
/api/stracker/preview/NOMBRE_TABLA
```
