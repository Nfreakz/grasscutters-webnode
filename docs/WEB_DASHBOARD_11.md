# GC Deploy 11 - Web Dashboard

Este paquete añade la primera interfaz visual de Astro consumiendo la API real de stracker.

## Páginas incluidas

- `/` Home con resumen real, estado de auto-sync y actividad reciente.
- `/hotlaps` Leaderboard con filtros de piloto, coche, circuito, modo y búsqueda local.
- `/pilotos` Tabla inicial de pilotos reales desde stracker.db3.

## No cambia

- No toca el servidor Node.
- No toca la sincronización SFTP.
- No activa login.
- No modifica variables de entorno.

## Objetivo

Tener una primera capa visual útil antes de crear el área privada de pilotos.
