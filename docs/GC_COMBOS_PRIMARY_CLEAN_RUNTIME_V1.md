# GC Combos Primary Clean Runtime v1

Fecha: 2026-05-28  
Pack: `GC_Combos_Primary_Clean_Runtime_v1`

## Contexto

Ya se validó:

```txt
/app runtime limpio
/hotlaps runtime limpio
/api/pilots y /api/drivers con estadísticas completas
legacy aliases verdes
```

Por tanto el corte temporal de red en `/combos` ya no es necesario:

```txt
GCCombosLegacyNetworkCut
```

## Objetivo

Limpiar runtime temporal de `/combos`.

No elimina Combos Data Core Primary.

No toca endpoints.

No toca imágenes.

No toca otras páginas.

## Qué elimina

Bloque marcado:

```txt
GC_COMBOS_LEGACY_NETWORK_CUT_V1
```

## Qué mantiene

```txt
GC_COMBOS_DATA_CORE_PRIMARY_V1
document.documentElement.dataset.gcCombosDataCore = primary
document.documentElement.dataset.gcCombosDataCoreVersion = v1
GCTrackImages fuzzy resolver
gc-track-images-manifest.json
legacy server aliases
```

## Qué añade

Marcador limpio:

```js
document.documentElement.dataset.gcCombosRuntime
window.GCCombosRuntimeStatus()
```

Valor esperado:

```txt
data-core-primary-clean-v1
```

## Por qué es seguro ahora

Porque los endpoints legacy del servidor ya están centralizados:

```txt
/api/combos/stats
/api/combos/:comboId
/api/hotlaps
/api/laps
/api/pilots
/api/drivers
/api/stats/overview
```

Si algún script antiguo llama a `/api/combos/stats`, ya recibirá Data Core desde servidor.

## Aplicación

```powershell
node scripts/apply-gc-combos-primary-clean-runtime-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/combos
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcCombosDataCore,
  version: document.documentElement.dataset.gcCombosDataCoreVersion,
  runtime: document.documentElement.dataset.gcCombosRuntime,
  images: window.GCTrackImages?.version,
  status: window.GCCombosRuntimeStatus?.()
})
```

Resultado esperado:

```txt
dataCore = primary
version = v1
runtime = data-core-primary-clean-v1
images = v1.1
legacyNetworkCut = false
```

## Validación obligatoria

```txt
/admin/endpoints
Ejecutar críticos
Probar legacy aliases
fails = 0
```

## Próximo paso

Si `/combos` queda limpio:

```txt
/combos/:comboId Primary Clean Runtime
```
