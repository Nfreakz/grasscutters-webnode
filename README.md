# GrassCutters Node + Astro Base 01

Primer paquete base para trasladar GrassCutters desde WordPress a una plataforma propia con Astro y un único Node.js.

## Qué incluye

- Astro configurado para SSR con `@astrojs/node` en modo `middleware`.
- Servidor Node único en `src/server/index.ts`.
- API interna en `/api`.
- Módulo Discord bot preparado, desactivado por defecto.
- Módulo stracker preparado para leer `data/stracker/stracker.db3`.
- Base SQLite interna para pilotos y eventos en `data/app`.
- Páginas iniciales: home, hotlaps y área de pilotos.
- Estructura preparada para crecer por módulos.

## Copia recomendada

Copia el contenido de este paquete encima de tu proyecto `grasscutters-node`.

Si pregunta por reemplazar estos archivos, acepta:

- `package.json`
- `astro.config.mjs`
- `tsconfig.json`
- `.gitignore`

## Estructura principal

```txt
src/
  api/          Rutas API
  auth/         Sesiones y autenticación
  bot/          Bot Discord
  config/       Variables de entorno
  db/           DB interna de la app
  events/       Eventos y calendario
  layouts/      Layouts Astro
  pages/        Páginas Astro
  rankings/     Rankings y leaderboard
  server/       Servidor Node único
  shared/       Logger y utilidades
  stracker/     Lectura/normalización stracker.db3
  styles/       CSS global
  types/        Tipos compartidos
```

## Variables

Copia `.env.example` como `.env` y edita valores cuando toque.

Por defecto el bot está desactivado:

```env
DISCORD_ENABLED=false
```

Para activarlo más adelante:

```env
DISCORD_ENABLED=true
DISCORD_TOKEN=token_real
DISCORD_CHANNEL_ID=canal_real
```

## Endpoints iniciales

```txt
/api/health
/api/status
/api/stracker/tables
/api/hotlaps
/api/leaderboard
/api/pilots
/api/pilots/me
/api/events/upcoming
```

## Notas importantes

En desarrollo, Astro sigue siendo más cómodo con su servidor de desarrollo normal.

En producción, este proyecto está preparado para servir Astro desde el mismo Node después de generar `dist`, usando la salida `dist/server/entry.mjs` del adaptador Node en modo middleware.

## Próximo paquete recomendado

Base 02 debería añadir:

- Conexión real a tablas de `stracker.db3`.
- Detector de esquema de stracker.
- Endpoints reales de leaderboard.
- Mapeo de pilotos, coches y circuitos.
- Primer diseño visual del dashboard de pilotos.
