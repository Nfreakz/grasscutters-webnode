# GC Admin Lab Legacy Alias Validation v1

Fecha: 2026-05-28  
Pack: `GC_Admin_Lab_Legacy_Alias_Validation_v1`

## Objetivo

Después de convertir los endpoints legacy del servidor en aliases de Data Core, el Endpoint Lab debe verificarlo.

No basta con que:

```txt
/api/hotlaps -> 200
```

Ahora debe comprobar también:

```txt
source = gc-data-core-legacy-server-alias
```

## Qué añade

### Nuevas pruebas legacy

```txt
/api/combos/:comboId
/api/pilots?limit=50
/api/drivers?limit=50
```

Además de las ya existentes:

```txt
/api/hotlaps?limit=50
/api/laps?limit=50&sort=recent&valid=all
/api/combos/stats?limit=50&sort=recent
/api/stats/overview
```

### Nuevo botón

```txt
Probar legacy aliases
```

Ejecuta solo el grupo `legacy`.

## Nuevas validaciones

Para endpoints legacy de lista:

```txt
source = gc-data-core-legacy-server-alias
items no vacío
legacyEndpoint existe
```

Para overview:

```txt
source = gc-data-core-legacy-server-alias
totalLaps/lapsCount existe
legacyEndpoint existe
```

Para combo detail legacy:

```txt
source = gc-data-core-legacy-server-alias
item existe
summary existe
legacyEndpoint existe
```

## Qué NO toca

```txt
server endpoints
páginas
Data Core
imágenes
scripts legacy
```

Solo modifica:

```txt
src/pages/admin/endpoints.astro
```

## Aplicación

```powershell
node scripts/apply-gc-admin-lab-legacy-alias-validation-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/admin/endpoints
```

Ejecutar:

```txt
Probar legacy aliases
```

Resultado esperado:

```txt
legacy-hotlaps = ok
legacy-laps = ok
legacy-combos-stats = ok
legacy-overview = ok
legacy-combo-detail = ok
legacy-pilots = ok
legacy-drivers = ok
```

Si alguno falla con:

```txt
source no es gc-data-core-legacy-server-alias
```

significa que el endpoint legacy sigue usando lógica vieja.
