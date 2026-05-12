# Archivo Motorsport · Media Manager v8.4.2

## Corrige

1. El menú/página ya no debe decir `Imagen URL`.
   Se actualiza a `Imágenes`.

2. La página `/admin/archivo/imagen-url` ya no usa tabs raros.
   Ahora muestra dos bloques claros:

```txt
Añadir por URL
Subir desde PC
```

3. Las imágenes de portada no aparecían bien en `/archivo` y en la ficha pública.
   Se refuerza:

```txt
src/lib/motorsport-archive/public-data.ts
```

para leer `media[]`, `coverUrl`, `url`, `localUrl`, `/archive-media/...`.

4. En editar ficha se añade gestor de imágenes:

```txt
- editar alt/fuente/autor/licencia
- marcar portada
- borrar imagen
```

## Nuevos endpoints

```txt
PATCH  /api/admin/archive/unified/items/:id/media/:mediaId
DELETE /api/admin/archive/unified/items/:id/media/:mediaId
```

## Instalación

```bash
node scripts/patch-archivo-media-manager-v842.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Add Motorsport Archive media manager"
git push
```

Redeploy/restart en Hostinger.

## Prueba

1. `/admin/archivo/imagen-url`
   - Debe llamarse Imágenes.
   - Debe mostrar dos bloques, no tabs.

2. `/admin/archivo/editar/<id>`
   - Debe aparecer “Imágenes de la ficha”.
   - Puedes marcar portada, guardar créditos o borrar.

3. `/archivo`
   - Debe mostrar portada.

4. `/archivo/<categoria>/<slug>/`
   - Debe mostrar portada y galería.
