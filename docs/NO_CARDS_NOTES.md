# No-cards LFM direction

Tienes razón: LFM no se siente como una web de tarjetas flotantes.
Se siente más como:

- paneles planos
- strips de métricas
- tablas densas
- filas de datos
- navegación/product shell
- menos esquinas redondeadas
- menos sombras
- más estructura horizontal

## Qué hace este parche

Este paquete elimina la sensación de card en toda la base visual:
- `.card`, `.panel`, `.summary-card`, etc. pasan a ser paneles planos
- métricas en formato strip
- tablas más densas
- CTA más sobrios
- layout más producto / competición

## Importante

Si después de esto todavía hay páginas que "parecen cards", el problema ya no será de CSS base, sino del HTML/Astro de esas páginas.
En ese caso el siguiente paso correcto es rehacer la composición de:
- Home
- Hotlaps
- Perfil
- Login

No seguir maquillando CSS.
