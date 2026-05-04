# 23a - Force landing at root

Este parche fuerza que `/` sea la landing pública.

Archivos que deben sobrescribirse:

- `src/pages/index.astro` -> Landing pública
- `src/pages/app.astro` -> App/dashboard actual
- `src/layouts/MarketingLayout.astro` -> Layout público
- `src/styles/marketing.css` -> CSS landing

Si al abrir `/` sigue saliendo la home tipo app, el archivo `src/pages/index.astro` no se ha sobrescrito o el servidor dev no se ha reiniciado.

La landing tiene un marcador visible:

`Landing pública · GrassCutters Racing`

Así puedes comprobar rápido que está cargando la página correcta.
