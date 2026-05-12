# Archivo Motorsport · Public MySQL + Share Public Only v8.3.3

## Problemas corregidos

1. `/archivo` no mostraba fichas publicadas desde Hostinger porque seguía usando helpers antiguos/JSON.
2. `/archivo/[category]/[slug]` leía `data/app/motorsport-archive.json`, por eso no encontraba fichas guardadas en MySQL.
3. El bloque grande de compartir aparecía en admin, pero debe aparecer en la ficha pública.
4. La URL pública de glosario podía salir mal si se calculaba desde admin.

## Qué añade/cambia

Nuevo helper:

```txt
src/lib/motorsport-archive/public-data.ts
```

Lee:

```txt
ARCHIVE_STORAGE_DRIVER=mysql
APP_STORAGE_DRIVER=mysql
MYSQL_*
```

y normaliza categorías:

```txt
glosario -> /archivo/glosario/<slug>/
circuitos -> /archivo/circuitos/<slug>/
pilotos -> /archivo/pilotos/<slug>/
```

Reemplaza:

```txt
src/pages/archivo.astro
src/pages/archivo/[category]/[slug].astro
```

El bloque de compartir se mantiene solo en ficha pública.

## Instalación

```bash
node scripts/patch-archivo-public-mysql-share-v833.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Fix Motorsport Archive public MySQL pages and share block"
git push
```

Redeploy/restart en Hostinger.

## Prueba

1. Publica una ficha en admin.
2. Abre:

```txt
/archivo
```

Debe aparecer.

3. Abre:

```txt
/archivo/glosario/apex/
```

Debe cargar la ficha.

4. El bloque de compartir debe aparecer ahí, no en admin.
