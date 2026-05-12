# Archivo Motorsport · Share minimal v8.3.5

## Qué cambia

Convierte el bloque de compartir en una línea minimalista:

```txt
Compartir  [copy] [whatsapp] [telegram] [x] [facebook] [linkedin] [reddit] [email]
```

Sin card, sin caja grande, sin campo de URL visible.

## Mantiene

- Iconos SVG.
- Copiar enlace.
- URL pública forzada a:

```txt
https://grasscuttersracing.com
```

aunque estés probando en local.

## Instalación

```bash
node scripts/patch-archivo-share-minimal-v835.mjs
npm run build
```

Luego:

```bash
git add .
git commit -m "Make Motorsport Archive share icons minimal"
git push
```

Redeploy/restart en Hostinger.
