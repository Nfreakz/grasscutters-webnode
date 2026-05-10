ACSM Discovery Script
=====================

Este script intenta localizar archivos útiles de Assetto Corsa Server Manager.
No cambia nada. Solo lee/lista y genera un informe.

Busca:
- config.yml
- server-manager.db / *.db / *.sqlite / *.db3
- cfg/server_cfg.ini
- cfg/entry_list.ini
- carpetas championship, championships, race-weekends, events, results
- posibles tablas SQLite relacionadas con calendar, championship, events, scheduled, race_weekend, server, car, track

Uso:
node scripts/acsm_discover.cjs
