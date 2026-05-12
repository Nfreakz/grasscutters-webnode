# Archivo Motorsport · import/delete fix v8.2.3

## Corrige

1. Las fichas importadas sin media/SVG porque el CSV usa columnas distintas.
2. La imposibilidad de borrar fichas importadas en MySQL.
3. El estado al importar:
   - publicar desmarcado -> `draft`
   - publicar marcado -> `published`

## Nuevos endpoints

```txt
POST   /api/admin/archive/import-csv-web-v823
DELETE /api/admin/archive/mysql-hard-delete-v823/:id
```

## Columnas de imagen/SVG reconocidas

Además de `imagen_1_url`, ahora reconoce:

```txt
imagen_url
image_url
foto_url
photo_url
svg_url
svg
mapa_url
track_map_url
layout_svg
circuito_svg
image
imagen
foto
photo
```

Y también:

```txt
imagen_1_url
image_1_url
media_1_url
svg_1_url
```

hasta 8 imágenes.

## Actualizar las 11 fichas ya importadas

Como ya existen, para rellenar media/SVG debes marcar:

```txt
Actualizar existentes
```

En `/admin/archivo/importar`.

Si quieres que queden como borrador:

```txt
Solo probar: desmarcado
Publicar directamente: desmarcado
Actualizar existentes: marcado
```

La respuesta debe decir:

```json
"forcedStatus": "draft"
```

y las muestras deben enseñar `media: 1` o más si detecta imagen/SVG.

## Instalación

```bash
node scripts/patch-archivo-import-delete-v823.mjs
npm run build
```

Luego commit, push y redeploy.
