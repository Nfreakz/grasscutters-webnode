# GC Archive Core Skeleton v1

Fecha: 2026-05-28  
Pack: `GC_Archive_Core_Skeleton_v1`

## Objetivo

Crear una capa pública separada para archivo/media/fichas, sin mezclarla con:

```txt
Race Data Core = Stracker
Championship Core = ACSM/campeonato
```

## Endpoints añadidos

```txt
GET /api/gc/archive/snapshot
GET /api/gc/archive/latest
```

## Fuente inicial

El skeleton puede leer una fuente pública si se configura:

```env
GC_ARCHIVE_CORE_SOURCE_URL=https://...
```

Si no está configurada, devuelve:

```json
{
  "ok": true,
  "warnings": [
    "GC_ARCHIVE_CORE_SOURCE_URL not configured. Archive Core skeleton is active but has no public source yet."
  ],
  "items": []
}
```

Esto es intencional: no se usan endpoints admin como fuente pública.

## Por qué no usa `/api/admin/archive/unified`

Ese endpoint pertenece al panel admin. Aunque exista, no debe convertirse en fuente pública directa.

Regla:

```txt
Admin escribe/gestiona.
Archive Core expone versión pública segura.
```

## `/api/gc/archive/snapshot`

Devuelve resumen:

```json
{
  "summary": {
    "total": 0,
    "public": 0,
    "featured": 0,
    "byCategory": {},
    "latest": [],
    "featuredItems": []
  }
}
```

## `/api/gc/archive/latest`

Parámetros:

```txt
limit=6
category=all
q=texto
search=texto
```

## Item público normalizado

```json
{
  "id": "abc",
  "slug": "ficha",
  "title": "Título",
  "summary": "Resumen",
  "category": "general",
  "type": "general",
  "status": "published",
  "imageUrl": "/...",
  "url": "/archivo/ficha",
  "publishedAt": "...",
  "updatedAt": "...",
  "source": "archive-core",
  "tags": []
}
```

## Qué NO toca

```txt
Race Data Core
Championship Core
Stracker
ACSM
admin archive
media uploads
UI pública
/pitwall
/app
/hotlaps
/combos
```

## Aplicación

```powershell
node scripts/apply-gc-archive-core-skeleton-v1.cjs
npm run build
npm run dev
```

## Pruebas

```txt
http://localhost:4321/api/gc/archive/snapshot
http://localhost:4321/api/gc/archive/latest
```

Si devuelve warning de fuente no configurada, el skeleton está bien.

## Próximo paso

Cuando decidamos qué datos públicos del archivo se quieren mostrar:

1. Crear endpoint público real desde los módulos de archivo.
2. Apuntar `GC_ARCHIVE_CORE_SOURCE_URL` o conectar internamente Archive Core a ese lector.
3. Usar `/api/gc/archive/latest` en home/pitwall sin tocar admin.
