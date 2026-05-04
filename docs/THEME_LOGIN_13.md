# GC Deploy 13 - Paletas, CSS organizado y login fase 1

## Qué añade

- Selector de paleta global en el menú.
- Paletas disponibles: Grass, Ocean, Violet, Amber, Crimson y Mono.
- La paleta se guarda en `localStorage` con la clave `gc-theme`.
- CSS reorganizado por capas para no tener que buscar colores archivo por archivo.
- Login fase 1 en modo desarrollo: selecciona un piloto real desde `/api/pilots` y crea una sesión local.
- Perfil preparado para leer esa sesión local y mostrar datos reales del piloto elegido.

## Estructura CSS nueva

```txt
src/styles/
  global.css        -> solo importa el resto
  00-tokens.css     -> paletas, colores, radios, sombras, tamaños globales
  01-base.css       -> reset/base HTML/body
  02-layout.css     -> header, nav, grid, footer, estructura principal
  03-components.css -> botones, cards, formularios, tablas, selector de tema
  04-pages.css      -> hero, auth, perfil y layouts concretos de páginas
  05-utilities.css  -> helpers pequeños
```

## Para cambiar la paleta global

Edita solo `src/styles/00-tokens.css`.

La paleta principal es:

```css
:root,
html[data-theme='grass'] {
  --gc-accent: #6dff9c;
  --gc-accent-2: #16c966;
  --gc-highlight: #f7ff7a;
}
```

## Para añadir una nueva paleta

1. Duplica un bloque `html[data-theme='...']` en `00-tokens.css`.
2. Añade un botón en `src/components/ThemeSelector.astro`.
3. Añade el nombre al objeto `labels` y al array `allowed` de `BaseLayout.astro`.

## Login fase 1

El login todavía no es seguridad real. Es un modo de trabajo local para diseñar el área privada usando datos reales de stracker.

Flujo actual:

```txt
/login
  carga /api/pilots
  eliges piloto
  guarda sesión local gc-dev-session
  redirige a /perfil

/perfil
  lee gc-dev-session
  muestra stats del piloto
```

## Siguiente fase recomendada

- Crear DB propia de usuarios.
- Crear tablas `users`, `pilot_links`, `sessions`.
- Añadir contraseña con hash seguro.
- Vincular usuario web con `Players.SteamGuid` de stracker.
- Más adelante, Discord OAuth.
