# Archivo Motorsport · Media Center v8.4.1

## Corrige

1. La imagen subía y se asociaba a la ficha, pero no aparecía en `/archivo` ni en la ficha pública.
   Causa probable: `/archive-media` no estaba sirviendo desde `ARCHIVE_MEDIA_DIR`.

2. El bloque de subir imagen estaba en el editor de ficha.
   Ahora vive en:

```txt
/admin/archivo/imagen-url
```

con dos pestañas:

```txt
Imagen por URL
Subir desde PC
```

## Qué cambia

- Reemplaza `src/pages/admin/archivo/imagen-url.astro`.
- Añade un montaje estático persistente en `src/server/index.ts`:

```txt
/archive-media -> ARCHIVE_MEDIA_DIR
```

- Quita el bloque de subida local del editor si estaba instalado.

## Variables recomendadas Hostinger

```env
ARCHIVE_MEDIA_DIR=/home/u303801827/gc-persistent/archive-media
ARCHIVE_MEDIA_PUBLIC_URL=/archive-media
```

Crear carpeta si no existe:

```bash
mkdir -p /home/u303801827/gc-persistent/archive-media
```

## Instalación

```bash
node scripts/patch-archivo-media-center-v841.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Move Motorsport Archive image upload to media center"
git push
```

Redeploy/restart en Hostinger.

## Prueba

1. Abre `/admin/archivo/imagen-url`.
2. Pestaña `Subir desde PC`.
3. Selecciona ficha.
4. Sube imagen y marca portada.
5. Abre `/archivo`.
6. Abre la ficha pública.
