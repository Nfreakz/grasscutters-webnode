# GC Data Core Names Pipeline v1

Fecha: 2026-05-28  
Pack: `GC_Data_Core_Names_Pipeline_v1`

## Objetivo

Formalizar la cadena de nombres para Assetto Corsa y mods:

```txt
rawName -> autoName -> displayName
```

Esto evita que cada página invente su propia limpieza de nombres.

## Capas

### 1. rawName

Nombre original o más cercano al origen técnico:

```txt
ts_bmw_m3_gt2
ks_mugello
rt_sebring
```

### 2. autoName

Primera limpieza automática usando el sistema existente:

```ts
autoTitleFromCode(...)
```

Ejemplo:

```txt
ks_mugello      -> Mugello
ts_bmw_m3_gt2   -> BMW M3 GT2
```

### 3. displayName

Nombre final visible:

```txt
displayName = override admin si existe; si no, autoName
```

Lo gestiona el sistema admin con `gc_display_names`.

## Helpers añadidos

```ts
gcDataCoreNameEntity(...)
gcDataCoreDriverNameEntity(...)
gcDataCoreCarNameEntity(...)
gcDataCoreTrackNameEntity(...)
gcDataCoreApplyNamePipelineToLap(...)
gcDataCoreApplyNamePipelineToLaps(...)
gcDataCoreCombosNamePipelineDiagnostics(...)
```

Cada entidad devuelve:

```json
{
  "kind": "car",
  "id": 12,
  "code": "ts_bmw_m3_gt2",
  "rawName": "ts_bmw_m3_gt2",
  "autoName": "BMW M3 GT2",
  "displayName": "BMW M3 GT2",
  "hasOverride": false,
  "entryId": null,
  "notes": null,
  "enabled": true
}
```

## Endpoint añadido

```txt
GET /api/gc/names/preview
```

Parámetros:

```txt
limit=50
```

Devuelve una muestra de vueltas con:

```txt
driver.rawName / driver.autoName / driver.displayName
car.rawName / car.autoName / car.displayName
track.rawName / track.autoName / track.displayName
```

También devuelve diagnóstico:

```txt
drivers
cars
tracks
overridesApplied
rawAutoDiffs
samples
```

## Endpoint reforzado si existe

Si ya existe:

```txt
/api/gc/display-names/status
```

se añade información de pipeline:

```json
{
  "pipeline": {
    "order": ["rawName", "autoName", "displayName"],
    "automaticCleaner": "autoTitleFromCode",
    "adminOverride": "applyDisplayName / gc_display_names",
    "previewEndpoint": "/api/gc/names/preview"
  }
}
```

## Archivos modificados

- `src/server/index.ts`

## Qué NO toca

- páginas UI
- `/`
- `/app`
- `/hotlaps`
- `/combos`
- `/pitwall`
- assets
- imágenes
- admin UI

## Prueba recomendada

```powershell
node scripts/apply-gc-data-core-names-pipeline-v1.cjs
npm run build
npm run dev
```

Abrir:

```txt
http://localhost:4321/api/gc/names/preview
http://localhost:4321/api/gc/display-names/status
```

## Qué mirar

Para cada muestra:

```txt
rawName:      ts_bmw_m3_gt2
autoName:     BMW M3 GT2
displayName: BMW M3 GT2 GrassCutters
```

Si `displayName` no respeta admin, revisar `gc_display_names`.
Si `autoName` no limpia bien, ampliar `autoTitleFromCode`.
