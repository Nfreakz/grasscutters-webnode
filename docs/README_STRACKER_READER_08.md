# GrassCutters Deploy 08 - Stracker Real Reader

Este paquete mantiene el servidor en un solo archivo para Hostinger, pero añade lectura real de `stracker.db3`.

## Sigue sin hacer al arrancar

- No conecta a GTX al arrancar.
- No abre SQLite al arrancar.
- No inicia Discord.
- No activa login todavía.

## Rutas principales

- `/api/status`
- `/api/stracker/status`
- `/api/stracker/tables`
- `/api/stracker/sync?secret=TU_SECRET`
- `/api/hotlaps`
- `/api/laps`
- `/api/drivers`
- `/api/pilots`
- `/api/cars`
- `/api/tracks`
- `/api/combos`
- `/api/sessions`
- `/api/activity/recent`
- `/api/stats/overview`

## Filtros de hotlaps y laps

Ejemplos:

- `/api/hotlaps?limit=50`
- `/api/hotlaps?track=spa&car=bmw`
- `/api/hotlaps?driver=dani`
- `/api/hotlaps?valid=all`
- `/api/hotlaps?group=laps`
- `/api/hotlaps?group=driver`
- `/api/hotlaps?group=driver-track`
- `/api/hotlaps?group=car-track`
- `/api/hotlaps?options=1`
- `/api/laps?sort=recent&limit=100`
- `/api/activity/recent?hours=48`

## Variables necesarias

Mantener las mismas del paquete 07A:

```env
NODE_ENV=production
PORT=3000
DISCORD_ENABLED=false
STRACKER_SYNC_SECRET=tu_secret
GTX_SFTP_HOST=185.216.144.78
GTX_SFTP_PORT=8822
GTX_SFTP_USER=tu_usuario
GTX_SFTP_PASS=tu_password
GTX_STRACKER_REMOTE_PATH=185.216.144.78_9800/stracker/stracker.db3
```

## Notas

Este lector usa `sql.js`, que ya funcionó para listar tablas. Es más seguro en Hostinger que `better-sqlite3` porque no requiere binarios nativos.
