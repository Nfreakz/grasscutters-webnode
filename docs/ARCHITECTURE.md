# Arquitectura GrassCutters Platform

## Objetivo

Crear una plataforma propia para GrassCutters que sustituya la web WordPress y centralice:

- Web pública.
- Rankings y hotlaps.
- Datos reales desde stracker.db3.
- Discord bot.
- Área privada de pilotos.
- Eventos y votaciones.

## Decisión inicial

Usar un único proceso Node.js con módulos separados.

```txt
Node único
  ├─ Astro SSR
  ├─ API /api
  ├─ Discord bot
  ├─ stracker service
  ├─ app database
  └─ módulos de dominio
```

## Por qué así

Esta estructura permite empezar simple, desplegar con menos piezas y mantener todos los módulos bajo el mismo proyecto. Si más adelante el bot o stracker necesitan independencia, se podrán separar sin rehacer la base.

## Módulos

### Web

Astro renderiza las páginas públicas y futuras páginas privadas.

### API

Express Router centralizado bajo `/api`.

### Discord bot

Módulo controlado por variables de entorno. No arranca si `DISCORD_ENABLED=false`.

### stracker

Lee `stracker.db3` como fuente externa. De momento incluye inspección de tablas y preview preparado.

### DB interna

SQLite para la app propia: pilotos, eventos, perfiles y futuras relaciones. Más adelante se puede migrar a PostgreSQL.

## Regla de oro

No meter lógica de negocio dentro de páginas Astro.

Las páginas consumen servicios o API. La lógica queda en módulos:

```txt
pages -> api/services -> db/stracker
```
