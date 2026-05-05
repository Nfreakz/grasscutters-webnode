# Pack 41 - Hostinger Astro runtime V3

Este parche separa tres capas dentro del servidor Express:

1. APIs propias (`/api`, `/gc-data`)
2. HTML estático de Astro (`dist/client/admin/index.html`, etc.)
3. SSR de Astro (`dist/server/entry.mjs`) para rutas dinámicas

Añade `/api/runtime/status` para diagnosticar qué carpetas ve Node en Hostinger.

Configuración recomendada en Hostinger:

- Directorio raíz: `./`
- Comando de compilación: `npm run build`
- Gestor: `npm`
- Archivo de entrada: `src/server/index.ts`
- Directorio de salida: `./`
- Node: 22.x
