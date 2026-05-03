import { defineConfig } from 'astro/config';

// Deploy inicial Hostinger:
// Generamos la web como estática y la servimos desde un único Node/Express.
// Más adelante volveremos a SSR/middleware cuando la base esté estable en hosting.
export default defineConfig({
  output: 'static'
});
