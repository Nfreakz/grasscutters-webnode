# Archivo Motorsport · subida local de imágenes v8.4

## Qué añade

Permite subir imágenes propias desde el editor de una ficha:

```txt
/admin/archivo/editar/<id>
```

Añade un bloque:

```txt
Subir imagen propia
- seleccionar archivo desde PC
- texto alternativo
- fuente
- autor
- licencia
- marcar como portada
- bloquear como imagen buena
```

## Endpoint nuevo

```txt
POST /api/admin/archive/unified/items/:id/media/upload
```

Recibe una imagen como Data URL base64 y la guarda en:

```env
ARCHIVE_MEDIA_DIR=/home/u303801827/gc-persistent/archive-media
```

La URL pública queda con:

```env
ARCHIVE_MEDIA_PUBLIC_URL=/archive-media
```

Ejemplo:

```txt
/archive-media/glosario/apex/apex-abc123.webp
```

## Formatos permitidos

```txt
jpg
jpeg
png
webp
svg
```

Máximo por defecto:

```txt
8 MB
```

Puedes cambiarlo con:

```env
ARCHIVE_MEDIA_UPLOAD_MAX_BYTES=10485760
```

## Variables recomendadas en Hostinger

```env
ARCHIVE_MEDIA_DIR=/home/u303801827/gc-persistent/archive-media
ARCHIVE_MEDIA_PUBLIC_URL=/archive-media
```

Y asegúrate de que existe la carpeta:

```bash
mkdir -p /home/u303801827/gc-persistent/archive-media
```

## Instalación

```bash
node scripts/patch-archivo-local-image-upload-v84.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Add Motorsport Archive local image upload"
git push
```

Redeploy/restart en Hostinger.

## Prueba

1. Abre una ficha en admin.
2. Sube una imagen.
3. Marca como portada.
4. Recarga.
5. Comprueba que aparece en la galería.
6. Abre la ficha pública.
