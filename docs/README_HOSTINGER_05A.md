# GC deploy 05A - Hotfix single-file API

Este parche vuelve al esquema estable de Hostinger: un único `src/server/index.ts`, sin imports internos y sin top-level await.

Mantiene las rutas nuevas:

- `/api/status`
- `/api/health`
- `/api/modules`
- `/api/discord/status`
- `/api/stracker/status`
- `/api/pilots`
- `/api/hotlaps`
- `/api/debug/runtime`

Variables recomendadas:

- `NODE_ENV=production`
- `PORT=3000`
- `DISCORD_ENABLED=false`

No añadir todavía `APP_DB_PATH` ni `STRACKER_DB_PATH`.
