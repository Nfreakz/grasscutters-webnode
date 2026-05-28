# GC Track Image Client Guard v1

Fecha: 2026-05-28  
Pack: `GC_Track_Image_Client_Guard_v1`

## Problema detectado

En `/combos` seguían apareciendo 404:

```txt
/images/tracks/sebring.webp
/images/tracks/phillip_island.webp
/images/tracks/hockenheim.webp
...
```

y además:

```txt
Uncaught SyntaxError: Unexpected string
gc-track-image.js:208
```

## Causa

El guard de servidor no siempre intercepta en `localhost:4321`, porque en desarrollo puede estar sirviendo Astro/Vite, no el servidor Node donde añadimos `/images/tracks/:file`.

Además el helper `gc-track-image.js` tenía un error de sintaxis y/o seguía devolviendo rutas inventadas.

## Qué hace este pack

### 1. Sobrescribe helper cliente

Crea/normaliza:

```txt
public/gc-track-image.js
public/js/gc-track-image.js
frontend/public/gc-track-image.js
frontend/public/js/gc-track-image.js
```

y cualquier archivo existente tipo:

```txt
gc-track-image*.js
```

en `public`, `frontend/public` o `src`.

### 2. Nuevo comportamiento seguro

`window.GCTrackImages.candidates(trackName)` ya no devuelve rutas inventadas.

Antes:

```txt
/images/tracks/hockenheim.webp
/images/tracks/hockenheim.jpg
...
```

Ahora:

```txt
si hay asset real conocido → usa ese
si no hay asset real       → usa SVG data URI placeholder
```

### 3. Inline guard en `/combos`

Añade un guard inline antes del Data Core primary para evitar problemas de orden de carga.

## Resultado esperado

La consola ya no debe mostrar:

```txt
Uncaught SyntaxError en gc-track-image.js
Failed to load resource 404 /images/tracks/*.webp
```

## Aplicación

```powershell
node scripts/apply-gc-track-image-client-guard-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos
```

Haz hard refresh:

```txt
Ctrl + F5
```

y revisa consola.

## Nota

Este pack no añade imágenes reales. Solo evita que la UI dispare rutas fantasma.

Más adelante se puede crear un admin para asignar imágenes reales por circuito.
