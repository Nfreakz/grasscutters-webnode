import { defineConfig } from 'astro/config';

// Deploy Hostinger estable:
// Astro genera web estática y Express la sirve desde dist.
// El servidor Node queda preparado para API, Discord, stracker y usuarios por módulos.
export default defineConfig({
  output: 'static'
});
