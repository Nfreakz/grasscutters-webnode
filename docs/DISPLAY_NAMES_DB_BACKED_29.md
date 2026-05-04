# Pack 29 - Filtros de nombres 100% DB-backed

Este paquete corrige la persistencia de los alias/filtros de nombres.

## Problema corregido

En producción, con `APP_STORAGE_DRIVER=mysql`, los alias deben vivir en:

- `gc_display_names`

En local, con `APP_STORAGE_DRIVER=sqlite`, los alias deben vivir en:

- `gc_display_names` dentro de `data/app/gc-local.sqlite`

Antes había una zona de lectura síncrona que podía volver a mirar `display-names.json`, de modo que algunos datos guardados en BD podían no aplicarse en `/hotlaps`, `/perfil` u otras rutas que pintan nombres desde stracker.

## Qué cambia

- MySQL y SQLite ya no leen `display-names.json` para aplicar nombres.
- `/hotlaps`, `/perfil`, `/pilotos` y demás usan la caché cargada desde `gc_display_names`.
- El panel admin sigue guardando mediante el storage activo.
- El panel de storage muestra `gc_display_names` cuando está en MySQL/SQLite, no `display-names.json`.
- Si existe un `display-names.json` antiguo y la tabla `gc_display_names` está vacía, se migra automáticamente una sola vez al cargar filtros.

## Resultado esperado

Hostinger:

```txt
APP_STORAGE_DRIVER=mysql
filtros -> gc_display_names
```

Local:

```txt
APP_STORAGE_DRIVER=sqlite
filtros -> data/app/gc-local.sqlite / gc_display_names
```

`display-names.json` queda solo como legado/fallback si usas `APP_STORAGE_DRIVER=json`.

## Pruebas recomendadas

1. Entra en `/admin`.
2. Cambia un alias de coche, circuito o piloto.
3. Revisa `/hotlaps`.
4. Reinicia la app Node.
5. Revisa que el alias sigue aplicado.
6. En `/api/admin/storage/status`, comprueba que los filtros aparecen como `gc_display_names`.
