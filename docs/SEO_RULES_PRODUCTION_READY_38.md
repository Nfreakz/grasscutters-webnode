# Pack 38 - SEO, normas y preparación de producción

## Añadido

- Metadatos SEO en `MarketingLayout.astro`.
- Open Graph y Twitter Cards.
- Canonical URL basada en `PUBLIC_SITE_URL`.
- `robots.txt` dinámico.
- `sitemap.xml` dinámico.
- `site.webmanifest`.
- Imagen social base en `public/og/grasscutters-og.svg`.
- Página pública `/normas`.
- Página pública `/privacidad`.
- Enlaces a normas y privacidad en footer.
- Skip link accesible para navegación por teclado.

## Variable recomendada en producción

```env
PUBLIC_SITE_URL=https://grasscuttersracing.com
```

En el dominio temporal de Hostinger puedes usar:

```env
PUBLIC_SITE_URL=https://papayawhip-elephant-736209.hostingersite.com
```

Cuando migres al dominio final, cambia solo esa variable.

## Nota

La página de privacidad es una estructura operativa y debe revisarse antes de abrir registros públicos estables.
