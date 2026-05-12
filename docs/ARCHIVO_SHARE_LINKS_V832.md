# Archivo Motorsport · Social share links v8.3.2

## Qué añade

Bloque de compartir ficha en páginas públicas del Archivo Motorsport:

- Copiar enlace
- WhatsApp
- Telegram
- X / Twitter
- Facebook
- LinkedIn
- Reddit
- Email

Y en el editor admin añade un bloque para copiar la URL pública de la ficha.

## Nota sobre Discord

Discord no tiene una URL universal de compartir como WhatsApp o Telegram. Para Discord se usa el botón:

```txt
Copiar enlace
```

y luego se pega en el canal.

## Archivos añadidos

```txt
public/gc-archivo-share-v832.js
public/gc-archivo-share-v832.css
scripts/patch-archivo-share-links-v832.mjs
```

## Archivos tocados por el patch

```txt
src/pages/archivo/[category]/[slug].astro
src/pages/admin/archivo/editar/[id].astro
```

## Instalación

```bash
node scripts/patch-archivo-share-links-v832.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Add Motorsport Archive share links"
git push
```

Redeploy/restart en Hostinger.

## Prueba

Abre una ficha pública:

```txt
/archivo/glosario/apex/
```

Debe aparecer el bloque “Compartir ficha”.

Abre una ficha admin:

```txt
/admin/archivo/editar/<id>
```

Debe aparecer “Compartir ficha pública” con copiar enlace.
