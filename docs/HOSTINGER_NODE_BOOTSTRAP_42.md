# Pack 42 - Hostinger Node bootstrap

Este pack añade `server.cjs`, un arranque seguro para Hostinger.

Motivo: la app real está en `src/server/index.ts`. En local funciona con `tsx`, pero Hostinger a veces intenta arrancar el archivo de entrada directamente con Node. `server.cjs` arranca `src/server/index.ts` usando el `tsx` local de `node_modules`.

Configuración recomendada en Hostinger:

- Directorio raíz: `./`
- Comando de compilación: `npm run build`
- Directorio de salida: `./`
- Archivo de entrada: `server.cjs`
- Node: 22.x

Comprobaciones después del redeploy:

- `/api/status`
- `/api/runtime/status`
- `/api/mysql/status`
- `/admin`
- `/hotlaps`

Si `/api/status` sigue en 503, el servidor Node no está arrancando. Revisa los logs de runtime de Hostinger y busca líneas que empiecen por `[GC bootstrap]` o `[GC]`.
