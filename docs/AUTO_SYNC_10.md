# Paquete 10 - Auto-sync stracker cada 5 minutos

Este paquete mantiene el servidor single-file que funciona en Hostinger y añade una tarea interna para sincronizar `stracker.db3` desde GTX por SFTP.

## Variables nuevas

```env
STRACKER_AUTO_SYNC_ENABLED=true
STRACKER_AUTO_SYNC_INTERVAL_MINUTES=5
STRACKER_AUTO_SYNC_INITIAL_DELAY_SECONDS=30
```

También deben seguir configuradas las variables SFTP:

```env
STRACKER_SYNC_SECRET=...
GTX_SFTP_HOST=185.216.144.78
GTX_SFTP_PORT=8822
GTX_SFTP_USER=...
GTX_SFTP_PASS=...
GTX_STRACKER_REMOTE_PATH=185.216.144.78_9800/stracker/stracker.db3
```

## Rutas de prueba

```txt
/api/status
/api/stracker/status
/api/stracker/auto-sync/status
/api/stracker/auto-sync/run?secret=TU_SECRET
```

## Funcionamiento

- No sincroniza durante el arranque inmediato.
- Espera `STRACKER_AUTO_SYNC_INITIAL_DELAY_SECONDS` antes de la primera sincronización.
- Luego sincroniza cada `STRACKER_AUTO_SYNC_INTERVAL_MINUTES`.
- Si falla una sincronización, no tumba la web.
- Si ya hay una sync en curso, evita solaparse.
- Sigue existiendo la sync manual protegida por secret.

## Nota

Si Hostinger reinicia la app, el contador de auto-sync vuelve a cero y la siguiente sincronización se programa otra vez con el delay inicial.
