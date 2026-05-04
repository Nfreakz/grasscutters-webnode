# LFM-inspired redesign

Este parche no intenta clonar Low Fuel Motorsport píxel por píxel.
La idea es llevar la web a un lenguaje visual parecido:

- dark UI muy marcada
- look de dashboard de competición
- acentos neon/lime + cyan
- cards más técnicas y compactas
- tablas con sensación de telemetría
- navegación de producto serio/competitivo

## Dónde tocar cosas en el futuro

- `src/styles/00-tokens.css` → colores, radios, sombras, tema base
- `src/styles/02-layout.css` → header, hero, layout general
- `src/styles/03-components.css` → cards, tablas, botones, formularios
- `src/styles/04-pages.css` → ajustes por página

## Recomendación

Haz primero una pasada visual general y luego una segunda de detalle sobre:
- Home
- Hotlaps
- Perfil
- Login
- Tracker

Si quieres, el siguiente paquete puede atacar ya el HTML/Astro de esas páginas para que no solo cambie el CSS, sino también la composición visual.
