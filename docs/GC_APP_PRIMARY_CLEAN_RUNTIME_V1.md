# GC App Primary Clean Runtime v1

Fecha: 2026-05-28  
Pack: `GC_App_Primary_Clean_Runtime_v1`

## Contexto

El Endpoint Lab ya validó:

```txt
legacy aliases: OK
/api/drivers: OK
warnings: 0
fails: 0
```

Por tanto los parches temporales de `/app` ya no son necesarios:

```txt
GCAppLegacyGovernor
GCAppLegacyNetworkCut
```

## Objetivo

Limpiar runtime temporal de `/app`.

No elimina Data Core Primary.

No toca endpoints.

No toca imágenes.

No toca otras páginas.

## Qué elimina de `/app`

Bloques marcados:

```txt
GC_APP_LEGACY_GOVERNOR_V1_EARLY
GC_APP_LEGACY_GOVERNOR_V1_LATE
GC_APP_LEGACY_NETWORK_CUT_V1
```

También elimina la llamada residual:

```js
window.GCAppLegacyGovernor?.markCorePaint?.()
```

## Qué mantiene

```txt
GC_APP_DATA_CORE_PRIMARY_V1
/app Data Core Primary loader
fallback visual legacy existente
endpoints legacy server aliases
```

## Qué añade

Marcador limpio:

```js
document.documentElement.dataset.gcAppRuntime
window.GCAppRuntimeStatus()
```

Valor esperado:

```txt
data-core-primary-clean-v1
```

## Por qué es seguro ahora

Porque los endpoints legacy ya no son cocina vieja en servidor. Son aliases Data Core:

```txt
/api/hotlaps
/api/laps
/api/combos/stats
/api/combos/:comboId
/api/pilots
/api/drivers
/api/stats/overview
```

Por eso, aunque algún script viejo de `/app` hiciera una llamada antigua, ya recibiría Data Core.

## Aplicación

```powershell
node scripts/apply-gc-app-primary-clean-runtime-v1.cjs
npm run build
npm run dev
```

## Prueba

```txt
http://localhost:4321/app
```

Consola:

```js
({
  dataCore: document.documentElement.dataset.gcAppDataCore,
  version: document.documentElement.dataset.gcAppDataCoreVersion,
  runtime: document.documentElement.dataset.gcAppRuntime,
  status: window.GCAppRuntimeStatus?.()
})
```

Resultado esperado:

```txt
dataCore = primary
version = v1
runtime = data-core-primary-clean-v1
legacyGovernor = false
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

Si `/app` queda limpio:

```txt
/hotlaps Primary Clean Runtime
```

y después:

```txt
/combos
/combos/:comboId
```
