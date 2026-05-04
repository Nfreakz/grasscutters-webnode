# Paquete 15 - Perfil Pro

Este paquete convierte `/perfil` en un panel privado real para el piloto vinculado.

## Añade

- Endpoint `GET /api/profile` protegido por sesión.
- Resumen del piloto vinculado desde `stracker.db3`.
- Mejor vuelta, vueltas válidas, porcentaje de limpieza y consistencia.
- Velocidad máxima, ranking global por mejor vuelta y última actividad.
- Mejores combos coche + circuito.
- Últimas vueltas.
- Garaje usado y circuitos corridos con barras visuales.
- Mejores sectores.
- Vincular/desvincular piloto desde la misma página.

## Archivos incluidos

- `src/server/index.ts`
- `src/pages/perfil.astro`
- `src/styles/04-pages.css`
- `src/styles/03-components.css`

## Pruebas locales

1. Arranca la web con `npm run dev`.
2. Abre `/perfil`.
3. Inicia sesión si hace falta.
4. Vincula un piloto real.
5. Comprueba `GET /api/profile`.

## Importante

El paquete mantiene el servidor en single-file porque Hostinger ya está confirmado estable con esta estructura.
