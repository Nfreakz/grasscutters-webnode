# GC Deploy 07A - Stracker SFTP Pull desde GTX

Este paquete replica el comportamiento del script PHP antiguo, pero en Node:

GTX Gaming -> SFTP -> Hostinger -> data/stracker/stracker.db3

No conecta al arrancar. Solo sincroniza cuando llamas a una ruta protegida por secret.

## Variables necesarias en Hostinger

NODE_ENV=production
PORT=3000
DISCORD_ENABLED=false

STRACKER_SYNC_SECRET=pon_una_clave_larga
GTX_SFTP_HOST=185.216.144.78
GTX_SFTP_PORT=8822
GTX_SFTP_USER=tu_usuario_gtx
GTX_SFTP_PASS=tu_password_gtx
GTX_STRACKER_REMOTE_PATH=185.216.144.78_9800/stracker/stracker.db3

Opcional:
STRACKER_DB_PATH=./data/stracker/stracker.db3
GTX_SFTP_TIMEOUT_MS=20000

## Rutas

Estado general:
/api/status
/api/stracker/status
/api/stracker/remote-config

Sincronizar manualmente:
/api/stracker/sync?secret=TU_SECRET

Alias compatibles con /gc-data/:
/gc-data/sync-stracker?secret=TU_SECRET
/gc-data/sync-stracker.php?secret=TU_SECRET

Consultar DB después de sincronizar:
/api/stracker/tables
/api/stracker/preview/NOMBRE_TABLA?limit=5

## Seguridad

No metas usuario, contraseña ni secret en GitHub.
Ponlos solo en las variables de entorno de Hostinger.

## Cron sugerido

Cuando funcione manualmente, crea un cron que llame cada X minutos a:
https://TU_DOMINIO/gc-data/sync-stracker?secret=TU_SECRET

