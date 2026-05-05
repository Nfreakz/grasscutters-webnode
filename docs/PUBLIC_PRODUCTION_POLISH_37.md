# Pack 37 - Public production polish

## Problema corregido

Las páginas públicas podían quedarse sin CSS porque se mezclaron dos sistemas de clases:

- páginas antiguas con clases `mk-*`
- CSS nuevo con clases `gc-public-*`

Además, `MarketingLayout.astro` enlazaba CSS con:

```html
<link rel="stylesheet" href="/src/styles/marketing.css" />
```

Eso no es buena práctica en Astro para producción. Ahora el CSS se importa desde el layout:

```astro
import '../styles/marketing.css';
```

Astro lo empaqueta correctamente en local y en producción.

## Cambios

- Header público actualizado y con rutas reales.
- Páginas públicas rehechas con una misma familia de clases.
- `/datos` queda fuera del header principal.
- `/datos` pasa a ser ficha técnica / arquitectura, útil para portfolio y documentación.
- `/estado` sigue siendo estado público de servicios.
- Discord y App Android se mantienen fuera del control panel.

## Páginas públicas

- `/`
- `/comunidad`
- `/discord`
- `/app-android`
- `/estado`
- `/datos` desde footer
- `/404`

## Plataforma

No cambia el control panel. La parte interna sigue siendo:

- `/app`
- `/hotlaps`
- `/combos`
- `/pilotos`
- `/perfil`
- `/admin`
