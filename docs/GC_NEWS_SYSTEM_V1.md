# GC News System v2 · Noticias

## Objetivo

Sistema de noticias persistente para GrassCutters WebNode.

- editable desde `/admin/noticias`
- persistente en Hostinger
- sin enlace público en menús
- página pública oculta en `/noticias`
- integración con el bloque `Noticias` de `/home2`

## Persistencia

El sistema usa MySQL si está activo:

```env
APP_STORAGE_DRIVER=mysql
```

o si se define explícitamente:

```env
NEWS_STORAGE_DRIVER=mysql
```

Tabla creada automáticamente:

```txt
gc_news_posts
```

Si no hay MySQL, usa JSON persistente:

```txt
NEWS_DATA_PATH
APP_NEWS_PATH
APP_DATA_DIR/app/news-posts.json
data/app/news-posts.json
```

En Hostinger, lo recomendado es MySQL o `APP_DATA_DIR` fuera de la carpeta de deploy.

## Rutas admin

```txt
/admin/noticias
/api/admin/news
/api/admin/news/:id
/api/admin/news/demo
```

Las rutas admin usan la sesión admin existente (`gc_session`) mediante `requireAdmin`.

## Rutas públicas ocultas

```txt
/noticias
/api/noticias
/api/noticias/:slug
```

No se añade ningún enlace a menús.

## Integración home2

`/home2` ahora intenta cargar noticias desde:

```txt
/api/noticias?limit=4&featured=1
```

Si no hay API disponible, conserva fallback a:

```txt
/data/home2-news.json
```

## Patch automático del servidor

Se añade:

```txt
scripts/patch-news-system.mjs
```

Y se ejecuta antes de `dev:server` y antes de `build`.

El patch inserta en `src/server/index.ts`:

```ts
import { registerNewsRoutes } from './news-routes';
registerNewsRoutes(app, { rootDir, requireAdmin });
```

## No toca

- sistema de avatares
- Archivo GC
- Top Combo
- Timing Sheet
- Estado del servidor
- mugello_mapa.png


## v2

Cambios respecto a v1:

```txt
/paddock-wire eliminado
/noticias como slug correcto
/api/noticias añadido como alias público
/api/admin/news/image-upload añadido para subir imágenes
/admin/noticias permite seleccionar archivo de imagen
/noticias usa estética home2
```

## Imágenes

Endpoint:

```txt
POST /api/admin/news/image-upload
```

Guarda en:

```txt
NEWS_MEDIA_DIR
ARCHIVE_MEDIA_DIR
public/uploads/news
```

URL pública:

```txt
NEWS_MEDIA_PUBLIC_BASE
ARCHIVE_MEDIA_PUBLIC_BASE
/uploads/news
```
