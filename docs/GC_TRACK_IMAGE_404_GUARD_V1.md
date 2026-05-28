# GC Track Image 404 Guard v1

Fecha: 2026-05-28  
Pack: `GC_Track_Image_404_Guard_v1`

## Problema detectado

Después de pasar `/combos` a Data Core primary, la consola se llenaba de errores:

```txt
Failed to load resource: 404
/images/tracks/hockenheim.jpg
/images/tracks/phillip_island.webp
/images/tracks/rt_zolder.jpg
...
```

La página funcionaba, pero cada card intentaba varias rutas de imagen posibles y generaba ruido, carga inútil y mala señal para producción.

## Objetivo

Evitar 404 masivos en imágenes de circuito.

## Qué añade

### 1. Endpoint de diagnóstico

```txt
GET /api/gc/assets/tracks
```

Devuelve las imágenes reales encontradas en:

```txt
public/images/tracks
frontend/public/images/tracks
dist/client/images/tracks
dist/images/tracks
```

Ejemplo:

```json
{
  "ok": true,
  "count": 4,
  "items": [
    {
      "file": "mugello.webp",
      "url": "/images/tracks/mugello.webp"
    }
  ]
}
```

### 2. Fallback seguro para imágenes

```txt
GET /images/tracks/:file
```

Si la imagen existe, la sirve.

Si no existe, devuelve un SVG ligero con estado:

```txt
Track image pending
```

en vez de 404.

## Por qué se hace en servidor

Porque el cliente no puede saber con seguridad qué imágenes existen en producción. Si la UI adivina rutas, genera 404.

Con este guard:

```txt
imagen real existe    → 200 imagen real
imagen no existe      → 200 SVG fallback
nombre inválido       → 400 SVG fallback
```

## Qué NO toca

```txt
Race Data Core
Combos Data Core
Hotlaps
App
Pitwall
Admin UI
assets reales
home
```

## Aplicación

```powershell
node scripts/apply-gc-track-image-404-guard-v1.cjs
npm run build
npm run dev
```

## Pruebas

```txt
http://localhost:4321/api/gc/assets/tracks
http://localhost:4321/images/tracks/hockenheim.jpg
http://localhost:4321/combos
```

## Resultado esperado

La consola ya no debería mostrar 404 masivos de:

```txt
/images/tracks/*.jpg
/images/tracks/*.webp
/images/tracks/*.png
```

Si falta la imagen real, se verá el placeholder SVG.

## Siguiente mejora opcional

Más adelante se puede crear un selector/admin de imágenes de circuito para asignar cada track a una imagen real, en vez de depender de nombres de archivo.
