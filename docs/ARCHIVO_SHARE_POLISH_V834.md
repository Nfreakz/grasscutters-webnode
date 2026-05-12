# Archivo Motorsport · Share polish v8.3.4

## Corrige

- Mejora visual del bloque de compartir.
- Añade iconos SVG pequeños por red.
- Fuerza URL pública con dominio:

```txt
https://grasscuttersracing.com
```

Así, aunque estés probando en local, el campo copiar ya no muestra:

```txt
http://localhost:4321/...
```

- Mantiene el bloque solo en ficha pública.
- Elimina restos de share en admin editor si quedaban.

## Archivos

```txt
public/gc-archivo-share-v832.js
public/gc-archivo-share-v832.css
scripts/patch-archivo-share-polish-v834.mjs
```

## Instalación

```bash
node scripts/patch-archivo-share-polish-v834.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Polish Motorsport Archive share block"
git push
```

Redeploy/restart en Hostinger.

## Prueba

Abre una ficha pública:

```txt
/archivo/glosario/apex/
```

Debe mostrar URL:

```txt
https://grasscuttersracing.com/archivo/glosario/apex/
```
