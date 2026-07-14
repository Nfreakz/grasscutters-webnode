import { defineConfig } from 'astro/config';

const gcDevApiTarget = process.env.GC_DEV_API_TARGET || 'http://127.0.0.1:3000';

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
  },
  vite: {
    server: {
      proxy: {
        '/api': gcDevApiTarget,
        '/gc-data': gcDevApiTarget
      }
    }
  }
});

