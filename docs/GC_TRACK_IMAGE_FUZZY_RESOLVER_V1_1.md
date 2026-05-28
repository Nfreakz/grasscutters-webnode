# GC Track Image Fuzzy Resolver v1.1

Fecha: 2026-05-28  
Pack: `GC_Track_Image_Fuzzy_Resolver_v1_1`

## Aclaración

El objetivo original del sistema era correcto:

```txt
Encontrar imágenes aunque el nombre del circuito no coincida exacto
y aunque la extensión sea distinta.
```

Pero sin generar 404 masivos.

## Problema

La solución anterior era demasiado conservadora: evitaba rutas fantasma, pero podía perder la búsqueda inteligente.

## Solución correcta

```txt
1. Escanear imágenes reales existentes.
2. Crear manifest:
   /gc-track-images-manifest.json
3. El cliente carga el manifest.
4. Hace fuzzy matching contra archivos reales.
5. Si encuentra imagen razonable, usa esa.
6. Si no encuentra nada, usa SVG placeholder data URI.
```

## Qué NO hace

No prueba rutas inventadas.

Mal:

```txt
/images/tracks/phillip_island_2013.webp
/images/tracks/phillip_island_2013.jpg
/images/tracks/phillip_island_2013.png
```

Bien:

```txt
manifest contiene:
  phillip_island.webp

Data Core dice:
  Phillip Island 2013

resolver:
  phillip_island_2013 ≈ phillip_island.webp
```

## Fuentes escaneadas

```txt
public/images/tracks
frontend/public/images/tracks
src/assets/tracks
src/assets/images/tracks
```

## Archivos escritos

```txt
public/gc-track-image.js
public/js/gc-track-image.js
frontend/public/gc-track-image.js
frontend/public/js/gc-track-image.js

public/gc-track-images-manifest.json
public/js/gc-track-images-manifest.json
frontend/public/gc-track-images-manifest.json
frontend/public/js/gc-track-images-manifest.json
```

## Matching

Usa:

```txt
normalización
tokens
compactación
eliminación de stopwords
aliases manuales
puntuación fuzzy
preferencia ligera por webp/jpg/png
```

Ejemplos cubiertos:

```txt
Phillip Island 2013 -> phillip_island.webp
mx_sb_day_standing  -> sebring.webp
rt_zolder           -> zolder.jpg
ve_hockenheim_gp    -> hockenheim.webp
ks_suzuka           -> suzuka.png
```

## Aplicación

```powershell
node scripts/apply-gc-track-image-fuzzy-resolver-v1-1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/gc-track-images-manifest.json
http://localhost:4321/combos
```

Luego en consola:

```js
GCTrackImages.version
GCTrackImages.assets.length
GCTrackImages.bestAsset('Phillip Island 2013')
GCTrackImages.bestAsset('mx_sb_day_standing')
```

Resultado esperado:

```txt
version = v1.1
assets.length > 0 si hay imágenes reales
bestAsset(...) devuelve un asset real o null
```

## Resultado esperado en consola

No debería haber:

```txt
Uncaught SyntaxError gc-track-image.js
404 masivos /images/tracks/*.webp
```

Si no hay imágenes reales, se verá placeholder SVG, pero sin 404.
