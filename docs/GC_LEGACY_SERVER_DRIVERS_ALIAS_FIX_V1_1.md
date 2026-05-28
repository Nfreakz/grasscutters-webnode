# GC Legacy Server Drivers Alias Fix v1.1

Fecha: 2026-05-28  
Pack: `GC_Legacy_Server_Drivers_Alias_Fix_v1_1`

## Problema detectado

El Endpoint Lab muestra:

```txt
legacy-hotlaps       OK
legacy-laps          OK
legacy-combos-stats  OK
legacy-overview      OK
legacy-combo-detail  OK
legacy-pilots        OK
legacy-drivers       FAIL
```

Fallo concreto:

```txt
/api/drivers?limit=50
HTTP 500
source != gc-data-core-legacy-server-alias
```

## Causa

En `GC_Legacy_Server_Aliases_v1`, `/api/drivers` quedó como reenvío interno:

```ts
req.url = req.url.replace('/api/drivers', '/api/pilots');
return (app as any)._router.handle(req, res);
```

Eso es frágil y puede fallar con Express, orden de rutas o estructura interna del servidor.

## Solución

Reemplazar `/api/drivers` por un handler directo, igual que `/api/pilots`, usando Race Data Core.

Nuevo comportamiento:

```txt
/api/drivers
→ lee Stracker/Data Core
→ genera listado único de pilotos/drivers
→ devuelve source = gc-data-core-legacy-server-alias
```

## Qué modifica

```txt
src/server/index.ts
```

Solo reemplaza el handler de:

```txt
/api/drivers
```

## Qué NO toca

```txt
/api/pilots
/api/hotlaps
/api/laps
/api/combos/stats
/api/combos/:comboId
páginas
imágenes
Admin Lab
Data Core principal
```

## Aplicación

```powershell
node scripts/apply-gc-legacy-server-drivers-alias-fix-v1-1.cjs
npm run build
npm run dev
```

## Prueba directa

```txt
http://localhost:4321/api/drivers?limit=50
```

Debe devolver:

```txt
status 200
source = gc-data-core-legacy-server-alias
items.length > 0
legacyEndpoint = /api/drivers
```

## Prueba en Lab

```txt
/admin/endpoints
```

Pulsa:

```txt
Probar legacy aliases
```

Resultado esperado:

```txt
7 OK
0 fails
```
