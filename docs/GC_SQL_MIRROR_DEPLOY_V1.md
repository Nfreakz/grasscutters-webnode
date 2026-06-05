# GC SQL Mirror Deploy v1

Guía interna para desplegar el mirror sTracker en Hostinger sin activar automatismos.

## Objetivo

- Local usa SQLite.
- Producción usa MySQL.
- `stracker.db3` queda solo como fuente de sincronización/importación.
- No activar todavía automatismos de rating, ACSM ni nada relacionado con procesado automático.

## Variables online

Configura al menos una de estas parejas:

- `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- o `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

Opcionales:

- `MYSQL_PORT`
- `DB_PORT`
- `MYSQL_CONNECTION_LIMIT`
- `GC_STRACKER_MIRROR_DRIVER=mysql` para forzar MySQL

Regla del selector:

- si `GC_STRACKER_MIRROR_DRIVER=mysql`, usa MySQL
- si `GC_STRACKER_MIRROR_DRIVER=sqlite`, usa SQLite
- si no se define, usa MySQL cuando detecta credenciales válidas
- si no hay credenciales MySQL, usa SQLite local

## Endpoints de prueba

- `GET /api/gc/ratings/stracker-sql-diagnostics`
- `POST /api/gc/ratings/sync-stracker-sql`
- `GET /api/gc/ratings/stracker-candidates`
- `GET /api/hotlaps`
- `GET /api/gc/leaderboard`
- `GET /api/gc/ratings/event/stracker:XXX`

## Orden de prueba online

1. Abrir `GET /api/gc/ratings/stracker-sql-diagnostics`
2. Confirmar `mirrorDriver: "mysql"`
3. Confirmar `mysqlConfigured: true`
4. Confirmar `dbName` correcto
5. Confirmar que las tablas existen
6. Ejecutar `POST /api/gc/ratings/sync-stracker-sql`
7. Verificar que `sessionsImported` y el `latestSync.status` son correctos
8. Comprobar `GET /api/gc/ratings/stracker-candidates`
9. Comprobar `GET /api/hotlaps`
10. Comprobar `GET /api/gc/leaderboard`
11. Comprobar un detalle `GET /api/gc/ratings/event/stracker:XXX`

## Sincronización manual

Desde admin o con una llamada autorizada:

- `POST /api/gc/ratings/sync-stracker-sql`

La sync lee `stracker.db3`, normaliza y guarda el mirror en MySQL o SQLite según el driver activo.

## Qué no activar todavía

- No activar automatismos de rating
- No tocar ACSM automático
- No cambiar `/campeonato`
- No cambiar `/ratings`
- No cambiar header
- No reactivar noticias
- No quitar el fallback manual con `?fallback=1`

## Notas

- En producción no hace falta publicar `data/gc-stracker-mirror/stracker-mirror.sqlite` si MySQL está configurado.
- El mirror SQLite local solo es para desarrollo sin MySQL.
- `stracker.db3` no debe usarse como lectura pública directa; solo como origen de sync.
