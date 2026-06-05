import { defineConfig } from 'astro/config';

let nodeAdapter = null;
try {
  const mod = await import('@astrojs/node');
  nodeAdapter = mod.default({ mode: 'middleware' });
} catch (error) {
  console.warn('[GC] @astrojs/node no disponible todavÃ­a. Ejecuta npm install.');
}

export default defineConfig({
  output: 'static',
  adapter: nodeAdapter || undefined,
  redirects: {
    '/campeonato/historico': '/historico',
    '/campeonato/historico/[slug]': '/historico/[slug]',
    '/campeonato/carreras-comunidad': '/carreras-comunidad',
  },
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/gc-data': 'http://localhost:3000'
      }
    }
  }
});

