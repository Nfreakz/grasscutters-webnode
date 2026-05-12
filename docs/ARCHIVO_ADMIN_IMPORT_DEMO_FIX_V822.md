# Archivo Motorsport · import/demo hotfix v8.2.2

## Corrige

1. El botón de demo seguía llamando a la ruta antigua y mostraba:

```txt
Archivo Motorsport API desactivada en producción...
```

Ahora el JS fuerza el botón a usar:

```txt
POST /api/admin/archive/mysql-demo-safe-v822
```

2. El importador CSV podía respetar estados del CSV o confundirse con rutas previas.

Ahora el endpoint nuevo fuerza estado:

```txt
publish=false -> draft
publish=true  -> published
```

Endpoint nuevo:

```txt
POST /api/admin/archive/import-csv-web-v822
```

## Instalación

```bash
node scripts/patch-archivo-admin-import-demo-v822.mjs
npm run build
```

Luego commit/push/redeploy.

## Pruebas

### Demo

```txt
/admin/archivo/nuevo
```

Pulsa Crear demo. Debe crear borradores.

### Import

```txt
/admin/archivo/importar
```

- Solo probar marcado: no escribe.
- Publicar directamente desmarcado: crea `draft`.
- Publicar directamente marcado: crea `published`.

La respuesta incluye:

```json
"forcedStatus": "draft"
```

o:

```json
"forcedStatus": "published"
```
