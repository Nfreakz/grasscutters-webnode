# GC Deploy 22 - Name filters + sector cleanup

## Objetivo

Corregir dos puntos detectados en `/hotlaps`:

1. Los códigos de coches/circuitos salían demasiado crudos.
2. Los sectores S1/S2/S3 mostraban `1440:00.000`, que es un valor placeholder de stracker y no un sector real.

## Qué añade

### Filtro automático de nombres

La API ahora limpia nombres automáticamente:

- `porsche_935_mobydick_gr5` → `Porsche 935 Mobydick GR5`
- `salzburgring` → `Salzburgring`
- `ks_nordschleife-endurance` → `Nordschleife Endurance`

También permite overrides manuales desde `/admin`.

### Panel admin

En `/admin` aparece una nueva sección:

- Pilotos
- Coches
- Circuitos

Desde ahí puedes guardar un nombre visible o volver al nombre automático.

### Storage

Los overrides se guardan en:

```txt
./data/app/display-names.json
```

Esa ruta ya queda protegida si tienes en `.gitignore`:

```gitignore
/data/app/*.json
```

Variable opcional:

```env
APP_DISPLAY_NAMES_PATH=./data/app/display-names.json
```

### Rutas API nuevas

```txt
GET  /api/admin/name-filters
GET  /api/admin/display-names
POST /api/admin/name-filters
POST /api/admin/name-filters/delete
```

Todas requieren cuenta admin.

## Sectores

Ahora se ignoran sectores que no son reales:

- valores vacíos
- valores <= 0
- valores mayores que la vuelta
- valores enormes tipo 24h / `1440:00.000`

Si stracker no tiene sectores reales para esa vuelta, la web mostrará `--` en lugar de un tiempo falso.
