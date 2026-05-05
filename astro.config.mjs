import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // La plataforma tiene rutas dinámicas como /pilotos/[id] y /combos/[comboId].
  // En producción Astro necesita un adapter para poder renderizarlas bajo demanda.
  output: 'hybrid',
  adapter: node({
    mode: 'middleware'
  }),
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/gc-data': 'http://localhost:3000'
      }
    }
  }
});
