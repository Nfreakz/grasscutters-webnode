import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/gc-data': 'http://localhost:3000'
      }
    }
  }
});
