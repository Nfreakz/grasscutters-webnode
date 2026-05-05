import { defineConfig } from 'astro/config';

let nodeAdapter = null;
try {
  const mod = await import('@astrojs/node');
  nodeAdapter = mod.default({ mode: 'middleware' });
} catch (error) {
  console.warn('[GC] @astrojs/node no disponible todavía. Ejecuta npm install.');
}

export default defineConfig({
  output: 'static',
  adapter: nodeAdapter || undefined,
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/gc-data': 'http://localhost:3000'
      }
    }
  }
});
