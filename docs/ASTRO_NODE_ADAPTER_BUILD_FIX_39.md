# GC Deploy 39 - Astro Node Adapter Build Fix

## Problema corregido

Hostinger fallaba en `npm run build` con:

```txt
[NoAdapterInstalled] Cannot use server-rendered pages without an adapter.
```

Esto ocurre porque ahora existen rutas dinámicas/server-rendered como:

```txt
/pilotos/[id]
/combos/[comboId]
```

Astro no puede compilar esas páginas para producción sin un adapter.

## Cambios

### package.json

Añade:

```json
"@astrojs/node": "latest"
```

### astro.config.mjs

Cambia a:

```js
output: 'hybrid',
adapter: node({ mode: 'middleware' })
```

`hybrid` permite mantener páginas públicas prerenderizadas y renderizar bajo demanda las rutas dinámicas de la plataforma.

## Después de aplicar

1. Copiar archivos encima del proyecto.
2. Hacer commit.
3. Push.
4. Hostinger instalará `@astrojs/node` y el build debería pasar.

## Nota

El servidor Express existente sigue siendo el punto principal de arranque con:

```json
"start": "tsx src/server/index.ts"
```

Si Hostinger compila correctamente pero alguna ruta dinámica pública no carga en producción, el siguiente ajuste será montar el handler SSR de Astro dentro del servidor Express. Este pack corrige primero el bloqueo de build.
