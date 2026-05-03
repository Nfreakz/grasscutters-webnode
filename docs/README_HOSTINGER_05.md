# GC deploy 05 - API modular segura

Este paquete mantiene el deploy estable de Hostinger y ordena el servidor Node por módulos.

## Activo

- Web Astro estática desde `dist`.
- Servidor Express único.
- API modular.
- Rutas de estado para web, API, Discord, stracker y pilotos.

## Todavía no activo

- Discord real.
- Lectura real de `stracker.db3`.
- Base de datos de usuarios.
- Login de pilotos.

## Rutas de prueba

- `/api/status`
- `/api/health`
- `/api/modules`
- `/api/discord/status`
- `/api/stracker/status`
- `/api/pilots`
- `/api/hotlaps`

## Variables en Hostinger

Para este paquete deja solo:

```txt
NODE_ENV=production
PORT=3000
```

Opcional, si quieres ver Discord en modo apagado explícito:

```txt
DISCORD_ENABLED=false
```

No añadas todavía `STRACKER_DB_PATH` hasta que creemos el paquete de detector de tablas.
