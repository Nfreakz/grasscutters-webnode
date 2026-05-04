# GC Deploy 27 - Perfil Pro v2 + Admin Manager Pro

Este paquete pule dos zonas críticas de la plataforma:

- Perfil de piloto con más datos útiles y reales.
- Panel admin con edición de nombres más cómoda y trazabilidad.

## Perfil de piloto

`/perfil` ahora consume `/api/profile` con una estructura más completa:

- resumen competitivo
- ranking global por mejor vuelta
- limpieza/validity rate
- consistencia
- media de mejores 10 vueltas
- delta de mejores 10 contra mejor vuelta
- cortes totales y media
- mejores combos coche + circuito con rank del combo
- últimas vueltas con validez y velocidad máxima
- garaje por coche
- circuitos por pista

Los sectores oficiales siguen fuera porque stracker guarda `86400000` en SectorTime0/1/2, así que no se vuelven a pintar datos falsos.

## Admin

`/admin` mejora el editor de nombres visibles:

- filtro por tipo: coches, circuitos, pilotos
- búsqueda
- vista de todos / sin override / solo modificados
- guardado por fila
- guardado masivo de cambios visibles
- alias manual
- pilotos detectados en stracker sin usuario vinculado
- historial admin básico

## API nueva o ampliada

- `GET /api/admin/audit-log`
- `GET /api/admin/unlinked-pilots`
- `POST /api/admin/name-filters/bulk`

## Tabla nueva

En MySQL y SQLite se crea automáticamente:

```sql
gc_admin_audit_log
```

Registra cambios como:

- `display_name.create`
- `display_name.update`
- `display_name.delete`
- `display_names.bulk_save`
- `user.role_update`
- `user.unlink_pilot`

## Storage

Funciona con:

- `APP_STORAGE_DRIVER=mysql` en Hostinger
- `APP_STORAGE_DRIVER=sqlite` en local

No requiere cambios de variables si ya tienes el paquete 26 funcionando.
