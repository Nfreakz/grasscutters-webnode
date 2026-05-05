import { defineConfig } from 'astro/config';

let adapter;
try {
  const nodeModule = await import('@astrojs/node');
  adapter = nodeModule.default({
    mode: 'middleware'
  });
} catch (error) {
  // Permite arrancar Astro en local aunque aún no se haya ejecutado npm install
  // después de añadir @astrojs/node. En producción Hostinger instalará la
  // dependencia desde package.json y activará SSR para las rutas dinámicas.
  if (process.env.NODE_ENV === 'production') {
    throw error;
  }
  console.warn('[GC] @astrojs/node no está instalado todavía. Ejecuta npm install para probar build/SSR completo.');
}

export default defineConfig({
  output: 'static',
  ...(adapter ? { adapter } : {}),
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/gc-data': 'http://localhost:3000'
      }
    }
  }
});
